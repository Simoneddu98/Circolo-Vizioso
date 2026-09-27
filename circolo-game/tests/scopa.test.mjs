import test from 'node:test';
import assert from 'node:assert/strict';
import { ScopaGame, captureOptions, scoreHand, primiera, makeDeck } from '../src/minigames/scopa/rules.js';

const C = (id) => makeDeck().find((c) => c.id === id);
const ids = (arr) => arr.map((c) => c.id).sort();

// generatore deterministico per le simulazioni
function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('la presa della carta singola ha la precedenza sulle somme', () => {
  const table = [C('3C'), C('4S'), C('7B')];
  const opts = captureOptions(C('7D'), table);
  assert.equal(opts.length, 1);
  assert.deepEqual(ids(opts[0]), ['7B']);
  const two = captureOptions(C('7D'), [C('7B'), C('7C'), C('3S'), C('4B')]);
  assert.equal(two.length, 2);                                    // due sette: sceglie il giocatore, niente somme
  assert.ok(two.every((o) => o.length === 1));
});

test('somme: più combinazioni possibili, e carta che resta in tavola', () => {
  const opts = captureOptions(C('6D'), [C('1C'), C('5S'), C('2B'), C('4C')]);
  assert.deepEqual(opts.map(ids).sort(), [['1C', '5S'], ['2B', '4C']].sort());
  assert.deepEqual(captureOptions(C('9D'), [C('1C'), C('2S')]), []);
});

function rigged(hands, table, deck = []) {
  const g = new ScopaGame({ rng: mulberry(1) });
  g.hands = hands.map((h) => h.map(C));
  g.table = table.map(C);
  g.deck = deck.map(C);
  g.piles = [[], []];
  g.scope = [0, 0];
  g.current = 0;
  g.lastTaker = null;
  return g;
}

test('scopa valida, ma non all\'ultima giocata della smazzata', () => {
  const g = rigged([['5D', '1C'], ['2S', '9B']], ['5C'], ['3D', '3C', '3S', '3B', '4D', '4C']);
  assert.equal(g.play('5D').scopa, true);
  const last = rigged([['5D'], []], ['5C']);
  const ev = last.play('5D');
  assert.equal(ev.scopa, false);
  assert.equal(last.scope[0], 0);
});

test('a fine smazzata le carte in tavola vanno a chi ha preso per ultimo', () => {
  const g = rigged([['5D', '9C'], ['2S', '8B']], ['5C', '1B']);
  g.play('5D');          // prende il 5 (resta l'asso)
  g.play('2S');          // l'avversario non prende
  g.play('9C');          // non prende
  const ev = g.play('8B');                        // ultima giocata: nessuna somma fa 8, la carta resta in tavola
  assert.ok(ev.handOver);
  assert.equal(ev.leftover.to, 0);
  assert.deepEqual(ids(ev.leftover.cards), ['1B', '2S', '8B', '9C']);
  assert.equal(g.piles[0].length + g.piles[1].length, 6);         // 2 in tavola + 4 in mano all'inizio
});

test('primiera con e senza tutti i semi', () => {
  const full = ['7D', '6C', '1S', '5B'].map(C);
  assert.equal(primiera(full), 21 + 18 + 16 + 15);
  assert.equal(primiera(['7D', '7C', '7S'].map(C)), null);
  // solo uno ha tutti i semi: vince lui
  let r = scoreHand([full, ['7C', '7S', '7B'].map(C)], [0, 0]);
  assert.equal(r.rows.find((x) => x.key === 'primiera').winner, 0);
  // nessuno ha tutti i semi: non si assegna
  r = scoreHand([['7D'].map(C), ['7C'].map(C)], [0, 0]);
  assert.equal(r.rows.find((x) => x.key === 'primiera').winner, null);
});

test('conteggio completo di una smazzata costruita a mano', () => {
  const deck = makeDeck();
  const p0 = deck.filter((c) => c.suit === 'denari' || (c.suit === 'coppe' && c.rank <= 7) || c.id === '7S' || c.id === '7B');   // 19 carte
  const p1 = deck.filter((c) => !p0.includes(c));                                                                             // 21 carte
  const r = scoreHand([p0, p1], [2, 1]);
  const w = Object.fromEntries(r.rows.map((x) => [x.key, x.winner]));
  assert.equal(w.carte, 1);            // 21 contro 19
  assert.equal(w.denari, 0);
  assert.equal(w.settebello, 0);
  assert.equal(w.primiera, 0);         // 21*4 contro le carte migliori rimaste all'avversario
  assert.deepEqual(r.points, [3 + 2, 1 + 1]);
  const tie = scoreHand([deck.slice(0, 20), deck.slice(20)], [0, 0]);
  assert.equal(tie.rows.find((x) => x.key === 'carte').winner, null);   // 20 a 20: nessuno
});

test('1000 partite casuali: 40 carte sempre, giocate legali, punti coerenti', () => {
  const rng = mulberry(42);
  let hands = 0;
  for (let n = 0; n < 1000; n++) {
    const g = new ScopaGame({ rng, dealer: n % 2 });
    let guard = 0;
    while (g.winner === null && guard++ < 60) {
      while (!g.handResult) {
        assert.equal(g.cardsInPlay(), 40);
        const moves = g.legalMoves();
        assert.ok(moves.length > 0);
        const m = moves[Math.floor(rng() * moves.length)];
        const opts = g.options(m.card.id);
        const oi = opts.length ? opts.findIndex((o) => ids(o).join() === ids(m.take).join()) : 0;
        assert.ok(oi >= 0);
        const before = g.table.slice();
        const ev = g.play(m.card.id, oi);
        // se c'era una carta di pari valore, la presa deve essere quella singola
        if (before.some((c) => c.rank === m.card.rank)) assert.equal(ev.take.length, 1);
        if (ev.take.length > 1) assert.equal(ev.take.reduce((s, c) => s + c.rank, 0), m.card.rank);
      }
      hands++;
      const r = g.handResult;
      assert.equal(g.piles[0].length + g.piles[1].length, 40);
      const assigned = r.rows.filter((x) => x.winner != null && x.key !== 'scope').length;
      assert.equal(r.points[0] + r.points[1], assigned + g.scope[0] + g.scope[1]);
      assert.ok(assigned <= 4);
      if (g.winner === null) g.nextHand();
    }
    assert.notEqual(g.winner, null, 'la partita deve finire');
    const [a, b] = g.totals;
    assert.ok(Math.max(a, b) >= 11 && a !== b);
    assert.equal(g.winner, a > b ? 0 : 1);
  }
  assert.ok(hands >= 1000);
});

import { chooseMove } from '../src/minigames/scopa/ai.js';

test('IA: prende il settebello e fa scopa quando può', () => {
  const g = rigged([['7C', '2B'], ['1S', '9B']], ['7D'], ['3D', '3C', '3S', '3B', '4D', '4C']);
  assert.equal(chooseMove(g).cardId, '7C');
  const s = rigged([['6C', '9B'], ['1S', '2B']], ['2S', '4B'], ['3D', '3C', '3S', '3B', '4D', '4C']);
  assert.equal(chooseMove(s).cardId, '6C');                     // 2+4 = scopa
});

test('IA: non serve la scopa all\'avversario e scarta la carta meno preziosa', () => {
  const g = rigged([['9C', '3B'], ['1S', '2B']], ['5S'], ['3D', '3C', '3S', '3B', '4D', '4C']);
  assert.equal(chooseMove(g).cardId, '9C');                     // 5+3 = 8 in tavola darebbe scopa; 5+9 = 14 no
});

test('IA contro giocatore casuale: vince la maggior parte delle partite', () => {
  const rng = mulberry(7);
  let won = 0;
  for (let n = 0; n < 200; n++) {
    const g = new ScopaGame({ rng, dealer: n % 2 });
    while (g.winner === null) {
      while (!g.handResult) {
        if (g.current === 1) { const m = chooseMove(g, { rng }); g.play(m.cardId, m.optionIndex); } else {
          const ms = g.legalMoves(); const m = ms[Math.floor(rng() * ms.length)];
          const opts = g.options(m.card.id); const k = (a) => a.map((c) => c.id).sort().join();
          g.play(m.card.id, opts.length ? opts.findIndex((o) => k(o) === k(m.take)) : 0);
        }
      }
      if (g.winner === null) g.nextHand();
    }
    if (g.winner === 1) won++;
  }
  assert.ok(won > 140, `vinte ${won}/200`);
});

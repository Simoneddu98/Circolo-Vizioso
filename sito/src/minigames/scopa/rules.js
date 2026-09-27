// Scopa a due, mazzo napoletano da 40 carte. Logica pura: niente three.js, niente DOM.
// Carta: { id: '7D', rank: 1..10, suit: 'denari'|'coppe'|'spade'|'bastoni' }  (8 fante, 9 cavallo, 10 re)

export const SUITS = ['denari', 'coppe', 'spade', 'bastoni'];
const LETTER = { denari: 'D', coppe: 'C', spade: 'S', bastoni: 'B' };
export const PRIMIERA = { 7: 21, 6: 18, 1: 16, 5: 15, 4: 14, 3: 13, 2: 12, 8: 10, 9: 10, 10: 10 };

export function makeDeck() {
  const d = [];
  for (const suit of SUITS) for (let rank = 1; rank <= 10; rank++) d.push({ id: `${rank}${LETTER[suit]}`, rank, suit });
  return d;
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Prese possibili giocando `card` su `table`: una carta di pari valore ha la precedenza sulle somme.
// Ritorna un array di opzioni, ciascuna un array di carte prese; [] se la carta resta in tavola.
export function captureOptions(card, table) {
  const same = table.filter((c) => c.rank === card.rank);
  if (same.length) return same.map((c) => [c]);
  const out = [];
  const n = table.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    const pick = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { sum += table[i].rank; pick.push(table[i]); }
    if (sum === card.rank && pick.length > 1) out.push(pick);
  }
  return out;
}

// Punteggio di fine smazzata: { rows: [{ key, label, values: [a, b], winner }], points: [a, b] }
export function scoreHand(piles, scope) {
  const rows = [];
  const add = (key, label, values, winner) => rows.push({ key, label, values, winner });
  const cmp = (a, b) => (a > b ? 0 : b > a ? 1 : null);
  const cards = piles.map((p) => p.length);
  add('carte', 'Carte', cards, cmp(cards[0], cards[1]));
  const denari = piles.map((p) => p.filter((c) => c.suit === 'denari').length);
  add('denari', 'Denari', denari, cmp(denari[0], denari[1]));
  const sette = piles.map((p) => (p.some((c) => c.id === '7D') ? 1 : 0));
  add('settebello', 'Settebello', sette, sette[0] ? 0 : sette[1] ? 1 : null);
  const prim = piles.map(primiera);
  let pw = null;
  if (prim[0] != null && prim[1] != null) pw = cmp(prim[0], prim[1]);
  else if (prim[0] != null) pw = 0;
  else if (prim[1] != null) pw = 1;
  add('primiera', 'Primiera', prim.map((v) => v ?? '—'), pw);
  add('scope', 'Scope', scope.slice(), null);
  const points = [0, 0];
  for (const r of rows) if (r.winner != null) points[r.winner]++;
  points[0] += scope[0]; points[1] += scope[1];
  return { rows, points };
}

// Somma della primiera (migliore carta per seme); null se manca un seme
export function primiera(pile) {
  let sum = 0;
  for (const s of SUITS) {
    const vals = pile.filter((c) => c.suit === s).map((c) => PRIMIERA[c.rank]);
    if (!vals.length) return null;
    sum += Math.max(...vals);
  }
  return sum;
}

export class ScopaGame {
  constructor({ target = 11, rng = Math.random, dealer = 1 } = {}) {
    this.target = target;
    this.rng = rng;
    this.totals = [0, 0];
    this.dealer = dealer;
    this.winner = null;
    this.handNo = 0;
    this.newHand();
  }

  newHand() {
    this.handNo++;
    this.dealer = this.handNo === 1 ? this.dealer : 1 - this.dealer;   // chi distribuisce si alterna
    let tries = 0;
    do {
      this.deck = shuffle(makeDeck(), this.rng);
      this.table = this.deck.splice(0, 4);
      tries++;
    } while (this.table.filter((c) => c.rank === 10).length >= 3 && tries < 50);   // tre o più re in tavola: si rimescola
    this.hands = [[], []];
    this._deal();
    this.piles = [[], []];
    this.scope = [0, 0];
    this.scopaMarks = [[], []];            // id delle carte che hanno fatto scopa (girate di traverso nella pila)
    this.lastTaker = null;
    this.current = 1 - this.dealer;        // gioca per primo chi non distribuisce
    this.handResult = null;
    this.log = [];
  }

  _deal() {
    for (let k = 0; k < 3; k++) for (const p of [1 - this.dealer, this.dealer]) this.hands[p].push(this.deck.shift());
  }

  // opzioni legali del giocatore di turno per la carta indicata
  options(cardId) {
    const card = this.hands[this.current].find((c) => c.id === cardId);
    return card ? captureOptions(card, this.table) : [];
  }

  // Tutte le giocate legali: [{ card, take: [...] }] (take vuoto = la carta resta in tavola)
  legalMoves(player = this.current) {
    const out = [];
    for (const card of this.hands[player]) {
      const opts = captureOptions(card, this.table);
      if (opts.length) for (const take of opts) out.push({ card, take });
      else out.push({ card, take: [] });
    }
    return out;
  }

  // gioca una carta; optionIndex sceglie la presa quando ce n'è più di una
  play(cardId, optionIndex = 0) {
    if (this.winner !== null || this.handResult) throw new Error('smazzata finita');
    const p = this.current;
    const hand = this.hands[p];
    const i = hand.findIndex((c) => c.id === cardId);
    if (i < 0) throw new Error(`carta ${cardId} non in mano al giocatore ${p}`);
    const card = hand[i];
    const opts = captureOptions(card, this.table);
    if (opts.length && !(optionIndex >= 0 && optionIndex < opts.length)) throw new Error('presa non valida');
    hand.splice(i, 1);
    const ev = { player: p, card, take: [], scopa: false };
    if (opts.length) {
      const take = opts[optionIndex];
      const ids = new Set(take.map((c) => c.id));
      this.table = this.table.filter((c) => !ids.has(c.id));
      this.piles[p].push(card, ...take);
      this.lastTaker = p;
      ev.take = take;
      const lastPlay = this.deck.length === 0 && this.hands[0].length === 0 && this.hands[1].length === 0;
      if (this.table.length === 0 && !lastPlay) {           // scopa, ma non all'ultima giocata della smazzata
        this.scope[p]++;
        this.scopaMarks[p].push(card.id);
        ev.scopa = true;
      }
    } else {
      this.table.push(card);
    }
    this.log.push(ev);
    this.current = 1 - p;
    if (this.hands[0].length === 0 && this.hands[1].length === 0) {
      if (this.deck.length) { this._deal(); ev.dealt = true; } else this._endHand(ev);
    }
    return ev;
  }

  _endHand(ev) {
    if (this.table.length && this.lastTaker !== null) {                // le carte rimaste vanno a chi ha preso per ultimo
      this.piles[this.lastTaker].push(...this.table);
      ev.leftover = { to: this.lastTaker, cards: this.table.slice() };
      this.table = [];
    }
    const res = scoreHand(this.piles, this.scope);
    this.totals[0] += res.points[0];
    this.totals[1] += res.points[1];
    const [a, b] = this.totals;
    if ((a >= this.target || b >= this.target) && a !== b) this.winner = a > b ? 0 : 1;
    this.handResult = res;
    ev.handOver = res;
  }

  nextHand() {
    if (this.winner !== null) throw new Error('partita finita');
    this.newHand();
  }

  cardsInPlay() {
    return this.deck.length + this.table.length + this.hands[0].length + this.hands[1].length + this.piles[0].length + this.piles[1].length;
  }
}

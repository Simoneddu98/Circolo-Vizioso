import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERATA } from '../src/serata/contenuti.js';
import {
  mescolaRisposte, puntiRisposta, valutaRichiesta, orarioGiusto, bonusVelocitaOrdine, ora, cifre,
  ordineGiusto, scambi, applicaScambi, euroDaPunti, shuffle, anello,
} from '../src/serata/regole.js';

test('quiz del cinema: quattro risposte diverse, la giusta resta giusta dopo il mescolamento', () => {
  assert.ok(SERATA.cinema.domande.length >= 20);
  for (const d of SERATA.cinema.domande) {
    assert.equal(d.r.length, 4, d.q);
    assert.equal(new Set(d.r).size, 4, d.q);
    for (let i = 0; i < 20; i++) {
      const m = mescolaRisposte(d.r, d.a);
      assert.equal(m.testi[m.giusta], d.r[d.a]);
    }
  }
});

test('punti delle risposte: niente se sbagliata, bonus velocità e serie', () => {
  const base = { totale: 10, punti: 100, bonusVelocita: 60, bonusSerie: 20 };
  assert.equal(puntiRisposta({ ...base, giusta: false, restante: 10, serie: 0 }), 0);
  assert.equal(puntiRisposta({ ...base, giusta: true, restante: 10, serie: 1 }), 160);
  assert.equal(puntiRisposta({ ...base, giusta: true, restante: 0, serie: 3 }), 140);
});

test('cibo: le richieste si controllano sui tag degli ingredienti', () => {
  const P = SERATA.cibo.punti;
  const [kebab, pizza] = SERATA.cibo.locali;
  const rafka = SERATA.cibo.richieste.find((r) => r.chi === 'Rafka');
  const ok = valutaRichiesta(rafka, kebab, { base: 'piadina', carne: 'pollo', extra: ['peperoncino'] }, P);
  assert.ok(ok.voci.every((v) => v.ok));
  const ko = valutaRichiesta(rafka, pizza, { base: 'margherita', carne: 'nessuna', extra: [] }, P);
  assert.ok(ko.voci.every((v) => !v.ok));
  assert.ok(ko.punti < 0);
  const kappa = SERATA.cibo.richieste.find((r) => r.chi === 'Kappa');
  assert.ok(valutaRichiesta(kappa, pizza, { base: 'rossa', carne: 'nessuna', extra: ['funghi', 'olive', 'peperoni'] }, P).voci.every((v) => v.ok));
  assert.ok(!valutaRichiesta(kappa, pizza, { base: 'rossa', carne: 'nessuna', extra: ['nduja', 'olive', 'peperoni'] }, P).voci.every((v) => v.ok));
  // ogni richiesta si può soddisfare con almeno un locale
  for (const r of SERATA.cibo.richieste) {
    const possibile = SERATA.cibo.locali.some((l) => l.basi.some((b) => l.carni.some((c) => {
      const extra = l.extra.filter((e) => !(r.evita ?? []).some((t) => e.tag.includes(t))).map((e) => e.id);
      return valutaRichiesta(r, l, { base: b.id, carne: c.id, extra }, P).voci.every((v) => v.ok);
    })));
    assert.ok(possibile, r.chi);
  }
});

test('cibo: orario, velocità, orologio e numero di telefono', () => {
  assert.ok(orarioGiusto('presto', 0, 4) && orarioGiusto('presto', 1, 4) && !orarioGiusto('presto', 2, 4));
  assert.ok(orarioGiusto('tardi', 3, 4) && !orarioGiusto('tardi', 0, 4) && orarioGiusto(undefined, 2, 4));
  assert.equal(bonusVelocitaOrdine(10, 30, 60), 60);
  assert.equal(bonusVelocitaOrdine(45, 30, 60), 30);
  assert.equal(bonusVelocitaOrdine(90, 30, 60), 0);
  assert.equal(ora(20 * 60 + 40), '20:40');
  assert.equal(ora(21 * 60 + 5), '21:05');
  assert.equal(cifre('051 482 916'), '051482916');
  for (const l of SERATA.cibo.locali) assert.match(cifre(l.tel), /^\d{9}$/);
});

test('scatola nera: ordine giusto solo se rimette i passaggi come in origine', () => {
  const mescolati = [2, 0, 1];                  // testi mostrati: passo 2, passo 0, passo 1
  assert.ok(ordineGiusto([1, 2, 0], mescolati));
  assert.ok(!ordineGiusto([0, 1, 2], mescolati));
  for (const s of SERATA.blackbox.scatole) assert.ok(s.r.length >= 3 && s.inizio && s.fine, s.inizio);
});

test('bicchieri: gli scambi tengono traccia di ogni bicchiere', () => {
  for (let i = 0; i < 200; i++) {
    const lista = scambi(10);
    for (const [a, b] of lista) assert.notEqual(a, b);
    const fine = applicaScambi([0, 1, 2], lista);
    assert.deepEqual([...fine].sort(), [0, 1, 2]);
    // simulazione a mano: posti -> bicchiere
    const posti = [0, 1, 2];
    for (const [a, b] of lista) [posti[a], posti[b]] = [posti[b], posti[a]];
    for (let g = 0; g < 3; g++) assert.equal(posti[fine[g]], g);
  }
});

test('spettacolo: l\'anello è chiuso, continuo e dentro i suoi limiti', () => {
  const A = SERATA.spettacolo.anello;
  const a = anello(A);
  let prev = a.at(0);
  for (let s = 0.05; s <= a.length + 0.001; s += 0.05) {
    const p = a.at(s);
    assert.ok(Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 0.06, `salto a ${s}`);
    assert.ok(p[0] >= A.x[0] - 1e-6 && p[0] <= A.x[1] + 1e-6 && p[1] >= A.z[0] - 1e-6 && p[1] <= A.z[1] + 1e-6);
    prev = p;
  }
  const end = a.at(a.length - 1e-9), start = a.at(0);
  assert.ok(Math.hypot(end[0] - start[0], end[1] - start[1]) < 1e-3);
});

test('punti in euro e mescolamento', () => {
  assert.equal(euroDaPunti(0, 250, 40), 0);
  assert.equal(euroDaPunti(2600, 250, 40), 10);
  assert.equal(euroDaPunti(1e6, 250, 40), 40);
  assert.deepEqual(shuffle([1, 2, 3, 4]).sort(), [1, 2, 3, 4]);
});

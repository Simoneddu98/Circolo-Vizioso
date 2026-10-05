import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANES, FINESTRE, generaChart, Partita, giudica, votoDa, sezioneDi } from '../src/plus/jukebox/rules.js';

const BPM = 113;

test('lo spartito è deterministico e dura 32 battute da 4 quarti (circa 68 secondi a 113 bpm)', () => {
  const a = generaChart({ seed: 1103 }), b = generaChart({ seed: 1103 }), c = generaChart({ seed: 7 });
  assert.deepEqual(a.note, b.note);
  assert.notDeepEqual(a.note, c.note);
  assert.equal(a.beatTotali, 128);
  const fine = a.note.at(-1).beat;
  assert.ok(fine > 120 && fine < 128, `ultima nota al quarto ${fine}`);
  assert.ok(Math.abs(128 * 60 / BPM - 67.96) < 0.05);
});

test('spartito: note in ordine, corsie valide, densità crescente, niente tre note di fila nella stessa corsia, mai due note uguali insieme', () => {
  const { note } = generaChart({ seed: 1103 });
  for (let i = 1; i < note.length; i++) assert.ok(note[i].beat >= note[i - 1].beat, 'in ordine');
  for (const n of note) assert.ok(Number.isInteger(n.lane) && n.lane >= 0 && n.lane < LANES);
  const visti = new Set();
  for (const n of note) { const k = `${n.beat}:${n.lane}`; assert.ok(!visti.has(k), `doppione ${k}`); visti.add(k); }
  const perSezione = {};
  for (const n of note) { const s = sezioneDi(Math.floor(n.beat / 4) + 1); perSezione[s] = (perSezione[s] ?? 0) + 1; }
  assert.ok(perSezione.intro < perSezione.strofa && perSezione.strofa < perSezione.ritornello, JSON.stringify(perSezione));
  assert.ok(perSezione.pausa < perSezione.ritornello && perSezione.finale >= perSezione.ritornello, JSON.stringify(perSezione));
  assert.ok(note.length > 150 && note.length < 320, `${note.length} note`);
  // niente tre note di fila nella stessa corsia (contando solo la prima corsia di ogni istante)
  const unaPerIstante = note.filter((n, i) => i === 0 || n.beat !== note[i - 1].beat);
  for (let i = 2; i < unaPerIstante.length; i++) {
    assert.ok(!(unaPerIstante[i].lane === unaPerIstante[i - 1].lane && unaPerIstante[i - 1].lane === unaPerIstante[i - 2].lane), `tre uguali a ${i}`);
  }
  // note a doppia corsia solo nei punti di accento
  const doppie = note.filter((n, i) => i > 0 && n.beat === note[i - 1].beat);
  assert.ok(doppie.length > 0 && doppie.length < 20);
});

test('giudizio: perfetto, buono, fuori finestra', () => {
  assert.equal(giudica(0), 'perfetto');
  assert.equal(giudica(-FINESTRE.perfetto), 'perfetto');
  assert.equal(giudica(FINESTRE.perfetto + 0.001), 'buono');
  assert.equal(giudica(-FINESTRE.buono), 'buono');
  assert.equal(giudica(FINESTRE.buono + 0.001), null);
});

test('un colpo giusto vale punti e fa salire la serie; un tasto a vuoto non toglie niente', () => {
  const p = new Partita({ note: [{ beat: 4, lane: 1 }, { beat: 5, lane: 2 }] }, BPM);
  const t0 = 4 * 60 / BPM;
  assert.equal(p.colpo(0, t0), null, 'corsia sbagliata');
  assert.equal(p.colpo(1, t0 - 1), null, 'troppo presto');
  assert.equal(p.combo, 0);
  const r = p.colpo(1, t0 + 0.02);
  assert.equal(r.giudizio, 'perfetto');
  assert.equal(p.punti, 300);
  assert.equal(p.combo, 1);
  assert.equal(p.colpo(1, t0 + 0.02), null, 'la stessa nota non si colpisce due volte');
});

test('note mancate: dopo la finestra la serie si azzera e il conteggio sale', () => {
  const p = new Partita({ note: [{ beat: 2, lane: 0 }, { beat: 3, lane: 0 }] }, BPM);
  p.colpo(0, 2 * 60 / BPM);
  assert.equal(p.combo, 1);
  assert.equal(p.aggiorna(3 * 60 / BPM - 0.01).length, 0);
  const perse = p.aggiorna(3 * 60 / BPM + FINESTRE.max + 0.01);
  assert.equal(perse.length, 1);
  assert.equal(p.combo, 0);
  assert.equal(p.conteggi.mancato, 1);
  assert.equal(p.aggiorna(100).length, 0, 'una nota si manca una volta sola');
});

test('moltiplicatore: ogni 10 di serie, fino a x4; il colpo storto tra buono e massimo conta come mancato', () => {
  const note = Array.from({ length: 45 }, (_, i) => ({ beat: i, lane: 0 }));
  const p = new Partita({ note }, 60);                    // a 60 bpm un quarto = 1 secondo
  const visti = [];
  for (let i = 0; i < 45; i++) { visti.push(p.moltiplicatore); p.colpo(0, i); }
  assert.deepEqual([visti[0], visti[9], visti[10], visti[19], visti[20], visti[30], visti[44]], [1, 1, 2, 2, 3, 4, 4]);
  const q = new Partita({ note: [{ beat: 1, lane: 0 }] }, 60);
  const r = q.colpo(0, 1 + (FINESTRE.buono + FINESTRE.max) / 2);
  assert.equal(r.giudizio, 'mancato');
  assert.equal(q.conteggi.mancato, 1);
});

test('partita perfetta: precisione 1, voto S; nessun colpo: voto D; la partita finisce dopo l\'ultima nota', () => {
  const chart = generaChart({ seed: 1103 });
  const p = new Partita(chart, BPM);
  for (const n of p.note) p.colpo(n.lane, n.t);
  assert.equal(p.precisione, 1);
  assert.equal(p.voto, 'S');
  assert.equal(p.conteggi.perfetto, p.totale);
  assert.equal(p.comboMax, p.totale);
  assert.ok(p.punti > p.totale * 300, 'il moltiplicatore aumenta il punteggio');
  const v = new Partita(chart, BPM);
  assert.equal(v.finita(v.durata), false);
  v.aggiorna(v.durata + 5);
  assert.equal(v.voto, 'D');
  assert.equal(v.conteggi.mancato, v.totale);
  assert.equal(v.finita(v.durata + 5), true);
  assert.deepEqual(['S', 'A', 'B', 'C', 'D'], [0.96, 0.9, 0.75, 0.55, 0.1].map(votoDa));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { payout, SlotMachine, STRIPS, theoreticalRTP, SYMBOLS } from '../src/minigames/slots/rules.js';

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('vincite della linea centrale', () => {
  assert.equal(payout(['nuraghe', 'nuraghe', 'nuraghe']), 150);
  assert.equal(payout(['sette', 'sette', 'sette'], 3), 240);
  assert.equal(payout(['ciliegia', 'uva', 'ciliegia']), 3);
  assert.equal(payout(['ciliegia', 'uva', 'bar']), 2);
  assert.equal(payout(['uva', 'ciliegia', 'bar']), 0);
  assert.equal(payout(['bar', 'bar', 'sette']), 0);
});

test('strisce: 22 posizioni, tutti i simboli presenti', () => {
  for (const s of STRIPS) {
    assert.equal(s.length, 22);
    for (const sym of SYMBOLS) assert.ok(s.includes(sym), sym);
  }
});

test('ritorno teorico tra 85% e 98%, e simulazione coerente', () => {
  const rtp = theoreticalRTP();
  assert.ok(rtp > 0.85 && rtp < 0.98, `RTP ${rtp}`);
  const m = new SlotMachine({ credits: 1e9, rng: mulberry(9) });
  let paid = 0;
  for (let i = 0; i < 200000; i++) paid += m.spin().win;
  assert.ok(Math.abs(paid / 200000 - rtp) < 0.03, `simulato ${paid / 200000} contro ${rtp}`);
});

test('gettoni mai negativi, puntata limitata ai gettoni rimasti', () => {
  const m = new SlotMachine({ credits: 5, rng: mulberry(1) });
  m.setBet(3);
  let guard = 0;
  while (m.canSpin() && guard++ < 10000) { m.spin(); assert.ok(m.credits >= 0); if (m.credits < m.bet) m.setBet(m.credits); }
  assert.ok(m.credits >= 0);
  if (m.credits === 0) assert.equal(m.spin(), null);
});

test('gettoni: si inseriscono uno alla volta dalla tasca e si incassano', () => {
  const m = new SlotMachine({ pocket: 3, credits: 0, rng: mulberry(4) });
  assert.equal(m.canSpin(), false);
  assert.equal(m.insertCoin(), true);
  assert.equal(m.insertCoin(), true);
  assert.deepEqual([m.pocket, m.credits, m.total], [1, 2, 3]);
  m.spin();
  const back = m.cashOut();
  assert.equal(m.credits, 0);
  assert.equal(m.pocket, 1 + back);
  m.pocket = 0;
  assert.equal(m.insertCoin(), false);
});

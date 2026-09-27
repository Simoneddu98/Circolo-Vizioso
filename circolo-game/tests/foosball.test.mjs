import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, makeRod, step, kickoff, ballInsideFoot, DEFAULTS } from '../src/minigames/foosball/physics.js';

// campo del circolo: 1.16 x 0.70 (misurato in Blender), porte da 0.20, aste come nel glb
const hx = 0.58, hy = 0.35;
const FIELD = { hx, hy, goalHalf: 0.10 };
const LAYOUT = [['A', 1, 0.14], ['A', 2, 0.21], ['B', 3, 0.13], ['A', 5, 0.09], ['B', 5, 0.09], ['A', 3, 0.13], ['B', 2, 0.21], ['B', 1, 0.14]];
const GAPS = { 1: 0, 2: 0.24, 3: 0.2, 5: 0.12 };
const rods = () => LAYOUT.map(([team, n, travel], i) => makeRod(-hx + (2 * hx / 8) * (i + 0.5), team,
  Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * GAPS[n]), travel, 0.112));

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('2000 tiri alla massima velocità: la palla non attraversa sponde o piedi, rotazioni entro ±90°, gol solo in porta', () => {
  const rng = mulberry(11);
  let goals = 0;
  for (let n = 0; n < 2000; n++) {
    const st = makeState(FIELD, rods());
    const b = st.ball;
    b.x = (rng() * 2 - 1) * (hx - 0.03); b.y = (rng() * 2 - 1) * (hy - 0.03);
    const a = rng() * Math.PI * 2;
    b.vx = Math.cos(a) * DEFAULTS.maxSpeed; b.vy = Math.sin(a) * DEFAULTS.maxSpeed;
    for (const r of st.rods) { r.angle = (rng() * 2 - 1) * 0.6; r.omega = (rng() * 2 - 1) * 40; r.slideVel = (rng() * 2 - 1) * 2; }
    // la palla parte dentro un piede? la sposto: il test riguarda l'attraversamento, non la partenza
    if (ballInsideFoot(st)) continue;
    for (let t = 0; t < 1.5; t += 1 / 120) {
      const ev = step(st, 1 / 120);
      for (const r of st.rods) assert.ok(Math.abs(r.angle) <= Math.PI / 2 + 1e-9);
      if (ev.goal) {
        assert.ok(Math.abs(b.y) < FIELD.goalHalf, `gol fuori dalla porta (y=${b.y})`);
        goals++;
        break;
      }
      assert.ok(Math.abs(b.y) <= hy - b.r + 1e-6, 'attraversa la sponda laterale');
      assert.ok(Math.abs(b.x) <= hx - b.r + 1e-6 || Math.abs(b.y) < FIELD.goalHalf, 'attraversa il fondo fuori dalla porta');
      assert.ok(!ballInsideFoot(st), 'palla dentro un piede');
    }
  }
  assert.ok(goals > 0);
});

test('tiro dell\'asta: il piede trasmette velocità verso la porta avversaria', () => {
  const st = makeState(FIELD, [makeRod(0, 'A', [0], 0.1, 0.112)]);
  st.ball.x = 0.03; st.ball.y = 0;
  st.rods[0].angle = -0.3; st.rods[0].omega = 30;
  for (let i = 0; i < 10; i++) step(st, 1 / 240);
  assert.ok(st.ball.vx > 1, `vx ${st.ball.vx}`);
});

test('gol solo dentro la porta: palla verso il fondo fuori dalla porta rimbalza', () => {
  const st = makeState(FIELD, []);
  st.ball.x = 0.4; st.ball.y = 0.2; st.ball.vx = 5;
  let goal = null;
  for (let i = 0; i < 10 && !goal; i++) goal = step(st, 1 / 120).goal;   // 83 ms: un solo rimbalzo sul fondo
  assert.equal(goal, null);
  assert.ok(st.ball.vx < 0);
  const s2 = makeState(FIELD, []);
  s2.ball.x = 0.4; s2.ball.y = 0.02; s2.ball.vx = 5;
  for (let i = 0; i < 60 && !goal; i++) goal = step(s2, 1 / 120).goal;
  assert.equal(goal, 'B');
});

test('rimessa dopo 4 secondi di stallo fuori portata', () => {
  const st = makeState(FIELD, []);                  // nessuna asta: nessuno raggiunge la palla
  st.ball.x = 0.1; st.ball.y = 0.3;
  let stall = false, t = 0;
  const P = { ...DEFAULTS, nudgeTime: 0 };             // solo la regola della rimessa, senza spinte
  while (!stall && t < 10) { stall = step(st, 1 / 60, P).stall; t += 1 / 60; }
  assert.ok(stall && t >= 4 - 1e-6 && t < 4.1, `stallo a ${t}`);
  kickoff(st, 'A');
  assert.equal(st.ball.x, 0); assert.ok(st.ball.vx < 0);
});

import { FoosballAI } from '../src/minigames/foosball/ai.js';

test('IA: le aste di Nicola seguono la palla e il portiere tira verso la porta A', () => {
  const st = makeState(FIELD, rods());
  const ai = new FoosballAI('normale', mulberry(5));
  const gk = st.rods[7];
  st.ball.x = gk.x - 0.06; st.ball.y = 0.08;
  for (let i = 0; i < 90; i++) { ai.update(st, 1 / 60); step(st, 1 / 60); }
  assert.ok(st.ball.vx < 0 || Math.abs(gk.slide - 0.08) < 0.03, `slide ${gk.slide} vx ${st.ball.vx}`);
});

test('palla quasi ferma: dopo 1,2 s riceve una spinta e il gioco riparte', () => {
  const st = makeState(FIELD, rods());
  st.ball.x = 0.145; st.ball.y = 0.3;                // tra due aste, vicino alla sponda
  let t = 0, nudged = false;
  while (!nudged && t < 3) { nudged = !!step(st, 1 / 60).nudge; t += 1 / 60; }
  assert.ok(nudged && t < 1.3, `spinta a ${t}`);
  assert.ok(Math.hypot(st.ball.vx, st.ball.vy) > 0.3);
  assert.ok(st.ball.vy < 0, 'verso il centro del campo');
});

test('palla incastrata contro un piede che vibra: spinta entro 1,3 s e poi si allontana', () => {
  const st = makeState(FIELD, [makeRod(0.072, 'B', [0], 0.09, 0.112)]);
  st.ball.x = 0.072 + 0.0155 + 0.0176; st.ball.y = 0; st.ball.vx = -0.08;   // appoggiata al piede
  let t = 0, nudged = false;
  while (!nudged && t < 3) { st.ball.vx -= 0.02; nudged = !!step(st, 1 / 60).nudge; t += 1 / 60; }
  assert.ok(nudged && t < 1.3, `spinta a ${t}`);
  assert.ok(st.ball.vx > 0.3, 'via dal piede');
});

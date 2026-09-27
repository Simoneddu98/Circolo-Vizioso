import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBall, rack, simulate, step, onTable, newEvents, DEFAULTS } from '../src/minigames/pool/physics.js';

// tavolo del circolo: campo 2.17 x 1.05 (misurato in Blender), buche 0.035 oltre lo spigolo delle sponde
const hx = 1.085, hy = 0.525, o = 0.035;
const TABLE = { hx, hy, pockets: [[-1, -1, 0.06], [0, -1, 0.065], [1, -1, 0.06], [1, 1, 0.06], [0, 1, 0.065], [-1, 1, 0.06]]
  .map(([sx, sy, r]) => ({ x: sx * (hx + o), y: sy * (hy + o), r })) };

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('urto tra due palle: la quantità di moto si conserva', () => {
  const a = makeBall(0, -0.2, 0.004); const b = makeBall(1, 0, 0);
  a.vx = 2;
  const p0 = [a.vx + b.vx, a.vy + b.vy];
  const ev = newEvents();
  for (let i = 0; i < 30 && ev.ballContacts === 0; i++) step([a, b], TABLE, 1 / 240, ev, { ...DEFAULTS, decel: 0 });
  assert.equal(ev.ballContacts, 1);
  assert.ok(Math.abs(a.vx + b.vx - p0[0]) < 1e-9 && Math.abs(a.vy + b.vy - p0[1]) < 1e-9);
  assert.equal(ev.firstContact, 1);
});

test('2000 tiri casuali alla massima potenza: niente palle fuori, niente compenetrazioni, fine entro 30 s', () => {
  const rng = mulberry(3);
  let maxT = 0;
  for (let n = 0; n < 2000; n++) {
    const balls = [makeBall(0, -hx / 2, 0), ...rack(hx / 2, DEFAULTS.r, rng)];
    const a = rng() * Math.PI * 2;
    balls[0].vx = Math.cos(a) * DEFAULTS.maxShot; balls[0].vy = Math.sin(a) * DEFAULTS.maxShot;
    const { time } = simulate(balls, TABLE);
    maxT = Math.max(maxT, time);
    assert.ok(time < 30, `simulazione non ferma (${time}s)`);
    for (const b of balls) assert.ok(onTable(b, TABLE), `palla ${b.id} fuori dal tavolo`);
    const live = balls.filter((b) => !b.pocketed);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const d = Math.hypot(live[i].x - live[j].x, live[i].y - live[j].y);
      assert.ok(d >= live[i].r + live[j].r - 1e-4, `compenetrazione ${live[i].id}-${live[j].id}`);
    }
  }
  assert.ok(maxT > 1);
});

test('una palla dritta verso la buca d\'angolo entra', () => {
  const b = makeBall(3, 0.5, 0.2);
  const p = TABLE.pockets[3];
  const d = Math.hypot(p.x - b.x, p.y - b.y);
  b.vx = (p.x - b.x) / d * 2; b.vy = (p.y - b.y) / d * 2;
  const { events } = simulate([b], TABLE);
  assert.deepEqual(events.pocketed.map((e) => e.pocket), [3]);
});

import { EightBall } from '../src/minigames/pool/rules.js';
const shot = (first, ...ids) => ({ firstContact: first, pocketed: ids.map((id) => ({ id })) });

test('regole: il gruppo si assegna con la prima imbucata dopo l\'apertura', () => {
  const g = new EightBall(0);
  let r = g.applyShot(shot(1, 3));                 // apertura: imbucata ma nessun gruppo
  assert.equal(r.assigned, null);
  assert.equal(r.turnOver, false);                 // ha imbucato: continua
  r = g.applyShot(shot(12, 12));
  assert.equal(r.assigned, 'stripes');
  assert.deepEqual(g.groups, ['stripes', 'solids']);
  assert.equal(g.current, 0);
});

test('regole: falli e bianca in mano', () => {
  const g = new EightBall(0);
  g.applyShot(shot(1));                            // apertura senza imbucate
  assert.equal(g.current, 1);
  let r = g.applyShot(shot(null));
  assert.equal(r.foul, true); assert.equal(g.ballInHand, true); assert.equal(g.current, 0);
  r = g.applyShot(shot(2, 0));
  assert.equal(r.reason, 'bianca in buca');
  g.groups = ['solids', 'stripes']; g.current = 0;
  r = g.applyShot(shot(10));
  assert.equal(r.reason, 'prima palla toccata non tua');
  r = g.applyShot(shot(3, 3));                     // giocatore 1 (rigate) tocca una piena
  assert.equal(r.foul, true);
});

test('regole: vittoria e sconfitta sulla 8', () => {
  const win = new EightBall(0);
  win.shots = 5; win.groups = ['solids', 'stripes'];
  for (let id = 1; id <= 7; id++) win.pocketed.add(id);
  assert.equal(win.applyShot(shot(8, 8)).win, true);
  assert.equal(win.winner, 0);
  const early = new EightBall(0);
  early.shots = 5; early.groups = ['solids', 'stripes'];
  assert.equal(early.applyShot(shot(1, 1, 8)).lose, true);   // 8 prima del tempo
  assert.equal(early.winner, 1);
  const foul = new EightBall(0);
  foul.shots = 5; foul.groups = ['solids', 'stripes'];
  for (let id = 1; id <= 7; id++) foul.pocketed.add(id);
  assert.equal(foul.applyShot(shot(8, 8, 0)).lose, true);     // 8 insieme alla bianca
});

import { chooseShot, candidates } from '../src/minigames/pool/ai.js';

test('IA: con una palla davanti alla buca sceglie un colpo che la imbuca', () => {
  const balls = [makeBall(0, 0.2, 0.1), makeBall(3, 0.7, 0.3)];
  const shotAI = chooseShot(balls, TABLE, (id) => id >= 1 && id <= 7);
  assert.equal(shotAI.safety, false);
  const sim = balls.map((b) => ({ ...b }));
  sim[0].vx = Math.cos(shotAI.angle) * shotAI.speed; sim[0].vy = Math.sin(shotAI.angle) * shotAI.speed;
  const { events } = simulate(sim, TABLE);
  assert.ok(events.pocketed.some((e) => e.id === 3));
  assert.ok(!events.pocketed.some((e) => e.id === 0));
});

test('IA: scarta i colpi ostruiti', () => {
  // palla 3 dietro la 9: nessun colpo diretto sulla 3 verso le buche lontane passa
  const balls = [makeBall(0, -0.5, 0), makeBall(9, -0.2, 0), makeBall(3, 0.1, 0)];
  const c = candidates(balls, TABLE, (id) => id === 3);
  assert.ok(c.every((x) => Math.abs(x.angle) > 0.05), 'nessun colpo attraverso la 9');
});

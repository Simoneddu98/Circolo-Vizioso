import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PatataGame, W, CANNON_Y } from '../src/minigames/patata/rules.js';

// generatore ripetibile
const seeded = (s = 1) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

test('onda iniziale: 9 x 5 patate dentro lo schermo, tre vite', () => {
  const g = new PatataGame({}, seeded(3));
  assert.equal(g.potatoes.length, 45);
  assert.equal(g.lives, 3);
  for (const p of g.potatoes) assert.ok(p.x > 0 && p.x < W && p.y < CANNON_Y - 40);
});

test('un colpo sotto una patata la abbatte e dà i punti a chi ha sparato', () => {
  const g = new PatataGame({}, seeded(5));
  const p = g.potatoes.find((q) => q.kind === 'small');
  g.cannons.me.x = p.x;
  g.fireIn = 99; g.goldIn = 99;
  g.cannons.zugo.x = 0; g.cannons.zugo.cd = 99;          // Zugo fermo
  g._ai = () => {};
  const before = g.potatoes.length;
  g.fire('me');
  for (let i = 0; i < 120 && g.potatoes.length === before; i++) g.step(1 / 60, {});
  assert.equal(g.potatoes.length, before - 1);
  assert.ok(g.score.me >= 10);
  assert.equal(g.score.zugo, 0);
});

test('al massimo due proiettili a testa e rispetto della ricarica', () => {
  const g = new PatataGame({}, seeded(7));
  assert.ok(g.fire('me'));
  assert.ok(!g.fire('me'));                               // ricarica
  g.cannons.me.cd = 0;
  assert.ok(g.fire('me'));
  g.cannons.me.cd = 0;
  assert.ok(!g.fire('me'));                               // già due in volo
});

test('le patatine tolgono vite; a zero vite la partita finisce', () => {
  const g = new PatataGame({}, seeded(9));
  g.fireIn = 99; g._ai = () => {};
  for (let k = 0; k < 3; k++) {
    g.cannons.me.hurt = 0;
    g.drops.push({ x: g.cannons.me.x, y: CANNON_Y - 1 });
    g.step(1 / 60, {});
  }
  assert.equal(g.lives, 0);
  assert.equal(g.over, 'vite');
});

test('partite simulate: finiscono sempre, punti coerenti, Zugo fa punti da solo', () => {
  for (let s = 1; s <= 30; s++) {
    const rng = seeded(s * 31);
    const g = new PatataGame({}, rng);
    let t = 0;
    while (!g.over && t < 600) {
      g.step(1 / 60, { move: rng() < 0.5 ? -1 : 1, fire: rng() < 0.3 });
      t += 1 / 60;
    }
    assert.ok(g.over, `partita ${s} non finita in 10 minuti`);
    assert.ok(g.score.me >= 0 && g.score.zugo > 0);
    assert.ok(['me', 'zugo'].includes(g.winner()));
    for (const c of Object.values(g.cannons)) assert.ok(c.x >= 10 && c.x <= W - 10);
  }
});

test('finita un\'onda ne parte un\'altra più veloce', () => {
  const g = new PatataGame({}, seeded(11));
  const v1 = g.speed();
  g.potatoes = [];
  g.step(1 / 60, {});
  assert.equal(g.wave, 2);
  assert.equal(g.potatoes.length, 45);
  assert.ok(g.speed() > v1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAt, targetPoint, X01, AroundTheClock, ORDER, RADII, chooseTarget } from '../src/minigames/darts/rules.js';

const polar = (deg, r) => [r * Math.sin(deg * Math.PI / 180), r * Math.cos(deg * Math.PI / 180)];

test('anelli e settori noti', () => {
  assert.equal(scoreAt(...polar(0, 0.103)).points, 60);          // tripla 20
  assert.equal(scoreAt(0, 0).points, 50);                          // bull
  assert.equal(scoreAt(0, 0.012).points, 25);                      // 25 esterno
  const i3 = ORDER.indexOf(3);
  assert.equal(scoreAt(...polar(i3 * 18, 0.166)).points, 6);      // doppia 3
  assert.equal(scoreAt(0, 0.2).points, 0);                         // fuori
  assert.equal(scoreAt(0, 0.2).ring, 'miss');
  assert.equal(scoreAt(...polar(18, 0.13)).points, 1);             // singolo 1
  assert.equal(scoreAt(...polar(-18, 0.13)).points, 5);            // singolo 5
});

test('ogni settore, ogni anello, al centro del bersaglio', () => {
  for (const v of ORDER) {
    for (const [ring, mult] of [['single', 1], ['double', 2], ['triple', 3]]) {
      const p = targetPoint(v, ring);
      const h = scoreAt(p.x, p.y);
      assert.equal(h.value, v, `${ring} ${v}`);
      assert.equal(h.points, v * mult, `${ring} ${v}`);
    }
  }
});

test('confini tra settori e tra anelli', () => {
  assert.equal(scoreAt(...polar(8.9, 0.13)).value, 20);
  assert.equal(scoreAt(...polar(9.1, 0.13)).value, 1);
  assert.equal(scoreAt(...polar(-8.9, 0.13)).value, 20);
  assert.equal(scoreAt(...polar(-9.1, 0.13)).value, 5);
  assert.equal(scoreAt(...polar(180, 0.13)).value, 3);           // in basso il 3
  assert.equal(scoreAt(...polar(90, 0.13)).value, 6);            // a destra il 6
  assert.equal(scoreAt(...polar(270, 0.13)).value, 11);          // a sinistra l'11
  assert.equal(scoreAt(0, RADII.treble_in - 0.0005).ring, 'single');
  assert.equal(scoreAt(0, RADII.treble_in + 0.0005).ring, 'triple');
  assert.equal(scoreAt(0, RADII.double_out - 0.0005).ring, 'double');
  assert.equal(scoreAt(0, RADII.double_out + 0.0005).ring, 'miss');
  assert.equal(scoreAt(0, RADII.bull + 0.0003).ring, 'bull25');
});

const hit = (points, ring = 'single') => ({ points, ring, value: points });

test('301: sballato riporta al punteggio di inizio turno', () => {
  const g = new X01({ start: 301 });
  g.scores[0] = 40; g.turnStart = 40;
  assert.equal(g.throw(hit(20)).bust, undefined);
  assert.equal(g.scores[0], 20);
  const r = g.throw(hit(60, 'triple'));
  assert.equal(r.bust, true);
  assert.equal(g.scores[0], 40);
  assert.equal(g.current, 1);
});

test('301: chiusura esatta a 0 (semplice e con doppio)', () => {
  const g = new X01();
  g.scores[0] = 32; g.turnStart = 32;
  g.throw(hit(12));
  const r = g.throw(hit(20));
  assert.equal(r.checkout, true);
  assert.equal(g.winner, 0);
  const d = new X01({ doubleOut: true });
  d.scores[0] = 32; d.turnStart = 32;
  assert.equal(d.throw(hit(32, 'single')).bust, true);          // a zero senza doppio: sballato
  d.current = 0; d.scores[0] = 32; d.turnStart = 32;
  assert.equal(d.throw({ points: 32, value: 16, ring: 'double' }).checkout, true);
});

test('301: tre freccette per turno', () => {
  const g = new X01();
  g.throw(hit(1)); g.throw(hit(1));
  assert.equal(g.current, 0);
  assert.equal(g.throw(hit(1)).turnOver, true);
  assert.equal(g.current, 1);
});

test('strategia: chiude quando può', () => {
  assert.deepEqual(chooseTarget(301), { value: 20, ring: 'triple' });
  assert.deepEqual(chooseTarget(17), { value: 17, ring: 'single' });
  assert.deepEqual(chooseTarget(50), { value: 50, ring: 'bull50' });
  assert.deepEqual(chooseTarget(57), { value: 19, ring: 'triple' });
});

test('giro dell\'orologio', () => {
  const g = new AroundTheClock();
  g.throw({ value: 2, ring: 'single' });
  assert.equal(g.target, 1);
  for (let v = 1; v <= 20; v++) g.throw({ value: v, ring: 'double' });
  assert.equal(g.label, 'Centro');
  g.throw({ value: 25, ring: 'bull25' });
  assert.equal(g.done, true);
  assert.equal(g.darts, 22);
});

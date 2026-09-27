// Freccette: punteggio dal punto d'impatto e regole di 301 / Giro dell'orologio. Logica pura, senza three.js.
// Coordinate del bersaglio: metri, origine al centro, x a destra, y verso il settore 20.

export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export const RADII = { bull: 0.00635, outer_bull: 0.0159, treble_in: 0.099, treble_out: 0.107, double_in: 0.162, double_out: 0.170 };

// { value, points, ring: 'miss'|'single'|'double'|'triple'|'bull25'|'bull50', label }
export function scoreAt(x, y, R = RADII, order = ORDER) {
  const r = Math.hypot(x, y);
  if (r <= R.bull) return { value: 50, points: 50, mult: 2, ring: 'bull50', label: '50' };
  if (r <= R.outer_bull) return { value: 25, points: 25, mult: 1, ring: 'bull25', label: '25' };
  if (r > R.double_out) return { value: 0, points: 0, mult: 0, ring: 'miss', label: 'Fuori' };
  // angolo dall'alto in senso orario; il settore 20 è centrato sull'alto (±9°)
  let a = Math.atan2(x, y) * 180 / Math.PI;           // 0 = alto, positivo verso destra
  a = (a + 9 + 360) % 360;
  const value = order[Math.floor(a / 18) % 20];
  if (r >= R.treble_in && r <= R.treble_out) return { value, points: value * 3, mult: 3, ring: 'triple', label: `T${value}` };
  if (r >= R.double_in) return { value, points: value * 2, mult: 2, ring: 'double', label: `D${value}` };
  return { value, points: value, mult: 1, ring: 'single', label: String(value) };
}

// Punto al centro di un bersaglio (per mirare): ring = 'single' | 'double' | 'triple' | 'bull50' | 'bull25'
export function targetPoint(value, ring = 'single', R = RADII, order = ORDER) {
  if (ring === 'bull50') return { x: 0, y: 0 };
  if (ring === 'bull25') return { x: 0, y: (R.bull + R.outer_bull) / 2 };
  const i = order.indexOf(value);
  const ang = i * 18 * Math.PI / 180;
  const r = ring === 'triple' ? (R.treble_in + R.treble_out) / 2
    : ring === 'double' ? (R.double_in + R.double_out) / 2
      : (R.treble_out + R.double_in) / 2;
  return { x: r * Math.sin(ang), y: r * Math.cos(ang) };
}

// ------------------------------------------------------------------ 301

export class X01 {
  constructor({ start = 301, players = 2, doubleOut = false } = {}) {
    this.start = start;
    this.doubleOut = doubleOut;
    this.scores = Array(players).fill(start);
    this.current = 0;
    this.darts = [];                 // freccette del turno in corso
    this.turnStart = start;
    this.winner = null;
    this.history = [];
  }

  // registra una freccetta; ritorna { bust, checkout, turnOver }
  throw(hit) {
    if (this.winner !== null) return { turnOver: true };
    const p = this.current;
    const left = this.scores[p] - hit.points;
    this.darts.push(hit);
    const lastIsDouble = hit.ring === 'double' || hit.ring === 'bull50';
    if (left < 0 || (this.doubleOut && (left === 1 || (left === 0 && !lastIsDouble)))) {
      this.scores[p] = this.turnStart;            // sballato: si torna al punteggio di inizio turno
      this._endTurn(true);
      return { bust: true, turnOver: true };
    }
    this.scores[p] = left;
    if (left === 0) {
      this.winner = p;
      this.history.push({ player: p, darts: this.darts, bust: false });
      this.darts = [];
      return { checkout: true, turnOver: true };
    }
    if (this.darts.length >= 3) { this._endTurn(false); return { turnOver: true }; }
    return { turnOver: false };
  }

  _endTurn(bust) {
    this.history.push({ player: this.current, darts: this.darts, bust });
    this.darts = [];
    this.current = (this.current + 1) % this.scores.length;
    this.turnStart = this.scores[this.current];
  }
}

// Strategia dell'avversario: tripla 20 finché serve, poi il colpo che chiude o avvicina alla chiusura
export function chooseTarget(left, dartsLeft = 3, doubleOut = false) {
  if (!doubleOut) {
    if (left > 60) return { value: 20, ring: 'triple' };
    if (left === 50) return { value: 50, ring: 'bull50' };
    if (left === 25) return { value: 25, ring: 'bull25' };
    if (left <= 20) return { value: left, ring: 'single' };
    if (left % 3 === 0 && left / 3 <= 20) return { value: left / 3, ring: 'triple' };
    if (left % 2 === 0 && left / 2 <= 20) return { value: left / 2, ring: 'double' };
    // lascia un resto chiudibile con una singola: tripla che porta sotto 20
    for (let v = 20; v >= 1; v--) if (left - v * 3 >= 1 && left - v * 3 <= 20) return { value: v, ring: 'triple' };
    return { value: 20, ring: 'single' };
  }
  if (left > 60) return { value: 20, ring: 'triple' };
  if (left === 50) return { value: 50, ring: 'bull50' };
  if (left % 2 === 0 && left / 2 <= 20) return { value: left / 2, ring: 'double' };
  if (left <= 40) return { value: left % 2 ? 1 : 2, ring: 'single' };
  for (let v = 20; v >= 1; v--) { const r = left - v; if (r > 0 && r % 2 === 0 && r / 2 <= 20) return { value: v, ring: 'single' }; }
  return { value: 20, ring: 'single' };
}

// ------------------------------------------------------------------ Giro dell'orologio

export class AroundTheClock {
  constructor() { this.target = 1; this.darts = 0; this.done = false; }
  get label() { return this.target <= 20 ? String(this.target) : 'Centro'; }
  throw(hit) {
    if (this.done) return { advanced: false };
    this.darts++;
    const ok = this.target <= 20 ? hit.value === this.target && hit.ring !== 'miss' && hit.ring !== 'bull25' && hit.ring !== 'bull50'
      : hit.ring === 'bull25' || hit.ring === 'bull50';
    if (ok) {
      this.target++;
      if (this.target > 21) this.done = true;
    }
    return { advanced: ok };
  }
}

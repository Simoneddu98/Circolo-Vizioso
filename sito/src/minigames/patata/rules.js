// Patata Simulator 3000 — logica pura (niente DOM, niente three.js): uno Space Invaders con le patate.
// Due cannoni in basso, il tuo e quello di Zugo (IA); le patate scendono a file e lanciano patatine fritte.
// Vite in comune; chi abbatte più patate vince. Finisce quando le vite sono zero o le patate arrivano ai cannoni.
// Coordinate logiche: campo W x H, y verso il basso.

export const W = 320, H = 180;
export const CANNON_Y = 164;
const TYPES = [                       // dall'alto: patatona, patata, patata novella
  { kind: 'big', pts: 30, r: 7.5 },
  { kind: 'mid', pts: 20, r: 6.5 },
  { kind: 'mid', pts: 20, r: 6.5 },
  { kind: 'small', pts: 10, r: 5.5 },
  { kind: 'small', pts: 10, r: 5.5 },
];

export class PatataGame {
  constructor(opts = {}, rng = Math.random) {
    this.rng = rng;
    this.o = { lives: 3, cols: 9, rows: 5, cannonSpeed: 120, bulletSpeed: 220, dropSpeed: 60, cooldown: 0.38, aiCooldown: 0.55,
      aiError: 8, aiSpread: 7, stepDown: 7, baseSpeed: 14, ...opts };
    this.lives = this.o.lives;
    this.wave = 0;
    this.score = { me: 0, zugo: 0 };
    this.cannons = {
      me: { x: W * 0.35, cd: 0, hurt: 0 },
      zugo: { x: W * 0.65, cd: 0, hurt: 0, target: W * 0.65, think: 0 },
    };
    this.bullets = [];                // { x, y, owner }
    this.drops = [];                  // patatine: { x, y }
    this.gold = null;                 // patata dorata che attraversa in alto: { x, dir }
    this.goldIn = 12;
    this.over = false;
    this.events = [];                 // per la vista: { type: 'hit'|'gold'|'hurt'|'wave'|'shot', ... }
    this.nextWave();
  }

  nextWave() {
    this.wave++;
    this.potatoes = [];
    const { cols, rows } = this.o;
    const gap = 26, x0 = (W - (cols - 1) * gap) / 2;
    for (let r = 0; r < rows; r++) {
      const t = TYPES[r % TYPES.length];
      for (let c = 0; c < cols; c++) this.potatoes.push({ x: x0 + c * gap, y: 26 + r * 17 + Math.min(18, (this.wave - 1) * 4), ...t, wob: this.rng() * 6 });
    }
    this.dir = 1;
    this.fireIn = 1.2;
    this.events.push({ type: 'wave', n: this.wave });
  }

  // velocità orizzontale della formazione: cresce con l'onda e quando le patate sono poche
  speed() {
    const n = this.potatoes.length, tot = this.o.cols * this.o.rows;
    return this.o.baseSpeed * (1 + (this.wave - 1) * 0.35) * (1 + 2.2 * (1 - n / tot));
  }

  fire(who) {
    const c = this.cannons[who];
    if (this.over || c.cd > 0 || c.hurt > 0.6) return false;
    if (this.bullets.filter((b) => b.owner === who).length >= 2) return false;
    c.cd = who === 'me' ? this.o.cooldown : this.o.aiCooldown;
    this.bullets.push({ x: c.x, y: CANNON_Y - 8, owner: who });
    this.events.push({ type: 'shot', owner: who });
    return true;
  }

  // input: { move: -1..1, fire: bool, dx: pixel logici di spostamento diretto (mouse) }
  step(dt, input = {}) {
    if (this.over) return;
    const o = this.o;
    // cannone del giocatore
    const me = this.cannons.me;
    me.x += (input.move ?? 0) * o.cannonSpeed * dt + (input.dx ?? 0);
    me.x = Math.max(10, Math.min(W - 10, me.x));
    if (input.fire) this.fire('me');
    this._ai(dt);
    for (const c of Object.values(this.cannons)) { c.cd = Math.max(0, c.cd - dt); c.hurt = Math.max(0, c.hurt - dt); }
    // formazione
    const v = this.speed() * this.dir * dt;
    let edge = false;
    for (const p of this.potatoes) { p.x += v; p.wob += dt * 5; if (p.x < 10 || p.x > W - 10) edge = true; }
    if (edge) {
      this.dir *= -1;
      for (const p of this.potatoes) { p.y += o.stepDown; p.x = Math.max(10, Math.min(W - 10, p.x)); }
    }
    // patatine: una patata in fondo a una colonna lancia
    this.fireIn -= dt;
    if (this.fireIn <= 0 && this.potatoes.length) {
      const bottoms = new Map();
      for (const p of this.potatoes) { const k = Math.round(p.x); if (!bottoms.has(k) || bottoms.get(k).y < p.y) bottoms.set(k, p); }
      const list = [...bottoms.values()];
      const p = list[Math.floor(this.rng() * list.length)];
      this.drops.push({ x: p.x, y: p.y + p.r });
      this.fireIn = Math.max(0.35, 1.3 - this.wave * 0.12) * (0.6 + this.rng() * 0.8);
    }
    // patata dorata
    this.goldIn -= dt;
    if (!this.gold && this.goldIn <= 0) { const d = this.rng() < 0.5 ? 1 : -1; this.gold = { x: d > 0 ? -10 : W + 10, dir: d }; }
    if (this.gold) {
      this.gold.x += this.gold.dir * 55 * dt;
      if (this.gold.x < -14 || this.gold.x > W + 14) { this.gold = null; this.goldIn = 14 + this.rng() * 10; }
    }
    // proiettili
    for (const b of this.bullets) b.y -= o.bulletSpeed * dt;
    for (const b of [...this.bullets]) {
      if (b.y < 4) { this._remove(this.bullets, b); continue; }
      if (this.gold && Math.abs(b.x - this.gold.x) < 9 && Math.abs(b.y - 12) < 6) {
        this.score[b.owner] += 100;
        this.events.push({ type: 'gold', owner: b.owner, x: this.gold.x, y: 12 });
        this.gold = null; this.goldIn = 16 + this.rng() * 10;
        this._remove(this.bullets, b);
        continue;
      }
      const hit = this.potatoes.find((p) => Math.abs(b.x - p.x) < p.r + 1.5 && Math.abs(b.y - p.y) < p.r * 0.8 + 2);
      if (hit) {
        this.score[b.owner] += hit.pts;
        this.events.push({ type: 'hit', owner: b.owner, x: hit.x, y: hit.y, pts: hit.pts, kind: hit.kind });
        this._remove(this.potatoes, hit);
        this._remove(this.bullets, b);
      }
    }
    // patatine che cadono
    for (const d of this.drops) d.y += o.dropSpeed * (1 + this.wave * 0.08) * dt;
    for (const d of [...this.drops]) {
      if (d.y > H) { this._remove(this.drops, d); continue; }
      for (const [who, c] of Object.entries(this.cannons)) {
        if (c.hurt <= 0 && Math.abs(d.x - c.x) < 9 && Math.abs(d.y - CANNON_Y) < 6) {
          this._remove(this.drops, d);
          c.hurt = 1.4;
          this.lives--;
          this.events.push({ type: 'hurt', owner: who });
          if (this.lives <= 0) this.over = 'vite';
          break;
        }
      }
    }
    // le patate arrivano ai cannoni
    if (this.potatoes.some((p) => p.y + p.r >= CANNON_Y - 8)) { this.over = 'invasione'; this.lives = 0; }
    if (!this.over && !this.potatoes.length) this.nextWave();
  }

  // Zugo: sceglie la patata più bassa vicina, ci si mette sotto (con un po' di errore), spara; schiva le patatine vicine
  _ai(dt) {
    const z = this.cannons.zugo;
    z.think -= dt;
    if (z.think <= 0 && this.potatoes.length) {
      z.think = 0.35 + this.rng() * 0.3;
      let best = null, bs = Infinity;
      for (const p of this.potatoes) {
        const s = Math.abs(p.x - z.x) - p.y * 0.6;
        if (s < bs) { bs = s; best = p; }
      }
      if (this.gold && this.rng() < 0.3) best = { x: this.gold.x + this.gold.dir * 20 };
      z.target = best.x + (this.rng() - 0.5) * 2 * this.o.aiError;
    }
    const danger = this.drops.find((d) => Math.abs(d.x - z.x) < 12 && d.y > CANNON_Y - 50);
    const goal = danger ? z.x + (d2(danger.x, z.x)) * 30 : z.target;
    const dx = goal - z.x;
    const step = this.o.cannonSpeed * 0.8 * dt;
    z.x += Math.max(-step, Math.min(step, dx));
    z.x = Math.max(10, Math.min(W - 10, z.x));
    if (Math.abs(dx) < this.o.aiSpread && !danger) this.fire('zugo');
  }

  _remove(list, item) { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1); }

  winner() { return this.score.me >= this.score.zugo ? 'me' : 'zugo'; }
}

// verso di fuga dalla patatina: dalla parte opposta
const d2 = (from, x) => (x >= from ? 1 : -1);

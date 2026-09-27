// Avversario del biliardo (Tonino). Per ogni coppia palla del proprio gruppo - buca calcola il colpo con la ghost ball,
// scarta traiettorie ostruite e tagli oltre 75°, prova i candidati con la stessa fisica del gioco e sceglie quello che
// imbuca con la bianca messa meglio dopo il colpo; poi aggiunge un errore gaussiano su angolo e potenza.
import { simulate, DEFAULTS } from './physics.js';

export const LEVELS = { facile: { angle: 0.03, power: 0.12 }, normale: { angle: 0.012, power: 0.06 }, difficile: { angle: 0.005, power: 0.03 } };
const MAX_CUT = 75 * Math.PI / 180;

function segClear(ax, ay, bx, by, balls, skip, clearance) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  for (const o of balls) {
    if (o.pocketed || skip.includes(o.id)) continue;
    const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.y - ay) * dy) / L2));
    if (Math.hypot(ax + dx * t - o.x, ay + dy * t - o.y) < clearance) return false;
  }
  return true;
}

const clone = (balls) => balls.map((b) => ({ ...b }));

// Candidati geometrici: [{ target, pocket, angle, speed, cut }]
export function candidates(balls, table, legal) {
  const cue = balls.find((b) => b.id === 0);
  const r = cue.r;
  const out = [];
  for (const b of balls) {
    if (b.pocketed || b.id === 0 || !legal(b.id)) continue;
    table.pockets.forEach((p, k) => {
      const px = p.x - b.x, py = p.y - b.y, dp = Math.hypot(px, py);
      const gx = b.x - (px / dp) * 2 * r, gy = b.y - (py / dp) * 2 * r;          // ghost ball
      const cx = gx - cue.x, cy = gy - cue.y, dc = Math.hypot(cx, cy);
      if (dc < 1e-6) return;
      const cut = Math.acos(Math.max(-1, Math.min(1, (cx * px + cy * py) / (dc * dp))));
      if (cut > MAX_CUT) return;
      if (!segClear(cue.x, cue.y, gx, gy, balls, [0, b.id], 2 * r * 0.98)) return;
      if (!segClear(b.x, b.y, p.x, p.y, balls, [0, b.id], 2 * r * 0.98)) return;
      const speed = Math.min(DEFAULTS.maxShot * 0.9, 1.1 + 1.6 * (dc + dp) / Math.max(0.35, Math.cos(cut)));
      out.push({ target: b.id, pocket: k, angle: Math.atan2(cy, cx), speed, cut, dist: dc + dp });
    });
  }
  return out.sort((a, b) => a.cut + a.dist * 0.3 - (b.cut + b.dist * 0.3));
}

// Sceglie il colpo; gauss() fornisce il rumore (iniettabile per i test)
export function chooseShot(balls, table, legal, { level = 'normale', gauss = () => 0, maxTry = 12 } = {}) {
  const cands = candidates(balls, table, legal).slice(0, maxTry);
  let best = null;
  for (const c of cands) {
    const sim = clone(balls);
    const cue = sim.find((b) => b.id === 0);
    cue.vx = Math.cos(c.angle) * c.speed; cue.vy = Math.sin(c.angle) * c.speed;
    const { events } = simulate(sim, table, 20, 1 / 120);
    const potted = events.pocketed.some((e) => e.id === c.target);
    const scratch = events.pocketed.some((e) => e.id === 0);
    const wrongFirst = events.firstContact !== c.target;
    if (!potted || scratch || wrongFirst) continue;
    const endCue = sim.find((b) => b.id === 0);
    const central = 1 - Math.min(1, Math.hypot(endCue.x / table.hx, endCue.y / table.hy));     // bianca lontana dalle sponde
    const next = candidates(sim, table, legal).length > 0 ? 1 : 0;                              // resta un colpo dopo
    const score = 2 + central * 0.5 + next - c.cut * 0.4;
    if (!best || score > best.score) best = { ...c, score, safety: false };
  }
  if (!best) best = safetyShot(balls, legal);
  const L = LEVELS[level] ?? LEVELS.normale;
  return { ...best, angle: best.angle + gauss() * L.angle, speed: Math.min(DEFAULTS.maxShot, best.speed * (1 + gauss() * L.power)) };
}

// Colpo di sicurezza: tocca piano la palla legale più vicina (evita il fallo di nessuna palla toccata)
export function safetyShot(balls, legal) {
  const cue = balls.find((b) => b.id === 0);
  let best = null;
  for (const b of balls) {
    if (b.pocketed || b.id === 0 || !legal(b.id)) continue;
    const d = Math.hypot(b.x - cue.x, b.y - cue.y);
    if (!best || d < best.d) best = { d, b };
  }
  if (!best) return { angle: 0, speed: 1.5, safety: true, target: null };
  return { angle: Math.atan2(best.b.y - cue.y, best.b.x - cue.x), speed: Math.min(3, 0.9 + best.d * 1.4), safety: true, target: best.b.id };
}

// Dove posare la bianca con la bianca in mano: il punto (su una griglia) che dà il colpo migliore
export function placeCue(balls, table, legal) {
  const cue = balls.find((b) => b.id === 0);
  let best = null;
  for (let gx = -0.8; gx <= 0.81; gx += 0.2) {
    for (let gy = -0.35; gy <= 0.36; gy += 0.175) {
      const x = gx * table.hx, y = gy * table.hy / 0.35 * 0.35;
      if (balls.some((b) => !b.pocketed && b.id !== 0 && Math.hypot(b.x - x, b.y - y) < 2.2 * cue.r)) continue;
      const trial = balls.map((b) => (b.id === 0 ? { ...b, x, y, pocketed: false } : b));
      const c = candidates(trial, table, legal)[0];
      const s = c ? -c.cut - c.dist * 0.3 : -9;
      if (!best || s > best.s) best = { x, y, s };
    }
  }
  return best ?? { x: -table.hx / 2, y: 0 };
}

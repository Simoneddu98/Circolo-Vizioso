// Biliardino: fisica 2D sul piano di FOOSBALL_Field. Logica pura, senza three.js.
// x lungo il campo (porta A a -hx, porta B a +hx), y laterale. Aste: { x, team, offsets[], travel, leg, slide, slideVel, angle, omega }
// angle = rotazione dell'asta (0 = omini verticali, positivo = piede verso +x), limitata a ±90°: niente rullate.

export const DEFAULTS = { r: 0.0175, restWall: 0.7, restFoot: 0.7, decel: 0.15, maxSpeed: 8, footHalf: [0.0155, 0.017],
  activeAngle: 35 * Math.PI / 180, stallTime: 4, maxAngle: Math.PI / 2,
  // come le leggere pendenze di un campo vero: una palla quasi ferma per nudgeTime secondi riceve una spinta verso il
  // centro del campo e verso l'asta più vicina, così il gioco non si pianta
  nudgeTime: 1.2, nudgeSpeed: 0.45, stallMove: 0.015 };

export function makeState(field, rods, P = DEFAULTS) {
  return { field, rods, ball: { x: 0, y: 0, vx: 0, vy: 0, r: P.r }, slow: 0, time: 0 };
}

export function makeRod(x, team, offsets, travel, leg) {
  return { x, team, offsets, travel, leg, slide: 0, slideVel: 0, angle: 0, omega: 0 };
}

// posizione e velocità del piede k dell'asta
function foot(rod, k, P) {
  const s = Math.sin(rod.angle), c = Math.cos(rod.angle);
  return { x: rod.x + rod.leg * s, y: rod.slide + rod.offsets[k], vx: rod.leg * c * rod.omega, vy: rod.slideVel, hx: P.footHalf[0], hy: P.footHalf[1] };
}

export function footActive(rod, P = DEFAULTS) { return Math.abs(rod.angle) <= P.activeAngle; }

// Avanza di dt; ritorna gli eventi { goal: 'A'|'B'|null, hits: [{ kind, speed }], stall }
export function step(st, dt, P = DEFAULTS) {
  const ev = { goal: null, hits: [], stall: false };
  const b = st.ball;
  let vf = 0;
  for (const r of st.rods) vf = Math.max(vf, Math.abs(r.omega) * r.leg + Math.abs(r.slideVel));
  const n = Math.max(1, Math.ceil(((Math.hypot(b.vx, b.vy) + vf) * dt) / (0.5 * b.r)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    for (const r of st.rods) {
      r.angle += r.omega * h;
      if (r.angle > P.maxAngle) { r.angle = P.maxAngle; r.omega = 0; }
      if (r.angle < -P.maxAngle) { r.angle = -P.maxAngle; r.omega = 0; }
      r.slide += r.slideVel * h;
      if (r.slide > r.travel) { r.slide = r.travel; r.slideVel = 0; }
      if (r.slide < -r.travel) { r.slide = -r.travel; r.slideVel = 0; }
    }
    const v = Math.hypot(b.vx, b.vy);
    if (v > 0) {
      const nv = Math.max(0, v - P.decel * h);
      b.vx *= nv / v; b.vy *= nv / v;
    }
    b.x += b.vx * h; b.y += b.vy * h;
    feet(st, ev, P);
    if (walls(st, ev, P)) break;
    const s2 = Math.hypot(b.vx, b.vy);
    if (s2 > P.maxSpeed) { b.vx *= P.maxSpeed / s2; b.vy *= P.maxSpeed / s2; }
  }
  st.time += dt;
  // stallo misurato sullo spostamento, non sulla velocità: una palla incastrata contro un piede vibra ma non si muove
  if (!ev.goal) {
    if (!st.anchor) st.anchor = { x: b.x, y: b.y, t: 0 };
    if (Math.hypot(b.x - st.anchor.x, b.y - st.anchor.y) > P.stallMove) st.anchor = { x: b.x, y: b.y, t: 0 };
    else st.anchor.t += dt;
    if (P.nudgeTime > 0 && st.anchor.t >= P.nudgeTime && !st.anchor.nudged) {
      st.anchor.nudged = true;
      // spinta via dal piede più vicino (se ce n'è uno a contatto), verso il centro del campo
      let fx = 0, fy = 0;
      for (const rod of st.rods) for (let k = 0; k < rod.offsets.length; k++) {
        const f = foot(rod, k, P);
        const d = Math.hypot(b.x - f.x, b.y - f.y);
        if (d < b.r + 0.03) { fx += (b.x - f.x) / (d || 1); fy += (b.y - f.y) / (d || 1); }
      }
      if (!fx && !fy) {
        const rod = st.rods.reduce((a, r) => (!a || Math.abs(r.x - b.x) < Math.abs(a.x - b.x) ? r : a), null);
        fx = rod ? Math.sign(rod.x - b.x) || 1 : (Math.random() < 0.5 ? -1 : 1);
      }
      fy += -Math.sign(b.y) * Math.min(1, Math.abs(b.y) / st.field.hy);
      const n = Math.hypot(fx, fy) || 1;
      b.vx = (fx / n) * P.nudgeSpeed; b.vy = (fy / n) * P.nudgeSpeed;
      ev.nudge = true;
    }
    if (st.anchor.t >= P.stallTime) { ev.stall = true; st.anchor = null; }
  }
  return ev;
}

function feet(st, ev, P) {
  const b = st.ball;
  for (const rod of st.rods) {
    if (!footActive(rod, P)) continue;
    for (let k = 0; k < rod.offsets.length; k++) {
      const f = foot(rod, k, P);
      const cx = Math.max(f.x - f.hx, Math.min(b.x, f.x + f.hx));
      const cy = Math.max(f.y - f.hy, Math.min(b.y, f.y + f.hy));
      let dx = b.x - cx, dy = b.y - cy;
      let d = Math.hypot(dx, dy);
      if (d >= b.r) continue;
      if (d < 1e-9) {                                 // centro dentro il piede: esce dal lato più vicino
        const px = f.hx - Math.abs(b.x - f.x), py = f.hy - Math.abs(b.y - f.y);
        if (px < py) { dx = Math.sign(b.x - f.x) || 1; dy = 0; } else { dx = 0; dy = Math.sign(b.y - f.y) || 1; }
        d = 0;
        b.x = px < py ? f.x + dx * (f.hx + b.r) : b.x;
        b.y = px < py ? b.y : f.y + dy * (f.hy + b.r);
      } else {
        dx /= d; dy /= d;
        b.x = cx + dx * b.r; b.y = cy + dy * b.r;
      }
      const rel = (b.vx - f.vx) * dx + (b.vy - f.vy) * dy;
      if (rel < 0) {
        b.vx -= (1 + P.restFoot) * rel * dx;
        b.vy -= (1 + P.restFoot) * rel * dy;
        ev.hits.push({ kind: 'foot', speed: -rel, team: rod.team });
      }
    }
  }
}

function walls(st, ev, P) {
  const b = st.ball, { hx, hy, goalHalf } = st.field;
  if (b.y > hy - b.r) { b.y = 2 * (hy - b.r) - b.y; if (b.vy > 0) { ev.hits.push({ kind: 'wall', speed: b.vy }); b.vy = -b.vy * P.restWall; } }
  if (b.y < -hy + b.r) { b.y = 2 * (-hy + b.r) - b.y; if (b.vy < 0) { ev.hits.push({ kind: 'wall', speed: -b.vy }); b.vy = -b.vy * P.restWall; } }
  for (const side of [1, -1]) {
    if (side * b.x > hx - b.r) {
      if (Math.abs(b.y) < goalHalf - b.r * 0.2) {     // dentro la porta: gol quando il centro supera la linea
        if (side * b.x > hx) { ev.goal = side > 0 ? 'B' : 'A'; return true; }
      } else {
        b.x = side * (2 * (hx - b.r)) - b.x;
        if (side * b.vx > 0) { ev.hits.push({ kind: 'wall', speed: Math.abs(b.vx) }); b.vx = -b.vx * P.restWall; }
      }
    }
  }
  return false;
}

export function reach(rod, P = DEFAULTS) { return rod.leg * Math.sin(P.activeAngle) + P.footHalf[0] + P.r; }

export function reachable(st, P = DEFAULTS) {
  const b = st.ball;
  return st.rods.some((r) => Math.abs(b.x - r.x) < reach(r, P)
    && r.offsets.some((o) => Math.abs(b.y - o) <= r.travel + P.footHalf[1] + b.r));
}

// Rimessa al centro, spinta leggera verso chi ha subito il gol ('A' o 'B'); senza argomento, ferma al centro
export function kickoff(st, towards = null, speed = 0.25) {
  const b = st.ball;
  st.anchor = null;
  b.x = 0; b.y = 0; b.vy = (Math.random() - 0.5) * speed * 1.2;
  // senza direzione (rimessa per stallo) una spinta leggera a caso: la palla non resta mai ferma al centro
  b.vx = towards === 'A' ? -speed : towards === 'B' ? speed : (Math.random() < 0.5 ? -1 : 1) * speed;
  st.slow = 0;
}

export function ballInsideFoot(st, P = DEFAULTS, eps = 1e-4) {
  const b = st.ball;
  return st.rods.some((rod) => footActive(rod, P) && rod.offsets.some((_, k) => {
    const f = foot(rod, k, P);
    const cx = Math.max(f.x - f.hx, Math.min(b.x, f.x + f.hx)), cy = Math.max(f.y - f.hy, Math.min(b.y, f.y + f.hy));
    return Math.hypot(b.x - cx, b.y - cy) < b.r - eps;
  }));
}

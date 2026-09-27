// Biliardo: fisica 2D sul piano di POOL_Surface. Logica pura, senza three.js.
// Coordinate in metri, origine al centro del panno, x lungo il lato lungo. Tavolo: { hx, hy, pockets: [{ x, y, r }] }

export const DEFAULTS = { r: 0.028575, restBall: 0.95, restCushion: 0.75, decel: 0.45, stopSpeed: 0.005, maxShot: 6 };

export function makeBall(id, x, y, r = DEFAULTS.r) {
  return { id, x, y, vx: 0, vy: 0, r, pocketed: false, pocket: -1, roll: 0 };
}

// Triangolo sul punto (fx, 0): 8 al centro, un angolo pieno e uno rigato
export function rack(fx, r = DEFAULTS.r, rng = Math.random) {
  const solids = [1, 2, 3, 4, 5, 6, 7], stripes = [9, 10, 11, 12, 13, 14, 15];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  shuffle(solids); shuffle(stripes);
  const order = new Array(15).fill(0);
  order[4] = 8;                                       // centro della terza fila
  order[10] = solids.pop(); order[14] = stripes.pop(); // angoli posteriori: uno pieno e uno rigato
  const rest = shuffle([...solids, ...stripes]);
  for (let i = 0; i < 15; i++) if (!order[i]) order[i] = rest.pop();
  const balls = [];
  const d = 2 * r + 0.0002;
  let k = 0;
  for (let row = 0; row < 5; row++) {
    for (let j = 0; j <= row; j++) {
      balls.push(makeBall(order[k++], fx + row * d * Math.sqrt(3) / 2, (j - row / 2) * d, r));
    }
  }
  return balls;
}

// Avanza la simulazione di dt secondi; ev raccoglie gli eventi del tiro
export function step(balls, table, dt, ev = newEvents(), P = DEFAULTS) {
  let vmax = 0;
  for (const b of balls) if (!b.pocketed) vmax = Math.max(vmax, Math.hypot(b.vx, b.vy));
  if (vmax === 0) return false;
  const n = Math.max(1, Math.ceil((vmax * dt) / (0.5 * P.r)));   // nessuna palla si sposta più di mezzo raggio
  const h = dt / n;
  for (let s = 0; s < n; s++) {
    for (const b of balls) {
      if (b.pocketed) continue;
      const v = Math.hypot(b.vx, b.vy);
      if (v === 0) continue;
      const nv = Math.max(0, v - P.decel * h);
      if (nv < P.stopSpeed) { b.vx = 0; b.vy = 0; continue; }
      b.vx *= nv / v; b.vy *= nv / v;
      b.x += b.vx * h; b.y += b.vy * h;
      b.roll += nv * h / b.r;
    }
    collideBalls(balls, ev, P);
    for (const b of balls) if (!b.pocketed) cushionsAndPockets(b, table, ev, P);
  }
  return balls.some((b) => !b.pocketed && (b.vx || b.vy));
}

export function newEvents() { return { firstContact: null, pocketed: [], cushions: 0, impacts: [], ballContacts: 0 }; }

function collideBalls(balls, ev, P) {
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.pocketed) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.pocketed) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy), min = a.r + b.r;
      if (dist >= min || dist === 0) continue;
      const nx = dx / dist, ny = dy / dist;
      const push = (min - dist) / 2;                 // separa le palle compenetrate
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel <= 0) continue;
      const jn = rel * (1 + P.restBall) / 2;         // masse uguali
      a.vx -= jn * nx; a.vy -= jn * ny; b.vx += jn * nx; b.vy += jn * ny;
      ev.ballContacts++;
      if (ev.firstContact === null) {
        if (a.id === 0) ev.firstContact = b.id; else if (b.id === 0) ev.firstContact = a.id;
      }
      ev.impacts.push({ kind: 'ball', speed: rel });
    }
  }
}

// Le sponde si interrompono alle ganasce delle buche: vicino a una buca la palla non rimbalza e prosegue verso
// l'interno della buca; se supera la linea dei centri delle buche è imbucata nella più vicina.
function cushionsAndPockets(b, table, ev, P) {
  const pot = (k) => { b.pocketed = true; b.pocket = k; b.vx = 0; b.vy = 0; ev.pocketed.push({ id: b.id, pocket: k }); };
  let near = 0, nd = Infinity;
  for (let k = 0; k < table.pockets.length; k++) {
    const p = table.pockets[k];
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < nd) { nd = d; near = k; }
  }
  if (nd < table.pockets[near].r) { pot(near); return; }
  const ox = Math.abs(table.pockets[0].x), oy = Math.abs(table.pockets[0].y);
  if (Math.abs(b.x) > ox || Math.abs(b.y) > oy) { pot(near); return; }
  const jawC = P.jawCorner ?? 0.075, jawS = P.jawSide ?? 0.07;
  const inCornerX = Math.abs(b.x) > table.hx - jawC, inCornerY = Math.abs(b.y) > table.hy - jawC;
  const lx = table.hx - b.r, ly = table.hy - b.r;
  const hit = (speed) => { ev.impacts.push({ kind: 'cushion', speed }); ev.cushions++; };
  if (!inCornerY) {                                                   // sponde corte
    if (b.x > lx) { b.x = lx - (b.x - lx); if (b.vx > 0) { hit(b.vx); b.vx = -b.vx * P.restCushion; } }
    if (b.x < -lx) { b.x = -lx + (-lx - b.x); if (b.vx < 0) { hit(-b.vx); b.vx = -b.vx * P.restCushion; } }
  }
  if (!inCornerX && Math.abs(b.x) > jawS) {                           // sponde lunghe, interrotte dalla buca centrale
    if (b.y > ly) { b.y = ly - (b.y - ly); if (b.vy > 0) { hit(b.vy); b.vy = -b.vy * P.restCushion; } }
    if (b.y < -ly) { b.y = -ly + (-ly - b.y); if (b.vy < 0) { hit(-b.vy); b.vy = -b.vy * P.restCushion; } }
  }
}

// Simula un tiro fino a quando tutto è fermo (o maxT secondi); ritorna { events, time }
export function simulate(balls, table, maxT = 30, dt = 1 / 120, P = DEFAULTS) {
  const ev = newEvents();
  let t = 0;
  while (t < maxT && step(balls, table, dt, ev, P)) t += dt;
  return { events: ev, time: t };
}

export function onTable(b, table, eps = 1e-6) {
  const ox = Math.abs(table.pockets[0].x), oy = Math.abs(table.pockets[0].y);
  return b.pocketed || (Math.abs(b.x) <= ox + eps && Math.abs(b.y) <= oy + eps);
}

// Collisioni 2D sul piano del pavimento: il giocatore è un cerchio, gli ostacoli sono rettangoli orientati (OBB).
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _c0 = new THREE.Vector3();
const _c2 = new THREE.Vector3();

export class CollisionWorld {
  constructor(config) {
    this.cfg = config.collisions;
    this.boxes = [];          // { name, cx, cz, ux, uz, vx, vz, hx, hz, minY, maxY }
    this.bounds = null;       // { minX, maxX, minZ, maxZ } interno della stanza
    this.source = 'none';
  }

  get count() { return this.boxes.length; }

  // Da circolo_collision.glb: ogni mesh COL_ può contenere più box (es. il muro sud con porta e finestre).
  addFromCollisionScene(root) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.name.startsWith('COL_') || this.cfg.ignore.includes(o.name) || this.cfg.ignorePattern?.test(o.name)) return;
      for (const part of splitComponents(o.geometry)) this._addLocalBox(o.name, o.matrixWorld, part.min, part.max);
    });
    this.source = 'circolo_collision.glb';
  }

  // Ripiego: bounding box dei nodi di primo livello del glb principale.
  addFromVisualScene(root) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const o of root.children) {
      if (this.cfg.fallbackExclude.test(o.name)) continue;
      box.setFromObject(o);
      if (box.isEmpty()) continue;
      this._addWorldAABB('COL_' + o.name, box.min, box.max);
    }
    this.source = 'bounding box del glb principale (ripiego)';
  }

  _addLocalBox(name, m, min, max) {
    const center = _v.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2).applyMatrix4(m);
    const e = m.elements;
    _c0.set(e[0], e[1], e[2]);
    _c2.set(e[8], e[9], e[10]);
    const sx = Math.hypot(_c0.x, _c0.z), sz = Math.hypot(_c2.x, _c2.z);
    const sy = Math.hypot(e[4], e[5], e[6]);
    const hy = (max.y - min.y) / 2 * sy;
    this._push({
      name,
      cx: center.x, cz: center.z,
      ux: _c0.x / sx, uz: _c0.z / sx,
      vx: _c2.x / sz, vz: _c2.z / sz,
      hx: (max.x - min.x) / 2 * sx, hz: (max.z - min.z) / 2 * sz,
      minY: center.y - hy, maxY: center.y + hy,
    });
  }

  _addWorldAABB(name, min, max) {
    this._push({
      name, cx: (min.x + max.x) / 2, cz: (min.z + max.z) / 2, ux: 1, uz: 0, vx: 0, vz: 1,
      hx: (max.x - min.x) / 2, hz: (max.z - min.z) / 2, minY: min.y, maxY: max.y,
    });
  }

  _push(b) {
    if (b.maxY < this.cfg.minHeight || b.minY > this.cfg.maxHeight) return;   // sotto i piedi o sopra la testa
    this.boxes.push(b);
  }

  // Interno della stanza ricavato dai muri: limite rigido anche se un rettangolo mancasse.
  computeBounds(spawn) {
    const b = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };
    for (const w of this.boxes) {
      if (!/Wall/.test(w.name)) continue;
      const ex = Math.abs(w.ux) * w.hx + Math.abs(w.vx) * w.hz;   // semi-estensione in X mondo
      const ez = Math.abs(w.uz) * w.hx + Math.abs(w.vz) * w.hz;
      if (ez > ex) {            // muro lungo Z: ovest / est
        if (w.cx < spawn.x) b.minX = Math.max(b.minX, w.cx + ex); else b.maxX = Math.min(b.maxX, w.cx - ex);
      } else {
        if (w.cz < spawn.z) b.minZ = Math.max(b.minZ, w.cz + ez); else b.maxZ = Math.min(b.maxZ, w.cz - ez);
      }
    }
    if ([b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite)) this.bounds = b;
    return this.bounds;
  }

  // Risolve le compenetrazioni del cerchio (x, z, r): spinge lungo la normale del bordo più vicino → scivolamento.
  resolve(pos, r) {
    for (let it = 0; it < this.cfg.iterations; it++) {
      let moved = this._clampToRoom(pos, r);
      for (const b of this.boxes) {
        const dx = pos.x - b.cx, dz = pos.z - b.cz;
        let lx = dx * b.ux + dz * b.uz;
        let lz = dx * b.vx + dz * b.vz;
        if (Math.abs(lx) > b.hx + r || Math.abs(lz) > b.hz + r) continue;
        const qx = Math.max(-b.hx, Math.min(b.hx, lx));
        const qz = Math.max(-b.hz, Math.min(b.hz, lz));
        const ex = lx - qx, ez = lz - qz;
        const d2 = ex * ex + ez * ez;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), push = r - d;
          lx += (ex / d) * push; lz += (ez / d) * push;
        } else {                                   // centro dentro il rettangolo: esci dal lato più vicino
          const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz);
          if (px < pz) lx = Math.sign(lx || 1) * (b.hx + r); else lz = Math.sign(lz || 1) * (b.hz + r);
        }
        pos.x = b.cx + lx * b.ux + lz * b.vx;
        pos.z = b.cz + lx * b.uz + lz * b.vz;
        moved = true;
      }
      if (!moved) break;
    }
    this._clampToRoom(pos, r);                     // limite rigido finale: dalla stanza non si esce mai
    return pos;
  }

  _clampToRoom(pos, r) {
    if (!this.bounds) return false;
    const m = r + this.cfg.roomMargin, B = this.bounds;
    const x = Math.min(B.maxX - m, Math.max(B.minX + m, pos.x));
    const z = Math.min(B.maxZ - m, Math.max(B.minZ + m, pos.z));
    const moved = x !== pos.x || z !== pos.z;
    pos.x = x; pos.z = z;
    return moved;
  }

  // Linee a filo pavimento per ?debug=1
  debugLines() {
    const pts = [];
    for (const b of this.boxes) {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => new THREE.Vector3(
        b.cx + sx * b.hx * b.ux + sz * b.hz * b.vx, 0.02, b.cz + sx * b.hx * b.uz + sz * b.hz * b.vz));
      for (let i = 0; i < 4; i++) pts.push(c[i], c[(i + 1) % 4]);
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xff3355, depthTest: false }));
    lines.renderOrder = 10;
    return lines;
  }
}

// Divide una geometria in componenti connesse (per posizione) e restituisce il bounding box locale di ciascuna.
function splitComponents(geo) {
  const pos = geo.attributes.position;
  const n = pos.count;
  // Caso tipico dell'export glTF: 24 vertici per box (6 facce × 4). I box che si toccano condividono posizioni,
  // quindi prima si prova a dividere a blocchi di 24 con esattamente 8 posizioni distinte ciascuno.
  if (n % 24 === 0 && n > 24) {
    const parts = [];
    for (let s = 0; s < n; s += 24) {
      const keys = new Set();
      const p = { min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity) };
      for (let i = s; i < s + 24; i++) {
        _v.fromBufferAttribute(pos, i);
        keys.add(`${_v.x.toFixed(4)},${_v.y.toFixed(4)},${_v.z.toFixed(4)}`);
        p.min.min(_v); p.max.max(_v);
      }
      if (keys.size !== 8) { parts.length = 0; break; }
      parts.push(p);
    }
    if (parts.length) return parts;
  }
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const byKey = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (byKey.has(k)) union(i, byKey.get(k)); else byKey.set(k, i);
  }
  const idx = geo.index;
  if (idx) for (let t = 0; t < idx.count; t += 3) { union(idx.getX(t), idx.getX(t + 1)); union(idx.getX(t), idx.getX(t + 2)); }
  else for (let t = 0; t < n; t += 3) { union(t, t + 1); union(t, t + 2); }
  const parts = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let p = parts.get(r);
    if (!p) parts.set(r, p = { min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity) });
    _v.fromBufferAttribute(pos, i);
    p.min.min(_v); p.max.max(_v);
  }
  return [...parts.values()];
}

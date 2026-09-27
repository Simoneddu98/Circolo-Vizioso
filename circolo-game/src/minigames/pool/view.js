// Biliardo: palla 8 contro Tonino e pratica in solitario. Fisica in physics.js, regole in rules.js, avversario in ai.js.
import * as THREE from 'three';
import { registerMinigame } from '../manager.js';
import { SurfaceFrame, markerCamera, sfx, jingle, gauss } from '../util.js';
import { makeBall, rack, step, newEvents, DEFAULTS } from './physics.js';
import { EightBall, groupOf } from './rules.js';
import { chooseShot, placeCue } from './ai.js';

registerMinigame('pool', {
  camera: 'CAM_Pool_Spectate',
  opponentSpot: 'POOL_OpponentSpot',
  modes: [{ id: '8ball', label: 'Palla 8 contro {opponent}' }, { id: 'practice', label: 'Pratica (da solo)' }],
  create: (host) => new Pool(host),
});

const COLORS = { 1: '#e8b320', 2: '#1f47a8', 3: '#c8261e', 4: '#5a2a8a', 5: '#e0701c', 6: '#1c7a3a', 7: '#7a1c1c', 8: '#111111' };
const colorOf = (id) => COLORS[id > 8 ? id - 8 : id];

function ballTexture(id) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = id === 0 ? '#f4f1e8' : id > 8 ? '#f4f1e8' : colorOf(id);
  g.fillRect(0, 0, 256, 128);
  if (id > 8) { g.fillStyle = colorOf(id); g.fillRect(0, 34, 256, 60); }
  if (id > 0) {
    for (const u of [64, 192]) {
      g.fillStyle = '#f4f1e8'; g.beginPath(); g.arc(u, 64, 19, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.font = '700 24px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(id), u, 65);
    }
  } else {
    g.fillStyle = '#c0392b'; g.beginPath(); g.arc(64, 64, 4, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Pool {
  constructor(host) {
    this.h = host;
    this.c = host.cfg;
    this.frame = new SurfaceFrame(host.marker('POOL_Surface'));
    const f = this.frame;
    this.r = host.marker('POOL_Surface').userData.ball_radius ?? DEFAULTS.r;
    const pockets = [];
    for (let k = 1; k <= 6; k++) {
      const m = host.marker(`POOL_Pocket_${k}`);
      const p = f.toLocal(m.getWorldPosition(new THREE.Vector3()));
      pockets.push({ x: p.x, y: p.y, r: m.userData.radius ?? 0.06 });
    }
    this.table = { hx: f.width / 2, hy: f.depth / 2, pockets };
    this.head = f.toLocal(host.marker('POOL_HeadSpot').getWorldPosition(new THREE.Vector3()));
    this.foot = f.toLocal(host.marker('POOL_FootSpot').getWorldPosition(new THREE.Vector3()));
    this.P = { ...DEFAULTS, r: this.r };
    this.group = new THREE.Group();
    host.scene.add(this.group);
    this.geo = new THREE.SphereGeometry(this.r, 28, 18);
    this.meshes = new Map();
    // stecca: cono lungo con puntale chiaro, costruita lungo +Z (la punta all'origine)
    const cue = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.014, 1.42, 16), new THREE.MeshStandardMaterial({ color: 0xb98a4e, roughness: 0.5 }));
    shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.71;
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.0141, 0.015, 0.45, 16), new THREE.MeshStandardMaterial({ color: 0x2a1408, roughness: 0.4 }));
    butt.rotation.x = Math.PI / 2; butt.position.z = 1.2;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 12), new THREE.MeshStandardMaterial({ color: 0x3b6fb0 }));
    tip.rotation.x = Math.PI / 2; tip.position.z = 0.006;
    cue.add(shaft, butt, tip);
    this.cue = cue;
    this.group.add(cue);
    // linea di mira tratteggiata e ghost ball
    this.aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.02, gapSize: 0.015, transparent: true, opacity: 0.8 }));
    this.ghost = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
    this.group.add(this.aimLine, this.ghost);
    this.lamps = [];
    host.root.traverse((o) => { if (/^Lamp_Billiard/.test(o.name)) this.lamps.push(o); });
    this.state = 'idle';
    this.top = false;
  }

  // ------------------------------------------------------------------ partita

  start(mode) {
    this.mode = mode;
    for (const m of this.meshes.values()) m.removeFromParent();
    this.meshes.clear();
    this.balls = [makeBall(0, this.head.x, this.head.y, this.r), ...rack(this.foot.x, this.r)];
    for (const b of this.balls) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ map: ballTexture(b.id), roughness: 0.18, metalness: 0 }));
      m.castShadow = true;
      m.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      this.group.add(m);
      this.meshes.set(b.id, m);
    }
    this.rules = mode === '8ball' ? new EightBall(0) : null;
    this.shots = 0; this.potted = 0;
    this.over = false;
    this.aim = 0;                                   // direzione di tiro (radianti nel piano del tavolo)
    this._syncMeshes();
    this._playerTurn(false);
  }

  inProgress() { return !this.over && this.shots > 0; }

  get current() { return this.rules ? this.rules.current : 0; }

  _hud() {
    const R = this.rules;
    if (!R) {
      this.h.hud(`<div class="box">Tiri ${this.shots}</div><div class="box me">Imbucate ${this.potted}/15</div>`);
      return;
    }
    const gname = (g) => (g === 'solids' ? 'piene' : g === 'stripes' ? 'rigate' : 'tavolo aperto');
    this.h.hud(`<div class="box me">Tu · ${gname(R.groups[0])} ${R.groups[0] ? `(${R.remaining(0)})` : ''}</div>`
      + `<div class="box opp">${this.c.opponent} · ${gname(R.groups[1])} ${R.groups[1] ? `(${R.remaining(1)})` : ''}</div>`
      + `<div class="box turn">${R.current === 0 ? 'Tocca a te' : `Tocca a ${this.c.opponent}`}${R.ballInHand ? ' · bianca in mano' : ''}</div>`);
  }

  _playerTurn(ballInHand) {
    this._hud();
    if (ballInHand) { this.state = 'place'; this.h.hint(this.c.placeHint); this._showAim(false); this.cue.visible = false; return; }
    this.state = 'aim';
    this.charge = null;
    this.cue.visible = true;
    this.h.hint(this.c.hint);
    const cb = this.balls[0];
    // punta verso la palla più vicina, per partire da una mira sensata
    let best = null;
    for (const b of this.balls) if (!b.pocketed && b.id) { const d = Math.hypot(b.x - cb.x, b.y - cb.y); if (!best || d < best.d) best = { d, b }; }
    if (best && this.shots === 0) this.aim = Math.atan2(best.b.y - cb.y, best.b.x - cb.x);
  }

  _aiTurn(ballInHand) {
    this._hud();
    this.h.hint(null);
    this.state = 'ai-think';
    this.aiT = 0.6;
    const legal = (id) => this.rules.legalTarget(id, 1);
    if (ballInHand) {
      const p = placeCue(this.balls, this.table, legal);
      Object.assign(this.balls[0], { x: p.x, y: p.y, pocketed: false, vx: 0, vy: 0 });
      this.meshes.get(0).visible = true;
      this._syncMeshes();
    }
    this.aiShot = chooseShot(this.balls, this.table, legal, { level: this.c.difficulty, gauss });
    this.aim = this.aiShot.angle;
  }

  // colpo: la stecca parte dalla distanza di carica e avanza fino alla bianca, tanto più veloce quanto più forte
  _shoot(speed) {
    this.pending = speed;
    this.strokeFrom = this.cueGap;
    this.strokeT = 0;
    this.strokeDur = THREE.MathUtils.lerp(0.22, 0.07, speed / this.P.maxShot);
    this.state = 'stroke';
    this._showAim(false);
  }

  _hit() {
    const cb = this.balls[0], speed = this.pending;
    cb.vx = Math.cos(this.aim) * speed; cb.vy = Math.sin(this.aim) * speed;
    this.ev = newEvents();
    this.shots++;
    this.state = 'roll';
    this.follow = 0.15;
    sfx({ freq: 700, dur: 0.06, vol: Math.min(0.6, speed / 8), noise: 0.7 });
  }

  _shotOver() {
    const ev = this.ev;
    const pottedIds = ev.pocketed.map((e) => e.id);
    this.potted += pottedIds.filter((id) => id !== 0).length;
    if (pottedIds.length) sfx({ freq: 180, dur: 0.18, vol: 0.3, noise: 0.5 });
    if (!this.rules) {                              // pratica
      if (pottedIds.includes(0)) { this._respotCue(); this.h.message(this.c.scratch); }
      if (this.potted >= 15) {
        this.over = true;
        jingle([523, 659, 784, 1046]);
        this.h.finish({ title: this.c.practiceDone.replace('{n}', this.shots), win: true, record: this.shots });
        return;
      }
      this._playerTurn(false);
      return;
    }
    const who = this.rules.current;
    const r = this.rules.applyShot(ev);
    if (pottedIds.includes(0)) this._respotCue();
    if (r.win || r.lose) {
      this.over = true;
      const win = this.rules.winner === 0;
      if (win) jingle([523, 659, 784, 1046]); else jingle([392, 330, 262], 0.18);
      this.h.banter(win ? 'lose' : 'win');
      this.h.finish({ title: win ? this.c.youWin : this.c.youLose.replace('{name}', this.c.opponent), win,
        html: `<p class="sub">${r.lose && who === (win ? 1 : 0) ? this.c.eightEarly : ''}</p>` });
      return;
    }
    if (r.foul) this.h.message(`${this.c.foul}: ${r.reason}`, 2);
    else if (r.assigned) this.h.message(who === 0 ? `Tu: ${r.assigned === 'solids' ? 'piene' : 'rigate'}` : `${this.c.opponent}: ${r.assigned === 'solids' ? 'piene' : 'rigate'}`, 1.8);
    if (who === 1) this.h.banter(pottedIds.some((id) => id && groupOf(id) === this.rules.groups[1]) ? 'hit' : 'miss');
    if (this.rules.current === 0) this._playerTurn(this.rules.ballInHand);
    else this._aiTurn(this.rules.ballInHand);
  }

  _respotCue() {
    const cb = this.balls[0];
    Object.assign(cb, { x: this.head.x, y: this.head.y, vx: 0, vy: 0, pocketed: false, pocket: -1 });
    // se il punto è occupato si arretra
    while (this.balls.some((b) => b.id && !b.pocketed && Math.hypot(b.x - cb.x, b.y - cb.y) < 2.1 * this.r)) cb.x -= this.r;
    this.meshes.get(0).visible = true;
    this.meshes.get(0).userData.drop = null;
  }

  // ------------------------------------------------------------------ input

  input(type, e) {
    if (type === 'keydown' && e.code === 'KeyT') { this.top = !this.top; return; }
    if (this.state === 'aim') {
      if (type === 'mousemove') {
        const k = this.charge != null ? 0.0006 : 0.0025;       // mentre si carica la mira è più fine
        this.aim -= e.movementX * k * this.h.config.player.mouseSensitivity;
      } else if (type === 'mousedown' && e.button === 0) this.charge = 0;
      else if (type === 'mouseup' && e.button === 0 && this.charge != null) {
        const p = this.charge; this.charge = null; this.h.power(null);
        this._shoot(Math.max(0.3, p * this.P.maxShot));
      }
    } else if (this.state === 'place') {
      const cb = this.balls[0];
      if (type === 'mousemove') {
        const d = this._screenDir(e.movementX, -e.movementY);
        cb.x = THREE.MathUtils.clamp(cb.x + d.x * 0.0012, -this.table.hx + this.r, this.table.hx - this.r);
        cb.y = THREE.MathUtils.clamp(cb.y + d.y * 0.0012, -this.table.hy + this.r, this.table.hy - this.r);
        cb.pocketed = false;
        this.meshes.get(0).visible = true;
      } else if (type === 'mousedown' && e.button === 0) {
        const free = !this.balls.some((b) => b.id && !b.pocketed && Math.hypot(b.x - cb.x, b.y - cb.y) < 2.05 * this.r);
        if (free) this._playerTurn(false); else this.h.message(this.c.notFree, 1.2);
      }
    }
  }

  // spostamento del mouse (x a destra, y in alto sullo schermo) -> direzione nel piano del tavolo
  _screenDir(mx, my) {
    const cam = this.h.camera;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const fwd = up.clone().sub(this.frame.normal.clone().multiplyScalar(up.dot(this.frame.normal)));
    if (fwd.lengthSq() < 1e-6) fwd.copy(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion));
    const w = right.multiplyScalar(mx).add(fwd.normalize().multiplyScalar(my));
    return this.frame.toLocal(w.add(this.frame.center));
  }

  // ------------------------------------------------------------------ disegno

  _syncMeshes() {
    for (const b of this.balls) {
      const m = this.meshes.get(b.id);
      if (b.pocketed) continue;
      this.frame.toWorld(b.x, b.y, this.r, m.position);
    }
  }

  _firstContact(cb, dir) {
    // prima palla o sponda lungo la direzione di mira (per la linea tratteggiata e la ghost ball)
    let best = { t: Infinity, ball: null };
    for (const b of this.balls) {
      if (b.pocketed || b.id === 0) continue;
      const ox = b.x - cb.x, oy = b.y - cb.y;
      const proj = ox * dir.x + oy * dir.y;
      if (proj <= 0) continue;
      const perp2 = ox * ox + oy * oy - proj * proj;
      const R2 = (2 * this.r) ** 2;
      if (perp2 > R2) continue;
      const t = proj - Math.sqrt(R2 - perp2);
      if (t < best.t) best = { t, ball: b };
    }
    const lx = this.table.hx - this.r, ly = this.table.hy - this.r;
    const tx = dir.x > 0 ? (lx - cb.x) / dir.x : dir.x < 0 ? (-lx - cb.x) / dir.x : Infinity;
    const ty = dir.y > 0 ? (ly - cb.y) / dir.y : dir.y < 0 ? (-ly - cb.y) / dir.y : Infinity;
    const tw = Math.min(tx, ty);
    return best.t < tw ? best : { t: tw, ball: null };
  }

  _showAim(on) {
    this.aimLine.visible = on;
    this.ghost.visible = on;
    if (!on) return;
    const cb = this.balls[0];
    const dir = { x: Math.cos(this.aim), y: Math.sin(this.aim) };
    const hit = this._firstContact(cb, dir);
    const a = this.frame.toWorld(cb.x, cb.y, this.r);
    const b = this.frame.toWorld(cb.x + dir.x * hit.t, cb.y + dir.y * hit.t, this.r);
    this.aimLine.geometry.setFromPoints([a, b]);
    this.aimLine.computeLineDistances();
    this.ghost.position.copy(b);
    this.ghost.visible = !!hit.ball;
  }

  // gap = distanza della punta dalla bianca
  _placeCue(gap) {
    this.cueGap = gap;
    const pull = gap;
    const cb = this.balls[0];
    const dir = this.frame.dirWorld(Math.cos(this.aim), Math.sin(this.aim)).normalize();
    const pos = this.frame.toWorld(cb.x, cb.y, this.r);
    const back = dir.clone().multiplyScalar(-(this.r + 0.002 + pull));
    this.cue.position.copy(pos).add(back).addScaledVector(this.frame.normal, 0.012);
    // la stecca si estende lungo +Z locale verso chi tira: la punta guarda la palla, leggermente inclinata
    const tail = pos.clone().addScaledVector(dir, -1.5).addScaledVector(this.frame.normal, 0.18);
    this.cue.lookAt(tail);
  }

  _camera(dt) {
    const cam = this.h.camera;
    this.lamps.forEach((l) => { l.visible = !this.top; });
    if (this.top) { this.h.setCamera('CAM_Pool_Top'); return; }
    const cb = this.balls[0];
    const dir = this.frame.dirWorld(Math.cos(this.aim), Math.sin(this.aim)).normalize();
    const pos = this.frame.toWorld(cb.x, cb.y, 0);
    const want = pos.clone().addScaledVector(dir, -0.85).addScaledVector(this.frame.normal, 0.42);
    const look = pos.clone().addScaledVector(dir, 0.45);
    const k = this.state === 'roll' ? 1 - Math.exp(-dt * 1.5) : 1 - Math.exp(-dt * 10);
    if (this.state === 'roll') {                    // durante il rotolamento: vista che segue il tavolo dall'alto di lato
      const spec = markerCamera(this.h.marker('CAM_Pool_Spectate'));
      cam.position.lerp(spec.pos, k);
      cam.quaternion.slerp(spec.quat, k);
    } else {
      cam.position.lerp(want, k);
      const m = new THREE.Matrix4().lookAt(cam.position, look, this.frame.normal);
      cam.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(m), k);
    }
    if (cam.fov !== this.c.fov) { cam.fov = this.c.fov; cam.updateProjectionMatrix(); }
  }

  // ------------------------------------------------------------------ aggiornamento

  update(dt) {
    if (this.state === 'aim') {
      if (this.charge != null) { this.charge = Math.min(1, this.charge + dt / this.c.chargeTime); this.h.power(this.charge); }
      // a riposo la punta sta qualche centimetro dietro la bianca; caricando arretra fino a cueBack
      this._placeCue(this.c.cueRest + (this.charge ?? 0) * (this.c.cueBack - this.c.cueRest));
      this._showAim(true);
    } else if (this.state === 'place') {
      this._syncMeshes();
    } else if (this.state === 'ai-think') {
      this.cue.visible = true;
      const k = Math.min(1, Math.max(0, -this.aiT / 1.0));             // Tonino arretra la stecca mentre prende la mira
      this._placeCue(this.c.cueRest + k * (this.aiShot.speed / this.P.maxShot) * (this.c.cueBack - this.c.cueRest));
      this._showAim(true);                          // la mira di Tonino resta visibile un secondo
      this.aiT -= dt;
      if (this.aiT <= -1.0) this._shoot(this.aiShot.speed);
    } else if (this.state === 'stroke') {
      this.strokeT += dt;
      const k = Math.min(1, this.strokeT / this.strokeDur);
      this._placeCue(this.strokeFrom * (1 - k * k));
      if (k >= 1) this._hit();
    } else if (this.state === 'roll') {
      if (this.follow > 0) { this.follow -= dt; this._placeCue(-0.03); } else this.cue.visible = false;   // accompagnamento, poi via
      const before = this.ev.impacts.length;
      const moving = step(this.balls, this.table, dt, this.ev, this.P);
      for (const im of this.ev.impacts.slice(before, before + 4)) {
        sfx(im.kind === 'ball' ? { freq: 2400, dur: 0.035, vol: Math.min(0.5, im.speed / 6), noise: 0.4 } : { freq: 300, dur: 0.06, vol: Math.min(0.35, im.speed / 8), noise: 0.8 });
      }
      this._animate(dt);
      if (!moving && !this._dropping()) this._shotOver();
    }
    this._syncMeshes();
    this._camera(dt);
  }

  // rotazione proporzionale alla distanza e caduta nelle buche
  _animate(dt) {
    for (const b of this.balls) {
      const m = this.meshes.get(b.id);
      if (b.pocketed) {
        const d = m.userData.drop ?? (m.userData.drop = { t: 0, from: m.position.clone(), p: this.table.pockets[b.pocket] });
        if (!m.visible) continue;
        d.t += dt;
        const k = Math.min(1, d.t / 0.35);
        const to = this.frame.toWorld(d.p.x, d.p.y, this.r - 0.12 * k);
        m.position.lerpVectors(d.from, to, k);
        if (k >= 1) m.visible = false;
        continue;
      }
      const v = Math.hypot(b.vx, b.vy);
      if (v > 0) {
        const axis = this.frame.dirWorld(-b.vy / v, b.vx / v).normalize();
        m.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, (v * dt) / this.r));
      }
    }
  }

  _dropping() { return this.balls.some((b) => b.pocketed && this.meshes.get(b.id).visible); }

  idle() {}

  dispose() {
    this.lamps.forEach((l) => { l.visible = true; });
    for (const m of this.meshes.values()) { m.material.map.dispose(); m.material.dispose(); }
    this.group.removeFromParent();
    this.geo.dispose();
    this.h.hud('');
  }
}

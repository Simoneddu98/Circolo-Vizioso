// Freccette: mira con il mouse sul bersaglio, clic tenuto per la potenza, volo balistico, punteggio dal punto d'impatto.
import * as THREE from 'three';
import { registerMinigame } from '../manager.js';
import { markerCamera, smoothNoise, gauss, sfx, jingle } from '../util.js';
import { scoreAt, targetPoint, X01, AroundTheClock, chooseTarget } from './rules.js';

const G = new THREE.Vector3(0, -9.81, 0);

registerMinigame('darts', {
  camera: 'CAM_Darts_Throw',
  opponentSpot: 'DARTS_OpponentSpot',
  modes: [{ id: '301', label: '301 contro {opponent}' }, { id: 'clock', label: 'Giro dell\'orologio (da solo)' }],
  create: (host) => new Darts(host),
});

class Darts {
  constructor(host) {
    this.h = host;
    this.c = host.cfg;
    const b = host.marker('DARTS_Board');
    b.updateWorldMatrix(true, false);
    this.center = b.getWorldPosition(new THREE.Vector3());
    this.quat = b.getWorldQuaternion(new THREE.Quaternion());
    this.inv = this.quat.clone().invert();
    this.normal = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);          // uscente dal bersaglio
    this.R = { ...b.userData };
    this.order = b.userData.order;
    this.boardR = b.userData.board ?? 0.2255;
    this.template = this._dartTemplate(host.marker('DARTS_Dart_1'));
    this.group = new THREE.Group();
    host.scene.add(this.group);
    this.darts = [];
    this.held = this.template.clone();              // freccetta in mano, visibile mentre si mira
    this.held.visible = false;
    host.scene.add(this.held);
    this.cursor = document.createElement('div');
    this.cursor.className = 'cursor';
    this.cursor.hidden = true;
    host.layer.appendChild(this.cursor);
    this.noise = [smoothNoise(), smoothNoise()];
    this.t = 0;
    this.state = 'idle';
    this.cam = markerCamera(host.marker('CAM_Darts_Throw'));
  }

  // Freccetta con la punta all'origine e rivolta verso +Z (la compressione meshopt sposta l'origine del nodo)
  _dartTemplate(src) {
    const holder = new THREE.Group();
    if (!src) return holder;
    const m = src.clone();                          // può essere un gruppo (una mesh per materiale)
    m.visible = true;
    m.position.set(0, 0, 0); m.quaternion.identity();
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    const tip = new THREE.Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, bb.max.z);
    m.position.sub(tip);
    holder.add(m);
    return holder;
  }

  // ------------------------------------------------------------------ geometria del bersaglio

  boardToWorld(x, y, out = new THREE.Vector3()) { return out.set(x, 0, -y).applyQuaternion(this.quat).add(this.center); }
  worldToBoard(p) { const v = p.clone().sub(this.center).applyQuaternion(this.inv); return { x: v.x, y: -v.z, d: v.y }; }

  // ------------------------------------------------------------------ partita

  start(mode) {
    this.h.setCamera({ ...this.cam, fov: this.c.fov });      // vista stretta: il bersaglio riempie lo schermo
    this.clear();
    this.mode = mode;
    this.over = false;
    this.aim = { x: 0, y: 0.1 };
    this.aimTime = 0;
    this.breath = { on: 0, cooldown: 0 };
    if (mode === 'clock') this.clock = new AroundTheClock();
    else this.game = new X01({ start: this.c.start, doubleOut: this.c.doubleOut });
    this.turnPoints = 0;
    this._playerTurn();
  }

  inProgress() { return !this.over && (this.mode === 'clock' ? this.clock.darts > 0 : this.game.history.length > 0 || this.game.darts.length > 0); }

  _playerTurn() {
    this.state = 'aim';
    this.charge = null;
    this.aimTime = 0;
    this.cursor.hidden = false;
    this.h.hint(this.c.hint);
    this._hud();
  }

  _hud() {
    const h = this.h;
    if (this.mode === 'clock') {
      h.hud(`<div class="box turn">${this.c.clockTarget}: ${this.clock.label}</div><div class="box">${this.c.dartsUsed}: ${this.clock.darts}</div>`
        + (h.stats().record ? `<div class="box">${this.c.record}: ${h.stats().record}</div>` : ''));
      return;
    }
    const g = this.game;
    const d = g.darts.map((x) => x.label).join(' · ');
    h.hud(`<div class="box me">Tu ${g.scores[0]}</div><div class="box opp">${this.c.opponent} ${g.scores[1]}</div>`
      + `<div class="box turn">${g.current === 0 ? 'Tocca a te' : `Tocca a ${this.c.opponent}`}${d ? ` — ${d}` : ''}</div>`);
  }

  // ------------------------------------------------------------------ input

  input(type, e) {
    if (type === 'mousemove' && this.state === 'aim') {
      const k = this.c.aimSensitivity;
      this.aim.x = THREE.MathUtils.clamp(this.aim.x + e.movementX * k, -0.3, 0.3);
      this.aim.y = THREE.MathUtils.clamp(this.aim.y - e.movementY * k, -0.3, 0.3);
    } else if (type === 'mousedown' && this.state === 'aim') {
      if (e.button === 0) this.charge = 0;
      if (e.button === 2 && this.breath.cooldown <= 0 && this.breath.on <= 0) { this.breath.on = this.c.breathHold; }
    } else if (type === 'mouseup' && e.button === 0 && this.state === 'aim' && this.charge != null) {
      this._throwPlayer(this.charge);
    }
  }

  // ------------------------------------------------------------------ tiro

  _sway() {
    const b = this.breath;
    let amp = this.c.swayBase;
    if (this.aimTime > this.c.swayGrowAfter) amp *= 1 + Math.min(2, (this.aimTime - this.c.swayGrowAfter) * this.c.swayGrowth);
    if (b.on > 0) amp *= this.c.breathFactor;
    else if (b.cooldown > 0) amp *= 1.25;
    return { x: this.noise[0](this.t * 1.1) * amp, y: this.noise[1](this.t * 0.9) * amp };
  }

  _throwPlayer(power) {
    const s = this._sway();
    const target = this.boardToWorld(this.aim.x + s.x, this.aim.y + s.y);
    const start = new THREE.Vector3(0.14, -0.12, -0.25).applyQuaternion(this.cam.quat).add(this.cam.pos);
    this.charge = null;
    this.h.power(null);
    this._launch(start, target, power, 0);
  }

  // velocità calibrata per colpire il punto mirato alla potenza ideale; con più o meno potenza la gravità
  // porta la freccetta più in basso o un po' più in alto
  _launch(start, target, power, who) {
    const z = this.c.idealZone;
    const s0 = this.c.idealSpeed;
    const dist = start.distanceTo(target);
    const t0 = dist / s0;
    const v0 = target.clone().sub(start).divideScalar(t0).addScaledVector(G, -0.5 * t0);
    // sotto la zona la freccetta è lenta e cade; sopra è più veloce e sale solo di poco
    const k = power < z[0] ? 1 - (z[0] - power) * this.c.powerWeak
      : power > z[1] ? 1 + (power - z[1]) * this.c.powerStrong : 1;
    const vel = v0.multiplyScalar(k);
    const d = this.template.clone();
    this.group.add(d);
    d.position.copy(start);
    this.flight = { d, vel, who, stuck: false };
    this.state = 'flight';
    this.cursor.hidden = who !== 0 || this.state !== 'aim';
    sfx({ freq: 500, dur: 0.12, vol: 0.05, noise: 1 });
  }

  _stepFlight(dt) {
    const f = this.flight;
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const h = dt / steps;
      const prev = f.d.position.clone();
      f.vel.addScaledVector(G, h);
      f.d.position.addScaledVector(f.vel, h);
      f.d.lookAt(f.d.position.clone().add(f.vel));
      // attraversa il piano del bersaglio?
      const a = prev.clone().sub(this.center).dot(this.normal);
      const b = f.d.position.clone().sub(this.center).dot(this.normal);
      if (a > 0 && b <= 0) {
        const hit = prev.clone().lerp(f.d.position, a / (a - b));
        const bp = this.worldToBoard(hit);
        const r = Math.hypot(bp.x, bp.y);
        if (r <= this.boardR) {
          f.d.position.copy(hit).addScaledVector(this.normal, -0.012);   // la punta entra nel sisal
          this._landed(scoreAt(bp.x, bp.y, this.R, this.order), hit);
          sfx({ freq: 220, dur: 0.08, vol: 0.35, noise: 0.8 });
        } else {
          f.falling = true;                                               // fuori: rimbalza sul muro e cade
          f.vel.set(0, -0.5, 0).addScaledVector(this.normal, 0.8);
          sfx({ freq: 900, dur: 0.05, vol: 0.2, noise: 0.9 });
        }
        return;
      }
      if (f.d.position.y < 0.02) { f.d.position.y = 0.02; this._landed({ value: 0, points: 0, ring: 'miss', label: this.c.missLabel }, f.d.position.clone()); return; }
    }
  }

  _landed(hit, point) {
    const f = this.flight;
    f.falling = false;
    this.darts.push(f.d);
    this.flight = null;
    this._float(hit.ring === 'miss' ? this.c.missLabel : (hit.points ? `${hit.label}${hit.mult > 1 && hit.ring !== 'bull50' ? ` = ${hit.points}` : ''}` : '0'), point);
    if (this.mode === 'clock') {
      const r = this.clock.throw(hit);
      if (r.advanced) sfx({ freq: 880, dur: 0.1, vol: 0.15, noise: 0, type: 'sine' });
      this._hud();
      if (this.clock.done) {
        this.over = true;
        jingle([523, 659, 784, 1046]);
        this.h.finish({ title: this.c.clockDone.replace('{n}', this.clock.darts), win: true, record: this.clock.darts });
        return;
      }
      this._after(this.darts.length >= 3);
      return;
    }
    const g = this.game;
    const who = g.current;
    const r = g.throw(hit);
    if (who === 1) this.h.banter(hit.points >= 40 ? 'hit' : hit.points <= 5 ? 'miss' : null);
    if (r.bust) this.h.message(this.c.bust);
    this._hud();
    if (r.checkout) {
      this.over = true;
      const win = who === 0;
      if (win) jingle([523, 659, 784, 1046]); else jingle([392, 330, 262], 0.18);
      this.h.banter(win ? 'lose' : 'win');
      this.h.hud(`<div class="box me">Tu ${g.scores[0]}</div><div class="box opp">${this.c.opponent} ${g.scores[1]}</div>`);
      this.h.finish({ title: win ? this.c.youWin : this.c.youLose.replace('{name}', this.c.opponent), win,
        html: `<p class="sub">Tu ${g.scores[0]} · ${this.c.opponent} ${g.scores[1]}</p>` });
      return;
    }
    this._after(r.turnOver);
  }

  _after(turnOver) {
    this.state = 'wait';
    this.wait = turnOver ? 1.4 : 0.35;
    this.nextTurnOver = turnOver;
  }

  _nextTurn() {
    if (this.nextTurnOver) this.clear();
    if (this.mode === 'clock' || this.game.current === 0) this._playerTurn();
    else this._aiTurn();
  }

  _aiTurn() {
    this.state = 'ai';
    this.cursor.hidden = true;
    this.h.hint(null);
    this.aiDelay = 0.9 + Math.random() * 0.5;
    this._hud();
  }

  _aiThrow() {
    const g = this.game;
    const tg = chooseTarget(g.scores[1], 3 - g.darts.length, g.doubleOut);
    const p = targetPoint(tg.value, tg.ring, this.R, this.order);
    const sd = this.c.aiError[this.c.difficulty];
    const target = this.boardToWorld(p.x + gauss() * sd, p.y + gauss() * sd);
    const spot = this.h.marker('DARTS_OpponentSpot').getWorldPosition(new THREE.Vector3());
    const line = this.cam.pos.clone();
    const start = line.lerp(spot, 0.3).setY(1.55);
    this._launch(start, target, (this.c.idealZone[0] + this.c.idealZone[1]) / 2, 1);
  }

  _float(text, world) {
    const el = document.createElement('div');
    el.className = 'float';
    el.textContent = text;
    this.h.layer.appendChild(el);
    const p = world.clone().project(this.h.camera);
    el.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
    requestAnimationFrame(() => { el.style.transform = 'translate(-50%, -160%)'; el.style.opacity = '0'; });
    setTimeout(() => el.remove(), 1100);
  }

  clear() {
    for (const d of this.darts) d.removeFromParent();
    this.darts = [];
    if (this.flight) { this.flight.d.removeFromParent(); this.flight = null; }
  }

  // ------------------------------------------------------------------ aggiornamento

  update(dt) {
    this.t += dt;
    const b = this.breath;
    if (b) {
      if (b.on > 0) { b.on -= dt; if (b.on <= 0) b.cooldown = this.c.breathRecover; } else if (b.cooldown > 0) b.cooldown -= dt;
    }
    this.held.visible = this.state === 'aim';
    if (this.state === 'aim') {
      // la freccetta in mano segue la mira e arretra un poco mentre si carica
      const back = (this.charge ?? 0) * 0.06;
      this.held.position.set(0.036, -0.036, -0.3 + back).applyQuaternion(this.h.camera.quaternion).add(this.h.camera.position);
      this.held.lookAt(this.boardToWorld(this.aim.x, this.aim.y));
      this.aimTime += dt;
      if (this.charge != null) {
        this.charge = Math.min(1, this.charge + dt / this.c.chargeTime);
        this.h.power(this.charge, this.c.idealZone);
      }
      const s = this._sway();
      const p = this.boardToWorld(this.aim.x + s.x, this.aim.y + s.y).project(this.h.camera);
      this.cursor.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
      this.cursor.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
      this.cursor.style.opacity = b.on > 0 ? 1 : 0.85;
      this.cursor.style.borderColor = b.on > 0 ? '#8fe39a' : b.cooldown > 0 ? '#e0a040' : '#fff';
    } else if (this.state === 'flight') {
      if (this.flight?.falling) {
        const f = this.flight;
        f.vel.addScaledVector(G, dt);
        f.d.position.addScaledVector(f.vel, dt);
        f.d.rotateX(dt * 6);
        if (f.d.position.y <= 0.02) { f.d.position.y = 0.02; this._landed({ value: 0, points: 0, ring: 'miss', label: this.c.missLabel }, f.d.position.clone()); }
      } else if (this.flight) this._stepFlight(dt);
    } else if (this.state === 'wait') {
      this.wait -= dt;
      if (this.wait <= 0) this._nextTurn();
    } else if (this.state === 'ai') {
      this.aiDelay -= dt;
      if (this.aiDelay <= 0) this._aiThrow();
    }
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
    this.held.removeFromParent();
    this.cursor.remove();
    this.h.hud('');
  }
}

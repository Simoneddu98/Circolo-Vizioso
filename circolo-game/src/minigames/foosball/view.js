// Biliardino contro Nicola. Le aste del glb (FOOSBALL_Rod_*) ruotano attorno a un perno costruito dall'extra axis_gltf
// (la compressione meshopt sposta l'origine dei nodi mesh). Fisica in physics.js, avversario in ai.js.
import * as THREE from 'three';
import { registerMinigame } from '../manager.js';
import { sfx, jingle } from '../util.js';
import { getRig } from './rig.js';
import { makeState, makeRod, step, kickoff, reach, DEFAULTS } from './physics.js';
import { FoosballAI } from './ai.js';

registerMinigame('foosball', {
  camera: 'CAM_Foosball_Player',
  opponentSpot: 'FOOSBALL_OpponentSpot',
  extraSpots: ['FOOSBALL_Spectator_1', 'FOOSBALL_Spectator_2'],   // i due giocatori del circolo si fanno da parte
  create: (host) => new Foosball(host),
});

const ROLES = ['GK', 'DEF', 'MID', 'ATT'];

class Foosball {
  constructor(host) {
    this.h = host;
    this.c = host.cfg;
    this.rig = getRig(host.root, host.scene);
    this.rig.owner = 'minigame';                    // la partita dimostrativa si ferma
    this.rig.ball.visible = true;
    this.rig.reset();
    this.frame = this.rig.frame;
    this.flip = this.rig.flip;
    this.P = this.rig.P;
    this.field = this.rig.field;
    this.views = this.rig.views;
    this.rods = this.rig.rods;
    for (const v of this.views) {
      v.ctrl = { mode: 'idle', t: 0, power: 0 };
      if (v.rod.team === 'A' && !v.indicator) {       // indicatore luminoso sull'impugnatura
        const ind = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd35a }));
        ind.position.copy(v.handleLocal).addScaledVector(v.handleLocal.clone().normalize(), 0.07);
        v.pivot.add(ind);
        v.indicator = ind;
      }
      if (v.indicator) v.indicator.visible = false;
    }
    const cam = host.camera;
    const lateral = this.frame.dirWorld(0, 1).normalize();
    this.screenSign = 1;
    this.camTop = false;
    this.state = 'idle';
    this.manual = null;
    this._camSign = () => {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      return right.dot(lateral) * this.flip >= 0 ? 1 : -1;
    };
  }

  start() {
    this.st = makeState(this.field, this.rods, this.P);
    this.rig.reset();
    this.ai = new FoosballAI(this.c.difficulty);
    this.score = [0, 0];                            // [giocatore (A), Nicola (B)]
    this.over = false;
    this.target = 0;
    this.screenSign = this._camSign();
    this._kickoff(Math.random() < 0.5 ? 'A' : 'B');
    this.state = 'play';
    this.h.hint(this.c.hint);
    this._hud();
  }

  inProgress() { return !this.over && (this.score[0] + this.score[1] > 0 || this.st?.time > 3); }

  _kickoff(towards) {
    kickoff(this.st, towards, 0.3);
    this.st.ball.vy = (Math.random() - 0.5) * 0.3;
    this.pause = 0.8;
  }

  _hud() {
    this.h.hud(`<div class="box me">Tu ${this.score[0]}</div><div class="box opp">${this.c.opponent} ${this.score[1]}</div>`
      + `<div class="box">a ${this.c.goals}</div>`);
  }

  // asta attiva: la propria più vicina alla palla tra quelle dietro la palla (dal lato della propria porta)
  _active() {
    const own = this.views.filter((v) => v.rod.team === 'A');
    if (this.manual && this.manual.t > 0) return this.manual.v;
    const bx = this.st.ball.x;
    const R = reach(own[0].rod, this.P);
    const inReach = own.filter((v) => Math.abs(v.rod.x - bx) <= R);          // aste che toccano davvero la palla
    const behind = (inReach.length ? inReach : own).filter((v) => v.rod.x <= bx + 0.02);
    const pool = behind.length ? behind : inReach.length ? inReach : own;
    return pool.reduce((a, b) => (Math.abs(b.rod.x - bx) < Math.abs(a.rod.x - bx) ? b : a));
  }

  input(type, e) {
    if (type === 'keydown') {
      if (e.code === 'KeyC') { this.camTop = !this.camTop; this.h.setCamera(this.camTop ? 'CAM_Foosball_Top' : 'CAM_Foosball_Player'); this.screenSign = this._camSign(); }
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
      if (n != null) this._select(ROLES[n]);
      return;
    }
    const v = this.act;
    if (!v) return;
    if (type === 'wheel') {
      const own = this.views.filter((x) => x.rod.team === 'A');
      const i = own.indexOf(v);
      this._selectView(own[Math.max(0, Math.min(own.length - 1, i + (e.deltaY > 0 ? -1 : 1)))]);
    } else if (type === 'mousemove') {
      this.target = THREE.MathUtils.clamp(v.rod.slide + e.movementX * this.c.slideSensitivity * this.screenSign, -v.rod.travel, v.rod.travel);
      this.targetFresh = true;
    } else if (type === 'mousedown') {
      if (e.button === 0) { v.ctrl.mode = 'charge'; v.ctrl.t = 0; }
      if (e.button === 2) v.ctrl.mode = 'lift';
    } else if (type === 'mouseup') {
      if (e.button === 0 && v.ctrl.mode === 'charge') {
        v.ctrl.power = Math.min(1, v.ctrl.t / this.c.maxCharge);
        v.ctrl.mode = 'kick';
        this.h.power(null);
      }
      if (e.button === 2 && v.ctrl.mode === 'lift') v.ctrl.mode = 'idle';
    }
  }

  _select(role) { const v = this.views.find((x) => x.rod.team === 'A' && x.rod.role === role); if (v) this._selectView(v); }
  _selectView(v) { this.manual = { v, t: 1.5 }; }

  _controlPlayer(dt) {
    const v = this._active();
    if (v !== this.act) {
      if (this.act && this.act.ctrl.mode !== 'kick') this.act.ctrl.mode = 'idle';
      this.act = v;
      this.target = v.rod.slide;
    }
    for (const x of this.views) if (x.indicator) x.indicator.visible = x === v;
    if (this.manual) this.manual.t -= dt;
    const r = v.rod;
    r.slideVel = THREE.MathUtils.clamp((this.target - r.slide) / Math.max(dt, 1 / 120), -3, 3);
    for (const x of this.views) {
      if (x.rod.team !== 'A') continue;
      if (x !== v) x.rod.slideVel = 0;
      const c = x.ctrl;
      if (c.mode === 'charge') {                    // carica: l'asta arretra un poco
        c.t += dt;
        this.h.power(Math.min(1, c.t / this.c.maxCharge));
        x.rod.omega = (-0.5 - x.rod.angle) * 8;
      } else if (c.mode === 'kick') {
        x.rod.omega = this.c.kickSpeed[0] + (this.c.kickSpeed[1] - this.c.kickSpeed[0]) * c.power;
        if (x.rod.angle > 1.2) c.mode = 'idle';
      } else if (c.mode === 'lift') {
        x.rod.omega = (-Math.PI / 2 - x.rod.angle) * 10;
      } else {
        x.rod.omega = -x.rod.angle * 10;          // torna verticale
      }
    }
  }

  update(dt) {
    if (this.state !== 'play') return;
    if (this.pause > 0) { this.pause -= dt; this._draw(); return; }
    this._controlPlayer(dt);
    this.ai.update(this.st, dt);
    const ev = step(this.st, dt, this.P);
    for (const hit of ev.hits.slice(0, 3)) {
      sfx(hit.kind === 'foot' ? { freq: 900, dur: 0.04, vol: Math.min(0.5, hit.speed / 6), noise: 0.6 } : { freq: 400, dur: 0.05, vol: Math.min(0.3, hit.speed / 8), noise: 0.8 });
    }
    if (ev.goal) {
      const scorer = ev.goal === 'B' ? 0 : 1;       // gol nella porta B = punto per la squadra A (giocatore)
      this.score[scorer]++;
      this._hud();
      jingle(scorer === 0 ? [523, 659, 784] : [392, 330], 0.12, 0.15);
      this.h.message(scorer === 0 ? this.c.goalYou : this.c.goalOpp, 1.6);
      this.h.banter(scorer === 1 ? 'hit' : 'miss');
      if (this.score[scorer] >= this.c.goals) {
        this.over = true;
        const win = scorer === 0;
        this.h.banter(win ? 'lose' : 'win');
        this.h.finish({ title: win ? this.c.youWin : this.c.youLose.replace('{name}', this.c.opponent), win,
          html: `<p class="sub">Tu ${this.score[0]} · ${this.c.opponent} ${this.score[1]}</p>` });
        this.state = 'done';
        return;
      }
      this._kickoff(ev.goal);                        // rimessa dal lato di chi ha subito
    } else if (ev.stall) this._kickoff(null);
    this._draw();
  }

  _draw() { this.rig.draw(this.st); }

  idle() {}

  dispose() {
    for (const v of this.views) if (v.indicator) v.indicator.visible = false;
    this.rig.reset();
    this.rig.owner = null;                          // riprende la partita dimostrativa (se attiva)
    this.rig.ball.visible = !!this.c.demoInExploration;
    this.h.hud('');
  }
}

// Patata Simulator 3000 (easter egg per Jaime): sul maxischermo, tu e Zugo contro le patate. Si gioca seduti davanti
// alla TV; il gioco è disegnato su un canvas che prende il posto della partita (tv.setOverride), come il quiz della serata.
// Si avvia parlando con Zugo, nel gioco libero (o a serata finita).
import * as THREE from 'three';
import { registerMinigame } from '../manager.js';
import { sfx, jingle, pick } from '../util.js';
import { PatataGame, W, H, CANNON_Y } from './rules.js';

let view = null;                               // camera calcolata in create(), letta da def.camera

registerMinigame('patata', {
  camera: () => view,
  opponentSpot: null,
  recordHigher: true,
  // schermata iniziale: il logo al posto del titolo e la dedica
  introHTML: (cfg) => `<img class="mg-logo" src="${cfg.logo}" alt="${cfg.title}"><p class="mg-dedica">${cfg.dedica}</p>`,
  create: (host) => new Patata(host),
});

const CW = 1024, CH = 576, S = CW / W;

class Patata {
  constructor(host) {
    this.h = host;
    this.cfg = host.cfg;
    this.canvas = document.createElement('canvas');
    this.canvas.width = CW; this.canvas.height = CH;
    this.g = this.canvas.getContext('2d');
    this.keys = { left: false, right: false, fire: false, mouse: false };
    this.dx = 0;
    this.fx = [];                              // scritte che salgono (+20) e schizzi
    this.stars = Array.from({ length: 70 }, () => [Math.random() * W, Math.random() * H, Math.random()]);
    this.line = null;                          // battuta di Zugo in basso sul maxischermo
    this.game = null;
    const screen = host.root.getObjectByName('TV_Screen');
    const box = screen ? new THREE.Box3().setFromObject(screen) : null;
    const c = box ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3(-1.5, 2, -3.95);
    // davanti allo schermo, all'altezza degli occhi di chi sta seduto in prima fila, un po' più vicino
    const pos = new THREE.Vector3(c.x, 1.55, c.z + 1.75);
    const cam = new THREE.PerspectiveCamera();
    cam.position.copy(pos);
    cam.lookAt(c.x, c.y - 0.05, c.z);
    view = { pos, quat: cam.quaternion.clone(), fov: this.cfg.fov };
    // Zugo si mette accanto, a destra, girato verso lo schermo (e torna dov'era all'uscita)
    this.zugo = host.npc(this.cfg.opponent);
    if (this.zugo) {
      const z = this.zugo;
      this.saved = { pos: z.position.clone(), rot: z.rotation.y, visible: z.visible, clip: z.userData.anim?.idle.getClip().name };
      host.stopFilming?.(z);
      z.userData.minigameMoved = true;
      z.visible = true;
      const p = z.parent.worldToLocal(new THREE.Vector3(c.x + 0.85, 0, c.z + 1.45));
      z.position.set(p.x, z.userData.stand_lift ?? z.position.y, p.z);
      z.rotation.y = Math.atan2(-0.85, -1.45);   // verso il centro dello schermo
      if (z.userData.idle_clip) host.setClip?.(z, z.userData.stand_clip ?? z.userData.idle_clip);
    }
    host.wallet?.show(false);                  // niente card sopra la schermata del gioco
    host.tv?.setOverride(this.canvas, () => this.draw());
    this.draw();
  }

  start() {
    this.game = new PatataGame(this.cfg.opzioni);
    this.fx = [];
    this.h.hint(this.cfg.hint);
    this.say(pick(this.cfg.lines.start));
    this._hud();
  }

  say(text) { this.line = { text, t: 4 }; }

  _hud() {
    const g = this.game;
    this.h.hud(`<div class="box me">Tu ${g.score.me}</div><div class="box turn">Onda ${g.wave} · ${'♥'.repeat(Math.max(0, g.lives))}</div><div class="box opp">Zugo ${g.score.zugo}</div>`);
  }

  update(dt) {
    const g = this.game;
    if (!g) return;
    const move = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    g.step(dt, { move, fire: this.keys.fire || this.keys.mouse, dx: this.dx });
    this.dx = 0;
    for (const e of g.events) this._event(e);
    g.events.length = 0;
    for (const f of this.fx) f.t -= dt;
    this.fx = this.fx.filter((f) => f.t > 0);
    if (this.line && (this.line.t -= dt) <= 0) this.line = null;
    if (g.over && !this.ended) {
      this.ended = true;
      const win = g.winner() === 'me';
      this.say(pick(this.cfg.lines[win ? 'lose' : 'win']));
      jingle(win ? [523, 659, 784, 1046] : [392, 330, 262], 0.14, 0.12);
      this.h.hint(null);
      this.h.finish({
        win, record: g.score.me, delay: 1600,
        title: win ? this.cfg.youWin : this.cfg.youLose.replace('{name}', this.cfg.opponent),
        html: `<p class="sub">${g.over === 'invasione' ? this.cfg.invasione : this.cfg.finite} · ${this.cfg.onda} ${g.wave}</p>
          <table class="score-table"><tr><th>Tu</th><th>Zugo</th></tr><tr><td>${g.score.me}</td><td>${g.score.zugo}</td></tr></table>`,
      });
    }
  }

  _event(e) {
    const g = this.game;
    if (e.type === 'shot') sfx({ freq: e.owner === 'me' ? 1400 : 1100, dur: 0.06, vol: 0.08, noise: 0.2, type: 'square' });
    else if (e.type === 'hit' || e.type === 'gold') {
      const pts = e.type === 'gold' ? 100 : e.pts;
      this.fx.push({ x: e.x, y: e.y, text: `+${pts}`, t: 0.8, col: e.owner === 'me' ? '#ffe100' : '#7ee8ff', splat: true });
      sfx({ freq: e.type === 'gold' ? 900 : 260, dur: 0.12, vol: 0.14, noise: 0.7 });
      if (e.type === 'gold') { jingle([880, 1175, 1568], 0.08, 0.09); this.say(e.owner === 'me' ? pick(this.cfg.lines.oroTuo) : pick(this.cfg.lines.oroSuo)); }
      else if (e.owner === 'zugo' && Math.random() < 0.12) this.say(pick(this.cfg.lines.hit));
      this._hud();
    } else if (e.type === 'hurt') {
      sfx({ freq: 120, dur: 0.3, vol: 0.2, noise: 0.5, type: 'sawtooth' });
      this.say(pick(this.cfg.lines[e.owner === 'me' ? 'colpitoTu' : 'colpitoLui']));
      this._hud();
    } else if (e.type === 'wave') {
      if (g.wave > 1) { this.fx.push({ x: W / 2, y: H / 2, text: `${this.cfg.onda.toUpperCase()} ${g.wave}`, t: 1.6, col: '#ff17e4', big: true }); this.say(pick(this.cfg.lines.onda)); }
      this._hud();
    }
  }

  input(type, e) {
    const down = type === 'keydown', up = type === 'keyup';
    if (down || up) {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = down;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = down;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.keys.fire = down;
    } else if (type === 'mousedown' && e.button === 0) this.keys.mouse = true;
    else if (type === 'mouseup' && e.button === 0) this.keys.mouse = false;
    else if (type === 'mousemove') this.dx += (e.movementX ?? 0) * this.cfg.mouseSensitivity;
  }

  inProgress() { return !!this.game && !this.game.over; }

  idle() { this.draw(); }

  // ------------------------------------------------------------------ disegno sul maxischermo

  draw() {
    const g = this.g, game = this.game;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const grd = g.createLinearGradient(0, 0, 0, CH);
    grd.addColorStop(0, '#12051c'); grd.addColorStop(1, '#2a0a2e');
    g.fillStyle = grd; g.fillRect(0, 0, CW, CH);
    g.setTransform(S, 0, 0, S, 0, 0);
    for (const [x, y, b] of this.stars) { g.fillStyle = `rgba(255,255,255,${0.25 + b * 0.5})`; g.fillRect(x, y, 0.8, 0.8); }
    // pavimento a griglia (synthwave)
    g.strokeStyle = 'rgba(255,23,228,0.35)'; g.lineWidth = 0.4;
    for (let x = -W; x <= 2 * W; x += 24) { g.beginPath(); g.moveTo(W / 2 + (x - W / 2) * 0.25, CANNON_Y + 8); g.lineTo(x, H); g.stroke(); }
    for (const y of [CANNON_Y + 9, CANNON_Y + 12, CANNON_Y + 16]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    if (!game) { this._title(); return; }
    for (const p of game.potatoes) this._potato(p.x, p.y + Math.sin(p.wob) * 0.6, p.r, p.kind);
    if (game.gold) this._potato(game.gold.x, 12, 6, 'gold');
    // patatine fritte
    for (const d of game.drops) {
      g.save(); g.translate(d.x, d.y); g.rotate(d.y * 0.15);
      g.fillStyle = '#f5c542'; g.fillRect(-0.9, -4, 1.8, 8); g.fillStyle = '#d99a1e'; g.fillRect(-0.9, 2.5, 1.8, 1.5);
      g.restore();
    }
    for (const b of game.bullets) { g.fillStyle = b.owner === 'me' ? '#ffe100' : '#7ee8ff'; g.fillRect(b.x - 0.7, b.y - 4, 1.4, 5); }
    this._cannon(game.cannons.me, '#ff17e4', '#ffe100', 'TU');
    this._cannon(game.cannons.zugo, '#1fb5d6', '#e8fbff', 'ZUGO');
    for (const f of this.fx) {
      g.globalAlpha = Math.min(1, f.t * 2);
      if (f.splat) { g.fillStyle = 'rgba(214,176,110,0.8)'; for (let i = 0; i < 5; i++) { const a = i * 1.26 + f.t * 3; g.fillRect(f.x + Math.cos(a) * (0.8 - f.t) * 14, f.y + Math.sin(a) * (0.8 - f.t) * 14, 1.6, 1.6); } }
      g.fillStyle = f.col; g.textAlign = 'center';
      g.font = f.big ? '700 22px Oswald, Arial Narrow, sans-serif' : '700 8px Oswald, Arial Narrow, sans-serif';
      g.fillText(f.text, f.x, f.y - (f.big ? 0 : (0.8 - f.t) * 16));
      g.globalAlpha = 1;
    }
    // punteggi in alto
    g.textBaseline = 'top'; g.font = '700 9px Oswald, Arial Narrow, sans-serif';
    g.textAlign = 'left'; g.fillStyle = '#ffe100'; g.fillText(`TU ${game.score.me}`, 6, 3);
    g.textAlign = 'right'; g.fillStyle = '#7ee8ff'; g.fillText(`ZUGO ${game.score.zugo}`, W - 6, 3);
    g.textAlign = 'center'; g.fillStyle = '#ff9df3'; g.fillText(`ONDA ${game.wave}   ${'♥'.repeat(Math.max(0, game.lives))}`, W / 2, 3);
    g.textBaseline = 'alphabetic';
    if (this.line) {
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, H - 13, W, 13);
      g.fillStyle = '#7ee8ff'; g.font = '600 8px "Source Sans 3", Arial, sans-serif'; g.textAlign = 'center';
      g.fillText(`ZUGO: ${this.line.text}`, W / 2, H - 4);
    }
  }

  _title() {
    const g = this.g;
    g.textAlign = 'center';
    g.font = '700 26px Oswald, Arial Narrow, sans-serif';
    g.fillStyle = '#ffe100'; g.fillText('PATATA', W / 2, 70);
    g.fillStyle = '#ff17e4'; g.fillText('SIMULATOR 3000', W / 2, 98);
    g.font = '600 9px "Source Sans 3", Arial, sans-serif'; g.fillStyle = '#e8d8ff';
    g.fillText(this.cfg.dedica, W / 2, 118);
    for (let i = 0; i < 5; i++) this._potato(W / 2 - 60 + i * 30, 145, 6.5, i === 2 ? 'gold' : 'mid');
  }

  _potato(x, y, r, kind) {
    const g = this.g;
    const col = { big: '#7a4a1f', mid: '#96602c', small: '#b57d42', gold: '#ffc61a' }[kind];   // scuri: lo schermo è luminoso
    g.fillStyle = col;
    g.beginPath(); g.ellipse(x, y, r * 1.25, r * 0.85, 0.15, 0, Math.PI * 2); g.fill();
    g.strokeStyle = kind === 'gold' ? '#fff3a8' : '#6b4320'; g.lineWidth = 0.6; g.stroke();
    // occhi della patata (germogli) e faccetta
    g.fillStyle = kind === 'gold' ? '#b8860b' : '#6b4320';
    for (const [dx, dy] of [[-0.6, -0.35], [0.7, 0.3], [-0.2, 0.45]]) g.fillRect(x + dx * r, y + dy * r, 0.9, 0.9);
    g.fillStyle = '#1a0d05';
    g.fillRect(x - r * 0.35, y - r * 0.15, 1.1, 1.3); g.fillRect(x + r * 0.2, y - r * 0.15, 1.1, 1.3);
    if (kind === 'gold') { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x - r * 0.7, y - r * 0.5, 1.4, 1.4); }
  }

  _cannon(c, body, tip, label) {
    const g = this.g;
    if (c.hurt > 0 && Math.floor(c.hurt * 10) % 2) return;       // lampeggia dopo un colpo
    g.fillStyle = body;
    g.beginPath(); g.moveTo(c.x - 9, CANNON_Y + 5); g.lineTo(c.x + 9, CANNON_Y + 5); g.lineTo(c.x + 6, CANNON_Y - 1); g.lineTo(c.x - 6, CANNON_Y - 1); g.fill();
    g.fillStyle = tip; g.fillRect(c.x - 1.5, CANNON_Y - 7, 3, 6);
    g.font = '700 5px Oswald, Arial Narrow, sans-serif'; g.textAlign = 'center'; g.fillStyle = tip;
    g.fillText(label, c.x, CANNON_Y + 11);
  }

  dispose() {
    this.h.tv?.setOverride(null);
    this.h.wallet?.show(true);
    const z = this.zugo;
    if (z && this.saved) {
      z.position.copy(this.saved.pos); z.rotation.y = this.saved.rot; z.visible = this.saved.visible;
      if (this.saved.clip) this.h.setClip?.(z, this.saved.clip);
      z.userData.minigameMoved = false;
    }
    view = null;
  }
}

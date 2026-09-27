// Slot machine: i rulli sono disegnati su una texture canvas posata sulla finestra dei rulli (marcatore SLOTS_Reels_N).
import * as THREE from 'three';
import { registerMinigame } from '../manager.js';
import { SurfaceFrame, sfx, jingle, pick } from '../util.js';
import { SlotMachine, STRIPS, PAYS } from './rules.js';

registerMinigame('slots', {
  camera: (target) => `CAM_Slots_${target?.userData.machine ?? 1}`,
  opponentSpot: null,
  recordHigher: true,
  create: (host) => new Slots(host),
});

const CW = 768, ROWS = 3;          // l'altezza del canvas segue le proporzioni della finestra dei rulli

function drawSymbol(g, sym, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s); g.lineWidth = 3; g.strokeStyle = '#2a1a0e';
  switch (sym) {
    case 'ciliegia':
      g.strokeStyle = '#2f6b1f'; g.beginPath(); g.moveTo(-10, 4); g.quadraticCurveTo(-4, -24, 12, -30); g.moveTo(12, 6); g.quadraticCurveTo(10, -14, 12, -30); g.stroke();
      g.fillStyle = '#c0141e'; for (const cx of [-12, 12]) { g.beginPath(); g.arc(cx, 14, 13, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(-16, 9, 3, 0, Math.PI * 2); g.fill(); break;
    case 'limone':
      g.fillStyle = '#f2d21b'; g.beginPath(); g.ellipse(0, 0, 28, 20, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.arc(29, 0, 4, 0, Math.PI * 2); g.fill(); break;
    case 'arancia':
      g.fillStyle = '#f08a12'; g.beginPath(); g.arc(0, 2, 24, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#2f6b1f'; g.beginPath(); g.ellipse(6, -22, 9, 4, -0.4, 0, Math.PI * 2); g.fill(); break;
    case 'uva':
      g.fillStyle = '#6a2c8c';
      for (const [cx, cy] of [[-12, -12], [0, -12], [12, -12], [-6, 0], [6, 0], [0, 12], [-12, 0], [12, 0]]) { g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#2f6b1f'; g.beginPath(); g.moveTo(0, -20); g.lineTo(4, -30); g.stroke(); break;
    case 'campana':
      g.fillStyle = '#e0b030'; g.beginPath(); g.moveTo(-24, 16); g.quadraticCurveTo(-20, -26, 0, -26); g.quadraticCurveTo(20, -26, 24, 16); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, 20, 6, 0, Math.PI * 2); g.fill(); g.stroke(); break;
    case 'bar':
      g.fillStyle = '#111'; g.fillRect(-32, -16, 64, 32); g.fillStyle = '#f4f1e8'; g.font = '700 22px Oswald, Arial Narrow, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BAR', 0, 1); break;
    case 'sette':
      g.fillStyle = '#d0141e'; g.font = '800 64px Oswald, Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('7', 0, 2); g.strokeText('7', 0, 2); break;
    case 'nuraghe':                                  // torre nuragica: tronco di cono in pietra con feritoia
      g.fillStyle = '#b09a78'; g.beginPath(); g.moveTo(-26, 26); g.lineTo(-16, -24); g.lineTo(16, -24); g.lineTo(26, 26); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(60,40,20,0.6)'; g.lineWidth = 1.5;
      for (let yy = -14; yy < 26; yy += 9) { g.beginPath(); g.moveTo(-26 + (26 - yy) * 0.0, yy); g.lineTo(26, yy); g.stroke(); }
      g.fillStyle = '#2a1a0e'; g.fillRect(-5, 12, 10, 14); break;
    default: break;
  }
  g.restore();
}

class Slots {
  constructor(host) {
    this.h = host;
    this.c = host.cfg;
    const n = host.target?.userData.machine ?? 1;
    const mk = host.marker(`SLOTS_Reels_${n}`);
    const fr = new SurfaceFrame(mk);
    this.canvas = document.createElement('canvas');
    this.CH = Math.round(CW * (fr.depth / fr.width));
    this.canvas.width = CW; this.canvas.height = this.CH;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(fr.width, fr.depth), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    this.mesh.quaternion.copy(fr.quat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    this.mesh.position.copy(fr.center).addScaledVector(fr.normal, 0.003);
    host.scene.add(this.mesh);
    this.reels = STRIPS.map(() => ({ pos: Math.random() * 22, speed: 0, stopAt: null, t: 0, stopped: true }));
    // pulsanti, gettoniera e vaschetta dal glb
    const part = (nm) => host.marker(`${nm}_${n}`);
    const at = (o) => (o ? { pos: o.getWorldPosition(new THREE.Vector3()), normal: new THREE.Vector3(0, 1, 0).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion())) } : null);
    // gli empty esportati da Blender hanno la Z locale (normale) sull'asse +Y di three.js
    this.btn = { spin: at(part('SLOTS_Button_Spin')), cash: at(part('SLOTS_Button_Cash')), bet: at(part('SLOTS_Button_Bet')) };
    this.coinSlot = at(part('SLOTS_Coin'));
    const tray = part('SLOTS_Tray');
    this.tray = tray ? { pos: tray.getWorldPosition(new THREE.Vector3()), size: tray.userData.size ?? [0.2, 0.08] } : null;
    this.coinGeo = new THREE.CylinderGeometry(0.0115, 0.0115, 0.0022, 20);
    this.coinMat = new THREE.MeshStandardMaterial({ color: 0xd9b24a, metalness: 0.9, roughness: 0.3 });
    this.trayCoins = [];
    this.busy = false;
    this.state = 'idle';
    this._draw();
  }

  // gettoni comprati col portafoglio entrando (fino a maxTokens); uscendo quelli rimasti tornano in euro
  _settle() {
    const w = this.h.wallet;
    if (!this.m || this.m.settled || !w) return;
    this.m.settled = true;
    w.earn(this.m.total * this.c.coinPrice);
  }

  start() {
    for (const c of this.trayCoins) c.removeFromParent();
    this.trayCoins = [];
    this._settle();
    const w = this.h.wallet;
    let tokens = this.c.pocket;
    if (w) {
      tokens = Math.min(this.c.maxTokens, Math.floor((w.amount + 1e-6) / this.c.coinPrice));
      w.pay(tokens * this.c.coinPrice, false);
    }
    this.m = new SlotMachine({ pocket: tokens, credits: 0 });
    this.state = 'ready';
    this.over = false;
    this.h.hint(this.c.hint);
    this._hud();
  }

  inProgress() { return !this.over && this.m?.spins > 0; }

  _hud() {
    const m = this.m;
    this.h.hud(`<div class="box">Gettoni ${m.pocket}</div><div class="box me">Crediti ${m.credits}</div><div class="box">Puntata ${m.bet}</div>`
      + `<div class="box turn">${m.lastWin ? `Vinti ${m.lastWin}` : m.credits ? 'Buona fortuna' : 'Inserisci un gettone'}</div>`);
  }

  input(type, e) {
    if (this.state !== 'ready' || this.busy) return;
    if ((type === 'mousedown' && e.button === 0) || (type === 'keydown' && e.code === 'Space')) this._press('spin', () => this._spin());
    else if ((type === 'mousedown' && e.button === 2) || (type === 'keydown' && e.code === 'KeyG')) this._insert();
    else if (type === 'wheel' || (type === 'keydown' && (e.code === 'ArrowUp' || e.code === 'ArrowDown'))) {
      const up = type === 'wheel' ? e.deltaY < 0 : e.code === 'ArrowUp';
      this._press('bet', () => { this.m.setBet(this.m.bet + (up ? 1 : -1)); this._hud(); sfx({ freq: 1200, dur: 0.03, vol: 0.1, noise: 0.2 }); });
    } else if (type === 'keydown' && e.code === 'Enter') this._press('cash', () => this._cashOut());
  }

  // la mano preme il pulsante; l'azione parte al contatto
  _press(which, action) {
    const b = this.btn[which];
    if (!b || !this.h.hands?.available) { action(); return; }
    if (which === 'spin' && !this.m.canSpin()) { this.h.message(this.c.needCoins, 1.2); return; }
    this.busy = true;
    this.h.hands.press(b.pos, b.normal, {
      onTouch: () => { sfx({ freq: 900, dur: 0.03, vol: 0.18, noise: 0.5 }); action(); },
      onDone: () => { this.busy = false; },
    });
  }

  // gettone dalla tasca alla gettoniera: la mano lo porta e lo spinge nella feritoia
  _insert() {
    if (this.m.pocket <= 0) { this.h.message(this.c.noPocket, 1.2); return; }
    const hands = this.h.hands;
    const coin = new THREE.Mesh(this.coinGeo, this.coinMat);
    coin.rotation.x = Math.PI / 2;
    const done = () => {
      coin.removeFromParent();
      this.m.insertCoin();
      sfx({ freq: 2600, dur: 0.05, vol: 0.2, noise: 0.3, type: 'sine' });
      setTimeout(() => sfx({ freq: 1800, dur: 0.08, vol: 0.12, noise: 0.6 }), 120);
      this._hud();
    };
    if (!this.coinSlot || !hands?.available || !hands.sockets.Socket_Fingertip) { done(); return; }
    this.busy = true;
    hands.hold('Hand_Point');
    hands.sockets.Socket_Fingertip.add(coin);          // il gettone sul polpastrello
    coin.position.set(0, -0.004, 0.006);
    hands.press(this.coinSlot.pos, this.coinSlot.normal, { depth: 0.0, approach: 0.04, onTouch: done, onDone: () => { this.busy = false; } });
  }

  _spin() {
    const r = this.m.spin();
    if (!r) return;
    this.result = r;
    this.state = 'spin';
    this.h.message(null);
    this._hud();
    sfx({ freq: 300, dur: 0.15, vol: 0.2, noise: 0.3, type: 'sawtooth' });
    this.reels.forEach((reel, i) => {
      reel.speed = 22 + i * 2;                    // simboli al secondo
      reel.stopped = false;
      reel.stopAt = this.c.stopTimes[i];
      reel.t = 0;
      reel.target = r.stops[i];
    });
  }

  // monete che cadono nella vaschetta quando si incassa
  _dropCoins(n) {
    if (!this.tray) return;
    const k = Math.min(n, 30 - this.trayCoins.length);
    for (let i = 0; i < k; i++) {
      const c = new THREE.Mesh(this.coinGeo, this.coinMat);
      const [w, d] = this.tray.size;
      c.position.copy(this.tray.pos).add(new THREE.Vector3((Math.random() - 0.5) * w * 0.7, 0.12 + i * 0.01, (Math.random() - 0.5) * d * 0.5));
      c.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * 6, (Math.random() - 0.5) * 0.4);
      c.userData.fall = { v: 0, floor: this.tray.pos.y + 0.0012 + (this.trayCoins.length % 6) * 0.0022, delay: i * 0.06 };
      this.h.scene.add(c);
      this.trayCoins.push(c);
    }
  }

  _cashOut() {
    const m = this.m;
    const n = m.cashOut();
    this._dropCoins(n);
    if (n) for (let i = 0; i < Math.min(n, 12); i++) setTimeout(() => sfx({ freq: 2000 + Math.random() * 800, dur: 0.04, vol: 0.12, noise: 0.4, type: 'sine' }), i * 70);
    this._hud();
    this.over = true;
    this.state = 'done';
    const win = m.total > m.start;
    this.h.banter(win ? 'lose' : 'win');
    this.h.finish({ title: this.c.cashOut.replace('{n}', m.total), win, record: m.best, delay: 1600,
      html: `<p class="sub">${this.c.summary.replace('{spins}', m.spins).replace('{best}', m.best)}</p>` });
  }

  update(dt) {
    for (const c of this.trayCoins) {                   // caduta delle monete nella vaschetta
      const f = c.userData.fall;
      if (!f) continue;
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.v += 9.8 * dt;
      c.position.y -= f.v * dt;
      if (c.position.y <= f.floor) { c.position.y = f.floor; c.userData.fall = null; c.rotation.x = 0; c.rotation.z = 0; }
    }
    let moving = false;
    for (const reel of this.reels) {
      if (reel.stopped) continue;
      moving = true;
      reel.t += dt;
      if (reel.t < reel.stopAt) {
        const before = Math.floor(reel.pos);
        reel.pos = (reel.pos + reel.speed * dt) % 22;
        if (Math.floor(reel.pos) !== before && Math.random() < 0.35) sfx({ freq: 1800, dur: 0.012, vol: 0.05, noise: 1 });
      } else {
        // aggancio morbido alla posizione finale (ultimi 0.25 s)
        if (reel.snapFrom == null) { reel.snapFrom = reel.pos; reel.snapT = 0; reel.goal = reel.target + (reel.target < reel.pos ? 22 : 0) + 22; }
        reel.snapT += dt / 0.3;
        const k = Math.min(1, reel.snapT);
        const e = 1 - (1 - k) ** 3;
        reel.pos = (reel.snapFrom + (reel.goal - reel.snapFrom) * e) % 22;
        if (k >= 1) { reel.pos = reel.target; reel.stopped = true; reel.snapFrom = null; sfx({ freq: 500, dur: 0.05, vol: 0.2, noise: 0.6 }); }
      }
    }
    this._draw();
    if (this.state === 'spin' && !moving) {
      const w = this.result.win;
      if (w > 0) {
        this.h.message(`+${w}`, 1.4);
        if (w >= this.m.bet * 20) { jingle([523, 659, 784, 1046, 1318], 0.1, 0.2); this.h.banter('hit'); }
        else jingle([784, 1046], 0.08, 0.12);
      }
      this._hud();
      if (!this.m.canSpin() && this.m.pocket <= 0) {
        if (this.m.credits > 0) { this.m.setBet(this.m.credits); this._hud(); this.state = 'ready'; return; }
        this.over = true;
        this.state = 'done';
        this.h.banter('win');
        this.h.finish({ title: this.c.broke, win: false, record: this.m.best,
          html: `<p class="sub">${this.c.summary.replace('{spins}', this.m.spins).replace('{best}', this.m.best)}</p>` });
        return;
      }
      this.state = 'ready';
    }
  }

  _draw() {
    const g = this.g, CH = this.CH;
    g.fillStyle = '#1b0f08'; g.fillRect(0, 0, CW, CH);
    const rw = CW / 3, sh = CH / ROWS;
    this.reels.forEach((reel, i) => {
      const x0 = i * rw;
      const grd = g.createLinearGradient(0, 0, 0, CH);
      grd.addColorStop(0, '#bcb4a4'); grd.addColorStop(0.5, '#fbf8f0'); grd.addColorStop(1, '#bcb4a4');
      g.fillStyle = grd; g.fillRect(x0 + 6, 0, rw - 12, CH);
      g.save(); g.beginPath(); g.rect(x0 + 6, 0, rw - 12, CH); g.clip();
      const strip = STRIPS[i];
      const base = Math.floor(reel.pos), frac = reel.pos - base;
      for (let k = -2; k <= 2; k++) {
        const sym = strip[(((base + k) % 22) + 22) % 22];
        const y = CH / 2 + (k - frac) * sh;       // la posizione "pos" è al centro della linea
        drawSymbol(g, sym, x0 + rw / 2, y, Math.min(rw / 90, sh / 80));
      }
      g.restore();
    });
    g.strokeStyle = 'rgba(200,20,30,0.85)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, CH / 2); g.lineTo(CW, CH / 2); g.stroke();
    this.tex.needsUpdate = true;
  }

  idle(dt) { if (this.state === 'spin' || this.state === 'done') this.update(dt); }

  dispose() {
    this._settle();
    for (const c of this.trayCoins) c.removeFromParent();
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.tex.dispose();
    this.h.hud('');
  }
}

export { PAYS };

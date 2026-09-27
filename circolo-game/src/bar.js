// Bancone (Nicola, modello Meshy): "Ordina da bere" cambia la schermata. La camera va sul bancone (CAM_Bar_Order),
// Nicola chiede cosa servire e il menu mostra i drink con i prezzi (CONFIG.bar.drinks). Si paga col portafoglio,
// Nicola prende la bottiglia giusta e versa nel bicchiere: il braccio destro segue la bottiglia con un'IK a due
// ossa sopra l'animazione, il liquido prende colore e livello del drink. Poi si torna in giro e il bicchiere si prende
// dal bancone come prima. Quando non serve, ogni tanto Nicola beve un sorso (clip Drink) da un bicchierino.
import * as THREE from 'three';
import { markerCamera } from './minigames/util.js';
import { ArmIK, aimBone } from './ik.js';
import { euro } from './wallet.js';
import { pick } from './minigames/util.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const FADE = 0.4;

// bottiglie che non ci sono sugli scaffali: birra (vetro scuro) e shaker per i cocktail
function latheBottle(kind) {
  const P = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
  const beer = kind === 'beer';
  const prof = beer
    ? P([[0, 0], [0.032, 0], [0.033, 0.01], [0.033, 0.14], [0.03, 0.16], [0.014, 0.2], [0.013, 0.24], [0.015, 0.245], [0, 0.245]])
    : P([[0, 0], [0.04, 0], [0.042, 0.01], [0.044, 0.15], [0.036, 0.17], [0.022, 0.2], [0.018, 0.23], [0.02, 0.24], [0, 0.24]]);
  const mat = beer
    ? new THREE.MeshStandardMaterial({ color: 0x4a2408, roughness: 0.15, metalness: 0.1 })
    : new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.25, metalness: 0.9 });
  const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), mat);
  m.castShadow = true;
  return m;
}

export class BarOrder {
  constructor(ctx, api) {
    this.ctx = ctx;
    this.api = api;
    this.cfg = ctx.config.bar;
    this.barista = ctx.npcs.npcs.find((o) => o.userData.npc_action === 'serve' && o.userData.meshy);
    this.enabled = !!(this.barista && api.glass && ctx.root.getObjectByName('CAM_Bar_Order'));
    this.active = false;
    if (!this.enabled) return;
    this.arm = new ArmIK(this.barista, 'Right');
    this.bottles = {};
    for (const d of this.cfg.drinks) this.bottles[d.id] = this._bottle(d.bottle);
    const geo = new THREE.CylinderGeometry(0.004, 0.003, 1, 8, 1, true);
    geo.translate(0, -0.5, 0);
    this.stream = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.15, transparent: true, opacity: 0.85 }));
    this.stream.visible = false;
    ctx.scene.add(this.stream);
    // bicchierino per il sorso di Nicola
    this.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.021, 0.075, 16),
      new THREE.MeshStandardMaterial({ color: 0xdfe8ea, roughness: 0.05, transparent: true, opacity: 0.55 }));
    this.cup.visible = false;
    ctx.scene.add(this.cup);
    this.sipIn = this._sipDelay();
    this._ui();
  }

  _sipDelay() { const [a, b] = this.cfg.sipEvery; return a + Math.random() * (b - a); }

  // bottiglia del drink in un contenitore con l'origine sul fondo e l'asse della bottiglia su +Y
  _bottle(name) {
    let mesh;
    if (name === 'beer' || name === 'shaker') mesh = latheBottle(name === 'beer' ? 'beer' : 'shaker');
    else {
      const src = this.ctx.root.getObjectByName(name);
      if (!src) return null;
      mesh = src.clone(true);
      src.updateWorldMatrix(true, true);
      mesh.matrixAutoUpdate = true;
      src.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
      const box = new THREE.Box3().setFromObject(src);
      const holder = new THREE.Group();
      holder.position.set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
      mesh.position.sub(holder.position);                  // mondo -> spazio del contenitore (senza rotazione)
      holder.add(mesh);
      holder.userData.h = box.max.y - box.min.y;
      holder.userData.r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
      holder.visible = false;
      this.ctx.scene.add(holder);
      return holder;
    }
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.userData.h = 0.245;
    holder.userData.r = name === 'beer' ? 0.033 : 0.044;
    holder.visible = false;
    this.ctx.scene.add(holder);
    return holder;
  }

  _ui() {
    const css = document.createElement('style');
    css.textContent = `
      #barui { position: fixed; inset: 0; z-index: 15; pointer-events: none; font-family: var(--body, sans-serif); color: #f1e6d2; }
      #barui .fade { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity ${FADE}s ease; }
      #barui .fade.on { opacity: 1; }
      #barui .menu { position: absolute; right: 4%; top: 50%; transform: translateY(-50%); width: min(420px, calc(100% - 32px)); pointer-events: auto;
        background: rgba(28,18,11,.94); border: 1px solid rgba(230,190,120,.4); border-radius: 8px; padding: 20px 22px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
      #barui .who { font: 600 16px var(--display, sans-serif); letter-spacing: .08em; color: #e6be78; text-transform: uppercase; }
      #barui .ask { font-size: 20px; line-height: 1.4; margin: 6px 0 14px; }
      #barui ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
      #barui button { width: 100%; display: flex; justify-content: space-between; gap: 12px; text-align: left; font: 17px var(--body, sans-serif); color: #f1e6d2;
        background: rgba(255,255,255,.05); border: 1px solid rgba(241,230,210,.2); border-radius: 5px; padding: 9px 12px; cursor: pointer; }
      #barui button:hover:not(:disabled), #barui button:focus-visible { background: rgba(230,190,120,.2); border-color: #e6be78; outline: none; }
      #barui button:disabled { opacity: .45; cursor: not-allowed; }
      #barui button b { color: #e6be78; margin-right: 8px; }
      #barui .price { font-family: var(--display, sans-serif); font-weight: 600; color: #e6be78; white-space: nowrap; }
      #barui .note { margin: 12px 0 0; font-size: 14px; opacity: .75; }
      #barui .donate { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
      #barui .donate a { font-size: 14px; color: #e6be78; }
      @media (max-aspect-ratio: 5/4) {
        #barui .menu { top: auto; bottom: 16px; right: 50%; transform: translateX(50%); padding: 14px 16px; }
        #barui .ask { margin: 4px 0 10px; font-size: 18px; } #barui button { padding: 7px 10px; } #barui .note { display: none; }
      }`;
    document.head.appendChild(css);
    this.el = document.createElement('div');
    this.el.id = 'barui';
    this.el.innerHTML = '<div class="menu" hidden></div><div class="fade"></div>';
    document.body.appendChild(this.el);
    this.menu = this.el.querySelector('.menu');
    this.fade = this.el.querySelector('.fade');
  }

  _fade(on, then) {
    this.fade.classList.toggle('on', on);
    if (then) setTimeout(then, FADE * 1000);
  }

  // ------------------------------------------------------------------ apertura e chiusura

  open() {
    const ctx = this.ctx;
    if (!this.enabled || this.active || this.api.state !== 'empty' || !this.api.atHome() || ctx.hands.active) return;
    this.active = true;
    this.phase = 'menu';
    ctx.player.clearInput();
    ctx.interactions.setModal(null);
    ctx.ui.setPrompt(null);
    ctx.ui.subtitle(null);
    this.saved = { fov: ctx.camera.fov };
    ctx.releaseLock?.();
    this._fade(true, () => {
      ctx.ui.showHUD(false);
      const c = markerCamera(ctx.root.getObjectByName('CAM_Bar_Order'));
      ctx.camera.position.copy(c.pos);
      ctx.camera.quaternion.copy(c.quat);
      ctx.camera.rotateOnWorldAxis(UP, this.cfg.cameraYaw);   // bancone e bicchiere a sinistra, menu a destra
      ctx.camera.fov = c.fov; ctx.camera.updateProjectionMatrix();
      this.hidden = [];
      this._hideNear();
      if (this.barista.userData.talk_clip) this.prevClip = ctx.npcs.setLoop(this.barista, this.barista.userData.talk_clip, 1, 0.3);
      this._showMenu(pick(this.cfg.ask));
      this._fade(false);
    });
  }

  _showMenu(text) {
    const w = this.ctx.wallet;
    const d = this.ctx.config.donations;
    this.menu.innerHTML = `<div class="who">${this.barista.userData.npc_name ?? 'Nicola'}</div><div class="ask"></div><ol></ol>
      <p class="note">${this.cfg.note}</p>${d?.enabled && d.drinkUrl ? `<div class="donate"><a href="${d.drinkUrl}" target="_blank" rel="noopener">${d.drinkLabel}</a></div>` : ''}`;
    this.menu.querySelector('.ask').textContent = text;
    const ol = this.menu.querySelector('ol');
    const items = [...this.cfg.drinks.map((dr) => ({ dr, label: dr.name, price: dr.price })), { label: this.cfg.none }];
    this.items = items;
    items.forEach((it, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.innerHTML = `<span><b>${i + 1}</b></span><span class="price"></span>`;
      b.firstChild.append(it.label);
      if (it.price != null) b.querySelector('.price').textContent = euro(it.price);
      b.disabled = it.price != null && !w.canPay(it.price);
      if (b.disabled) b.title = this.cfg.notEnough;
      b.addEventListener('click', (e) => { e.stopPropagation(); this.choose(i); });
      li.append(b);
      ol.append(li);
    });
    this.menu.hidden = false;
    ol.querySelector('button:not(:disabled)')?.focus();
  }

  // bicchiere pieno: Nicola dice il prezzo, un pulsante lo mette in mano (e il clic riprende il mouse)
  _served() {
    this.phase = 'served';
    this.menu.innerHTML = `<div class="who">${this.barista.userData.npc_name ?? 'Nicola'}</div><div class="ask"></div><ol><li><button><span><b>E</b></span></button></li></ol>`;
    this.menu.querySelector('.ask').textContent = pick(this.cfg.served).replace('{price}', euro(this.dr.price));
    const b = this.menu.querySelector('button');
    b.firstChild.append(this.cfg.takeLabel);
    b.addEventListener('click', (e) => { e.stopPropagation(); this.take(); });
    this.menu.hidden = false;
    b.focus();
  }

  take() {
    if (this.phase !== 'served') return;
    this.close(true);
  }

  choose(i) {
    const it = this.items?.[i];
    if (!it || this.phase !== 'menu') return;
    if (!it.dr) { this.close(); return; }
    if (!this.ctx.wallet.pay(it.price, false)) { this.ctx.ui.toast(this.cfg.notEnough); return; }
    this.menu.hidden = true;
    this._startPour(it.dr);
  }

  // take: il bicchiere appena versato passa in mano al giocatore
  close(take = false) {
    if (!this.active || this.phase === 'closing') return;
    const ctx = this.ctx;
    this.phase = 'closing';
    this.menu.hidden = true;
    this._fade(true, () => {
      this._hideProps();
      for (const o of this.hidden ?? []) o.visible = true;
      this.hidden = null;
      if (this.prevClip) ctx.npcs.setLoop(this.barista, this.prevClip, 1, 0.3);
      this.prevClip = null;
      ctx.camera.fov = this.saved.fov; ctx.camera.updateProjectionMatrix();
      ctx.player.update(0);
      ctx.ui.showHUD(true);
      this.active = false;
      this.phase = null;
      this._fade(false);
      if (take && this.api.state === 'full') this.api.take(ctx);
      ctx.requestLock?.();                                    // chiamato dal clic (o dal tasto): il browser lo permette
    });
  }

  // tasti: 1-9 scelgono, Esc esce (non durante la versata)
  key(e) {
    if (!this.active) return false;
    if (e.code === 'Escape') { if (this.phase === 'menu') this.close(); return true; }
    if (this.phase === 'served' && (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space' || e.key === '1')) { this.take(); return true; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) this.choose(n - 1);
    return true;
  }

  // ------------------------------------------------------------------ versata

  _startPour(dr) {
    const ctx = this.ctx;
    this.phase = 'pour';
    this.dr = dr;
    this.t = 0;
    this.bottle = this.bottles[dr.id];
    this.api.setDrink(dr.color, dr.opacity, dr.fill);
    this.api.setFill(0);
    this.stream.material.color.setHex(dr.color);
    this.stream.material.opacity = Math.min(0.9, dr.opacity + 0.1);
    if (this.prevClip) { ctx.npcs.setLoop(this.barista, this.prevClip, 1, 0.3); this.prevClip = null; }
    ctx.ui.subtitle(this.barista.userData.displayName, dr.line, 3.5);
    // bicchiere: bordo e centro
    const g = this.api.glass;
    g.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(g);
    this.glassTop = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    this.glassBase = box.min.y;
    const bp = this.barista.getWorldPosition(new THREE.Vector3());
    this.toBarista = bp.sub(this.glassTop).setY(0).normalize();
    const c = this.cfg.pour;
    this.T = { reach: c.reach, tilt: c.reach + c.tilt, pour: c.reach + c.tilt + dr.pour, untilt: c.reach + c.tilt + dr.pour + c.untilt,
      back: c.reach + c.tilt + dr.pour + c.untilt + c.back };
  }

  _hideProps() {
    for (const b of Object.values(this.bottles)) if (b) b.visible = false;
    this.stream.visible = false;
  }

  _pourUpdate(dt) {
    const T = this.T, c = this.cfg.pour;
    this.t += dt;
    const t = this.t;
    const s = (x) => x * x * (3 - 2 * x);
    const k = (a, b) => s(THREE.MathUtils.clamp((t - a) / (b - a), 0, 1));
    // peso dell'IK (0 = animazione) e inclinazione della bottiglia
    const w = t < T.untilt ? k(0, T.reach) : 1 - k(T.untilt, T.back);
    const tilt = THREE.MathUtils.degToRad(t < T.pour ? c.tiltStart + (c.tiltPour - c.tiltStart) * k(T.reach, T.tilt)
      : c.tiltPour - (c.tiltPour - c.tiltStart) * k(T.pour, T.untilt));
    const B = this.bottle;
    const hand = this.arm.hand;
    if (B && hand) {
      B.visible = w > 0.02;
      const h = B.userData.h;
      const axis = new THREE.Vector3().copy(UP).multiplyScalar(Math.cos(tilt)).addScaledVector(this.toBarista, -Math.sin(tilt)).normalize();
      // il collo parte alto, di lato al bicchiere (bottiglia dritta sopra il bancone), e scende sul bicchiere mentre si
      // inclina; la mano stringe la bottiglia al 40% dell'altezza
      const kt = THREE.MathUtils.clamp((tilt - THREE.MathUtils.degToRad(c.tiltStart)) / THREE.MathUtils.degToRad(c.tiltPour - c.tiltStart), 0, 1);
      const neckUp = this.glassTop.clone().addScaledVector(UP, h * Math.cos(tilt) + c.baseAbove).addScaledVector(this.toBarista, c.sideOffset);
      const neckPour = this.glassTop.clone().addScaledVector(UP, c.neckAbove).addScaledVector(this.toBarista, c.neckBack);
      const neck = neckUp.lerp(neckPour, s(kt));
      const grip = neck.clone().addScaledVector(axis, -h * 0.6);           // presa: sull'asse della bottiglia
      // il polso sta dalla parte di Nicola, a una mano più il raggio della bottiglia: le dita toccano il vetro
      const off = c.palm + B.userData.r;
      const wrist = grip.clone().addScaledVector(this.toBarista, off);
      this.arm.begin();
      const cur = hand.getWorldPosition(new THREE.Vector3());
      const target = cur.lerp(wrist, w);
      if (this.arm.ok && w > 0.001) {
        // gomito in fuori, sul fianco destro di Nicola (non all'indietro verso lo scaffale)
        const right = new THREE.Vector3(-1, 0, 0).applyQuaternion(this.barista.getWorldQuaternion(_q));
        const pole = new THREE.Vector3(0, -1, 0).addScaledVector(right, 0.8);
        this.arm.solve(target, pole);
        hand.getWorldPosition(_b);
        aimBone(hand, _c.copy(_b).addScaledVector(this.toBarista, -1), new THREE.Vector3(0, 1, 0));
      }
      this.arm.end();
      // bottiglia: davanti alle dita (la sua base a 0.4 h sotto la presa)
      hand.getWorldPosition(_b).addScaledVector(this.toBarista, -off);
      B.quaternion.setFromUnitVectors(UP, axis);
      B.position.copy(_b).addScaledVector(axis, -h * 0.4);
      B.updateMatrixWorld(true);
    }
    // liquido e getto
    const f = THREE.MathUtils.clamp((t - T.tilt) / (T.pour - T.tilt), 0, 1);
    this.api.setFill(this.dr.fill * f);
    const flowing = t > T.tilt && t < T.pour + 0.1 && B;
    this.stream.visible = !!flowing;
    if (flowing) {
      const axis = new THREE.Vector3().copy(UP).multiplyScalar(Math.cos(tilt)).addScaledVector(this.toBarista, -Math.sin(tilt)).normalize();
      const neck = B.position.clone().addScaledVector(axis, B.userData.h);
      const surf = this.glassTop.clone();
      surf.y = this.glassBase + 0.012 + this.api.liquidH * this.dr.fill * f;
      this.stream.position.copy(neck);
      this.stream.scale.set(1, Math.max(0.01, neck.distanceTo(surf)), 1);
      this.stream.quaternion.setFromUnitVectors(UP, surf.sub(neck).normalize().negate());
    }
    if (t >= T.back) {
      this._hideProps();
      this.arm.release();
      this.api.state = 'full';
      this.api.setFill(this.dr.fill);
      this._served();
    }
  }

  // ------------------------------------------------------------------ ciclo

  // chi arriva al bancone mentre si ordina non deve finire addosso alla camera (ricompare all'uscita)
  _hideNear() {
    const cam = this.ctx.camera.position;
    for (const o of this.ctx.npcs.npcs) {
      if (o === this.barista || !o.visible) continue;
      if (o.getWorldPosition(_a).setY(cam.y).distanceTo(cam) < this.cfg.hideNear) { o.visible = false; this.hidden.push(o); }
    }
  }

  update(dt) {
    if (!this.enabled) return;
    if (this.active && this.hidden) this._hideNear();
    if (this.active && this.phase === 'pour') this._pourUpdate(dt);
    this._sip(dt);
  }

  // Nicola beve un sorso ogni tanto (clip Drink), con il bicchierino in mano
  _sip(dt) {
    const n = this.barista, a = n.userData.anim, clip = n.userData.drink_clip;
    if (!a || !clip) return;
    const sipping = a.once && a.once.getClip().name === clip;
    this.cup.visible = !!sipping;
    if (sipping && this.arm.hand) {
      this.arm.hand.getWorldPosition(this.cup.position);
      this.cup.position.y += 0.03;
      return;
    }
    if (this.active) return;
    this.sipIn -= dt;
    if (this.sipIn <= 0) {
      this.sipIn = this._sipDelay();
      this.ctx.npcs.playOnce(n, clip, 0.4);
    }
  }
}

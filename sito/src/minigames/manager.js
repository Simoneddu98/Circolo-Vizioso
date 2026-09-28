// Macchina a stati comune dei minigiochi:
//   ESPLORAZIONE -> INGRESSO (dissolvenza + camera, 0.8 s) -> GIOCO -> RISULTATO -> USCITA -> ESPLORAZIONE
// Ogni gioco si registra con registerMinigame(id, def); gli oggetti del glb con interactable = "minigame" e
// minigame_id = id lo avviano con E. Il manager gestisce pointer lock, input, Esc (con conferma), H per le regole,
// spostamento dell'avversario, statistiche e ritorno del giocatore dove si trovava.
//
// def = {
//   camera: 'CAM_Darts_Throw',          marcatore della vista iniziale
//   opponentSpot: 'DARTS_OpponentSpot', dove si sposta l'avversario (npc_name nel marcatore); null se non si muove
//   extraSpots: ['SCOPA_Spectator_1'],  altri personaggi da spostare (per esempio chi occupava la sedia)
//   seated: ['Peppino'],                 chi deve essere seduto al suo posto (se era in giro, torna subito a sedersi)
//   pointerLock: true,                  false = cursore libero (scopa)
//   modes: [{ id, label }],             opzionale: pulsanti nella schermata iniziale
//   create(host) -> { start(mode), update(dt), input(type, e), inProgress(), dispose() }
// }
import * as THREE from 'three';
import { markerCamera, loadStats, saveStats, pick } from './util.js';
import { euro } from '../wallet.js';

const DEFS = new Map();
export function registerMinigame(id, def) { DEFS.set(id, def); }

const FADE = 0.4;                       // metà della transizione di 0.8 s

export class MinigameManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.cfg = ctx.config.minigames;
    this.state = 'explore';             // explore | entering | intro | playing | result | exiting
    this.game = null;                   // { id, def, inst, mode, saved, moved: [] }
    this.helpOpen = false;
    this.confirmOpen = false;
    this.stats = loadStats();
    this._buildUI();
    ctx.interactions.register('minigame', {
      range: this.cfg.range,
      label: (t) => {
        const c = this.cfg.games[t.object.userData.minigame_id];
        return c && DEFS.has(t.object.userData.minigame_id) ? `${this.cfg.playLabel} ${c.name}` : null;
      },
      action: (t) => this.start(t.object.userData.minigame_id, t.object),
    });
  }

  get active() { return this.state !== 'explore'; }
  get capturing() { return this.active; }
  get paused() { return this.helpOpen || this.confirmOpen; }

  // ------------------------------------------------------------------ interfaccia

  _buildUI() {
    const css = document.createElement('style');
    css.textContent = `
      #mg { position: fixed; inset: 0; z-index: 15; pointer-events: none; font-family: var(--body, sans-serif); color: #f1e6d2; }
      #mg .fade { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity ${FADE}s ease; }
      #mg .fade.on { opacity: 1; }
      #mg .panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(620px, calc(100% - 32px));
        max-height: calc(100% - 40px); overflow-y: auto; background: rgba(28, 18, 11, 0.94); border: 1px solid rgba(230, 190, 120, 0.35);
        border-radius: 8px; padding: 26px 28px; pointer-events: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
      #mg h2 { margin: 0 0 6px; font-family: var(--display, sans-serif); font-size: 32px; letter-spacing: 0.02em; color: #e6be78; text-transform: uppercase; }
      #mg .sub { margin: 0 0 16px; font-size: 17px; opacity: 0.85; }
      #mg ul { margin: 0 0 16px; padding-left: 20px; font-size: 16px; line-height: 1.5; }
      #mg table { border-collapse: collapse; margin: 0 0 18px; font-size: 15px; }
      #mg td { padding: 4px 12px 4px 0; vertical-align: top; }
      #mg td:first-child { font-family: var(--display, sans-serif); color: #e6be78; white-space: nowrap; }
      #mg .btns { display: flex; flex-wrap: wrap; gap: 10px; }
      #mg button { font: 600 17px var(--display, sans-serif); letter-spacing: 0.03em; padding: 10px 18px; border-radius: 5px; cursor: pointer;
        border: 1px solid #e6be78; background: #e6be78; color: #2a1a0e; }
      #mg button.alt { background: transparent; color: #f1e6d2; border-color: rgba(241,230,210,0.5); }
      #mg button:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
      #mg .hud { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;
        font: 600 18px var(--display, sans-serif); letter-spacing: 0.03em; }
      #mg .hud .box { background: rgba(28, 18, 11, 0.82); border: 1px solid rgba(230,190,120,0.3); border-radius: 6px; padding: 6px 14px; }
      #mg .hud .me { color: #ffb4a0; } #mg .hud .opp { color: #a8c8ff; } #mg .hud .turn { color: #e6be78; }
      #mg .msg { position: absolute; top: 34%; left: 50%; transform: translate(-50%, -50%); font: 700 44px var(--display, sans-serif);
        color: #ffd35a; text-shadow: 0 3px 12px rgba(0,0,0,0.8); letter-spacing: 0.04em; text-align: center; transition: opacity 0.25s; }
      #mg .hint { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); font-size: 15px; background: rgba(28,18,11,0.75);
        padding: 6px 14px; border-radius: 5px; white-space: nowrap; }
      #mg .power { position: absolute; right: 36px; bottom: 90px; width: 22px; height: 220px; background: rgba(28,18,11,0.85);
        border: 1px solid rgba(230,190,120,0.5); border-radius: 4px; overflow: hidden; }
      #mg .power .zone { position: absolute; left: 0; right: 0; background: rgba(90, 200, 110, 0.35); }
      #mg .power .fill { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(#ffd35a, #e0782a); }
      #mg .cursor { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border: 2px solid #fff; border-radius: 50%;
        box-shadow: 0 0 0 1px #000, inset 0 0 0 1px #000; }
      #mg .cursor::after { content: ''; position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; background: #ff3b30; border-radius: 50%; }
      #mg .float { position: absolute; font: 700 26px var(--display, sans-serif); color: #fff; text-shadow: 0 2px 6px #000; transform: translate(-50%, -100%);
        transition: transform 1s ease, opacity 1s ease; }
      #mg .score-table td { padding: 3px 14px 3px 0; }
      #mg .score-table th { text-align: left; font: 600 15px var(--display, sans-serif); color: #e6be78; padding: 3px 14px 6px 0; }
      #mg .layer { position: absolute; inset: 0; }
      #mg .mg-logo { display: block; width: 100%; max-width: 540px; height: auto; margin: -6px auto 4px; }
      #mg .mg-dedica { margin: 0 0 14px; text-align: center; font: 600 16px var(--display, sans-serif); letter-spacing: .12em; text-transform: uppercase;
        color: #ffe100; }
      @media (max-height: 520px), (max-width: 700px) { #mg .mg-logo { max-width: 300px; } #mg .mg-dedica { font-size: 12px; margin-bottom: 8px; } }
      #mg .layer > * { pointer-events: auto; }
    `;
    document.head.appendChild(css);
    const root = document.createElement('div');
    root.id = 'mg';
    root.innerHTML = `<div class="layer" data-k="layer"></div><div class="hud" data-k="hud"></div><div class="msg" data-k="msg"></div>
      <div class="hint" data-k="hint" hidden></div><div class="power" data-k="power" hidden><div class="zone"></div><div class="fill"></div></div>
      <div class="panel" data-k="panel" hidden></div><div class="fade" data-k="fade"></div>`;
    document.body.appendChild(root);
    this.el = { root };
    root.querySelectorAll('[data-k]').forEach((n) => { this.el[n.dataset.k] = n; });
  }

  _panel(html, buttons) {
    const p = this.el.panel;
    p.innerHTML = html + `<div class="btns">${buttons.map((b, i) => `<button data-i="${i}" class="${b.alt ? 'alt' : ''}">${b.label}</button>`).join('')}</div>`;
    p.hidden = false;
    p.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); buttons[+b.dataset.i].action(); }));
    p.querySelector('button')?.focus();
  }
  _hidePanel() { this.el.panel.hidden = true; this.el.panel.innerHTML = ''; }

  _rulesHTML(id) {
    const c = this.cfg.games[id];
    const controls = (this.ctx.touch && c.touch?.controls) || c.controls;       // su telefono: i comandi touch
    const head = DEFS.get(id)?.introHTML?.(c) ?? `<h2>${c.title}</h2>`;           // un gioco può mettere il suo logo al posto del titolo
    return `${head}<p class="sub">${c.intro}</p><ul>${c.rules.map((r) => `<li>${r}</li>`).join('')}</ul>
      <table>${controls.map(([k, d]) => `<tr><td>${k}</td><td>${d}</td></tr>`).join('')}</table>`;
  }

  // ------------------------------------------------------------------ ciclo di vita

  // opts.opponent: sfida lanciata da un personaggio (es. Cronico) che prende il posto dell'avversario abituale
  start(id, target = null, opts = {}) {
    const def = DEFS.get(id);
    const ctx = this.ctx;
    if (!def || this.active) return;
    if (ctx.hands.active) { ctx.ui.toast(this.cfg.handsBusy); return; }
    this.state = 'entering';
    ctx.player.clearInput();
    ctx.interactions.setModal(null);
    const saved = { pos: ctx.player.position.clone(), yaw: ctx.player.yaw, pitch: ctx.player.pitch,
      fov: ctx.camera.fov, seat: ctx.player.seat };
    const base = this.cfg.games[id];
    const who = opts.opponent && opts.opponent !== base.opponent ? opts.opponent : null;
    const cfg = who ? { ...base, opponent: who, lines: this.cfg.opponents?.[who]?.lines ?? base.lines } : base;
    this.game = { id, def, inst: null, mode: null, saved, moved: [], hidden: [], target, opts, cfg };
    this._fade(true, () => {
      ctx.ui.showHUD(false);                     // obiettivi e mirino dell'esplorazione non servono in partita
      // spostamenti al buio: avversario, spettatori, carte decorative
      for (const name of def.seated ?? []) ctx.routines?.find((r) => r.npc.userData.npc_name === name)?.sitNow();
      if (def.opponentSpot) this._moveNpc(def.opponentSpot, who);
      for (const s of def.extraSpots ?? []) this._moveNpc(s);
      ctx.root.traverse((o) => { if (o.userData.hide_during === id && o.visible) { o.visible = false; this.game.hidden.push(o); } });
      try {
        this.game.inst = def.create(this._host());
        this.setCamera(typeof def.camera === 'function' ? def.camera(target) : def.camera);
        this._showIntro();
      } catch (err) {
        console.error(err);
        this.state = 'result';                     // non riesce a partire: si torna subito all'esplorazione
        this.exit();
        return;
      }
      this._fade(false);
    });
  }

  _showIntro() {
    const { id, def } = this.game;
    this.state = 'intro';
    this._setCursorFree(true);
    const modes = def.modes ?? [{ id: 'default', label: this.cfg.startLabel }];
    const st = this._statsLine(id);
    const price = this.game.cfg.price;
    const priceTag = price ? ` · ${euro(price)}` : '';
    const priceLine = price ? `<p class="sub">${this.cfg.priceLine.replace('{price}', euro(price))}</p>` : '';
    this._panel(this._rulesHTML(id) + priceLine + (st ? `<p class="sub">${st}</p>` : ''), [
      ...modes.map((m) => ({ label: m.label.replace('{opponent}', this.game.cfg.opponent ?? '') + priceTag, action: () => this._begin(m.id) })),
      { label: this.cfg.exitLabel, alt: true, action: () => this.exit() },
    ]);
  }

  _begin(mode) {
    const price = this.game.cfg.price;                   // gettone o partita: si paga a ogni inizio (anche la rivincita)
    if (price && !this.ctx.wallet?.pay(price, false)) { this.message(this.cfg.notEnough, 2); return; }
    this._hidePanel();
    this.game.mode = mode;
    this.state = 'playing';
    this.game.inst.start(mode);
    this._setCursorFree(this.game.def.pointerLock === false);
  }

  finish(result) {
    if (this.state !== 'playing') return;
    const { id } = this.game;
    this.state = 'result';
    const s = this.stats[id] ?? (this.stats[id] = { played: 0, won: 0 });
    s.played++;
    if (result.win) s.won++;
    const better = (a, b) => (this.game.def.recordHigher ? a > b : a < b);         // freccette: meno è meglio; slot: più è meglio
    if (result.record != null && (s.record == null || better(result.record, s.record))) { s.record = result.record; result.newRecord = true; }
    saveStats(this.stats);
    this.ctx.ui.completeGoal('games');
    this.power(null); this.hint(null);
    this._setCursorFree(true);
    setTimeout(() => {
      if (this.state !== 'result') return;
      this._panel(`<h2>${result.title}</h2>${result.html ?? ''}${result.newRecord ? `<p class="sub">${this.cfg.newRecord}</p>` : ''}
        <p class="sub">${this._statsLine(id)}</p>`, [
        { label: this.cfg.rematchLabel + (this.game.cfg.price ? ` · ${euro(this.game.cfg.price)}` : ''),
          action: () => this._begin(this.game.mode) },
        { label: this.cfg.exitLabel, alt: true, action: () => this.exit() },
      ]);
    }, result.delay ?? 900);
  }

  exit() {
    if (!this.game || this.state === 'exiting' || this.state === 'entering') return;
    const ctx = this.ctx;
    this.state = 'exiting';
    this.helpOpen = this.confirmOpen = false;
    this._hidePanel();
    this._fade(true, () => {
      const g = this.game;
      g.inst?.dispose();
      ctx.hands.hideNow();
      for (const m of g.moved.reverse()) this._restoreNpc(m);
      for (const o of g.hidden) o.visible = true;
      this.el.hud.innerHTML = ''; this.el.layer.innerHTML = ''; this.message(null); this.power(null); this.hint(null);
      const p = ctx.player;
      p.position.copy(g.saved.pos); p.velocity.set(0, 0, 0);
      p.yaw = g.saved.yaw; p.pitch = g.saved.pitch;
      ctx.camera.fov = g.saved.fov; ctx.camera.updateProjectionMatrix();
      ctx.camera.up.set(0, 1, 0);
      p.update(0);
      this.game = null;
      this.state = 'explore';
      ctx.ui.showHUD(true);
      ctx.ui.subtitle(null);
      this._fade(false);
      ctx.requestLock?.();
      ctx.wallet?.checkBroke();
    });
  }

  // ------------------------------------------------------------------ input (instradato da main.js)

  input(type, e) {
    if (!this.active) return false;
    if (type === 'keydown') {
      if (e.code === 'Escape') { this.escape(); return true; }
      if (e.code === 'KeyH' && (this.state === 'playing' || this.helpOpen)) { this._toggleHelp(); return true; }
    }
    if (this.state !== 'playing' || this.paused) return true;
    this.game.inst.input?.(type, e);
    return true;
  }

  // Esc o perdita del pointer lock durante la partita
  escape() {
    if (this.state === 'intro' || this.state === 'result') { this.exit(); return; }
    if (this.state !== 'playing') return;
    if (this.helpOpen) { this._toggleHelp(); return; }
    if (this.confirmOpen) { this._closeConfirm(); return; }
    if (!this.game.inst.inProgress?.()) { this.exit(); return; }
    this.confirmOpen = true;
    this._setCursorFree(true);
    this._panel(`<h2>${this.cfg.confirmTitle}</h2><p class="sub">${this.cfg.confirmText}</p>`, [
      { label: this.cfg.continueLabel, action: () => this._closeConfirm() },
      { label: this.cfg.exitLabel, alt: true, action: () => this.exit() },
    ]);
  }

  onPointerLockLost() {
    if (this.state === 'playing' && this.game.def.pointerLock !== false && !this.paused && !this._freeing) this.escape();
  }

  _closeConfirm() {
    this.confirmOpen = false;
    this._hidePanel();
    this._setCursorFree(this.game.def.pointerLock === false);
  }

  _toggleHelp() {
    this.helpOpen = !this.helpOpen;
    if (this.helpOpen) {
      this._setCursorFree(true);
      this._panel(this._rulesHTML(this.game.id), [{ label: this.cfg.continueLabel, action: () => this._toggleHelp() }]);
    } else {
      this._hidePanel();
      this._setCursorFree(this.game.def.pointerLock === false);
    }
  }

  _setCursorFree(free) {
    const canvas = this.ctx.renderer.domElement;
    if (free) {
      if (document.pointerLockElement === canvas) {
        this._freeing = true;
        document.exitPointerLock();
        setTimeout(() => { this._freeing = false; }, 300);
      }
    } else if (document.pointerLockElement !== canvas) {
      this.ctx.requestLock?.();
    }
  }

  update(dt) {
    if (!this.game?.inst) return;
    if (this.state === 'playing' && !this.paused) this.game.inst.update(dt);
    else this.game.inst.idle?.(dt);
  }

  // ------------------------------------------------------------------ servizi per i giochi

  _host() {
    const ctx = this.ctx;
    const mgr = this;
    return {
      THREE, scene: ctx.scene, root: ctx.root, camera: ctx.camera, renderer: ctx.renderer, config: ctx.config, hands: ctx.hands,
      wallet: ctx.wallet, tv: ctx.tv,
      stopFilming: (npc) => ctx.camerawork?.stop(npc),
      setClip: (npc, name) => ctx.npcs.setLoop(npc, name, 1, 0.3),
      cfg: this.game.cfg,
      marker: (name) => ctx.root.getObjectByName(name),
      setCamera: (m) => mgr.setCamera(m),
      hud: (html) => { mgr.el.hud.innerHTML = html; },
      layer: mgr.el.layer,
      message: (t, d) => mgr.message(t, d),
      hint: (t) => mgr.hint(t),
      power: (v, zone) => mgr.power(v, zone),
      finish: (r) => mgr.finish(r),
      banter: (ev) => mgr.banter(ev),
      say: (name, text) => ctx.ui.subtitle(name, text, 4, { now: true }),
      npc: (name) => ctx.npcs.npcs.find((o) => o.userData.npc_name === name),
      stats: () => mgr.stats[mgr.game.id] ?? {},
      pointerLocked: () => document.pointerLockElement === ctx.renderer.domElement,
      get mode() { return mgr.game.mode; },
      get target() { return mgr.game.target; },
    };
  }

  setCamera(m) {
    const cam = this.ctx.camera;
    const c = typeof m === 'string' ? markerCamera(this.ctx.root.getObjectByName(m)) : m;
    cam.position.copy(c.pos);
    cam.quaternion.copy(c.quat);
    if (c.fov && cam.fov !== c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  message(text, dur = 1.6) {
    clearTimeout(this._msgT);
    const m = this.el.msg;
    if (!text) { m.textContent = ''; return; }
    m.textContent = text;
    m.style.opacity = 1;
    this._msgT = setTimeout(() => { m.style.opacity = 0; }, dur * 1000);
  }

  hint(text) {
    const t = this.game?.cfg.touch;
    if (this.ctx.touch && t?.hint && text === this.game.cfg.hint) text = t.hint;     // su telefono: il suggerimento touch
    this.el.hint.hidden = !text;
    if (text) this.el.hint.textContent = text;
  }

  power(v, zone) {
    const p = this.el.power;
    if (v == null) { p.hidden = true; return; }
    p.hidden = false;
    p.querySelector('.fill').style.height = `${Math.round(Math.min(1, v) * 100)}%`;
    const z = p.querySelector('.zone');
    if (zone) { z.style.display = ''; z.style.bottom = `${zone[0] * 100}%`; z.style.height = `${(zone[1] - zone[0]) * 100}%`; } else z.style.display = 'none';
  }

  banter(ev) {
    const g = this.game?.cfg;
    const lines = g?.lines?.[ev];
    if (!lines?.length) return;
    const now = performance.now();
    if (ev !== 'win' && ev !== 'lose' && now - (this._lastBanter ?? 0) < 5000) return;
    this._lastBanter = now;
    this.ctx.ui.subtitle(g.opponent, pick(lines), 4, { now: true });
  }

  _statsLine(id) {
    const s = this.stats[id];
    if (!s?.played) return '';
    let t = `${this.cfg.statsPlayed} ${s.played} · ${this.cfg.statsWon} ${s.won}`;
    if (s.record != null) t += ` · ${this.cfg.statsRecord} ${s.record}`;
    return t;
  }

  _fade(on, then) {
    this.el.fade.classList.toggle('on', on);
    if (then) setTimeout(then, FADE * 1000);
  }

  // Sposta il personaggio indicato dal marcatore (extra npc_name) in piedi sul marcatore
  _moveNpc(spotName, who = null) {
    const spot = this.ctx.root.getObjectByName(spotName);
    const npc = spot && this.ctx.npcs.npcs.find((o) => o.userData.npc_name === (who ?? spot.userData.npc_name));
    if (!npc) return;
    const saved = { npc, pos: npc.position.clone(), quat: npc.quaternion.clone(), parent: npc.parent, visible: npc.visible };
    npc.visible = true;                              // chi è nascosto in esplorazione compare per il minigioco
    const p = spot.getWorldPosition(new THREE.Vector3());
    const lift = npc.userData.stand_lift ?? npc.position.y;
    npc.parent.worldToLocal(p);
    npc.position.set(p.x, lift, p.z);
    npc.quaternion.copy(spot.getWorldQuaternion(new THREE.Quaternion()));
    if (npc.userData.stand_clip) saved.clip = this.ctx.npcs.setLoop(npc, npc.userData.stand_clip);
    npc.userData.minigameMoved = true;
    npc.updateMatrixWorld(true);
    this.game.moved.push(saved);
  }

  _restoreNpc(m) {
    m.npc.userData.minigameMoved = false;
    m.npc.visible = m.visible;
    m.npc.position.copy(m.pos);
    m.npc.quaternion.copy(m.quat);
    if (m.clip) this.ctx.npcs.setLoop(m.npc, m.clip);
    m.npc.updateMatrixWorld(true);
  }
}

// Controlli per telefono e tablet (schermo touch, nessun mouse). Si attivano da soli su dispositivi touch, oppure con
// ?touch=1 nell'indirizzo per provarli dal computer.
//   Esplorazione: levetta a sinistra (compare dove si appoggia il pollice) per camminare, trascinare a destra per
//   guardarsi intorno, un tocco veloce = l'azione indicata a schermo (parla, ordina, siediti, bevi, fai un tiro).
//   Si possono toccare anche la scritta dell'azione e il suggerimento "Bevi" / "Fai un tiro". Pulsante di pausa.
//   Minigiochi: trascinare = muovere il mouse (mira, aste, bilia) oppure toccare un punto (scopa: le carte); i pulsanti
//   sullo schermo (CONFIG.minigames.games.<id>.touch.buttons) mandano al gioco gli stessi eventi di mouse e tastiera.
export function isTouchDevice() {
  const force = new URLSearchParams(location.search).get('touch');
  if (force === '1') return true;
  if (force === '0') return false;
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
}

// evento finto con i campi che leggono i minigiochi
const ev = (o) => ({ button: 0, movementX: 0, movementY: 0, clientX: 0, clientY: 0, code: '', key: '', deltaY: 0, repeat: false,
  preventDefault() {}, stopPropagation() {}, ...o });

export class TouchControls {
  constructor(ctx, { pause }) {
    this.ctx = ctx;
    this.cfg = ctx.config.touch;
    this.pause = pause;
    this.stick = null;                       // { id, x0, y0 }
    this.look = null;                        // { id, x, y, sx, sy, t0, moved }
    this.drag = null;                        // minigioco: { id, x, y }
    this.gameId = null;
    document.body.classList.add('touch');
    this._ui();
  }

  _ui() {
    const css = document.createElement('style');
    css.textContent = `
      #tc, #tcmg { position: fixed; inset: 0; touch-action: none; -webkit-user-select: none; user-select: none; }
      #tc { z-index: 9; } #tcmg { z-index: 14; }
      #tc .base { position: absolute; width: 124px; height: 124px; margin: -62px 0 0 -62px; border-radius: 50%;
        border: 2px solid rgba(241,230,210,.45); background: rgba(20,12,6,.25); pointer-events: none; }
      #tc .knob { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%;
        background: rgba(241,230,210,.55); }
      #tc .hint { position: absolute; left: 22px; bottom: 22px; width: 96px; height: 96px; border-radius: 50%; border: 2px dashed rgba(241,230,210,.3);
        pointer-events: none; display: grid; place-items: center; color: rgba(241,230,210,.55); font: 600 12px var(--display, sans-serif);
        text-transform: uppercase; letter-spacing: .08em; text-align: center; }
      #tcpause { position: fixed; z-index: 12; left: 12px; top: 50%; transform: translateY(-50%); width: 46px; height: 46px; border-radius: 50%;
        border: 1px solid rgba(217,170,69,.5); background: rgba(30,18,10,.75); color: #f1e6d2; font: 700 18px var(--display, sans-serif); }
      #tcbtn { position: fixed; z-index: 16; inset: 0; pointer-events: none; }
      #tcbtn.paused .col { display: none; }
      #tcbtn .col { position: absolute; right: 14px; bottom: 14px; display: flex; flex-direction: row-reverse; gap: 10px; align-items: flex-end; }
      #tcbtn .side { display: flex; flex-direction: column-reverse; gap: 8px; align-items: flex-end; }
      #tcbtn .top { position: absolute; left: 12px; top: 12px; display: flex; gap: 8px; }
      #tcbtn button { pointer-events: auto; touch-action: none; -webkit-user-select: none; user-select: none; min-width: 64px; min-height: 52px;
        padding: 8px 16px; border-radius: 28px; border: 1px solid #e6be78; background: rgba(28,18,11,.82); color: #f1e6d2;
        font: 600 16px var(--display, sans-serif); text-transform: uppercase; letter-spacing: .04em; }
      #tcbtn button.main { min-width: 96px; min-height: 96px; border-radius: 50%; background: rgba(230,190,120,.9); color: #2a1a0e; font-size: 18px; }
      #tcbtn button.on { background: #ffd35a; color: #2a1a0e; }
      #tcbtn .top button { min-height: 40px; min-width: 0; padding: 6px 12px; font-size: 13px; }
      body.touch #prompt, body.touch #held-hint { pointer-events: auto; cursor: pointer; }`;
    document.head.appendChild(css);
    this.el = document.createElement('div');
    this.el.id = 'tc';
    this.el.hidden = true;
    this.el.innerHTML = `<div class="hint">${this.cfg.stickHint}</div><div class="base" hidden><div class="knob"></div></div>`;
    this.base = this.el.querySelector('.base');
    this.knob = this.el.querySelector('.knob');
    this.hintEl = this.el.querySelector('.hint');
    this.mg = document.createElement('div');
    this.mg.id = 'tcmg';
    this.mg.hidden = true;
    this.btns = document.createElement('div');
    this.btns.id = 'tcbtn';
    this.btns.hidden = true;
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.id = 'tcpause';
    this.pauseBtn.textContent = 'II';
    this.pauseBtn.setAttribute('aria-label', 'Pausa');
    this.pauseBtn.hidden = true;
    document.body.append(this.el, this.mg, this.btns, this.pauseBtn);
    this.pauseBtn.addEventListener('click', () => this.pause());

    const on = (el, fn) => {
      for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) el.addEventListener(t, (e) => { e.preventDefault(); fn(t, e); });
    };
    on(this.el, (t, e) => this._explore(t, e));
    on(this.mg, (t, e) => this._mgDrag(t, e));
    // la scritta dell'azione e il suggerimento di ciò che si ha in mano si possono toccare
    const ui = this.ctx.ui.el;
    ui.prompt.addEventListener('pointerdown', (e) => { e.preventDefault(); this.ctx.interactions.interact(); });
    ui.held.addEventListener('pointerdown', (e) => { e.preventDefault(); this.ctx.interactions.primary(); });
  }

  // ---------------------------------------------------------------- esplorazione
  _explore(type, e) {
    const p = this.ctx.player;
    if (type === 'pointerdown') {
      if (!this.stick && e.clientX < innerWidth * this.cfg.stickArea) {
        this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
        this.base.hidden = false;
        this.base.style.left = `${e.clientX}px`; this.base.style.top = `${e.clientY}px`;
        this.knob.style.transform = '';
        this.hintEl.hidden = true;
      } else if (!this.look) {
        this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now() };
      }
      return;
    }
    if (this.stick?.id === e.pointerId) {
      if (type === 'pointermove') {
        const R = this.cfg.stickRadius;
        let dx = e.clientX - this.stick.x0, dy = e.clientY - this.stick.y0;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        p.analog = { x: dx / R, y: -dy / R };
      } else {
        this.stick = null;
        p.analog = null;
        this.base.hidden = true;
      }
      return;
    }
    if (this.look?.id === e.pointerId) {
      if (type === 'pointermove') {
        const dx = e.clientX - this.look.x, dy = e.clientY - this.look.y;
        this.look.x = e.clientX; this.look.y = e.clientY;
        p.look(dx * this.cfg.lookSpeed, dy * this.cfg.lookSpeed);
      } else {
        const moved = Math.hypot(e.clientX - this.look.sx, e.clientY - this.look.sy);
        const quick = performance.now() - this.look.t0 < this.cfg.tapTime;
        this.look = null;
        if (type === 'pointerup' && moved < this.cfg.tapMove && quick) this._tap();
      }
    }
  }

  // tocco veloce: l'azione indicata (scritta "E — ..."), altrimenti bere / fare un tiro con ciò che si ha in mano
  _tap() {
    const ui = this.ctx.ui.el;
    if (!ui.prompt.hidden) this.ctx.interactions.interact();
    else if (!ui.held.hidden) this.ctx.interactions.primary();
  }

  // ---------------------------------------------------------------- minigiochi
  _send(type, o) { this.ctx.minigames?.input(type, ev(o)); }

  _mgDrag(type, e) {
    const g = this.ctx.minigames?.game;
    if (!g) return;
    const free = g.def.pointerLock === false;                     // scopa: si tocca il punto (le carte)
    if (type === 'pointerdown') {
      if (this.drag) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      if (free) {
        this._send('mousemove', { clientX: e.clientX, clientY: e.clientY });
        this._send('mousedown', { button: 0, clientX: e.clientX, clientY: e.clientY });
      }
      return;
    }
    if (this.drag?.id !== e.pointerId) return;
    if (type === 'pointermove') {
      const k = g.cfg.touch?.drag ?? this.cfg.dragSpeed;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      this._send('mousemove', { movementX: dx * k, movementY: dy * k, clientX: e.clientX, clientY: e.clientY });
    } else {
      if (free) this._send('mouseup', { button: 0, clientX: e.clientX, clientY: e.clientY });
      this.drag = null;
    }
  }

  _buildButtons(id) {
    const c = this.ctx.config.minigames;
    const t = c.games[id]?.touch ?? {};
    this.btns.innerHTML = '<div class="top"></div><div class="col"></div>';
    const top = this.btns.querySelector('.top'), col = this.btns.querySelector('.col');
    const add = (parent, b) => {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.main) el.className = 'main';
      const down = () => {
        el.classList.add('on');
        if (b.mouse != null) this._send('mousedown', { button: b.mouse });
        if (b.key) { this._send('keydown', { code: b.key, key: b.keyName ?? '' }); }
        if (b.wheel) this._send('wheel', { deltaY: b.wheel });
      };
      const up = () => {
        if (!el.classList.contains('on')) return;
        el.classList.remove('on');
        if (b.mouse != null) this._send('mouseup', { button: b.mouse });
        if (b.key) this._send('keyup', { code: b.key, key: b.keyName ?? '' });
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch { /* il dito resta sul pulsante anche se esce dal bordo */ }
        down();
      });
      for (const x of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(x, (e) => { e.preventDefault(); up(); });
      parent.append(el);
    };
    // il pulsante principale grande in basso a destra, gli altri in colonna alla sua sinistra
    for (const b of (t.buttons ?? []).filter((x) => x.main)) add(col, b);
    const side = document.createElement('div');
    side.className = 'side';
    col.append(side);
    for (const b of (t.buttons ?? []).filter((x) => !x.main)) add(side, b);
    add(top, { label: this.cfg.rulesLabel, key: 'KeyH' });
    add(top, { label: this.cfg.exitLabel, key: 'Escape' });
  }

  // ---------------------------------------------------------------- ogni fotogramma
  update(state) {
    const ctx = this.ctx, mg = ctx.minigames;
    const playing = state === 'playing';
    const inGame = playing && mg?.active;
    const busy = ctx.dialogue?.active || ctx.bar?.active || !!document.getElementById('broke');
    const explore = playing && !inGame && !busy;
    this.el.hidden = !explore;
    this.pauseBtn.hidden = !explore;
    if (!explore && this.stick) { this.stick = null; ctx.player.analog = null; this.base.hidden = true; }
    if (!explore) this.look = null;
    const mgPlay = inGame && mg.state === 'playing' && !mg.paused;
    this.mg.hidden = !mgPlay;
    this.btns.hidden = !(inGame && mg.state === 'playing');
    this.btns.classList.toggle('paused', !!mg?.paused);
    const id = inGame ? mg.game?.id : null;
    if (id !== this.gameId) { this.gameId = id; if (id) this._buildButtons(id); else this.btns.innerHTML = ''; }
    if (!mgPlay) this.drag = null;
  }
}

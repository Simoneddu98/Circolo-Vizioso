// Interfaccia: schermata iniziale, caricamento, HUD, pausa, sottotitoli, debug.

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(config) {
    this.cfg = config;
    this.el = {
      start: $('start'), progress: $('load-fill'), loadLabel: $('load-label'), enter: $('enter'),
      enterFree: $('enter-free'), enterStory: $('enter-story'), touch: $('touch-msg'), controls: $('controls'), hud: $('hud'), prompt: $('prompt'), promptText: $('prompt-text'),
      goals: $('goals'), inventory: $('inventory'), invList: $('inv-list'), subtitle: $('subtitle'),
      subName: $('sub-name'), subText: $('sub-text'), toast: $('toast'), held: $('held-hint'),
      pause: $('pause'), resume: $('resume'), restart: $('restart'), sens: $('sens'), sensVal: $('sens-val'),
      bob: $('bob'), debug: $('debug'), lockHint: $('lock-hint'), error: $('load-error'),
    };
    document.title = config.ui.title;               // il titolo a schermo è il logo in index.html
    $('subtitle-intro').textContent = config.ui.subtitle;
    $('credits').textContent = config.ui.credits;
    // due modi di entrare: la serata (storia a brani) o il circolo libero, tutto sbloccato
    const S = config.serata?.ui;
    if (S && this.el.enterFree) {
      $('mode-q').textContent = S.scegli;
      this.el.enter.innerHTML = `${S.storia}<small>${S.storiaSub}</small>`;
      this.el.enterFree.innerHTML = `${S.libero}<small>${S.liberoSub}</small>`;
      const T = config.storia?.ui;
      if (T && this.el.enterStory) this.el.enterStory.innerHTML = `${T.label}<small>${T.sub}</small>`;
      else this.el.enterStory?.remove();
    } else this.el.enter.textContent = config.ui.enterLabel;
    this.el.touch.textContent = config.ui.touchMessage;
    this.el.lockHint.textContent = config.ui.pointerLockHint;
    this.items = [];
    this.done = new Set();
    this._subTimer = 0;
    this._toastTimer = 0;
    this.renderGoals();
  }

  isTouchOnly() {
    return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  }

  // Telefono: legenda dei comandi touch al posto di quella per tastiera, e invito a girare il telefono in orizzontale
  showTouchLegend(legend, rotate, note = null) {
    const c = this.el.controls;
    const h = c.querySelector('h2');
    c.innerHTML = '';
    c.append(h);
    for (const [k, d] of legend) {
      const row = document.createElement('div');
      row.className = 'ctl';
      row.innerHTML = '<span class="keys"><span class="key"></span></span>';
      row.querySelector('.key').textContent = k;
      row.append(d);
      c.append(row);
    }
    if (note) {                                   // iPhone: a tutto schermo solo dalla schermata Home
      const n = document.createElement('p');
      n.className = 'ios-note';
      n.textContent = note;
      c.after(n);
    }
    const r = document.createElement('div');
    r.id = 'rotate';
    r.innerHTML = '<div class="phone"></div><p></p><button class="secondary"></button>';
    r.querySelector('p').textContent = rotate.text;
    r.querySelector('button').textContent = rotate.ok;
    r.querySelector('button').addEventListener('click', () => document.body.classList.add('rotate-ok'));
    document.body.append(r);
  }

  setProgress(p) {
    const pct = Math.round(p * 100);
    this.el.progress.style.width = pct + '%';
    this.el.loadLabel.textContent = pct < 100 ? `Caricamento del circolo… ${pct}%` : 'Pronto';
  }

  ready() {
    this.setProgress(1);
    this.el.enter.disabled = false;
    if (this.el.enterFree) this.el.enterFree.disabled = false;
    if (this.el.enterStory) this.el.enterStory.disabled = false;
  }

  loadError(msg) {
    this.el.error.hidden = false;
    this.el.error.textContent = msg;
  }

  showStart(v) { this.el.start.hidden = !v; }
  showHUD(v) { this.el.hud.hidden = !v; }
  showPause(v) { this.el.pause.hidden = !v; }
  showLockHint(v) { this.el.lockHint.hidden = !v; }
  setLockHint(text) { this.el.lockHint.textContent = text; }

  setPrompt(label, modal = false) {
    this.el.prompt.classList.toggle('modal', modal);
    if (label === this._prompt) return;
    this._prompt = label;
    this.el.prompt.hidden = !label;
    if (label) this.el.promptText.textContent = label;
  }

  setHeldHint(text) {
    this.el.held.hidden = !text;
    if (text) this.el.held.lastElementChild.textContent = text;
  }

  addItem(id) {
    if (this.items.includes(id)) return;
    this.items.push(id);
    this._renderInventory();
  }

  attachProgress(progress) { this.progress = progress; this.renderGoals(); }

  // compatibilità: i moduli segnalano un obiettivo raggiunto, la progressione decide se conta
  completeGoal(id) {
    if (this.progress) this.progress.complete(id); else { this.done.add(id); this.renderGoals(); }
  }

  resetProgress() {
    this.items = [];
    this.done.clear();
    this.progress?.reset();
    this._renderInventory();
    this.renderGoals();
    this.setHeldHint(null);
    this.toast(null);
    this.subtitle(null);
  }

  // Obiettivi: quelli completati spuntati, il corrente in evidenza; i successivi restano nascosti finché non si sbloccano
  renderGoals() {
    const ul = this.el.goals.querySelector('ul');
    const p = this.progress;
    if (!p) { ul.replaceChildren(); return; }
    if (p.free) {                                 // gioco libero: una riga sola, niente lista di cose da fare
      const li = document.createElement('li');
      li.className = 'current';
      li.textContent = this.cfg.serata?.ui.liberoGoal ?? '';
      ul.replaceChildren(li);
      return;
    }
    const cur = p.current;
    // della storia si vedono gli ultimi passi fatti e quello corrente (la lista completa sarebbe troppo lunga)
    const from = Math.max(0, cur - 2);
    ul.replaceChildren(...p.steps.slice(from, cur + 1).map((g, j) => {
      const i = from + j;
      const li = document.createElement('li');
      li.className = i < cur ? 'done' : 'current';
      li.innerHTML = '<span class="box"></span>';
      li.append(p.text(g));
      return li;
    }));
  }

  _renderInventory() {
    this.el.inventory.hidden = this.items.length === 0;
    this.el.invList.replaceChildren(...this.items.map((id) => {
      const li = document.createElement('li');
      li.textContent = this.cfg.items[id]?.name ?? id;
      return li;
    }));
  }

  // Sottotitoli in coda: una battuta non copre quella prima, e resta a schermo il tempo di leggerla (in proporzione alla
  // lunghezza). opts.now = subito, al posto di quella in corso (battute della storia, dialoghi dei minigiochi).
  subtitle(name, text, duration = 4, opts = {}) {
    const c = this.cfg.ui.subtitles ?? {};
    if (!name) { clearTimeout(this._subTimer); this._subQ = []; this._subOn = false; this.el.subtitle.hidden = true; return; }
    const read = Math.min(c.max ?? 10, Math.max(duration, (c.base ?? 2) + text.length / (c.charsPerSecond ?? 13)));
    const item = { name, text, dur: read };
    this._subQ ??= [];
    if (opts.now || !this._subOn) { this._subQ = opts.now ? [] : this._subQ; this._showSub(item); return; }
    if (this._subQ.some((q) => q.text === text)) return;          // la stessa battuta già in attesa
    this._subQ.push(item);
    if (this._subQ.length > (c.queue ?? 2)) this._subQ.shift();    // troppe in coda: si perde la più vecchia
  }

  _showSub(item) {
    clearTimeout(this._subTimer);
    this._subOn = true;
    this.el.subName.textContent = item.name;
    this.el.subText.textContent = `«${item.text}»`;
    this.el.subtitle.hidden = false;
    this._subTimer = setTimeout(() => {
      const next = this._subQ?.shift();
      if (next) { this.el.subtitle.hidden = true; this._subTimer = setTimeout(() => this._showSub(next), (this.cfg.ui.subtitles?.gap ?? 0.5) * 1000); }
      else { this._subOn = false; this.el.subtitle.hidden = true; }
    }, item.dur * 1000);
  }

  toast(text, duration = 3) {
    clearTimeout(this._toastTimer);
    if (!text) { this.el.toast.hidden = true; return; }
    this.el.toast.textContent = text;
    this.el.toast.hidden = false;
    this._toastTimer = setTimeout(() => { this.el.toast.hidden = true; }, duration * 1000);
  }

  bindPause({ onResume, onRestart, onSensitivity, onHeadBob, sensitivity, headBob }) {
    this.el.sens.value = sensitivity;
    this.el.sensVal.textContent = Number(sensitivity).toFixed(1);
    this.el.bob.checked = headBob;
    this.el.resume.addEventListener('click', onResume);
    this.el.restart.addEventListener('click', onRestart);
    this.el.sens.addEventListener('input', () => {
      this.el.sensVal.textContent = Number(this.el.sens.value).toFixed(1);
      onSensitivity(Number(this.el.sens.value));
    });
    this.el.bob.addEventListener('change', () => onHeadBob(this.el.bob.checked));
  }

  debugText(text) {
    this.el.debug.hidden = false;
    this.el.debug.textContent = text;
  }
}

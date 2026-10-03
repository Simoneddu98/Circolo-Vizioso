// Interfaccia comune dei giochi della serata: barra del brano in alto (numero, titolo, tempo, punti), un'area per il
// gioco, pannelli di risultato, dissolvenza al nero, scritte grandi e il brano in sottofondo (se c'è il file).

const CSS = `
  #srt { position: fixed; inset: 0; z-index: 15; pointer-events: none; font-family: var(--body, sans-serif); color: #f1e6d2; }
  #srt .fade { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity var(--fade, .5s) ease; }
  #srt .fade.on { opacity: 1; }
  #srt .bar { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; align-items: stretch;
    font: 600 17px var(--display, sans-serif); letter-spacing: .04em; text-transform: uppercase; }
  #srt .bar > div { background: rgba(20, 11, 5, .84); border: 1px solid rgba(230, 190, 120, .35); border-radius: 6px; padding: 6px 14px;
    display: flex; align-items: center; gap: 8px; }
  #srt .bar .n { color: #ffe100; } #srt .bar .t { font-variant-numeric: tabular-nums; min-width: 3.2em; justify-content: center; }
  #srt .bar .p { color: #ffb4f4; font-variant-numeric: tabular-nums; }
  #srt .bar .t.low { color: #ff8a70; }
  #srt .stage { position: absolute; inset: 0; }
  #srt .stage > * { pointer-events: auto; }
  #srt .card { background: rgba(28, 18, 11, .95); border: 1px solid rgba(230, 190, 120, .4); border-radius: 10px; padding: 18px 20px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, .55); }
  #srt h2 { margin: 0 0 8px; font: 700 28px var(--display, sans-serif); text-transform: uppercase; letter-spacing: .03em; color: #e6be78; }
  #srt h3 { margin: 0 0 6px; font: 600 15px var(--display, sans-serif); text-transform: uppercase; letter-spacing: .1em; color: #e6be78; }
  #srt p { margin: 0 0 10px; font-size: 17px; line-height: 1.4; }
  #srt button { font: 600 16px var(--display, sans-serif); letter-spacing: .04em; text-transform: uppercase; padding: 9px 16px; border-radius: 6px;
    cursor: pointer; border: 1px solid #e6be78; background: rgba(255, 255, 255, .06); color: #f1e6d2; touch-action: manipulation; }
  #srt button:hover:not(:disabled), #srt button:focus-visible { background: rgba(230, 190, 120, .22); outline: none; }
  #srt button.main { background: #e6be78; color: #2a1a0e; }
  #srt button.on { background: #ffd35a; color: #2a1a0e; border-color: #ffd35a; }
  #srt button.ok { background: #2fa24a; border-color: #7be08f; color: #fff; }
  #srt button.ko { background: #9b2b1e; border-color: #ff8a70; color: #fff; }
  #srt button:disabled { opacity: .45; cursor: default; }
  #srt button b { color: #ffe100; margin-right: 6px; }
  #srt .center { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(640px, calc(100% - 28px));
    max-height: calc(100% - 90px); overflow-y: auto; }
  #srt .big { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%) scale(.96); text-align: center; opacity: 0;
    transition: opacity .6s ease, transform .6s ease; pointer-events: none; width: min(900px, 92%); }
  #srt .big.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  #srt .big img { width: 100%; height: auto; filter: drop-shadow(0 6px 30px rgba(255, 23, 228, .45)); }
  #srt .big .txt { font: 700 54px var(--display, sans-serif); color: #ffe100; text-transform: uppercase; text-shadow: 0 4px 24px #000; }
  #srt .pop { position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%); font: 700 38px var(--display, sans-serif);
    color: #ffd35a; text-shadow: 0 3px 14px rgba(0, 0, 0, .85); pointer-events: none; transition: opacity .3s, transform .3s; text-align: center; }
  #srt table.score { border-collapse: collapse; width: 100%; margin: 6px 0 14px; font-size: 17px; }
  #srt table.score td { padding: 5px 0; border-bottom: 1px solid rgba(241, 230, 210, .12); }
  #srt table.score td:last-child { text-align: right; font-variant-numeric: tabular-nums; color: #ffb4f4; font-weight: 600; }
  #srt table.score tr.tot td { border: 0; font: 700 22px var(--display, sans-serif); color: #ffe100; padding-top: 10px; }
  #srt .row { display: flex; flex-wrap: wrap; gap: 8px; }
  /* durante un gioco: niente obiettivi, i sottotitoli in alto a sinistra (i pulsanti stanno in basso e al centro) */
  /* durante un gioco della serata non c'è nessuna card: obiettivi, sottotitoli, tasca, portafoglio, suggerimenti */
  body.srt-on #hud, body.srt-on #wallet, body.srt-on #dlg { display: none !important; }
  #srt .card ul { margin: 0 0 12px; padding-left: 20px; font-size: 17px; line-height: 1.45; }
  #srt .card li { margin-bottom: 6px; }
  @media (max-height: 520px), (max-width: 700px) { #srt .card ul { font-size: 13px; } }
  @media (max-height: 520px), (max-width: 700px) {
    #srt .bar { top: 6px; font-size: 12px; gap: 5px; } #srt .bar > div { padding: 4px 8px; }
    #srt h2 { font-size: 20px; } #srt p { font-size: 14px; } #srt button { font-size: 13px; padding: 6px 10px; }
    #srt .card { padding: 10px 12px; } #srt .center { max-height: calc(100% - 44px); top: calc(50% + 14px); }
    #srt .big .txt { font-size: 30px; } #srt .pop { font-size: 24px; }
  }`;

export class Overlay {
  constructor(cfg) {
    this.cfg = cfg;
    const css = document.createElement('style');
    css.textContent = CSS;
    document.head.appendChild(css);
    const root = document.createElement('div');
    root.id = 'srt';
    root.style.setProperty('--fade', `${cfg.fade}s`);
    root.innerHTML = `<div class="stage"></div><div class="bar" hidden><div class="n"></div><div class="t"></div><div class="p"></div></div>
      <div class="pop"></div><div class="big"></div><div class="fade"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.stage = root.querySelector('.stage');
    this.bar = root.querySelector('.bar');
    this.popEl = root.querySelector('.pop');
    this.bigEl = root.querySelector('.big');
    this.fadeEl = root.querySelector('.fade');
    this.audio = null;
  }

  // ---- barra del brano
  showBar(brano) {
    this.bar.hidden = !brano;
    if (!brano) return;
    this.bar.querySelector('.n').textContent = brano.label ?? `${this.cfg.ui.brano.replace('{n}', brano.n)} · ${brano.titolo}`;
  }

  setTime(sec) {
    const t = this.bar.querySelector('.t');
    const s = Math.max(0, Math.ceil(sec));
    t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    t.classList.toggle('low', s <= 10);
  }

  setPoints(p) { this.bar.querySelector('.p').textContent = `★ ${p}`; }

  // ---- area di gioco
  clear() { this.stage.replaceChildren(); }

  el(html, cls = '') {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.innerHTML = html;
    this.stage.append(d);
    return d;
  }

  // pannello centrale con pulsanti [{ label, main, action }]
  panel(html, buttons = []) {
    this.clear();
    const d = this.el(html, 'card center');
    if (buttons.length) {
      const row = document.createElement('div');
      row.className = 'row';
      for (const b of buttons) {
        const btn = document.createElement('button');
        btn.textContent = b.label;
        if (b.main) btn.className = 'main';
        btn.addEventListener('click', (e) => { e.stopPropagation(); b.action(); });
        row.append(btn);
      }
      d.append(row);
      row.querySelector('button')?.focus();
    }
    return d;
  }

  // scritta che compare e sparisce (+100, "Giusto!")
  pop(text, dur = 1.1, color = '#ffd35a') {
    clearTimeout(this._popT);
    const p = this.popEl;
    p.textContent = text;
    p.style.color = color;
    p.style.opacity = 1;
    p.style.transform = 'translate(-50%, -50%)';
    this._popT = setTimeout(() => { p.style.opacity = 0; p.style.transform = 'translate(-50%, -80%)'; }, dur * 1000);
  }

  // scritta grande (o il logo) al centro
  big(html) {
    const tok = (this._bigTok = (this._bigTok ?? 0) + 1);       // un "nascondi" arrivato prima del fotogramma vince sempre
    if (!html) { this.bigEl.classList.remove('on'); return; }
    this.bigEl.innerHTML = html;
    requestAnimationFrame(() => { if (this._bigTok === tok) this.bigEl.classList.add('on'); });
  }

  fade(on, then) {
    this.fadeEl.classList.toggle('on', on);
    if (then) setTimeout(then, this.cfg.fade * 1000);
  }

  // ---- brano in sottofondo (opzionale): restituisce la durata vera se il file c'è, altrimenti quella del config
  async music(brano) {
    this.stopMusic();
    if (!brano?.audio) return brano?.durata ?? 0;
    const a = new Audio(brano.audio);
    a.preload = 'auto';
    this.audio = a;
    const dur = await new Promise((resolve) => {
      const done = (v) => { clearTimeout(t); resolve(v); };
      const t = setTimeout(() => done(null), 4000);
      a.addEventListener('loadedmetadata', () => done(a.duration), { once: true });
      a.addEventListener('error', () => done(null), { once: true });
    });
    if (!dur || !isFinite(dur)) { this.audio = null; return brano.durata; }
    a.play().catch(() => {});
    return dur;
  }

  pauseMusic(p) { if (!this.audio) return; if (p) this.audio.pause(); else this.audio.play().catch(() => {}); }

  stopMusic() { if (this.audio) { this.audio.pause(); this.audio = null; } }
}

// Brano 1 · Cinema: quiz sui film d'amore (e un po' sensuali) disegnato sul maxischermo al posto della partita.
// Si risponde con 1-4 / A-D o con i pulsanti in basso. Punti: risposta giusta + velocità + serie.
import { shuffle, mescolaRisposte, puntiRisposta } from './regole.js';
import { pick } from '../minigames/util.js';

const W = 1024, H = 576;
const LETTERE = ['A', 'B', 'C', 'D'];

export function createCinema(api) {
  const cfg = api.cfg.cinema;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const deck = shuffle(cfg.domande);
  let i = -1, q = null, t = 0, fase = 'domanda', scelta = -1, serie = 0, giuste = 0, fatte = 0, punti = 0;
  let buttons = [];

  function next() {
    i = (i + 1) % deck.length;
    const d = deck[i];
    q = { testo: d.q, ...mescolaRisposte(d.r, d.a) };
    t = 0; fase = 'domanda'; scelta = -1;
    buttons.forEach((b, k) => { b.className = ''; b.disabled = false; b.querySelector('span').textContent = q.testi[k]; });
  }

  function answer(k) {
    if (fase !== 'domanda' || k > 3 || (k < 0 && k !== -2)) return;       // -2 = tempo scaduto
    scelta = k; fase = 'risposta'; fatte++;
    const ok = k === q.giusta;
    serie = ok ? serie + 1 : 0;
    if (ok) giuste++;
    const p = puntiRisposta({ giusta: ok, restante: cfg.tempoDomanda - t, totale: cfg.tempoDomanda, serie, punti: cfg.punti,
      bonusVelocita: cfg.bonusVelocita, bonusSerie: cfg.bonusSerie });
    punti += p;
    api.add(p);
    if (ok) api.overlay.pop(`+${p}${serie > 1 ? ` · serie ×${serie}` : ''}`, 1.1, '#7be08f');
    else api.overlay.pop(k === -2 ? 'Tempo scaduto' : 'Sbagliata', 1.1, '#ff8a70');
    if (Math.random() < 0.45) api.say(api.npc, pick(ok ? cfg.commenti.giusta : cfg.commenti.sbagliata));
    buttons.forEach((b, n) => { b.disabled = true; if (n === q.giusta) b.className = 'ok'; else if (n === k) b.className = 'ko'; });
    t = 0;
  }

  // testo a capo dentro una larghezza
  function wrap(text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '', yy = y;
    const lines = [];
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    lines.push(line);
    const top = yy - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, n) => g.fillText(l, x, top + n * lh));
  }

  function draw() {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#1b0826'); grd.addColorStop(1, '#07030a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // testata
    g.fillStyle = '#ff17e4'; g.fillRect(0, 0, W, 6);
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = '700 30px Oswald, Arial Narrow, sans-serif';
    g.fillStyle = '#ffe100'; g.fillText('CINEFORUM DEL CIRCOLO', 36, 40);
    g.textAlign = 'right'; g.fillStyle = '#ffb4f4';
    g.fillText(`★ ${punti}`, W - 36, 40);
    g.font = '600 22px Oswald, Arial Narrow, sans-serif'; g.fillStyle = '#bba98a';
    g.fillText(`${giuste}/${fatte}${serie > 1 ? `  ·  serie ×${serie}` : ''}`, W - 160, 40);
    if (!q) return;
    // domanda
    g.textAlign = 'center'; g.fillStyle = '#f4f2fa';
    g.font = '600 40px "Source Sans 3", Arial, sans-serif';
    wrap(q.testo, W / 2, 145, W - 90, 48);
    // tempo
    const k = fase === 'domanda' ? Math.max(0, 1 - t / cfg.tempoDomanda) : 0;
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(60, 214, W - 120, 10);
    g.fillStyle = k > 0.3 ? '#ffe100' : '#ff5a3c'; g.fillRect(60, 214, (W - 120) * k, 10);
    // risposte 2 x 2
    const bw = (W - 60 * 2 - 24) / 2, bh = 128;
    q.testi.forEach((r, n) => {
      const x = 60 + (n % 2) * (bw + 24), y = 250 + Math.floor(n / 2) * (bh + 22);
      let fill = 'rgba(255,255,255,0.07)', stroke = 'rgba(176,74,224,0.8)';
      if (fase === 'risposta' && n === q.giusta) { fill = '#1f7a3a'; stroke = '#7be08f'; }
      else if (fase === 'risposta' && n === scelta) { fill = '#7a1f14'; stroke = '#ff8a70'; }
      g.fillStyle = fill; g.fillRect(x, y, bw, bh);
      g.lineWidth = 3; g.strokeStyle = stroke; g.strokeRect(x, y, bw, bh);
      g.fillStyle = '#ffe100'; g.font = '700 44px Oswald, Arial Narrow, sans-serif'; g.textAlign = 'left';
      g.fillText(LETTERE[n], x + 22, y + bh / 2);
      g.fillStyle = '#f4f2fa'; g.font = '600 32px "Source Sans 3", Arial, sans-serif';
      const words = r.split(' ');
      let line = '', lines = [];
      for (const w of words) { const test = line ? `${line} ${w}` : w; if (g.measureText(test).width > bw - 100 && line) { lines.push(line); line = w; } else line = test; }
      lines.push(line);
      const top = y + bh / 2 - ((lines.length - 1) * 36) / 2;
      lines.forEach((l, m) => g.fillText(l, x + 78, top + m * 36));
    });
  }

  return {
    canvas,
    start() {
      if (!document.getElementById('cinema-css')) {
        const css = document.createElement('style');
        css.id = 'cinema-css';
        css.textContent = `
          #srt .answers button { background: #1c0826; border: 2px solid #ff17e4; color: #fff; font-size: 17px; padding: 12px 10px;
            box-shadow: 0 6px 18px rgba(0,0,0,.6); text-shadow: 0 1px 2px #000; }
          #srt .answers button b { color: #ffe100; font-size: 20px; }
          #srt .answers button:hover:not(:disabled), #srt .answers button:focus-visible { background: #4a1360; border-color: #ffe100; }
          #srt .answers button.ok { background: #1f7a3a; border-color: #7be08f; }
          #srt .answers button.ko { background: #7a1f14; border-color: #ff8a70; }
          #srt .answers button:disabled { opacity: 1; }
          #srt .answers button:disabled:not(.ok):not(.ko) { opacity: .55; }
          @media (max-height: 520px), (max-width: 700px) { #srt .answers button { font-size: 13px; padding: 7px 6px; } }`;
        document.head.appendChild(css);
      }
      const bar = api.overlay.el('', 'answers');
      Object.assign(bar.style, { position: 'absolute', left: '50%', bottom: '18px', transform: 'translateX(-50%)', display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', width: 'min(900px, calc(100% - 24px))' });
      buttons = LETTERE.map((l, k) => {
        const b = document.createElement('button');
        b.innerHTML = `<b>${l}</b><span></span>`;
        b.style.textTransform = 'none';
        b.addEventListener('click', (e) => { e.stopPropagation(); answer(k); });
        bar.append(b);
        return b;
      });
      api.tv?.setOverride(canvas, () => draw());
      next();
    },
    update(dt) {
      t += dt;
      if (fase === 'domanda' && t >= cfg.tempoDomanda) answer(-2);
      else if (fase === 'risposta' && t >= cfg.pausa) next();
    },
    key(e) {
      const k = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, KeyA: 0, KeyB: 1, KeyC: 2, KeyD: 3 }[e.code];
      if (k == null) return false;
      answer(k);
      return true;
    },
    summary: () => `${giuste} risposte giuste su ${fatte}`,
    dispose() { api.tv?.setOverride(null); },
  };
}

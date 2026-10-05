// Jukebox a ritmo: schermo di gioco (canvas), tasti, tocco, pausa, schermata finale. Regole in rules.js, suoni in audio.js.
// Si apre da un pulsante (serve un gesto dell'utente per far partire l'audio) e copre tutto; alla chiusura chiama onExit.
import { Ritmo } from './audio.js';
import { LANES, generaChart, Partita } from './rules.js';

const COL = ['#ff17e4', '#ffe100', '#34d1ff', '#7be08f'];
const ETICHETTE = ['D', 'F', 'J', 'K'];
const TASTI = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
const ANTICIPO = 2.0;                                  // secondi in cui una nota è visibile prima di arrivare sulla linea
const FONT = 'Oswald, Impact, sans-serif';
const OFFSET_KEY = 'circolo.jukebox.offset';
const GIUDIZI = { perfetto: ['PERFETTO', '#ffe100'], buono: ['BUONO', '#7be08f'], mancato: ['MANCATO', '#ff6a5c'] };

const CSS = `
  #jb { position: fixed; inset: 0; z-index: 90; background: #07030c; color: #f4f2fa; user-select: none; -webkit-user-select: none; touch-action: none; }
  #jb canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  #jb .vel { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(5,2,9,.72); padding: 16px; }
  #jb .vel[hidden] { display: none; }
  #jb .card { width: min(460px, 100%); background: #14091c; border: 2px solid rgba(217,170,69,.7); border-radius: 10px; padding: 20px; text-align: center;
    font-family: var(--body, sans-serif); box-shadow: 0 20px 60px rgba(0,0,0,.7); max-height: 100%; overflow-y: auto; }
  #jb h2 { margin: 0 0 6px; font: 700 28px ${FONT}; letter-spacing: .08em; text-transform: uppercase; color: #ffe100; }
  #jb p { margin: 0 0 10px; font-size: 16px; line-height: 1.4; opacity: .92; }
  #jb p.pic { font-size: 13px; opacity: .65; }
  #jb .voto { font: 700 96px/1 ${FONT}; margin: 4px 0 2px; }
  #jb table { margin: 8px auto 12px; border-collapse: collapse; font-size: 16px; }
  #jb td { padding: 2px 12px; text-align: left; } #jb td + td { text-align: right; font-weight: 700; }
  #jb .azioni { display: flex; gap: 10px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
  #jb button { padding: 10px 20px; font: 600 17px ${FONT}; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; border-radius: 8px;
    border: 2px solid rgba(217,170,69,.6); background: transparent; color: #f1e6d2; }
  #jb button.si { background: linear-gradient(180deg, #c93cf0, #7a1fa0); border-color: #ffe100; color: #fff; }
  #jb .esci { position: absolute; top: max(10px, env(safe-area-inset-top)); left: 10px; padding: 6px 12px; font-size: 14px; opacity: .8; }`;

const lisce = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const tieni = (n, a, b) => Math.max(a, Math.min(b, n));

export function apriJukebox(cfg, { nome = 'Jukebox', auto = false, muto = auto, onExit } = {}) {
  let stile = document.getElementById('jb-stile');
  if (!stile) { stile = document.createElement('style'); stile.id = 'jb-stile'; stile.textContent = CSS; document.head.appendChild(stile); }

  const chart = generaChart({ seed: cfg.seed ?? 1, battute: cfg.battute ?? 32 });
  const bestKey = `circolo.jukebox.${cfg.id ?? 'x'}.best`;
  const leggi = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const salva = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ok */ } };
  let offsetMs = leggi(OFFSET_KEY, 0);

  const root = document.createElement('div');
  root.id = 'jb';
  root.innerHTML = `<canvas></canvas><button class="esci" type="button">Esci</button><div class="vel" hidden><div class="card"></div></div>`;
  document.body.appendChild(root);
  const canvas = root.querySelector('canvas'), g = canvas.getContext('2d');
  const vel = root.querySelector('.vel'), card = root.querySelector('.card');

  let stato = 'pronto', ritmo = null, partita = null, raf = 0, W = 0, H = 0, dpr = 1;
  const premuti = new Array(LANES).fill(-1);          // tempo (brano) fino a cui la pad è accesa
  let giudizio = null, avviso = null;
  const anelli = [];

  function misura() {
    dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    W = root.clientWidth; H = root.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const area = () => { const w = Math.min(W * 0.96, 540); return { x0: (W - w) / 2, w, lw: w / LANES }; };
  const hitY = () => H * 0.8;
  const topY = () => Math.max(70, H * 0.12);

  // ------------------------------------------------------------------ pannelli

  function pannello(html, azioni) {
    card.innerHTML = html;
    const box = document.createElement('div');
    box.className = 'azioni';
    for (const [testo, fn, primario] of azioni) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = testo; if (primario) b.className = 'si';
      b.addEventListener('click', fn);
      box.appendChild(b);
    }
    card.appendChild(box);
    vel.hidden = false;
    box.querySelector('.si')?.focus();
  }

  function schermataPronto() {
    stato = 'pronto';
    pannello(`<h2>${nome}</h2>
      <p>${cfg.bpm} BPM · quattro corsie. Colpisci ogni nota quando arriva sulla linea: <b>D F J K</b>, le frecce, oppure tocca la corsia.</p>
      <p>Più colpi di fila fai, più il punteggio sale (fino a ×4).</p>
      <p class="pic">${cfg.audio ? '' : 'Versione con metronomo: l\'anteprima inedita del brano arriva con l\'uscita del singolo. '}Se i colpi ti sembrano sfasati, − e + regolano la sincronia.</p>`,
    [['Via', () => via(), true], ['Esci', () => chiudi()]]);
  }

  function schermataPausa() {
    pannello(`<h2>Pausa</h2><p>Il brano riparte da dove l'hai lasciato.</p>`, [['Riprendi', () => riprendi(), true], ['Esci', () => chiudi()]]);
  }

  function schermataFine() {
    stato = 'fine';
    const p = partita;
    const best = leggi(bestKey, 0), record = p.punti > best;
    if (record) salva(bestKey, p.punti);
    const col = { S: '#ffe100', A: '#7be08f', B: '#34d1ff', C: '#ff17e4', D: '#ff6a5c' }[p.voto];
    pannello(`<h2>${nome}</h2><div class="voto" style="color:${col}">${p.voto}</div>
      <p>${record ? 'Nuovo record!' : `Record: ${best.toLocaleString('it-IT')}`}</p>
      <table>
        <tr><td>Punti</td><td>${p.punti.toLocaleString('it-IT')}</td></tr>
        <tr><td>Precisione</td><td>${Math.round(p.precisione * 100)}%</td></tr>
        <tr><td>Perfetti</td><td>${p.conteggi.perfetto}</td></tr>
        <tr><td>Buoni</td><td>${p.conteggi.buono}</td></tr>
        <tr><td>Mancati</td><td>${p.conteggi.mancato}</td></tr>
        <tr><td>Serie più lunga</td><td>${p.comboMax}</td></tr>
      </table>`, [['Rigioca', () => via(), true], ['Esci', () => chiudi()]]);
  }

  // ------------------------------------------------------------------ partita

  async function via() {
    vel.hidden = true;
    ritmo?.ferma();
    ritmo = new Ritmo({ bpm: cfg.bpm, audio: cfg.audio, audioOffset: cfg.audioOffset, battute: chart.battute, muto });
    partita = new Partita(chart, cfg.bpm);
    anelli.length = 0; giudizio = null; premuti.fill(-1);
    stato = 'gioco';
    await ritmo.inizia();
  }

  function riprendi() {
    vel.hidden = true;
    stato = 'gioco';
    ritmo?.riprendi();
  }

  function pausa() {
    if (stato !== 'gioco') return;
    stato = 'pausa';
    ritmo?.pausa();
    schermataPausa();
  }

  const adesso = () => ritmo.tempo(offsetMs / 1000);

  function premi(lane) {
    if (stato !== 'gioco' || !ritmo?.ok) return;
    const t = adesso();
    premuti[lane] = t + 0.12;
    const r = partita.colpo(lane, t);
    if (r) esito(r, lane);
  }

  function esito(r, lane = r.nota.lane) {
    giudizio = { ...GIUDIZI[r.giudizio], t0: performance.now(), scarto: r.scarto };
    if (r.giudizio !== 'mancato') anelli.push({ lane, t0: performance.now(), col: COL[lane] });
    ritmo.suona(lane, r.giudizio);
  }

  function aggiorna() {
    if (stato !== 'gioco' || !ritmo?.ok) return;
    const t = adesso();
    if (auto) {                                        // prova automatica: colpisce ogni nota con un piccolo scarto
      for (const n of partita.note) {
        if (n.t > t + 0.03) break;
        if (!n.esito && t >= n.t + (((n.lane * 7 + Math.round(n.beat * 2)) % 5) - 2) * 0.01) { premuti[n.lane] = t + 0.12; const r = partita.colpo(n.lane, t); if (r) esito(r, n.lane); }
      }
    }
    for (const r of partita.aggiorna(t)) esito(r);
    if (partita.finita(t)) { ritmo.ferma(); schermataFine(); }
  }

  // ------------------------------------------------------------------ disegno

  function nota(x, y, w, col, alpha = 1) {
    const h = 26, r = 6;
    g.globalAlpha = alpha;
    g.shadowColor = col; g.shadowBlur = 14;
    g.fillStyle = col;
    g.beginPath(); g.roundRect(x, y - h / 2, w, h, r); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(7,3,12,.9)';                      // le tacche del biglietto
    g.beginPath(); g.arc(x, y, 5, 0, 7); g.arc(x + w, y, 5, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillRect(x + w * 0.2, y - 2, w * 0.6, 4);
    g.globalAlpha = 1;
  }

  function disegna() {
    g.clearRect(0, 0, W, H);
    const bd = 60 / cfg.bpm;
    const t = ritmo?.ok && stato !== 'pronto' ? adesso() : -4 * bd;
    const fase = ((t / bd) % 1 + 1) % 1, battito = Math.exp(-fase * 4);
    const { x0, w, lw } = area(), hy = hitY(), ty = topY();
    // sfondo e lo "schermo" del cinema in alto che pulsa
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#12061d'); bg.addColorStop(1, '#07030c');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const gl = g.createRadialGradient(W / 2, 0, 10, W / 2, 0, H * 0.7);
    gl.addColorStop(0, `rgba(255,23,228,${0.18 + 0.22 * battito})`); gl.addColorStop(1, 'rgba(255,23,228,0)');
    g.fillStyle = gl; g.fillRect(0, 0, W, H);
    // pellicola ai lati
    for (const sx of [x0 - 34, x0 + w + 12]) {
      g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(sx, 0, 22, H);
      g.fillStyle = 'rgba(7,3,12,.9)';
      const passo = 30, o = (t * 40) % passo;
      for (let y = -passo + o; y < H; y += passo) { g.beginPath(); g.roundRect(sx + 6, y, 10, 16, 3); g.fill(); }
    }
    // corsie e linee dei quarti
    for (let i = 0; i < LANES; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.06)';
      g.fillRect(x0 + i * lw, ty, lw, hy - ty + 70);
    }
    g.lineWidth = 1;
    const b0 = Math.floor(t / bd);
    for (let b = b0; b < b0 + ANTICIPO / bd + 2; b++) {
      const y = hy - ((b * bd - t) / ANTICIPO) * (hy - ty);
      if (y < ty || y > hy + 60) continue;
      g.strokeStyle = b % 4 === 0 ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.09)';
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke();
    }
    // linea di colpo
    g.shadowColor = '#ffe100'; g.shadowBlur = 16 + 14 * battito;
    g.strokeStyle = '#ffe100'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x0, hy); g.lineTo(x0 + w, hy); g.stroke(); g.shadowBlur = 0;
    // note
    if (partita) {
      for (const n of partita.note) {
        if (n.t > t + ANTICIPO) break;
        if (n.t < t - 0.5) continue;
        if (n.esito === 'perfetto' || n.esito === 'buono') continue;
        const y = hy - ((n.t - t) / ANTICIPO) * (hy - ty);
        const alpha = n.esito === 'mancato' ? 0.25 : lisce((y - ty) / 40);
        nota(x0 + n.lane * lw + lw * 0.08, y, lw * 0.84, n.esito === 'mancato' ? '#777' : COL[n.lane], alpha);
      }
    }
    // pad e tasti
    for (let i = 0; i < LANES; i++) {
      const acceso = premuti[i] > t;
      const px = x0 + i * lw + lw * 0.08, pw = lw * 0.84;
      g.fillStyle = acceso ? COL[i] : 'rgba(255,255,255,.08)';
      g.shadowColor = COL[i]; g.shadowBlur = acceso ? 22 : 0;
      g.beginPath(); g.roundRect(px, hy + 16, pw, 46, 10); g.fill(); g.shadowBlur = 0;
      g.strokeStyle = COL[i]; g.lineWidth = 2; g.beginPath(); g.roundRect(px, hy + 16, pw, 46, 10); g.stroke();
      g.fillStyle = acceso ? '#07030c' : COL[i];
      g.font = `700 24px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ETICHETTE[i], px + pw / 2, hy + 40);
    }
    // anelli dei colpi
    const ora = performance.now();
    for (let i = anelli.length - 1; i >= 0; i--) {
      const a = anelli[i], k = (ora - a.t0) / 350;
      if (k >= 1) { anelli.splice(i, 1); continue; }
      g.strokeStyle = a.col; g.globalAlpha = 1 - k; g.lineWidth = 4;
      g.beginPath(); g.arc(x0 + a.lane * lw + lw / 2, hy, 14 + 40 * k, 0, 7); g.stroke(); g.globalAlpha = 1;
    }
    // conto alla rovescia, via
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stato !== 'pronto' && t < 0) {
      const n = Math.ceil(-t / bd);
      g.fillStyle = '#ffe100'; g.font = `700 ${Math.min(180, H * 0.3)}px ${FONT}`;
      g.globalAlpha = 0.35 + 0.65 * battito; g.fillText(String(tieni(n, 1, 4)), W / 2, H * 0.4); g.globalAlpha = 1;
    } else if (stato !== 'pronto' && t < 0.7) {
      g.fillStyle = '#7be08f'; g.font = `700 ${Math.min(140, H * 0.22)}px ${FONT}`;
      g.globalAlpha = 1 - t / 0.7; g.fillText('VIA!', W / 2, H * 0.4); g.globalAlpha = 1;
    }
    // punteggio, serie, giudizio, avanzamento
    if (partita && stato !== 'pronto') {
      g.fillStyle = '#f4f2fa'; g.font = `600 26px ${FONT}`; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      g.fillText(partita.punti.toLocaleString('it-IT'), W - 16, 38);
      g.font = `400 14px ${FONT}`; g.fillStyle = 'rgba(244,242,250,.6)'; g.fillText(`×${partita.moltiplicatore}`, W - 16, 58);
      if (partita.combo >= 2) {
        g.textAlign = 'center'; g.fillStyle = '#ffe100'; g.font = `700 ${34 + 4 * battito}px ${FONT}`;
        g.fillText(`${partita.combo}`, W / 2, ty + 6);
      }
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, W, 5);
      g.fillStyle = '#ff17e4'; g.fillRect(0, 0, W * tieni(t / (partita.durata || 1), 0, 1), 5);
      if (giudizio) {
        const k = (ora - giudizio.t0) / 650;
        if (k < 1) {
          g.globalAlpha = 1 - k; g.fillStyle = giudizio[1]; g.textAlign = 'center'; g.font = `700 ${28 - 6 * k}px ${FONT}`;
          g.fillText(giudizio[0], W / 2, hy - 56 - 14 * k);
          if (giudizio[0] !== 'MANCATO') { g.font = `400 13px ${FONT}`; g.fillText(`${giudizio.scarto > 0 ? '+' : ''}${Math.round(giudizio.scarto * 1000)} ms`, W / 2, hy - 36); }
          g.globalAlpha = 1;
        }
      }
    }
    if (avviso && ora - avviso.t0 < 1600) {
      g.fillStyle = 'rgba(244,242,250,.85)'; g.font = `600 16px ${FONT}`; g.textAlign = 'center';
      g.fillText(avviso.testo, W / 2, H - 14);
    }
  }

  function ciclo() {
    raf = requestAnimationFrame(ciclo);
    aggiorna();
    disegna();
  }

  // ------------------------------------------------------------------ input

  function tasto(e) {
    e.stopImmediatePropagation();                       // i tasti non arrivano al gioco sotto
    if (e.code === 'Escape') { e.preventDefault(); if (stato === 'gioco') pausa(); else if (stato === 'pausa') riprendi(); else chiudi(); return; }
    if (e.repeat) { e.preventDefault(); return; }
    const delta = ['Minus', 'NumpadSubtract'].includes(e.code) ? -10 : ['Equal', 'NumpadAdd'].includes(e.code) ? 10 : 0;
    if (delta) {
      offsetMs = tieni(offsetMs + delta, -300, 300); salva(OFFSET_KEY, offsetMs);
      avviso = { testo: `Sincronia: ${offsetMs > 0 ? '+' : ''}${offsetMs} ms`, t0: performance.now() };
      return;
    }
    if (e.code in TASTI) { e.preventDefault(); premi(TASTI[e.code]); }
  }
  const tastoSu = (e) => e.stopImmediatePropagation();
  function tocco(e) {
    if (e.target !== canvas || stato !== 'gioco') return;
    e.preventDefault();
    const { x0, w } = area();
    const x = e.clientX - root.getBoundingClientRect().left;
    if (x < x0 - 30 || x > x0 + w + 30) return;
    premi(tieni(Math.floor(((x - x0) / w) * LANES), 0, LANES - 1));
  }
  const nascosta = () => { if (document.hidden) pausa(); };

  window.addEventListener('keydown', tasto, true);
  window.addEventListener('keyup', tastoSu, true);
  canvas.addEventListener('pointerdown', tocco);
  document.addEventListener('visibilitychange', nascosta);
  window.addEventListener('resize', misura);
  root.querySelector('.esci').addEventListener('click', () => chiudi());

  function chiudi() {
    cancelAnimationFrame(raf);
    ritmo?.ferma();
    window.removeEventListener('keydown', tasto, true);
    window.removeEventListener('keyup', tastoSu, true);
    document.removeEventListener('visibilitychange', nascosta);
    window.removeEventListener('resize', misura);
    root.remove();
    onExit?.();
  }

  misura();
  ciclo();
  schermataPronto();
  return { chiudi, get stato() { return stato; }, get partita() { return partita; }, via };
}

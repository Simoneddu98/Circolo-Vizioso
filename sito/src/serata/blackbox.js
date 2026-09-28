// Brano 3 · Black Box: di ogni storia si conoscono l'inizio e la fine; in mezzo c'è la scatola nera. Due tipi:
// "scegli" (cosa è successo in mezzo, tre possibilità) e "ordina" (rimetti in fila i passaggi, clic nell'ordine giusto).
import { shuffle, mescolaRisposte, puntiRisposta, ordineGiusto } from './regole.js';
import { pick, sfx } from '../minigames/util.js';

const CSS = `
  #srt .bb { position: absolute; left: 50%; top: calc(50% + 20px); transform: translate(-50%, -50%); width: min(820px, calc(100% - 28px));
    max-height: calc(100% - 80px); overflow-y: auto; }
  #srt .bb .flow { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; margin-bottom: 14px; }
  #srt .bb .end { background: rgba(255,255,255,.06); border: 1px solid rgba(241,230,210,.25); border-radius: 8px; padding: 10px 12px; font-size: 17px; }
  #srt .bb .end small { display: block; font: 600 12px var(--display, sans-serif); letter-spacing: .12em; text-transform: uppercase; color: #e6be78; margin-bottom: 4px; }
  #srt .bb .box { width: 120px; height: 92px; background: linear-gradient(145deg, #1b1b1f, #000); border-radius: 8px; display: grid; place-items: center;
    box-shadow: 0 0 0 1px #333, 0 10px 30px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.12); font: 700 16px var(--display, sans-serif);
    color: #ff17e4; letter-spacing: .1em; text-align: center; transition: box-shadow .3s; }
  #srt .bb .box.open { box-shadow: 0 0 0 2px #ff17e4, 0 0 40px rgba(255,23,228,.6); color: #ffe100; }
  #srt .bb .ops { display: grid; gap: 8px; }
  #srt .bb .ops button { text-transform: none; font-family: var(--body, sans-serif); font-size: 17px; text-align: left; padding: 10px 14px; }
  #srt .bb .timer { height: 6px; background: rgba(255,255,255,.1); border-radius: 3px; overflow: hidden; margin-bottom: 12px; }
  #srt .bb .timer div { height: 100%; background: #ffe100; }
  @media (max-height: 520px), (max-width: 700px) {
    #srt .bb .flow { gap: 6px; } #srt .bb .box { width: 70px; height: 56px; font-size: 11px; }
    #srt .bb .end { font-size: 13px; padding: 6px 8px; } #srt .bb .ops button { font-size: 14px; padding: 6px 10px; }
  }`;
let cssDone = false;

export function createBlackbox(api) {
  const cfg = api.cfg.blackbox;
  if (!cssDone) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); cssDone = true; }
  const deck = shuffle(cfg.scatole);
  let k = -1, cur = null, t = 0, card = null, giuste = 0, fatte = 0, serie = 0;

  function next() {
    k = (k + 1) % deck.length;
    const s = deck[k];
    t = 0;
    if (s.tipo === 'ordina') {
      const idx = shuffle(s.r.map((_, i) => i));
      cur = { ...s, mescolati: idx, testi: idx.map((i) => s.r[i]), scelti: [], fase: 'gioco' };
    } else {
      cur = { ...s, ...mescolaRisposte(s.r, 0), fase: 'gioco' };
    }
    render();
  }

  function render() {
    card.innerHTML = `<div class="timer"><div></div></div><div class="flow">
      <div class="end"><small>Inizio</small>${cur.inizio}</div><div class="box">BLACK<br>BOX</div><div class="end"><small>Fine</small>${cur.fine}</div></div>
      <h3>${cur.tipo === 'ordina' ? 'Cosa è successo in mezzo? Clicca i passaggi in ordine' : 'Cosa è successo in mezzo?'}</h3><div class="ops"></div>`;
    const ops = card.querySelector('.ops');
    cur.testi.forEach((txt, i) => {
      const b = document.createElement('button');
      const pos = cur.scelti?.indexOf(i) ?? -1;
      b.innerHTML = `<b>${pos >= 0 ? pos + 1 : i + 1}</b>`;
      b.append(txt);
      if (pos >= 0) b.className = 'on';
      b.addEventListener('click', (e) => { e.stopPropagation(); scegli(i); });
      ops.append(b);
    });
  }

  function scegli(i) {
    if (cur.fase !== 'gioco') return;
    if (cur.tipo === 'ordina') {
      if (cur.scelti.includes(i)) cur.scelti = cur.scelti.filter((x) => x !== i);      // di nuovo = lo togli
      else cur.scelti.push(i);
      sfx({ freq: 1100, dur: 0.04, vol: 0.1, noise: 0.7 });
      if (cur.scelti.length < cur.testi.length) { render(); return; }
      risolvi(ordineGiusto(cur.scelti, cur.mescolati), cfg.puntiOrdine);
    } else {
      cur.scelta = i;
      risolvi(i === cur.giusta, cfg.punti);
    }
  }

  function risolvi(ok, base) {
    cur.fase = 'fatto';
    fatte++;
    serie = ok ? serie + 1 : 0;
    if (ok) giuste++;
    const p = puntiRisposta({ giusta: ok, restante: cfg.tempo - t, totale: cfg.tempo, serie, punti: base, bonusVelocita: cfg.bonusVelocita });
    api.add(p);
    api.overlay.pop(ok ? `+${p}` : (t >= cfg.tempo ? 'Tempo scaduto' : 'Non proprio'), 1.1, ok ? '#7be08f' : '#ff8a70');
    if (Math.random() < 0.5) api.say(api.npc, pick(ok ? cfg.commenti.giusta : cfg.commenti.sbagliata));
    // la scatola si apre: si vede cosa c'era dentro
    card.querySelector('.box').classList.add('open');
    const buttons = [...card.querySelectorAll('.ops button')];
    if (cur.tipo === 'ordina') {
      card.querySelector('.ops').innerHTML = cur.r.map((txt, i) => `<button class="${ok ? 'ok' : ''}" disabled><b>${i + 1}</b>${txt}</button>`).join('');
    } else {
      buttons.forEach((b, i) => { b.disabled = true; if (i === cur.giusta) b.className = 'ok'; else if (i === cur.scelta) b.className = 'ko'; });
    }
    t = 0;
  }

  return {
    start() { card = api.overlay.el('', 'card bb'); next(); },
    update(dt) {
      t += dt;
      if (cur.fase === 'gioco') {
        const bar = card.querySelector('.timer div');
        if (bar) bar.style.width = `${Math.max(0, 1 - t / cfg.tempo) * 100}%`;
        if (t >= cfg.tempo) risolvi(false, 0);
      } else if (t >= (cur.tipo === 'ordina' ? 3.8 : 3.2)) next();   // il tempo di leggere la soluzione
    },
    key(e) {
      const n = /^(Digit|Numpad)([1-4])$/.exec(e.code);
      if (!n) return false;
      if (Number(n[2]) <= cur.testi.length) scegli(Number(n[2]) - 1);
      return true;
    },
    summary: () => `${giuste} scatole aperte su ${fatte}`,
    dispose() { card = null; },
  };
}

// Brano 5 · Mezzo pieno: al bancone, tre bicchieri. Nicola ne riempie uno fino a metà (mezzo pieno), Zugo ne beve
// metà di un altro (mezzo vuoto), il terzo resta pieno. Poi si mescolano, sempre più veloci: dov'è il mezzo pieno?
// E il mezzo vuoto? (Sembrano uguali. Lo sono.)
import { scambi, applicaScambi, difficolta, lerp, puntiRisposta } from './regole.js';
import { glassSvg } from './cometiva.js';
import { pick, sfx, jingle } from '../minigames/util.js';

const CSS = `
  #srt .bic { position: absolute; left: 50%; top: calc(50% + 30px); transform: translate(-50%, -50%); width: min(720px, calc(100% - 28px)); text-align: center; }
  #srt .bic .q { font: 700 28px var(--display, sans-serif); text-transform: uppercase; color: #ffe100; min-height: 40px; }
  #srt .bic .table { position: relative; height: 230px; margin: 6px 0 30px; border-bottom: 6px solid #4a2f1b; }
  #srt .bic .gl { position: absolute; bottom: 0; width: 110px; margin-left: -55px; display: flex; flex-direction: column; align-items: center; cursor: pointer; }
  #srt .bic .gl .lab { position: absolute; top: calc(100% + 8px); white-space: nowrap; font: 600 15px var(--display, sans-serif); text-transform: uppercase;
    letter-spacing: .06em; color: #f1e6d2; transition: opacity .25s; }
  #srt .bic .gl.hit svg { filter: drop-shadow(0 0 12px #7be08f); } #srt .bic .gl.miss svg { filter: drop-shadow(0 0 12px #ff8a70); }
  #srt .bic .info { font-size: 15px; color: #bba98a; }
  @media (max-height: 520px), (max-width: 700px) {
    #srt .bic .table { height: 150px; } #srt .bic .q { font-size: 18px; min-height: 26px; } #srt .bic .gl { width: 80px; margin-left: -40px; }
  }`;
let cssDone = false;

const SLOT = [0.2, 0.5, 0.8];                        // posti sul bancone (frazione della larghezza)
const TIPI = ['pieno', 'mezzoPieno', 'mezzoVuoto'];

export function createBicchiere(api) {
  const cfg = api.cfg.bicchiere;
  if (!cssDone) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); cssDone = true; }
  let card = null, table = null, qEl = null, infoEl = null, glasses = [];
  let giro = 0, fase = 'mostra', t = 0, lista = [], idx = 0, dur = 0.4, pos = [0, 1, 2], giuste = 0, domande = 0, serie = 0;
  const small = () => matchMedia('(max-height: 520px), (max-width: 700px)').matches;

  function draw(g) {
    g.el.querySelector('.svg').innerHTML = glassSvg(g.level, small() ? 50 : 74, '#b5173a');
    g.el.style.left = `${g.x * 100}%`;
    g.el.style.transform = `translateY(${-g.lift}px)`;
  }

  function nuovoGiro() {
    giro++;
    const k = difficolta(giro - 1, cfg.giriAlMassimo);
    lista = scambi(Math.round(lerp(cfg.scambi[0], cfg.scambi[1], k)));
    dur = lerp(cfg.velocita[0], cfg.velocita[1], k);
    idx = 0; t = 0; fase = 'mostra';
    pos = [0, 1, 2];
    glasses.forEach((g, i) => {
      g.x = SLOT[i]; g.lift = 0;
      g.level = g.tipo === 'pieno' ? 0.95 : g.tipo === 'mezzoPieno' ? 0 : 1;   // si riempie / si svuota durante la presentazione
      g.el.className = 'gl';
      g.el.querySelector('.lab').textContent = cfg.etichette[g.tipo];
      g.el.querySelector('.lab').style.opacity = 1;
      draw(g);
    });
    qEl.textContent = `Giro ${giro}: guarda bene`;
    infoEl.textContent = 'Nicola riempie, Zugo beve.';
  }

  function click(i) {
    if (fase !== 'domanda1' && fase !== 'domanda2') return;
    const want = fase === 'domanda1' ? 'mezzoPieno' : 'mezzoVuoto';
    const ok = glasses[i].tipo === want;
    domande++;
    serie = ok ? serie + 1 : 0;
    if (ok) giuste++;
    const p = puntiRisposta({ giusta: ok, restante: Math.max(0, 5 - t), totale: 5, serie, punti: cfg.punti, bonusVelocita: cfg.bonusVelocita });
    api.add(p);
    glasses[i].el.classList.add(ok ? 'hit' : 'miss');
    glasses[i].el.querySelector('.lab').textContent = cfg.etichette[glasses[i].tipo];
    glasses[i].el.querySelector('.lab').style.opacity = 1;
    api.overlay.pop(ok ? `+${p}` : 'No!', 0.8, ok ? '#7be08f' : '#ff8a70');
    if (ok) jingle([990, 1320], 0.06, 0.06); else sfx({ freq: 180, dur: 0.15, vol: 0.15, noise: 0.2, type: 'sawtooth' });
    t = 0;
    if (fase === 'domanda1') { fase = 'domanda2'; qEl.textContent = cfg.domande[1]; }
    else {
      fase = 'rivela';
      glasses.forEach((g) => { g.el.querySelector('.lab').textContent = cfg.etichette[g.tipo]; g.el.querySelector('.lab').style.opacity = 1; });
      qEl.textContent = '';
      if (Math.random() < 0.4) api.say(api.npc, pick(cfg.zucco));
    }
  }

  return {
    start() {
      card = api.overlay.el(`<div class="q"></div><div class="table"></div><div class="info"></div>`, 'card bic');
      table = card.querySelector('.table'); qEl = card.querySelector('.q'); infoEl = card.querySelector('.info');
      glasses = TIPI.map((tipo, i) => {
        const el = document.createElement('div');
        el.innerHTML = '<div class="svg"></div><div class="lab"></div>';
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); click(i); });
        table.append(el);
        return { tipo, el, x: SLOT[i], lift: 0, level: 0.5 };
      });
      nuovoGiro();
    },
    update(dt) {
      t += dt;
      if (fase === 'mostra') {
        const k = Math.min(1, t / 1.8);
        for (const g of glasses) {
          if (g.tipo === 'mezzoPieno') g.level = 0.5 * k;
          if (g.tipo === 'mezzoVuoto') g.level = 1 - 0.5 * k;
          draw(g);
        }
        if (t >= 2.6) {
          fase = 'mescola'; t = 0;
          glasses.forEach((g) => { g.el.querySelector('.lab').style.opacity = 0; });
          qEl.textContent = 'Occhio...';
          infoEl.textContent = '';
        }
      } else if (fase === 'mescola') {
        if (idx >= lista.length) { fase = 'domanda1'; t = 0; qEl.textContent = cfg.domande[0]; return; }
        const [a, b] = lista[idx];
        const k = Math.min(1, t / dur), e = k * k * (3 - 2 * k);
        const ga = glasses[pos.indexOf(a)], gb = glasses[pos.indexOf(b)];
        ga.x = lerp(SLOT[a], SLOT[b], e); gb.x = lerp(SLOT[b], SLOT[a], e);
        ga.lift = Math.sin(e * Math.PI) * 28; gb.lift = -Math.sin(e * Math.PI) * 6;
        draw(ga); draw(gb);
        if (k >= 1) {
          pos = applicaScambi(pos, [[a, b]]);
          ga.lift = gb.lift = 0; draw(ga); draw(gb);
          idx++; t = 0;
          sfx({ freq: 2600, dur: 0.03, vol: 0.06, noise: 0.5 });
        }
      } else if (fase === 'rivela' && t >= 1.6) nuovoGiro();
    },
    key(e) {
      const m = /^(Digit|Numpad)([1-3])$/.exec(e.code);
      if (!m) return false;
      const slot = Number(m[2]) - 1;                 // 1-3 = posto da sinistra
      click(pos.indexOf(slot));
      return true;
    },
    summary: () => `${giuste} bicchieri trovati su ${domande}`,
    dispose() { card = null; },
  };
}

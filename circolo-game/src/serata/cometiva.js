// Brano 4 · Come ti va: in mezzo alla sala, da solo, più microgiochi possibile in 3 minuti e mezzo. Ognuno dura pochi
// secondi e sempre meno; ogni vittoria vale punti, le vittorie di fila di più. Tutti si giocano con mouse, dita o tastiera.
import { shuffle, lerp } from './regole.js';
import { pick, sfx, jingle } from '../minigames/util.js';

const CSS = `
  #srt .ctv { position: absolute; left: 50%; top: calc(50% + 20px); transform: translate(-50%, -50%); width: min(700px, calc(100% - 28px));
    max-height: calc(100% - 70px); overflow: hidden; text-align: center; }
  #srt .ctv .head { display: flex; justify-content: space-between; font: 600 14px var(--display, sans-serif); letter-spacing: .1em; text-transform: uppercase; color: #bba98a; }
  #srt .ctv .ist { font: 700 30px var(--display, sans-serif); text-transform: uppercase; color: #ffe100; margin: 6px 0 8px; }
  #srt .ctv .timer { height: 8px; background: rgba(255,255,255,.1); border-radius: 4px; overflow: hidden; margin-bottom: 14px; }
  #srt .ctv .timer div { height: 100%; background: linear-gradient(90deg, #ff17e4, #ffe100); }
  #srt .ctv .area { min-height: 190px; display: grid; place-items: center; position: relative; }
  #srt .ctv .opts { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
  #srt .ctv .opts button { font-size: 24px; min-width: 84px; padding: 12px 16px; }
  #srt .ctv .word { font: 700 64px var(--display, sans-serif); margin-bottom: 12px; }
  #srt .ctv .lettera { font: 700 110px/1 var(--display, sans-serif); color: #fff; margin-bottom: 10px; }
  #srt .ctv .track { position: relative; width: 100%; height: 40px; background: rgba(255,255,255,.08); border-radius: 6px; margin-bottom: 12px; }
  #srt .ctv .track .zone { position: absolute; top: 0; bottom: 0; background: rgba(47,162,74,.6); }
  #srt .ctv .track .mark { position: absolute; top: -4px; bottom: -4px; width: 6px; margin-left: -3px; background: #ffe100; border-radius: 3px; }
  #srt .ctv .grid { display: grid; gap: 8px; }
  #srt .ctv .grid button { font-size: 30px; width: 58px; height: 58px; padding: 0; }
  #srt .ctv .field { position: relative; width: 100%; height: 170px; }
  #srt .ctv .cig { position: absolute; width: 46px; height: 9px; border-radius: 2px; background: linear-gradient(90deg, #d98a3a 0 28%, #f4f1ea 28%); }
  #srt .ctv .cig::after { content: ''; position: absolute; right: -3px; top: 1px; width: 5px; height: 7px; border-radius: 2px; background: #ff5a1f; }
  #srt .ctv svg { display: block; }
  @media (max-height: 520px), (max-width: 700px) {
    #srt .ctv .ist { font-size: 20px; } #srt .ctv .area { min-height: 130px; } #srt .ctv .word { font-size: 40px; }
    #srt .ctv .lettera { font-size: 64px; } #srt .ctv .opts button { font-size: 17px; min-width: 60px; padding: 8px 10px; }
    #srt .ctv .grid button { width: 42px; height: 42px; font-size: 22px; } #srt .ctv .field { height: 110px; }
  }`;
let cssDone = false;

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const euro = (v) => `${v.toFixed(2).replace('.', ',')} €`;

// bicchiere in SVG: livello da 0 a 1
export function glassSvg(level, w = 60, color = '#c9243f') {
  const h = w * 1.35, y = 6 + (h - 12) * (1 - level);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><clipPath id="g${w}${Math.round(level * 100)}">
    <path d="M6 4 L${w - 6} 4 L${w - 12} ${h - 4} L12 ${h - 4} Z"/></clipPath></defs>
    <rect x="0" y="${y}" width="${w}" height="${h}" fill="${color}" clip-path="url(#g${w}${Math.round(level * 100)})" opacity=".9"/>
    <path d="M6 4 L${w - 6} 4 L${w - 12} ${h - 4} L12 ${h - 4} Z" fill="rgba(220,235,240,.12)" stroke="#e8f2f5" stroke-width="2.5"/></svg>`;
}

export function createCometiva(api) {
  const cfg = api.cfg.cometiva;
  if (!cssDone) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); cssDone = true; }
  let card = null, micro = null, t = 0, limit = cfg.tempoBase, elapsed = 0, vinti = 0, giocati = 0, serie = 0, pausa = 0, bag = [];

  const btn = (label, onClick, cls = '') => {
    const b = document.createElement('button');
    b.innerHTML = label;
    if (cls) b.className = cls;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    return b;
  };
  const opts = (list, correct, render = (x) => x) => {
    const d = document.createElement('div'); d.className = 'opts';
    shuffle(list).forEach((x) => d.append(btn(render(x), () => finish(x === correct))));
    return d;
  };

  // ogni microgioco: { ist, build(area) , key?(e), update?(dt) }
  const GIOCHI = {
    tasto() {
      const L = 'ASDFGHJKLQWERTYUP';
      const giusta = L[rnd(0, L.length - 1)];
      const altre = shuffle([...L].filter((x) => x !== giusta)).slice(0, 3);
      return {
        ist: 'Premi la lettera!',
        build(a) { a.innerHTML = `<div class="lettera">${giusta}</div>`; a.append(opts([giusta, ...altre], giusta)); },
        key(e) { if (/^Key[A-Z]$/.test(e.code)) { finish(e.code.slice(3) === giusta); return true; } return false; },
      };
    },
    pieno() {
      const n = rnd(4, 5), k = rnd(0, n - 1);
      const livelli = Array.from({ length: n }, (_, i) => (i === k ? 0.92 : pick([0, 0.2, 0.45, 0.6])));
      return {
        ist: 'Tocca il bicchiere pieno!',
        build(a) {
          const d = document.createElement('div'); d.className = 'opts';
          livelli.forEach((l, i) => d.append(btn(glassSvg(l, 56), () => finish(i === k))));
          a.append(d);
        },
      };
    },
    barra() {
      const z0 = 0.2 + Math.random() * 0.55, zw = 0.16, speed = 0.9 + Math.random() * 0.6;
      let x = 0, dir = 1, mark;
      const stop = () => finish(x >= z0 && x <= z0 + zw);
      return {
        ist: 'Ferma la barra nel verde!',
        build(a) {
          const d = document.createElement('div'); d.style.width = '100%';
          d.innerHTML = `<div class="track"><div class="zone" style="left:${z0 * 100}%;width:${zw * 100}%"></div><div class="mark"></div></div>`;
          mark = d.querySelector('.mark');
          d.append(btn('Stop! (Spazio)', stop, 'main'));
          a.append(d);
        },
        update(dt) {
          x += dir * speed * dt * (1 + giocati * 0.02);
          if (x > 1) { x = 1; dir = -1; } else if (x < 0) { x = 0; dir = 1; }
          mark.style.left = `${x * 100}%`;
        },
        key(e) { if (e.code === 'Space' || e.code === 'Enter') { stop(); return true; } return false; },
      };
    },
    colore() {
      const [parola] = pick(cfg.colori);
      const inchiostro = pick(cfg.colori.filter(([p]) => p !== parola));
      return {
        ist: 'Di che colore è scritta?',
        build(a) {
          const d = document.createElement('div');
          d.innerHTML = `<div class="word" style="color:${inchiostro[1]}">${parola}</div>`;
          d.append(opts(cfg.colori.map(([p]) => p), inchiostro[0]));
          a.append(d);
        },
      };
    },
    conta() {
      const n = rnd(3, 9);
      const scelte = shuffle([n, n + 1, n - 1, n + 2].filter((x) => x > 0)).slice(0, 3);
      if (!scelte.includes(n)) scelte[0] = n;
      return {
        ist: 'Quante sigarette?',
        build(a) {
          const d = document.createElement('div'); d.style.width = '100%';
          const f = document.createElement('div'); f.className = 'field';
          for (let i = 0; i < n; i++) {
            const c = document.createElement('div'); c.className = 'cig';
            Object.assign(c.style, { left: `${5 + Math.random() * 80}%`, top: `${8 + Math.random() * 80}%`, transform: `rotate(${rnd(-70, 70)}deg)` });
            f.append(c);
          }
          d.append(f, opts(scelte, n));
          a.append(d);
        },
        key(e) { const m = /^(Digit|Numpad)(\d)$/.exec(e.code); if (m) { finish(Number(m[2]) === n); return true; } return false; },
      };
    },
    brinda() {
      const need = 8 + Math.min(8, Math.floor(giocati / 4));
      let c = 0, lab;
      const hit = () => { c++; sfx({ freq: 2400, dur: 0.05, vol: 0.12, noise: 0.3 }); lab.textContent = `${c} / ${need}`; if (c >= need) finish(true); };
      return {
        ist: `Brinda ${need} volte!`,
        build(a) {
          const d = document.createElement('div');
          lab = document.createElement('div'); lab.className = 'word'; lab.textContent = `0 / ${need}`;
          d.append(lab, btn('Cin cin! (Spazio)', hit, 'main'));
          a.append(d);
        },
        key(e) { if (e.code === 'Space' && !e.repeat) { hit(); return true; } return false; },
      };
    },
    conto() {
      const [a1, p1] = pick(cfg.prezzi), [a2, p2] = pick(cfg.prezzi);
      const tot = Math.round((p1 + p2) * 100) / 100;
      const sbagli = shuffle([0.5, -0.5, 1, -1, 1.5, 2].map((x) => Math.round((tot + x) * 100) / 100).filter((x) => x > 0 && x !== tot)).slice(0, 2);
      return {
        ist: 'Fai il conto!',
        build(a) {
          const d = document.createElement('div');
          d.innerHTML = `<div class="word" style="font-size:40px">${a1} + ${a2}</div>`;
          d.append(opts([tot, ...sbagli], tot, euro));
          a.append(d);
        },
      };
    },
    intruso() {
      const [base, diverso] = pick([['♣', '♠'], ['O', 'Q'], ['6', '9'], ['b', 'd'], ['☾', '☽'], ['M', 'N']]);
      const n = 12, k = rnd(0, n - 1);
      return {
        ist: 'Trova l\'intruso!',
        build(a) {
          const g = document.createElement('div'); g.className = 'grid'; g.style.gridTemplateColumns = 'repeat(6, auto)';
          for (let i = 0; i < n; i++) g.append(btn(i === k ? diverso : base, () => finish(i === k)));
          a.append(g);
        },
      };
    },
  };

  function nextMicro() {
    if (!bag.length) bag = shuffle(Object.keys(GIOCHI));
    const id = bag.pop();
    micro = GIOCHI[id]();
    const k = Math.min(1, elapsed / (api.durata || 210));
    limit = lerp(cfg.tempoBase, cfg.tempoMin, k);
    t = 0;
    card.innerHTML = `<div class="head"><span>Gioco ${giocati + 1}</span><span>${vinti} vinti${serie > 1 ? ` · serie ×${serie}` : ''}</span></div>
      <div class="ist">${micro.ist}</div><div class="timer"><div></div></div><div class="area"></div>`;
    micro.build(card.querySelector('.area'));
  }

  function finish(ok) {
    if (!micro || pausa > 0) return;
    giocati++;
    serie = ok ? serie + 1 : 0;
    if (ok) {
      vinti++;
      const p = cfg.punti + Math.max(0, serie - 1) * cfg.bonusSerie;
      api.add(p);
      api.overlay.pop(`+${p}`, 0.6, '#7be08f');
      jingle([880, 1320], 0.07, 0.07);
      if (serie > 0 && serie % 4 === 0) api.say(api.npc, pick(cfg.kappa));
    } else {
      api.overlay.pop(t >= limit ? 'Tempo!' : 'No!', 0.6, '#ff8a70');
      sfx({ freq: 160, dur: 0.18, vol: 0.18, noise: 0.2, type: 'sawtooth' });
    }
    micro = null;
    pausa = 0.55;
    card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  }

  return {
    start() { card = api.overlay.el('', 'card ctv'); nextMicro(); },
    update(dt) {
      elapsed += dt;
      if (pausa > 0) { if ((pausa -= dt) <= 0) nextMicro(); return; }
      if (!micro) return;
      t += dt;
      micro.update?.(dt);
      const bar = card.querySelector('.timer div');
      if (bar) bar.style.width = `${Math.max(0, 1 - t / limit) * 100}%`;
      if (t >= limit) finish(false);
    },
    key(e) { return micro?.key?.(e) ?? false; },
    summary: () => `${vinti} giochi vinti su ${giocati}`,
    dispose() { card = null; },
  };
}

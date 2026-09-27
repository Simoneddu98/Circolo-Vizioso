// Brano 2 · Fumo: seduto al tavolino con la sigaretta, si ordina da mangiare per il tavolo. Per ogni richiesta:
// volantino (kebabbaro, pizzeria, hamburgeria) -> composizione -> telefonata al numero del volantino -> orario.
// Il cibo arriva sul tavolino all'orario scelto, anche mentre il brano va avanti. Clic sulla scena = un tiro.
import { shuffle, valutaRichiesta, orarioGiusto, bonusVelocitaOrdine, ora, cifre, daLocale } from './regole.js';
import { pick, sfx, jingle } from '../minigames/util.js';

const CSS = `
  #srt .cibo { position: absolute; right: 16px; top: 64px; bottom: 16px; width: min(560px, calc(100% - 32px)); overflow-y: auto; }
  #srt .cibo .req { display: flex; gap: 10px; align-items: baseline; margin-bottom: 10px; }
  #srt .cibo .req .who { font: 700 15px var(--display, sans-serif); color: #ffe100; text-transform: uppercase; letter-spacing: .08em; white-space: nowrap; }
  #srt .cibo .req .txt { font-size: 17px; line-height: 1.35; }
  #srt .cibo .clock { float: right; font: 600 15px var(--display, sans-serif); color: #bba98a; }
  #srt .flyers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  #srt .flyer { border-radius: 8px; padding: 12px 10px 10px; cursor: pointer; text-align: center; color: #1b120b; transform: rotate(var(--r));
    box-shadow: 0 8px 20px rgba(0,0,0,.45); border: 3px solid var(--c); transition: transform .15s; min-height: 170px;
    display: flex; flex-direction: column; justify-content: space-between; background-size: cover; background-position: center; }
  #srt .flyer:hover, #srt .flyer:focus-visible { transform: rotate(0) scale(1.04); outline: none; }
  #srt .flyer .n { font: 700 21px/1.05 var(--display, sans-serif); text-transform: uppercase; color: var(--c); }
  #srt .flyer .m { font-size: 13px; font-style: italic; }
  #srt .flyer .menu { font-size: 12px; line-height: 1.3; margin: 6px 0; }
  #srt .flyer .tel { font: 700 17px var(--display, sans-serif); background: var(--c); color: #fff; border-radius: 4px; padding: 3px 4px; }
  #srt .flyer .k { font: 600 12px var(--display, sans-serif); opacity: .6; }
  #srt .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 12px; }
  #srt .chips button { text-transform: none; font-family: var(--body, sans-serif); font-size: 15px; padding: 6px 11px; }
  #srt .phone { display: grid; grid-template-columns: repeat(3, 72px); gap: 8px; justify-content: center; margin: 8px 0 10px; }
  #srt .phone button { height: 54px; font-size: 22px; border-radius: 27px; }
  #srt .display { text-align: center; font: 600 30px var(--display, sans-serif); letter-spacing: .08em; min-height: 42px; color: #fff;
    background: #0b0b0e; border-radius: 8px; padding: 4px 8px; margin-bottom: 6px; }
  #srt .note { font-size: 14px; color: #bba98a; text-align: center; margin-bottom: 4px; }
  #srt .slots { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
  #srt .slots button { font-size: 20px; padding: 12px 4px; }
  #srt .res li { font-size: 16px; line-height: 1.5; }
  #srt .res .ok { color: #7be08f; } #srt .res .ko { color: #ff8a70; }
  @media (max-height: 520px), (max-width: 700px) {
    #srt .cibo { top: 40px; bottom: 6px; right: 6px; }
    #srt .flyer { min-height: 120px; padding: 6px; } #srt .flyer .n { font-size: 15px; } #srt .flyer .menu { display: none; }
    #srt .phone { grid-template-columns: repeat(3, 56px); gap: 5px; } #srt .phone button { height: 40px; font-size: 17px; }
    #srt .display { font-size: 20px; min-height: 30px; } #srt .cibo .req .txt { font-size: 14px; }
  }`;
let cssDone = false;

export function createCibo(api) {
  const cfg = api.cfg.cibo;
  const P = cfg.punti;
  if (!cssDone) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); cssDone = true; }
  const [tu, ...altri] = cfg.richieste;
  const coda = [tu, ...shuffle(altri)];
  let elapsed = 0, box = null, ordine = null, n = 0, fatti = 0, arrivati = 0;
  const consegne = [];                          // { at, locale, scelta, chi, ok }

  const minuti = (sec) => cfg.orologio.inizio + sec * cfg.orologio.minutiPerSecondo;

  function header() {
    const r = ordine.richiesta;
    return `<span class="clock">${ora(minuti(elapsed))}</span><h3>Ordine ${n} · ${r.chi === 'Tu' ? 'per te' : `per ${r.chi}`}</h3>
      <div class="req"><span class="who">${r.chi}</span><span class="txt">«${r.testo}»</span></div>`;
  }

  function nuovoOrdine() {
    if (!coda.length) coda.push(...shuffle(altri));
    n++;
    ordine = { richiesta: coda.shift(), t0: elapsed, locale: null, scelta: null, errori: 0, numero: '' };
    step('volantino');
  }

  function step(s) {
    ordine.step = s;
    box.innerHTML = header();
    if (s === 'volantino') volantini();
    else if (s === 'componi') componi();
    else if (s === 'telefono') telefono();
    else if (s === 'orario') orario();
  }

  function volantini() {
    const wrap = document.createElement('div');
    wrap.className = 'flyers';
    cfg.locali.forEach((l, k) => {
      const f = document.createElement('div');
      f.className = 'flyer';
      f.tabIndex = 0;
      f.style.setProperty('--c', l.colore);
      f.style.setProperty('--r', `${[-2.5, 1.5, -1][k]}deg`);
      f.style.background = l.immagine ? `url(${l.immagine}) center/cover` : l.fondo;
      f.innerHTML = l.immagine ? `<span class="k">${k + 1}</span>`
        : `<div><div class="k">${k + 1}</div><div class="n">${l.nome}</div><div class="m">${l.motto}</div></div>
          <div class="menu">${[...l.carni, ...l.extra].slice(0, 7).map((x) => x.nome).join(' · ')}</div><div class="tel">☎ ${l.tel}</div>`;
      f.addEventListener('click', (e) => { e.stopPropagation(); scegliLocale(k); });
      wrap.append(f);
    });
    box.append(wrap);
  }

  function scegliLocale(k) {
    if (ordine.step !== 'volantino') return;
    const l = cfg.locali[k];
    ordine.locale = l;
    ordine.scelta = { base: l.basi[0].id, carne: l.carni[0].id, extra: [] };
    sfx({ freq: 900, dur: 0.05, vol: 0.12, noise: 0.8 });
    step('componi');
  }

  function componi() {
    const l = ordine.locale, sc = ordine.scelta;
    const d = document.createElement('div');
    const group = (title, list, isOn, toggle) => {
      const h = document.createElement('h3'); h.textContent = title;
      const c = document.createElement('div'); c.className = 'chips';
      for (const it of list) {
        const b = document.createElement('button');
        b.textContent = it.nome;
        b.className = isOn(it.id) ? 'on' : '';
        b.addEventListener('click', (e) => { e.stopPropagation(); toggle(it.id); step('componi'); });
        c.append(b);
      }
      d.append(h, c);
    };
    const h = document.createElement('h2'); h.textContent = l.nome; d.append(h);
    group(l.id === 'pizza' ? 'Pizza' : 'Base', l.basi, (id) => sc.base === id, (id) => { sc.base = id; });
    group(l.id === 'pizza' ? 'Carne' : 'Ripieno', l.carni, (id) => sc.carne === id, (id) => { sc.carne = id; });
    group('Aggiunte', l.extra, (id) => sc.extra.includes(id), (id) => {
      sc.extra = sc.extra.includes(id) ? sc.extra.filter((x) => x !== id) : [...sc.extra, id];
    });
    const row = document.createElement('div'); row.className = 'row';
    const back = document.createElement('button'); back.textContent = '← Volantini';
    back.addEventListener('click', (e) => { e.stopPropagation(); step('volantino'); });
    const go = document.createElement('button'); go.className = 'main'; go.textContent = 'Chiama per ordinare ☎';
    go.addEventListener('click', (e) => { e.stopPropagation(); step('telefono'); });
    row.append(back, go); d.append(row);
    box.append(d);
  }

  function telefono() {
    const l = ordine.locale;
    const d = document.createElement('div');
    d.innerHTML = `<p class="note">Il numero è sul volantino di <b>${l.nome}</b>: ${l.tel}</p><div class="display"></div><div class="phone"></div>
      <div class="row" style="justify-content:center"></div>`;
    const disp = d.querySelector('.display'), pad = d.querySelector('.phone'), row = d.querySelector('.row');
    const show = () => { disp.textContent = ordine.numero || ' '; };
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '☎']) {
      const b = document.createElement('button');
      b.textContent = k;
      if (k === '☎') b.className = 'ok';
      b.addEventListener('click', (e) => { e.stopPropagation(); tasto(k); });
      pad.append(b);
    }
    const back = document.createElement('button'); back.textContent = '← Cambia ordine';
    back.addEventListener('click', (e) => { e.stopPropagation(); step('componi'); });
    row.append(back);
    ordine.showNumero = show;
    show();
    box.append(d);
  }

  function tasto(k) {
    if (ordine.step !== 'telefono') return;
    if (k === '⌫') ordine.numero = ordine.numero.slice(0, -1);
    else if (k === '☎') { chiama(); return; }
    else if (cifre(ordine.numero).length < 12) {
      ordine.numero += k;
      sfx({ freq: 700 + Number(k) * 90, dur: 0.09, vol: 0.12, noise: 0, type: 'sine' });
    }
    ordine.showNumero?.();
  }

  function chiama() {
    if (cifre(ordine.numero) === cifre(ordine.locale.tel)) {
      jingle([440, 440], 0.35, 0.08);
      api.say(ordine.locale.nome, pick(['Pronto, dimmi tutto.', 'Pronto! Cosa ti porto?', 'Sì, pronto, ordinazione?']));
      step('orario');
    } else {
      ordine.errori++;
      ordine.numero = '';
      jingle([950, 1400, 1800], 0.18, 0.08);
      api.overlay.pop('Il numero selezionato è inesistente', 1.6, '#ff8a70');
      ordine.showNumero?.();
    }
  }

  function orario() {
    const d = document.createElement('div');
    const now = minuti(elapsed);
    d.innerHTML = `<h3>Per che ora?</h3><div class="slots"></div>`;
    const s = d.querySelector('.slots');
    cfg.orari.forEach((m, k) => {
      const b = document.createElement('button');
      b.textContent = ora(Math.ceil((now + m) / 5) * 5);
      b.addEventListener('click', (e) => { e.stopPropagation(); conferma(k); });
      s.append(b);
    });
    box.append(d);
  }

  function conferma(k) {
    if (ordine.step !== 'orario') return;
    const r = ordine.richiesta;
    const val = valutaRichiesta(r, ordine.locale, ordine.scelta, P);
    const sec = elapsed - ordine.t0;
    const vel = bonusVelocitaOrdine(sec, cfg.tempoVelocita, P.velocita);
    const numero = ordine.errori === 0 ? P.numero : 0;
    const orarioOk = orarioGiusto(r.quando, k, cfg.orari.length);
    const tot = Math.max(0, P.ordine + val.punti + vel + numero + (orarioOk ? P.orario : 0));
    api.add(tot);
    fatti++;
    const at = elapsed + cfg.orari[k] / cfg.orologio.minutiPerSecondo;
    consegne.push({ at, locale: ordine.locale.id, scelta: ordine.scelta, chi: r.chi });
    const voci = [...val.voci, { ok: ordine.errori === 0, testo: ordine.errori ? `numero sbagliato ${ordine.errori} volte` : 'numero giusto al primo colpo' },
      { ok: orarioOk, testo: r.quando ? `orario ${r.quando === 'presto' ? 'presto' : 'dopo la partita'}` : 'orario' },
      { ok: vel > 0, testo: `ordinato in ${Math.round(sec)} s` }];
    box.innerHTML = header() + `<h2>+${tot}</h2><ul class="res">${voci.map((v) => `<li class="${v.ok ? 'ok' : 'ko'}">${v.ok ? '✓' : '✗'} ${v.testo}</li>`).join('')}</ul>
      <p>Arriva alle ${ora(Math.ceil((minuti(ordine.t0 + sec) + cfg.orari[k]) / 5) * 5)} ${daLocale(ordine.locale.id)}.</p>`;
    ordine.step = 'fatto';
    api.overlay.pop(`+${tot}`, 1, '#7be08f');
    setTimeout(() => { if (box?.isConnected && ordine?.step === 'fatto') nuovoOrdine(); }, 2600);
  }

  return {
    start() {
      box = api.overlay.el('', 'card cibo');
      nuovoOrdine();
    },
    update(dt) {
      elapsed += dt;
      const c = box?.querySelector('.clock');
      if (c) c.textContent = ora(minuti(elapsed));
      for (const o of consegne) {
        if (o.done || elapsed < o.at) continue;
        o.done = true;
        arrivati++;
        api.add(P.arrivato);
        api.food?.deliver(o.locale, o.scelta);
        api.say('Rider', `${pick(cfg.consegna)} ${o.chi === 'Tu' ? 'È il tuo.' : `È per ${o.chi}.`}`);
        api.overlay.pop(`Consegna! +${P.arrivato}`, 1.4, '#ffe100');
        jingle([660, 880], 0.14, 0.08);
      }
    },
    key(e) {
      if (!ordine) return false;
      if (ordine.step === 'volantino' && /^Digit[1-3]$/.test(e.code)) { scegliLocale(Number(e.code.slice(5)) - 1); return true; }
      if (ordine.step === 'telefono') {
        if (/^(Digit|Numpad)\d$/.test(e.code)) { tasto(e.code.slice(-1)); return true; }
        if (e.code === 'Backspace') { tasto('⌫'); return true; }
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { tasto('☎'); return true; }
      }
      if (ordine.step === 'orario' && /^Digit[1-4]$/.test(e.code)) { conferma(Number(e.code.slice(5)) - 1); return true; }
      return false;
    },
    summary: () => `${fatti} ordini, ${arrivati} arrivati in tempo`,
    dispose() { box = null; },
  };
}

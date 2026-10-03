// "La storia", capitolo 3: la scatola nera sul biliardo. Domande "esistenziali" su ciò di cui conosciamo l'inizio e la
// fine ma non il mezzo. Si scrive la propria idea (o si salta), poi si leggono quelle di chi è passato prima. Nessun
// tempo che corre: si scrive con calma. Le idee si raccolgono in src/storia/idee.js.
import { shuffle } from '../serata/regole.js';

const CSS = `
  #srt .scatola { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(720px, calc(100% - 28px));
    max-height: calc(100% - 40px); overflow-y: auto; }
  #srt .scatola .flow { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; margin: 6px 0 14px; }
  #srt .scatola .end { background: rgba(255,255,255,.06); border: 1px solid rgba(241,230,210,.25); border-radius: 8px; padding: 10px 12px; font-size: 16px; }
  #srt .scatola .end small { display: block; font: 600 12px var(--display, sans-serif); letter-spacing: .12em; text-transform: uppercase; color: #e6be78; margin-bottom: 4px; }
  #srt .scatola .box { width: 96px; height: 76px; background: #050507; border-radius: 6px; display: grid; place-items: center;
    box-shadow: 0 0 0 1px #333, 0 0 26px rgba(255,23,228,.35); color: #ff17e4; font: 700 14px var(--display, sans-serif); letter-spacing: .1em; text-align: center; }
  #srt .scatola .q { font: 600 21px/1.35 var(--body, sans-serif); margin: 0 0 12px; color: #fff; }
  #srt .scatola textarea { width: 100%; min-height: 84px; resize: vertical; border-radius: 8px; border: 1px solid rgba(230,190,120,.5);
    background: rgba(0,0,0,.45); color: #f1e6d2; font: 17px/1.4 var(--body, sans-serif); padding: 10px 12px; }
  #srt .scatola textarea:focus { outline: 2px solid #ff17e4; }
  #srt .scatola .count { font-size: 13px; color: #bba98a; text-align: right; margin: 4px 0 10px; }
  #srt .scatola .idee { display: grid; gap: 8px; margin: 6px 0 14px; }
  #srt .scatola .idea { background: rgba(255,255,255,.06); border-left: 3px solid #ff17e4; border-radius: 4px; padding: 8px 12px; font-size: 16px; line-height: 1.4; }
  #srt .scatola .idea b { display: block; font: 600 12px var(--display, sans-serif); letter-spacing: .1em; text-transform: uppercase; color: #e6be78; }
  #srt .scatola .idea.mia { border-left-color: #ffe100; }
  @media (max-height: 520px), (max-width: 700px) {
    #srt .scatola .q { font-size: 15px; } #srt .scatola textarea { min-height: 54px; font-size: 14px; }
    #srt .scatola .end { font-size: 13px; padding: 6px 8px; } #srt .scatola .box { width: 60px; height: 48px; font-size: 10px; }
  }`;
let cssDone = false;

export function createScatola(api) {
  const cfg = api.cfg;                       // STORIA.blackbox
  if (!cssDone) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); cssDone = true; }
  const domande = shuffle(cfg.domande).slice(0, cfg.quante);
  let i = -1, card = null, scritte = 0;

  const el = (html) => { card.innerHTML = html; };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function next() {
    i++;
    if (i >= domande.length) { api.finish({ scritte, domande: domande.length }); return; }
    const d = domande[i];
    el(`<h3>${cfg.titolo} · ${i + 1} / ${domande.length}</h3>
      <div class="flow"><div class="end"><small>Inizio</small>${esc(d.inizio)}</div><div class="box">BLACK<br>BOX</div><div class="end"><small>Fine</small>${esc(d.fine)}</div></div>
      <p class="q">${esc(d.domanda)}</p>
      <textarea maxlength="${cfg.lunghezza}" placeholder="${esc(cfg.placeholder)}"></textarea><div class="count">0 / ${cfg.lunghezza}</div>
      <div class="row"><button class="main" data-a="invia">${cfg.invia}</button><button data-a="salta">${cfg.salta}</button></div>`);
    const ta = card.querySelector('textarea'), count = card.querySelector('.count');
    ta.addEventListener('input', () => { count.textContent = `${ta.value.length} / ${cfg.lunghezza}`; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(ta.value); } });
    card.querySelector('[data-a="invia"]').addEventListener('click', () => invia(ta.value));
    card.querySelector('[data-a="salta"]').addEventListener('click', () => mostraAltri(null));
    setTimeout(() => ta.focus(), 50);
  }

  async function invia(testo) {
    const ok = await api.idee.invia(domande[i].id, testo);
    if (!ok) { api.overlay.pop(cfg.troppoCorta, 1.4, '#ff8a70'); return; }
    scritte++;
    mostraAltri(testo.trim());
  }

  async function mostraAltri(mia) {
    const d = domande[i];
    el(`<h3>${cfg.titolo} · ${i + 1} / ${domande.length}</h3><p class="q">${esc(d.domanda)}</p><p>${cfg.altri}</p><div class="idee">…</div>
      <div class="row"><button class="main" data-a="avanti">${i + 1 < domande.length ? cfg.avanti : cfg.chiudi}</button></div>`);
    card.querySelector('[data-a="avanti"]').addEventListener('click', next);
    const altri = await api.idee.leggi(d.id, 4);
    const box = card.querySelector('.idee');
    if (!box) return;
    box.innerHTML = (mia ? `<div class="idea mia"><b>${cfg.tu}</b>${esc(mia)}</div>` : '')
      + (altri.length ? altri.map((x) => `<div class="idea"><b>${esc(x.chi ?? cfg.qualcuno)}</b>${esc(x.testo)}</div>`).join('')
        : `<p style="opacity:.8">${cfg.vuota}</p>`);
    if (!altri.length) card.querySelector('.idee').previousElementSibling.hidden = true;   // niente "ci sono già le idee di…"
  }

  return {
    start() { card = api.overlay.el('', 'card scatola'); next(); },
    update() {},
    key() { return false; },
    summary: () => `${scritte} idee lasciate nella scatola`,
    dispose() { card = null; },
  };
}

// Schermata iniziale: "Ho un codice" apre un riquadro dove si scrive il codice dei giochi plus. Elenca anche i plus già
// sbloccati su questo dispositivo. Stili e elementi sono creati qui, la logica è in plus.js.

const CSS = `
  #plus-open { margin-top: 14px; background: none; border: 0; border-bottom: 1px dashed rgba(217,170,69,.6); color: var(--tobacco-soft, #d9aa45);
    font: 600 15px var(--display, sans-serif); letter-spacing: .08em; text-transform: uppercase; padding: 2px 0; cursor: pointer; }
  #plus-open:hover { color: #fff; border-bottom-color: #fff; }
  #plus-sbloccati { margin: 10px 0 0; font: 15px var(--body, sans-serif); color: #7be08f; }
  #plus-box { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(0,0,0,.72); padding: 16px; }
  #plus-box[hidden] { display: none; }
  #plus-box .card { width: min(440px, 100%); background: #14091c; border: 2px solid rgba(217,170,69,.7); border-radius: 10px; padding: 20px 20px 16px;
    color: #f4f2fa; font-family: var(--body, sans-serif); box-shadow: 0 20px 60px rgba(0,0,0,.7); }
  #plus-box h2 { margin: 0 0 6px; font: 700 22px var(--display, sans-serif); letter-spacing: .08em; text-transform: uppercase; }
  #plus-box p { margin: 0 0 12px; font-size: 16px; line-height: 1.4; opacity: .9; }
  #plus-box input { width: 100%; box-sizing: border-box; padding: 12px 14px; font: 700 22px ui-monospace, Menlo, monospace; letter-spacing: .14em;
    text-transform: uppercase; text-align: center; color: #fff; background: #0b0510; border: 2px solid rgba(176,74,224,.8); border-radius: 8px; }
  #plus-box input:focus { outline: none; border-color: #ffe100; }
  #plus-box .esito { min-height: 22px; margin: 10px 0 0; font-size: 15px; }
  #plus-box .esito.ko { color: #ff8a70; } #plus-box .esito.ok { color: #7be08f; }
  #plus-box .azioni { display: flex; gap: 10px; margin-top: 12px; justify-content: flex-end; }
  #plus-box .azioni button { padding: 10px 18px; font: 600 16px var(--display, sans-serif); letter-spacing: .06em; text-transform: uppercase; cursor: pointer;
    border-radius: 8px; border: 2px solid rgba(217,170,69,.6); background: transparent; color: #f1e6d2; }
  #plus-box .azioni button.si { background: linear-gradient(180deg, #c93cf0, #7a1fa0); border-color: #ffe100; color: #fff; }
  #plus-box .azioni button:disabled { opacity: .5; cursor: progress; }`;

export function creaPlusUI(plus, { testi, onSbloccato } = {}) {
  if (!plus.attivo) return null;                       // senza collegamento al database il pulsante non compare
  const T = { apri: 'Ho un codice', titolo: 'Gioco plus', testo: 'Scrivi il codice che hai ricevuto. Vale per un solo dispositivo.',
    segnaposto: 'XXXXX-XXXXX', conferma: 'Sblocca', chiudi: 'Chiudi', controllo: 'Controllo…', ok: 'Sbloccato: {nome}', sbloccati: 'Sbloccati: {elenco}', ...testi };
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);

  const anchor = document.querySelector('#start .modes');
  const apri = document.createElement('button');
  apri.id = 'plus-open'; apri.type = 'button'; apri.textContent = T.apri;
  const elenco = document.createElement('p');
  elenco.id = 'plus-sbloccati';
  anchor?.after(apri);
  apri.after(elenco);

  const box = document.createElement('div');
  box.id = 'plus-box'; box.hidden = true;
  box.innerHTML = `<form class="card" autocomplete="off"><h2></h2><p></p>
    <input type="text" maxlength="24" spellcheck="false" autocapitalize="characters" aria-label="Codice">
    <div class="esito" role="status"></div>
    <div class="azioni"><button type="button" class="no"></button><button type="submit" class="si"></button></div></form>`;
  document.body.appendChild(box);
  const q = (sel) => box.querySelector(sel);
  q('h2').textContent = T.titolo; q('p').textContent = T.testo; q('input').placeholder = T.segnaposto;
  q('.no').textContent = T.chiudi; q('.si').textContent = T.conferma;

  const aggiorna = () => {
    elenco.textContent = plus.sbloccati.length ? T.sbloccati.replace('{elenco}', plus.sbloccati.map((l) => plus.nome(l)).join(', ')) : '';
  };
  const chiudi = () => { box.hidden = true; };
  const mostra = (testo, tipo = '') => { const e = q('.esito'); e.textContent = testo; e.className = `esito ${tipo}`; };

  apri.addEventListener('click', () => { mostra(''); q('input').value = ''; box.hidden = false; q('input').focus(); });
  q('.no').addEventListener('click', chiudi);
  box.addEventListener('click', (e) => { if (e.target === box) chiudi(); });
  box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') chiudi(); });   // i tasti non arrivano al gioco
  q('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bottone = q('.si');
    bottone.disabled = true; mostra(T.controllo);
    const r = await plus.riscatta(q('input').value);
    bottone.disabled = false;
    if (!r.ok) { mostra(plus.messaggio(r.errore), 'ko'); return; }
    mostra(T.ok.replace('{nome}', plus.nome(r.lotto)), 'ok');
    aggiorna();
    onSbloccato?.(r.lotto);
  });

  aggiorna();
  plus.riconferma().then(aggiorna);                     // un codice sganciato o rifiutato sparisce dall'elenco
  return { aggiorna };
}

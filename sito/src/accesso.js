// Chi può giocare a cosa, e quando. Una sola tabella (`SBLOCCHI`): ogni contenuto ancora da uscire è "chiuso" finché non
// arriva la sua data (o finché non lo apri a mano). La MODALITÀ PROVA li apre tutti, solo su questo dispositivo: si accende
// con ?prova=1 nel link (?prova=0 la spegne) o toccando cinque volte il logo nella schermata iniziale, e si ricorda.
// È un blocco "di cortesia": su un sito statico non esiste protezione vera, chi guarda il codice può aggirarlo.

export const SBLOCCHI = {
  cinema:   { da: null },                      // il primo singolo: aperto
  blackbox: { da: '2099-01-01T00:00:00+01:00' },   // il secondo singolo: la data vera sostituisce questa
  serata:   { da: '2099-01-01T00:00:00+01:00' },   // la serata a cinque brani (menu "La serata")
};

const KEY = 'circolo.prova';
let prova = false;
try {
  const q = new URLSearchParams(location.search).get('prova');
  if (q === '1') localStorage.setItem(KEY, '1'); else if (q === '0') localStorage.removeItem(KEY);
  prova = localStorage.getItem(KEY) === '1';
} catch { /* senza localStorage la prova si accende solo con il link */ prova = new URLSearchParams(location.search).get('prova') === '1'; }

export const inProva = () => prova;
export function impostaProva(v) {
  prova = !!v;
  try { prova ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch { /* ok */ }
}

// vero se il contenuto si può giocare adesso
export function aperto(id, adesso = Date.now()) {
  if (prova) return true;
  const s = SBLOCCHI[id];
  if (!s) return true;
  return s.da === null || adesso >= Date.parse(s.da);
}

// Cinque tocchi sul logo (entro 3 secondi) accendono o spengono la prova; un'etichetta lo mostra
export function legaProvaAlLogo(el, onChange) {
  if (!el) return;
  let n = 0, t = 0;
  el.addEventListener('click', () => {
    const ora = Date.now();
    n = ora - t > 3000 ? 1 : n + 1; t = ora;
    if (n >= 5) { n = 0; impostaProva(!prova); onChange?.(prova); }
  });
}

export function mostraEtichettaProva() {
  let e = document.getElementById('prova-tag');
  if (!prova) { e?.remove(); return; }
  if (!e) {
    e = document.createElement('div');
    e.id = 'prova-tag'; e.textContent = 'PROVA';
    e.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:96;padding:2px 8px;border-radius:6px;font:700 12px sans-serif;letter-spacing:.12em;color:#07030c;background:#ffe100;opacity:.85;pointer-events:none';
    document.body.appendChild(e);
  }
}

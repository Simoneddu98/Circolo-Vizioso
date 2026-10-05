// Sblocco dell'audio su telefono. Su iPhone il Web Audio tace con l'interruttore silenzioso e resta sospeso finché un
// tocco non lo riattiva: qui si chiede la sessione "playback" (iOS 17+) e, per i telefoni più vecchi, si tiene acceso un
// <audio> muto (un elemento media fa suonare anche con il silenzioso). Va chiamato da un gesto dell'utente.

let elemento = null;
// WAV muto di 0,1 s (8 kHz, 8 bit): basta a far passare la pagina per "riproduce audio"
const MUTO = 'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAACAgICAgICAgICAgICAgICA';

export function sbloccaAudio(ctx) {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* non supportato */ }
  try {
    if (!elemento) {
      elemento = new Audio(MUTO);
      elemento.loop = true; elemento.preload = 'auto'; elemento.setAttribute('playsinline', '');
    }
    elemento.play()?.catch(() => {});
  } catch { /* nessun elemento audio */ }
  if (ctx && ctx.state !== 'running') {
    ctx.resume().catch(() => {});
    try {                                                      // un suono vuoto dentro il gesto: sveglia l'uscita
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch { /* ok */ }
  }
}

// Se l'audio resta sospeso (il tocco giusto non c'è stato), al prossimo tocco si riprova
export function riprovaAlTocco(ctx) {
  if (!ctx || ctx.state === 'running') return;
  const f = () => { sbloccaAudio(ctx); if (ctx.state === 'running') off(); };
  const off = () => { for (const e of ['pointerdown', 'touchend', 'keydown']) removeEventListener(e, f, true); };
  for (const e of ['pointerdown', 'touchend', 'keydown']) addEventListener(e, f, true);
}

// ------------------------------------------------------------------ tasto audio (vale per tutto il gioco)

const MUTO_KEY = 'circolo.audio.muto';
const ascoltatori = new Set();
let muto = false;
try { muto = localStorage.getItem(MUTO_KEY) === '1'; } catch { /* senza localStorage resta acceso */ }

export const audioMuto = () => muto;
export function suAudioMuto(fn) { ascoltatori.add(fn); return () => ascoltatori.delete(fn); }
export function impostaMuto(v) {
  muto = !!v;
  try { localStorage.setItem(MUTO_KEY, muto ? '1' : '0'); } catch { /* ok */ }
  for (const f of ascoltatori) f(muto);
}

// Pulsante fisso in alto a destra, sopra anche al jukebox. I tasti del gioco non arrivano al pulsante (Spazio lo attiverebbe).
export function creaTastoAudio() {
  if (document.getElementById('audio-tasto')) return;
  const s = document.createElement('style');
  s.textContent = `#audio-tasto { position: fixed; top: max(10px, env(safe-area-inset-top)); right: 10px; z-index: 95; width: 42px; height: 42px;
    border-radius: 50%; border: 2px solid rgba(217,170,69,.7); background: rgba(20,9,28,.78); color: #f1e6d2; cursor: pointer; padding: 0;
    display: grid; place-items: center; -webkit-tap-highlight-color: transparent; }
    #audio-tasto svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    #audio-tasto[aria-pressed="true"] { color: #ff8a70; border-color: rgba(255,138,112,.8); }`;
  document.head.appendChild(s);
  const b = document.createElement('button');
  b.id = 'audio-tasto'; b.type = 'button';
  const disegna = () => {
    b.setAttribute('aria-pressed', String(muto));
    b.setAttribute('aria-label', muto ? 'Attiva l\'audio' : 'Disattiva l\'audio');
    b.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>${muto
      ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>'}</svg>`;
  };
  b.addEventListener('click', () => { impostaMuto(!muto); sbloccaAudio(); });
  for (const e of ['keydown', 'keyup']) b.addEventListener(e, (ev) => ev.stopPropagation());
  b.addEventListener('pointerup', () => b.blur());
  suAudioMuto(disegna);
  disegna();
  document.body.appendChild(b);
}

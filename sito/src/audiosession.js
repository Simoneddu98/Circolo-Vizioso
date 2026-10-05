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

// Logica pura dei giochi della serata (niente DOM, niente three.js): si prova con `npm test`.

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Risposte mescolate: restituisce { testi, giusta } con l'indice della risposta giusta dopo il mescolamento
export function mescolaRisposte(risposte, giusta = 0, rng = Math.random) {
  const idx = shuffle(risposte.map((_, i) => i), rng);
  return { testi: idx.map((i) => risposte[i]), giusta: idx.indexOf(giusta) };
}

// Punti di una risposta: base + bonus di velocità (tempo che restava / tempo totale) + bonus per la serie
export function puntiRisposta({ giusta, restante, totale, serie, punti, bonusVelocita, bonusSerie = 0 }) {
  if (!giusta) return 0;
  const vel = Math.round(bonusVelocita * Math.max(0, Math.min(1, restante / totale)));
  return punti + vel + Math.max(0, serie - 1) * bonusSerie;
}

// ------------------------------------------------------------------ cibo

// tag dell'ordine composto: base + carne + extra scelti
export function tagOrdine(locale, scelta) {
  const tags = new Set();
  const add = (list, id) => { for (const t of list.find((x) => x.id === id)?.tag ?? []) tags.add(t); };
  add(locale.basi, scelta.base);
  add(locale.carni, scelta.carne);
  for (const e of scelta.extra ?? []) add(locale.extra, e);
  return tags;
}

// Quanto rispetta la richiesta: elenco di { ok, testo } (uno per vincolo) e i punti
export function valutaRichiesta(richiesta, locale, scelta, p) {
  const tags = tagOrdine(locale, scelta);
  const voci = [];
  if (richiesta.locale) voci.push({ ok: locale.id === richiesta.locale, testo: daLocale(richiesta.locale) });
  for (const t of richiesta.serve ?? []) voci.push({ ok: tags.has(t), testo: `con ${t}` });
  for (const t of richiesta.evita ?? []) voci.push({ ok: !tags.has(t), testo: `senza ${t}` });
  if (richiesta.almeno) voci.push({ ok: (scelta.extra?.length ?? 0) >= richiesta.almeno, testo: `almeno ${richiesta.almeno} aggiunte` });
  const punti = voci.reduce((s, v) => s + (v.ok ? p.rispettata : p.violata), 0);
  return { voci, punti };
}

const DA = { kebab: 'dal kebabbaro', pizza: 'dalla pizzeria', burger: 'dall\'hamburgeria' };
export const daLocale = (id) => DA[id] ?? id;

// orario giusto: 'presto' = uno dei primi due, 'tardi' = uno degli ultimi due; nessuna richiesta = va bene tutto
export function orarioGiusto(quando, indice, n) {
  if (!quando) return true;
  return quando === 'presto' ? indice < Math.ceil(n / 2) : indice >= Math.floor(n / 2);
}

// bonus velocità di un ordine: pieno sotto `soglia` secondi, poi cala fino a zero al doppio del tempo
export function bonusVelocitaOrdine(sec, soglia, max) {
  if (sec <= soglia) return max;
  return Math.max(0, Math.round(max * (1 - (sec - soglia) / soglia)));
}

// orologio del gioco: minuti dall'inizio della serata -> "21:05"
export function ora(minuti) {
  const m = Math.round(minuti) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// numero composto sul telefono: solo le cifre contano
export const cifre = (s) => s.replace(/\D/g, '');

// ------------------------------------------------------------------ scatola nera

// ordine dato dal giocatore (indici dei passaggi mescolati) -> giusto se rimette i passaggi nell'ordine originale
export function ordineGiusto(scelti, mescolati) {
  return scelti.length === mescolati.length && scelti.every((i, k) => mescolati[i] === k);
}

// ------------------------------------------------------------------ bicchieri

// sequenza di scambi fra le tre posizioni: [a, b] con a != b
export function scambi(n, rng = Math.random) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor(rng() * 3);
    const b = (a + 1 + Math.floor(rng() * 2)) % 3;
    out.push([a, b]);
  }
  return out;
}

// posizione finale di ogni bicchiere: pos[bicchiere] = posto, dopo gli scambi dei posti
export function applicaScambi(pos, lista) {
  const p = [...pos];
  for (const [a, b] of lista) {
    const ia = p.indexOf(a), ib = p.indexOf(b);
    p[ia] = b; p[ib] = a;
  }
  return p;
}

// parametro di difficoltà da 0 a 1 in base al giro
export const difficolta = (giro, max) => Math.min(1, giro / Math.max(1, max));
export const lerp = (a, b, k) => a + (b - a) * k;

// ------------------------------------------------------------------ punti in euro a fine serata

export function euroDaPunti(punti, perPunti, max) {
  return Math.min(max, Math.floor(Math.max(0, punti) / perPunti));
}

// ------------------------------------------------------------------ spettacolo finale

// punto sull'anello a distanza s (m) dal punto di partenza, verso di percorrenza antiorario visto dall'alto
export function anello({ x: [x0, x1], z: [z0, z1], raggio: r }) {
  const w = x1 - x0 - 2 * r, h = z1 - z0 - 2 * r, arc = (Math.PI / 2) * r;
  const segs = [
    { len: w, at: (u) => [x0 + r + u, z0] },                                                 // lato nord, verso est
    { len: arc, at: (u) => { const a = -Math.PI / 2 + u / r; return [x1 - r + Math.cos(a) * r, z0 + r + Math.sin(a) * r]; } },
    { len: h, at: (u) => [x1, z0 + r + u] },                                                 // lato est, verso sud
    { len: arc, at: (u) => { const a = u / r; return [x1 - r + Math.cos(a) * r, z1 - r + Math.sin(a) * r]; } },
    { len: w, at: (u) => [x1 - r - u, z1] },                                                 // lato sud, verso ovest
    { len: arc, at: (u) => { const a = Math.PI / 2 + u / r; return [x0 + r + Math.cos(a) * r, z1 - r + Math.sin(a) * r]; } },
    { len: h, at: (u) => [x0, z1 - r - u] },                                                 // lato ovest, verso nord
    { len: arc, at: (u) => { const a = Math.PI + u / r; return [x0 + r + Math.cos(a) * r, z0 + r + Math.sin(a) * r]; } },
  ];
  const L = segs.reduce((s, g) => s + g.len, 0);
  return {
    length: L,
    at(s) {
      s = ((s % L) + L) % L;
      for (const g of segs) { if (s <= g.len) return g.at(s); s -= g.len; }
      return segs[0].at(0);
    },
  };
}

// Jukebox a ritmo (gioco plus): regole pure, senza audio né schermo, così si provano con node.
// Un brano è un elenco di note { beat, lane }: `beat` conta i quarti dall'inizio del brano (dopo il conto alla rovescia),
// il tempo in secondi è beat * 60 / bpm. Quattro corsie. Si preme la corsia quando la nota arriva sulla linea.

export const LANES = 4;
export const FINESTRE = { perfetto: 0.05, buono: 0.10, max: 0.14 };    // secondi di scarto dal momento giusto
export const PUNTI = { perfetto: 300, buono: 150 };
export const PESI = { perfetto: 1, buono: 0.6 };                       // peso per la precisione
export const VOTI = [['S', 0.95], ['A', 0.85], ['B', 0.7], ['C', 0.5], ['D', 0]];

export function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sezioni di 32 battute da 4 quarti. Ogni maschera dice in quali ottavi della battuta c'è una nota (8 passi).
const MASCHERE = {
  intro:  [[1, 0, 0, 0, 1, 0, 0, 0], [1, 0, 0, 0, 1, 0, 1, 0]],
  strofa: [[1, 0, 1, 0, 1, 0, 1, 0], [1, 0, 1, 0, 1, 1, 0, 0], [1, 0, 0, 1, 1, 0, 1, 0], [1, 0, 1, 0, 0, 1, 1, 0]],
  ritornello: [[1, 1, 1, 0, 1, 1, 1, 0], [1, 0, 1, 1, 1, 0, 1, 1], [1, 1, 0, 1, 1, 1, 0, 1], [1, 1, 1, 1, 1, 0, 1, 0]],
  pausa:  [[1, 0, 0, 0, 0, 0, 1, 0], [1, 0, 0, 0, 1, 0, 0, 0]],
  finale: [[1, 1, 1, 1, 1, 1, 1, 0], [1, 1, 1, 0, 1, 1, 1, 1], [1, 0, 1, 1, 1, 1, 0, 1], [1, 1, 0, 1, 1, 1, 1, 1]],
};
// battute (da 1) di ogni sezione
export const SEZIONI = [['intro', 1, 4], ['strofa', 5, 12], ['ritornello', 13, 20], ['pausa', 21, 24], ['finale', 25, 32]];
export const sezioneDi = (battuta) => (SEZIONI.find(([, a, b]) => battuta >= a && battuta <= b) ?? SEZIONI.at(-1))[0];

// Spartito deterministico: stesso seme, stesse note (si impara a memoria). Niente tre note di fila nella stessa corsia;
// nel ritornello e nel finale, sul primo tempo di ogni battuta dispari c'è un accento a due corsie.
export function generaChart({ seed = 1, battute = 32 } = {}) {
  const rnd = mulberry32(seed);
  const note = [];
  let lane = Math.floor(rnd() * LANES), stessa = 0;
  for (let b = 1; b <= battute; b++) {
    const sez = sezioneDi(b);
    const maschere = MASCHERE[sez];
    const m = maschere[Math.floor(rnd() * maschere.length)];
    for (let p = 0; p < 8; p++) {
      if (!m[p]) continue;
      // la corsia segue un percorso: spesso un passo accanto, ogni tanto un salto
      const r = rnd();
      let nuova = r < 0.55 ? lane + (rnd() < 0.5 ? -1 : 1) : r < 0.85 ? lane + 2 : Math.floor(rnd() * LANES);
      nuova = ((nuova % LANES) + LANES) % LANES;
      if (nuova === lane && stessa >= 1) nuova = (lane + 1 + Math.floor(rnd() * (LANES - 1))) % LANES;
      stessa = nuova === lane ? stessa + 1 : 0;
      lane = nuova;
      const beat = (b - 1) * 4 + p / 2;
      note.push({ beat, lane });
      if ((sez === 'ritornello' || sez === 'finale') && p === 0 && b % 2 === 1) note.push({ beat, lane: (lane + 2) % LANES });
    }
  }
  return { note, battute, beatTotali: battute * 4 };
}

export function giudica(scarto) {
  const d = Math.abs(scarto);
  if (d <= FINESTRE.perfetto) return 'perfetto';
  if (d <= FINESTRE.buono) return 'buono';
  return null;
}

export const votoDa = (precisione) => VOTI.find(([, soglia]) => precisione >= soglia)[0];

// La partita: tiene le note, giudica i colpi e conta il punteggio. Il tempo `t` è in secondi dall'inizio del brano.
export class Partita {
  constructor(chart, bpm) {
    this.bpm = bpm;
    this.note = chart.note.map((n) => ({ ...n, t: (n.beat * 60) / bpm, esito: null }));
    this.punti = 0;
    this.combo = 0;
    this.comboMax = 0;
    this.conteggi = { perfetto: 0, buono: 0, mancato: 0 };
  }

  get totale() { return this.note.length; }
  get moltiplicatore() { return Math.min(4, 1 + Math.floor(this.combo / 10)); }
  get precisione() {
    const { perfetto, buono } = this.conteggi;
    return this.totale ? (perfetto * PESI.perfetto + buono * PESI.buono) / this.totale : 0;
  }
  get voto() { return votoDa(this.precisione); }
  get durata() { return this.note.length ? this.note.at(-1).t : 0; }

  // Si preme la corsia `lane` al tempo `t`: colpisce la nota non ancora giudicata più vicina in quella corsia,
  // se è dentro la finestra. Fuori finestra non succede niente (niente penalità per un tasto a vuoto).
  colpo(lane, t) {
    let best = null;
    for (const n of this.note) {
      if (n.esito || n.lane !== lane) continue;
      const d = Math.abs(t - n.t);
      if (d <= FINESTRE.max && (!best || d < Math.abs(t - best.t))) best = n;
      if (n.t - t > FINESTRE.max) break;                           // le note sono in ordine di tempo
    }
    if (!best) return null;
    const scarto = t - best.t;
    const g = giudica(scarto);
    if (!g) return this._manca(best, scarto);                      // tra "buono" e il massimo: troppo storto
    best.esito = g;
    this.conteggi[g]++;
    this.punti += PUNTI[g] * this.moltiplicatore;
    this.combo++;
    this.comboMax = Math.max(this.comboMax, this.combo);
    return { giudizio: g, nota: best, scarto };
  }

  _manca(n, scarto = 0) {
    n.esito = 'mancato';
    this.conteggi.mancato++;
    this.combo = 0;
    return { giudizio: 'mancato', nota: n, scarto };
  }

  // note superate senza essere colpite: mancate. Restituisce quelle appena mancate.
  aggiorna(t) {
    const perse = [];
    for (const n of this.note) {
      if (n.esito) continue;
      if (n.t + FINESTRE.max < t) perse.push(this._manca(n)); else if (n.t > t) break;
    }
    return perse;
  }

  finita(t) { return t > this.durata + FINESTRE.max + 1.5; }
}

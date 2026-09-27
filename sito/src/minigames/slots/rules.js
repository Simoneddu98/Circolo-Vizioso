// Slot machine del circolo: tre rulli, una linea centrale, gettoni finti. Logica pura, senza three.js.
// Simboli (dal meno al più prezioso): ciliegia, limone, arancia, uva, campana, BAR, sette, nuraghe.

export const SYMBOLS = ['ciliegia', 'limone', 'arancia', 'uva', 'campana', 'bar', 'sette', 'nuraghe'];

// Strisce dei rulli: quante volte compare ogni simbolo (22 posizioni per rullo)
const COUNTS = { ciliegia: 5, limone: 4, arancia: 4, uva: 3, campana: 2, bar: 2, sette: 1, nuraghe: 1 };

// Vincite per gettone puntato sulla linea centrale
export const PAYS = {
  triple: { nuraghe: 150, sette: 80, bar: 35, campana: 20, uva: 12, arancia: 10, limone: 8, ciliegia: 8 },
  twoCherries: 3,          // due ciliegie qualsiasi sulla linea
  oneCherry: 2,            // una ciliegia sul primo rullo (ritorno teorico complessivo ~92%)
};

export function makeStrip(seedShift = 0) {
  const s = [];
  for (const [sym, n] of Object.entries(COUNTS)) for (let i = 0; i < n; i++) s.push(sym);
  // ordine mescolato in modo fisso (diverso per ogni rullo) così i simboli uguali non stanno vicini
  const out = [];
  let k = seedShift;
  while (s.length) { k = (k * 7 + 3) % s.length; out.push(s.splice(k, 1)[0]); }
  return out;
}

export const STRIPS = [makeStrip(1), makeStrip(4), makeStrip(9)];

// Vincita (in gettoni, già moltiplicata per la puntata) per i tre simboli sulla linea
export function payout(line, bet = 1) {
  const [a, b, c] = line;
  if (a === b && b === c) return PAYS.triple[a] * bet;
  const cherries = line.filter((s) => s === 'ciliegia').length;
  if (cherries >= 2) return PAYS.twoCherries * bet;
  if (a === 'ciliegia') return PAYS.oneCherry * bet;
  return 0;
}

export class SlotMachine {
  // pocket: gettoni in tasca; credits: gettoni già messi nella macchina
  constructor({ pocket = 0, credits = 100, rng = Math.random, maxBet = 3 } = {}) {
    this.pocket = pocket;
    this.credits = credits;
    this.start = pocket + credits;
    this.rng = rng;
    this.maxBet = maxBet;
    this.bet = 1;
    this.stops = [0, 0, 0];
    this.spins = 0;
    this.best = this.start;
    this.lastWin = 0;
  }

  get total() { return this.pocket + this.credits; }

  // un gettone dalla tasca alla macchina
  insertCoin() {
    if (this.pocket <= 0) return false;
    this.pocket--; this.credits++;
    return true;
  }

  // restituisce tutti i crediti (cadono nella vaschetta e tornano in tasca); ritorna quanti
  cashOut() {
    const n = this.credits;
    this.pocket += n; this.credits = 0;
    return n;
  }

  setBet(b) { this.bet = Math.max(1, Math.min(this.maxBet, b)); return this.bet; }

  canSpin() { return this.credits >= this.bet && this.bet > 0; }

  // Gira: ritorna { stops, line, win } oppure null se i crediti non bastano
  spin() {
    if (!this.canSpin()) return null;
    this.credits -= this.bet;
    this.stops = STRIPS.map((s) => Math.floor(this.rng() * s.length));
    const line = this.stops.map((p, i) => STRIPS[i][p]);
    const win = payout(line, this.bet);
    this.credits += win;
    this.spins++;
    this.lastWin = win;
    this.best = Math.max(this.best, this.total);
    return { stops: this.stops.slice(), line, win };
  }
}

// Ritorno teorico al giocatore (vincita attesa per gettone puntato), calcolato su tutte le combinazioni
export function theoreticalRTP() {
  let total = 0, n = 0;
  for (const a of STRIPS[0]) for (const b of STRIPS[1]) for (const c of STRIPS[2]) { total += payout([a, b, c], 1); n++; }
  return total / n;
}

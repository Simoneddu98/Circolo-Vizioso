// Palla 8 semplificata. Logica pura: riceve gli eventi del tiro (physics.js) e aggiorna lo stato della partita.
export const groupOf = (id) => (id >= 1 && id <= 7 ? 'solids' : id >= 9 && id <= 15 ? 'stripes' : id === 8 ? 'eight' : 'cue');

export class EightBall {
  constructor(first = 0) {
    this.groups = [null, null];          // 'solids' | 'stripes' per giocatore, assegnati con la prima imbucata dopo l'apertura
    this.current = first;
    this.ballInHand = false;             // dopo un fallo l'avversario posiziona la bianca
    this.winner = null;
    this.shots = 0;
    this.pocketed = new Set();           // palle già in buca (esclusa la bianca)
  }

  remaining(player) {
    const g = this.groups[player];
    if (!g) return 7;
    let n = 0;
    for (let id = 1; id <= 15; id++) if (groupOf(id) === g && !this.pocketed.has(id)) n++;
    return n;
  }

  // Bersaglio legale del giocatore di turno: il suo gruppo, la 8 se il gruppo è finito, qualsiasi (non la 8) a tavolo aperto
  legalTarget(id, player = this.current) {
    const g = this.groups[player];
    if (id === 8) return g !== null && this.remaining(player) === 0;
    return g === null || groupOf(id) === g;
  }

  // events: { firstContact, pocketed: [{ id }] } -> { foul, reason, turnOver, assigned, win, lose }
  applyShot(events) {
    if (this.winner !== null) throw new Error('partita finita');
    const p = this.current;
    const isBreak = this.shots === 0;
    this.shots++;
    const potted = events.pocketed.map((e) => e.id);
    const res = { foul: false, reason: null, turnOver: false, assigned: null, win: false, lose: false };
    const clearedBefore = this.groups[p] !== null && this.remaining(p) === 0;
    if (potted.includes(0)) { res.foul = true; res.reason = 'bianca in buca'; }
    else if (events.firstContact == null) { res.foul = true; res.reason = 'nessuna palla toccata'; }
    else if (!isBreak && !this.legalTarget(events.firstContact, p)) { res.foul = true; res.reason = 'prima palla toccata non tua'; }
    if (events.offTable?.length) { res.foul = true; res.reason = 'palla fuori dal tavolo'; }
    for (const id of potted) if (id !== 0) this.pocketed.add(id);
    if (potted.includes(8)) {
      if (clearedBefore && !res.foul) { res.win = true; this.winner = p; } else { res.lose = true; this.winner = 1 - p; }
      return res;
    }
    // gruppo: la prima palla imbucata dopo l'apertura, senza fallo
    if (!isBreak && !res.foul && this.groups[p] === null) {
      const first = potted.find((id) => id !== 0);
      if (first) {
        const g = groupOf(first);
        this.groups[p] = g;
        this.groups[1 - p] = g === 'solids' ? 'stripes' : 'solids';
        res.assigned = g;
      }
    }
    const own = potted.some((id) => id !== 0 && (this.groups[p] === null || groupOf(id) === this.groups[p]));
    res.turnOver = res.foul || !own;
    if (res.turnOver) this.current = 1 - p;
    this.ballInHand = res.foul;
    return res;
  }
}

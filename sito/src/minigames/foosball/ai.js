// Avversario del biliardino (Nicola, squadra B): ogni asta insegue la posizione laterale della palla con un ritardo
// di reazione e una velocità massima; tira quando la palla è davanti a un suo omino entro portata.
// Portiere e difesa restano allineati alla palla quando è nella loro metà (x > 0).

export const LEVELS = {
  facile: { reaction: 0.28, speed: 0.9, aimError: 0.12, kick: 22 },
  normale: { reaction: 0.16, speed: 1.4, aimError: 0.07, kick: 28 },
  difficile: { reaction: 0.08, speed: 2.0, aimError: 0.04, kick: 34 },
};

export class FoosballAI {
  // team: 'B' attacca verso -x (porta A), 'A' verso +x
  constructor(level = 'normale', rng = Math.random, team = 'B') {
    this.p = LEVELS[level] ?? LEVELS.normale;
    this.rng = rng;
    this.team = team;
    this.dir = team === 'B' ? -1 : 1;
    this.seen = { x: 0, y: 0 };          // posizione della palla "vista" con ritardo
    this.aimOff = new Map();             // ogni asta mira un po' fuori centro: i tiri escono angolati
    this.kicking = new Map();
  }

  // aggiorna slideVel e omega delle aste della squadra B
  update(st, dt) {
    const b = st.ball;
    const k = Math.min(1, dt / this.p.reaction);
    this.seen.x += (b.x - this.seen.x) * k;
    this.seen.y += (b.y - this.seen.y) * k;
    for (const rod of st.rods) {
      if (rod.team !== this.team) continue;
      const defensive = rod.x * this.dir < -0.2;
      // omino più vicino alla palla: porta il suo offset sotto la palla
      let best = rod.offsets[0], bd = Infinity;
      for (const o of rod.offsets) { const d = Math.abs(this.seen.y - (rod.slide + o)); if (d < bd) { bd = d; best = o; } }
      if (!this.aimOff.has(rod) || this.rng() < dt * 0.8) this.aimOff.set(rod, (this.rng() - 0.5) * 0.024);
      let target = this.seen.y - best + this.aimOff.get(rod);
      if (defensive && this.seen.x * this.dir > 0) target *= 0.4;   // palla lontana: la difesa torna verso il centro
      target = Math.max(-rod.travel, Math.min(rod.travel, target));
      const err = target - rod.slide;
      rod.slideVel = Math.max(-this.p.speed, Math.min(this.p.speed, err * 12));
      if (this.flick?.rod === rod && (this.kicking.get(rod) ?? 0) > 0) rod.slideVel = this.flick.v;
      // tiro: palla davanti all'omino (lato della porta A, cioè x minore) ed entro portata
      const t = this.kicking.get(rod) ?? 0;
      if (t > 0) {
        this.kicking.set(rod, t - dt);
        if (t - dt <= 0) rod.omega = -this.dir * this.p.kick * 0.5;   // ritorno
      } else {
        const ahead = (b.x - rod.x) * this.dir;
        const front = ahead > -0.01 && ahead < rod.leg + b.r;
        if (front && bd < 0.03) {
          rod.omega = this.dir * this.p.kick * (1 + (this.rng() - 0.5) * this.p.aimError * 4);
          this.kicking.set(rod, 0.12);
          this.flick = { rod, v: (this.rng() - 0.5) * 2.4 };            // colpo di polso laterale: tiro angolato
        } else if (ahead < -0.01 && ahead > -(rod.leg * 0.55 + b.r) && bd < 0.025 && Math.hypot(b.vx, b.vy) < 0.3) {
          // palla appena dietro l'omino e quasi ferma: colpo all'indietro (passaggio) per non lasciarla morta tra le aste
          rod.omega = -this.dir * this.p.kick * 0.55;
          this.kicking.set(rod, 0.1);
        } else if (Math.abs(rod.angle) > 0.02) {
          rod.omega = -rod.angle * 10;                            // torna verticale
        } else rod.omega = 0;
      }
    }
  }
}

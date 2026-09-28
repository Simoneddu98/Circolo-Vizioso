// Finale: tutti in fila, un giro del circolo attorno al biliardo; prima camminando, poi sempre più veloci fino a
// correre. Il giocatore guarda dal tavolino in fondo, con la sigaretta. L'anello è un rettangolo con gli angoli
// arrotondati dove non ci sono ostacoli (CONFIG.serata.spettacolo.anello).
import * as THREE from 'three';
import { anello } from './regole.js';

export class Spettacolo {
  constructor(ctx, cfg, release) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.path = anello(cfg.anello);
    this.t = 0;
    this.head = 0;                                  // posizione del primo della fila sull'anello
    this.release = release;
    const npcs = ctx.npcs.npcs;
    this.runners = cfg.chi.map((name) => npcs.find((o) => o.userData.npc_name === name)).filter(Boolean).map((npc, i, all) => ({
      npc, gap: (this.path.length / all.length) * i, routine: ctx.routines?.find((r) => r.npc === npc), ready: false, clip: null,
    }));
    for (const r of this.runners) {
      const npc = r.npc;
      npc.visible = true;
      npc.userData.directed = true;
      ctx.camerawork?.stop(npc);
      ctx.npcs.stopAction(npc);
      if (r.routine) { r.routine.path = null; r.routine.glide = null; r.routine._release?.(); }
      // chi è seduto al tavolo si alza
      if (r.routine?.seated) {
        const m = ctx.root.getObjectByName(`ELDER_Spot_Seat${['Efisio', 'Tonino', 'Peppino', 'Gavino'].indexOf(npc.userData.npc_name) + 1}`);
        if (m) { const p = m.getWorldPosition(new THREE.Vector3()); npc.position.x = p.x; npc.position.z = p.z; }
        npc.position.y = npc.userData.stand_lift ?? 0;
        r.routine.seated = false;
      }
      this._clip(r, 'walk', 1);
    }
  }

  _clip(r, kind, scale) {
    const u = r.npc.userData;
    const run = `${u.clip_prefix ?? r.npc.name.replace(/_\d+$/, '')}_Run`;
    const name = kind === 'run' && r.npc.userData.anim?.clips.get(run) ? run : (kind === 'idle' ? (u.stand_clip ?? u.idle_clip) : u.walk_clip);
    if (r.clip !== name) { this.ctx.npcs.setLoop(r.npc, name, scale, 0.3); r.clip = name; }
    else if (r.npc.userData.anim) r.npc.userData.anim.idle.timeScale = scale;
  }

  // velocità della fila: ferma durante il raduno, poi cammina, poi accelera fino alla corsa
  speed() {
    const c = this.cfg, t = this.t - c.raduno;
    if (t < 0) return 0;
    const span = c.durata - c.raduno;
    const k = Math.max(0, Math.min(1, (t / span - c.corsaDa) / (1 - c.corsaDa)));
    return c.passo[0] + (c.passo[1] - c.passo[0]) * k * k;
  }

  // restituisce true quando è finito
  update(dt) {
    this.t += dt;
    const v = this.speed();
    this.head += v * dt;
    for (const r of this.runners) {
      const npc = r.npc;
      const [tx, tz] = this.path.at(this.head - r.gap);
      const dx = tx - npc.position.x, dz = tz - npc.position.z;
      const d = Math.hypot(dx, dz);
      const max = Math.max(v * 1.35, 1.3) * dt;
      if (d > 0.02) {
        const k = Math.min(1, max / d);
        npc.position.x += dx * k; npc.position.z += dz * k;
        if (!r.ready) this.ctx.collisions?.resolve(npc.position, 0.2);   // mentre raggiunge la fila, niente mobili attraversati
        const yaw = Math.atan2(dx, dz);
        let a = yaw - npc.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a));
        npc.rotation.y += a * Math.min(1, dt * 8);
      }
      if (d < 0.1) r.ready = true;
      const moving = d > 0.05 || v > 0.05;
      const walkRef = npc.userData.walk_speed ?? 1.1;
      const speed = Math.max(v, d > 0.1 ? 1.2 : 0);
      if (!moving) this._clip(r, 'idle', 1);
      // passo della clip in proporzione alla velocità (alla fine si corre a perdifiato: camminata accelerata fino a 5x)
      else this._clip(r, speed > 2.3 ? 'run' : 'walk', r.clip?.endsWith('_Run') ? Math.min(2.6, speed / 3.2) : Math.min(5, speed / walkRef));
    }
    return this.t >= this.cfg.durata;
  }

  // fine: i vecchi tornano a sedersi, gli altri riprendono la loro serata
  stop() {
    for (const r of this.runners) {
      r.npc.userData.directed = false;
      if (r.routine && r.npc.userData.sit_clip) r.routine.sitNow();
      else if (r.npc.userData.idle_clip) this.ctx.npcs.setLoop(r.npc, r.routine?.idleClip ?? r.npc.userData.idle_clip, 1, 0.3);
    }
    this.release?.();
  }
}

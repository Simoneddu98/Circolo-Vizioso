// "La storia", capitolo 3: se ne vanno tutti. La porta d'ingresso si apre e i personaggi, uno alla volta, camminano
// fino alla porta ed entrano nel buio (spariscono), tranne chi deve restare (Lyuce). I vecchi si alzano dal tavolo,
// Nicola esce da dietro il bancone. Poi, a capitolo finito, tornano tutti al loro posto (ritorno()).
import * as THREE from 'three';

export class Esodo {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;                          // STORIA.esodo
    this.walkers = [];
    this.done = false;
  }

  // chi: nomi nell'ordine d'uscita; porta: soglia della porta d'ingresso (Vector3)
  // resta: { nome: [x, z] } chi non esce ma va ad aspettare in un punto (Lyuce)
  start(soglia, resta = {}) {
    const ctx = this.ctx, C = this.cfg;
    this.soglia = soglia;
    this.walkers = [];
    let delay = 0;
    for (const [name, [x, z]] of Object.entries(resta)) {
      const npc = ctx.npcs.npcs.find((o) => o.userData.npc_name === name);
      if (!npc) continue;
      this.walkers.push({ npc, routine: ctx.routines?.find((r) => r.npc === npc), path: [new THREE.Vector3(x, 0, z)], wait: 0, state: 'wait',
        stuck: 0, best: Infinity, ghost: 0, home: npc.position.clone(), homeRot: npc.rotation.y, stay: true, look: soglia });
    }
    for (const name of C.chi) {
      const npc = ctx.npcs.npcs.find((o) => o.userData.npc_name === name);
      if (!npc || !npc.visible) continue;
      const routine = ctx.routines?.find((r) => r.npc === npc);
      // percorso: (giro attorno al bancone per Nicola) → davanti alla porta → oltre la soglia, nel buio
      const path = [...(C.giri[name] ?? []).map(([x, z]) => new THREE.Vector3(x, 0, z)),
        new THREE.Vector3(soglia.x, 0, soglia.z - 1.0), new THREE.Vector3(soglia.x, 0, soglia.z + 0.3), new THREE.Vector3(soglia.x, 0, soglia.z + 1.8)];
      this.walkers.push({ npc, routine, path, wait: delay, state: 'wait', stuck: 0, best: Infinity, ghost: 0,
        home: npc.position.clone(), homeRot: npc.rotation.y, clip: npc.userData.anim?.idle.getClip().name,
        free: (C.senzaCollisioni ?? []).includes(name) });
      delay += C.intervallo;
    }
    for (const w of this.walkers) {
      const n = w.npc;
      n.userData.directed = true;
      ctx.camerawork?.stop(n);
      ctx.npcs.stopAction(n);
      if (w.routine) { w.routine.path = null; w.routine.glide = null; w.routine._release?.(); }
    }
    this.done = this.walkers.length === 0;
  }

  _setClip(n, name, scale = 1) { if (name) this.ctx.npcs.setLoop(n, name, scale, 0.3); }

  update(dt) {
    if (this.done) return;
    const ctx = this.ctx;
    let left = 0;
    for (const w of this.walkers) {
      const n = w.npc;
      if (w.state === 'gone' || w.state === 'stay') continue;
      if (!w.stay) left++;
      if (w.state === 'wait') {
        if ((w.wait -= dt) > 0) continue;
        // chi è seduto si alza accanto alla sedia
        if (w.routine?.seated) {
          const i = ['Efisio', 'Tonino', 'Peppino', 'Gavino'].indexOf(n.userData.npc_name);
          const m = ctx.root.getObjectByName(`ELDER_Spot_Seat${i + 1}`);
          if (m) { const p = n.parent.worldToLocal(m.getWorldPosition(new THREE.Vector3())); n.position.x = p.x; n.position.z = p.z; }
          n.position.y = n.userData.stand_lift ?? n.position.y;
          w.routine.seated = false;
        }
        const ws = n.userData.walk_speed;
        this._setClip(n, n.userData.walk_clip, ws ? this.cfg.passo / ws : 1);
        w.state = 'walk';
      }
      const goal = w.path[0];
      const dx = goal.x - n.position.x, dz = goal.z - n.position.z, d = Math.hypot(dx, dz);
      const last = w.path.length === 1;
      if (d < (last ? 0.1 : 0.3)) {
        w.path.shift();
        w.best = Infinity;
        if (!w.path.length) {
          if (w.stay) {                                          // arrivato al suo posto: fermo, girato verso la porta
            w.state = 'stay';
            if (n.userData.idle_clip) this._setClip(n, n.userData.stand_clip ?? n.userData.idle_clip);
            n.rotation.y = Math.atan2(w.look.x - n.position.x, w.look.z - n.position.z);
          } else { n.visible = false; w.state = 'gone'; }
        }
        continue;
      }
      if (d < w.best - 0.05) { w.best = d; w.stuck = 0; } else w.stuck += dt;
      if (w.stuck > 1.2) { w.ghost = 1.5; w.stuck = 0; w.best = d; }
      const step = Math.min(d, this.cfg.passo * dt);
      n.position.x += (dx / d) * step; n.position.z += (dz / d) * step;
      // oltre il muro (nel passaggio nero) niente collisioni: lì il circolo finisce
      const outside = n.position.z > this.soglia.z - 0.6;
      if ((w.ghost = Math.max(0, w.ghost - dt)) <= 0 && !outside && !w.free) ctx.collisions?.resolve(n.position, 0.2);
      let a = Math.atan2(dx, dz) - n.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a));
      n.rotation.y += a * Math.min(1, dt * 8);
    }
    if (left === 0) this.done = true;
  }

  // PROVA: tutti già usciti (e chi resta già al suo posto)
  skip() {
    for (const w of this.walkers) {
      const n = w.npc;
      if (w.stay) {
        const p = n.parent.worldToLocal(w.path[w.path.length - 1].clone());
        n.position.x = p.x; n.position.z = p.z;
        if (n.userData.idle_clip) this._setClip(n, n.userData.stand_clip ?? n.userData.idle_clip);
        w.state = 'stay';
      } else { n.visible = false; w.state = 'gone'; }
    }
    this.done = true;
  }

  get stayer() { return this.walkers.find((w) => w.stay)?.npc ?? null; }

  // a fine capitolo tornano tutti: i vecchi seduti, gli altri al punto di partenza della loro routine
  ritorno() {
    for (const w of this.walkers) {
      const n = w.npc;
      n.visible = true;
      n.userData.directed = false;
      if (w.routine?.npc.userData.sit_clip) w.routine.sitNow();
      else if (w.routine) {
        n.position.copy(w.routine.home.pos); n.rotation.y = w.routine.home.yaw;
        if (n.userData.idle_clip) this.ctx.npcs.setLoop(n, w.routine.idleClip ?? n.userData.idle_clip, 1, 0.3);
      } else {                                                    // Nicola: di nuovo dietro al bancone
        n.position.copy(w.home); n.rotation.y = w.homeRot;
        if (w.clip) this.ctx.npcs.setLoop(n, w.clip, 1, 0.3);
      }
    }
    this.walkers = [];
    this.done = true;
  }
}

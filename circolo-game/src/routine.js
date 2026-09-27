// Routine dei personaggi che si muovono per il circolo (userData.routine nel glb, passi in CONFIG.routines).
// Passi:
//   { goto: 'Bar', via: ['Way_A', 'Way_B'] }   cammina lungo i marcatori <PREFISSO>_Way_* fino a <PREFISSO>_Spot_Bar
//   { clip: 'Talk', for: 3.5 }                 clip in loop per un tempo
//   { once: 'Agree' }                          clip una volta sola, poi di nuovo idle
//   { wait: [6, 9] }                           attesa (secondi, a caso nell'intervallo)
//   { say: '...' } / { reply: 'Nicola', text: '...' }   battute (sottotitoli) di chi fa la routine o di un altro personaggio
//   { rise: 'Seat1' }                          si alza dalla sedia e si mette in piedi su <PREFISSO>_Spot_Seat1
//   { sit: true }                              torna al posto di partenza e si siede (clip userData.sit_clip)
//   { act: 'photo' | 'video', for: 4 }         Kappa e Zucco: foto o video con la reflex (src/camerawork.js)
//   { comment: 'any' | ['Nicola', ...], for: 6 } Lyuce: si gira verso il più vicino entro CONFIG.stylist.range e commenta
//                                              il suo outfit; lui risponde (CONFIG.stylist.lines)
// Chi cammina tiene la destra: se ha davanti qualcuno (personaggio in piedi o giocatore) entro walkAvoid metri devia
// dalla parte libera, e si ferma un attimo se è proprio addosso. Un punto di sosta occupato (prenotato da un altro o con
// qualcuno fermo lì) non si raggiunge: si aspetta e, dopo claimRetries secondi, si passa alla meta successiva.
// Clip: <userData.clip_prefix>_<Nome> (clip condivise tra più personaggi), altrimenti il nome del nodo senza _N.
// La camminata va alla velocità walkSpeed; la clip è rallentata o accelerata rispetto a userData.walk_speed (m/s).
// La routine si ferma mentre si parla con il personaggio (si gira verso il giocatore) o mentre è in un minigioco.
import * as THREE from 'three';
import { pick } from './minigames/util.js';

const _v = new THREE.Vector3();
// battute di chi è in giro (non più al tavolo), se configurate
const ctx_wander = (r) => r.ctx.config.npcActions?.wander;

export class NpcRoutine {
  constructor(ctx, npc, cfg) {
    this.ctx = ctx;
    this.npc = npc;
    this.cfg = cfg;
    this.i = -1;
    this.t = 0;
    this.path = null;
    this.started = false;
    this.clipPrefix = npc.userData.clip_prefix ?? npc.name.replace(/_\d+$/, '');   // es. NPC_Cronico
    this.walkClip = npc.userData.walk_clip;
    this.idleClip = npc.userData.idle_clip;
    this.walkScale = npc.userData.walk_speed ? (cfg.walkSpeed ?? 1.15) / npc.userData.walk_speed : 1;
    this.home = { pos: npc.position.clone(), yaw: npc.rotation.y };   // la sedia, per chi parte seduto
    this.seatLines = npc.userData.lineSet;
    this.seated = !!npc.userData.seated;
  }

  marker(name) { return this.ctx.root.getObjectByName(`${this.cfg.markers}_${name}`); }

  clip(short) { return `${this.clipPrefix}_${short}`; }

  near(dist = this.cfg.hearing ?? 7) {
    return this.npc.getWorldPosition(_v).distanceTo(this.ctx.player.position) < dist;
  }

  say(text, who = this.npc) {
    if (text && this.near()) this.ctx.npcs.say(who, text);
  }

  _next() {
    this.i = (this.i + 1) % this.cfg.steps.length;
    const s = this.cfg.steps[this.i];
    this.step = s;
    this.t = 0;
    this.faceTarget = null; this.reply = null;
    const npcs = this.ctx.npcs, npc = this.npc;
    if (s.goto && !this._claim(`${this.cfg.markers}_Spot_${s.goto}`)) return;     // posto occupato: aspetta
    if (s.say) this.say(s.say);
    if (s.reply) {
      const other = npcs.npcs.find((o) => o.userData.npc_name === s.reply);
      if (other) this.say(s.text, other);
    }
    if (s.rise) {                                                // in piedi accanto alla sedia
      const m = this.marker(`Spot_${s.rise}`);
      const p = m ? npc.parent.worldToLocal(m.getWorldPosition(new THREE.Vector3())) : npc.position.clone();
      p.y = npc.userData.stand_lift ?? 0;
      this.idleClip = npc.userData.stand_clip ?? this.idleClip;
      this.seated = false;
      if (ctx_wander(this)) npc.userData.lineSet = ctx_wander(this);
      this._glide(p, npc.rotation.y, this.idleClip, 1.0);
      return;
    }
    if (s.sit) {                                                 // di nuovo al suo posto
      this._release();
      this.idleClip = npc.userData.sit_clip ?? npc.userData.idle_clip;
      npc.userData.lineSet = this.seatLines;
      this._glide(this.home.pos, this.home.yaw, this.idleClip, 1.0);
      return;
    }
    if (s.goto) {
      this.path = [...(s.via ?? []).map((w) => this.marker(`Way_${w}`)), this.marker(`Spot_${s.goto}`)].filter(Boolean)
        .map((m) => m.getWorldPosition(new THREE.Vector3()));
      this.target = this.marker(`Spot_${s.goto}`);
      if (this.walkClip) npcs.setLoop(this.npc, this.walkClip, this.walkScale, 0.3);
      this.dur = Infinity;
    } else if (s.comment) {
      if (this.idleClip) npcs.setLoop(this.npc, this.idleClip, 1, 0.3);
      const c = this.ctx.config.stylist;
      const me = npc.position;
      const names = Array.isArray(s.comment) ? s.comment : null;
      let best = null, bd = c.range;
      for (const o of npcs.npcs) {
        if (o === npc || !o.visible) continue;
        const key = c.lines[o.userData.npc_name] ? o.userData.npc_name : (o.userData.npc_action === 'play_cards' ? 'Elder' : null);
        if (!key || (names && !names.includes(o.userData.npc_name) && !(names.includes('Elder') && key === 'Elder'))) continue;
        const d = Math.hypot(o.position.x - me.x, o.position.z - me.z);
        if (d < bd) { bd = d; best = { o, key }; }
      }
      if (best) {
        const [line, answer] = pick(c.lines[best.key]);
        this.faceTarget = best.o;
        this.say(line.replace('{name}', best.o.userData.npc_name ?? ''));
        this.reply = { t: c.replyAfter, who: best.o, text: answer };
        if (npc.userData.talk_clip) npcs.setLoop(npc, npc.userData.talk_clip, 1, 0.3);   // parla gesticolando
        this.dur = s.for ?? 6;
      } else this.dur = 0.5;
    } else if (s.act) {
      if (this.idleClip) npcs.setLoop(this.npc, this.idleClip, 1, 0.3);
      this.dur = this.ctx.camerawork?.play(this.npc, s.for ?? 4) || 0.5;
    } else if (s.once) {
      this.dur = npcs.playOnce(this.npc, this.clip(s.once)) + 0.3;
    } else if (s.clip) {
      npcs.setLoop(this.npc, this.clip(s.clip));
      this.dur = s.for ?? 3;
    } else {
      if (this.idleClip) npcs.setLoop(this.npc, this.idleClip, 1, 0.3);
      const w = s.wait ?? 1;
      this.dur = Array.isArray(w) ? w[0] + Math.random() * (w[1] - w[0]) : w;
    }
  }

  // ---- punti di sosta: prenotazione (condivisa tra le routine in ctx.spotClaims)
  _spotFree(key) {
    const claims = this.ctx.spotClaims ??= new Map();
    const owner = claims.get(key);
    if (owner && owner !== this) return false;
    const m = this.ctx.root.getObjectByName(key);
    if (!m) return true;
    const p = m.getWorldPosition(new THREE.Vector3());
    const r = this.cfg.spotRadius ?? 0.55;
    // qualcuno fermo proprio lì (anche di un'altra routine, con altri marcatori)
    for (const o of this.ctx.npcs.npcs) {
      if (o === this.npc || !o.visible) continue;
      const other = this.ctx.routines?.find((x) => x.npc === o);
      if (other?.path?.length) continue;                         // sta camminando: passa oltre
      if (Math.hypot(o.position.x - p.x, o.position.z - p.z) < r) return false;
    }
    return true;
  }

  _claim(key) {
    if (this._spotFree(key)) {
      this._release();
      this.ctx.spotClaims.set(key, this);
      this.claimed = key;
      this.retries = 0;
      return true;
    }
    const npcs = this.ctx.npcs;
    this.retries = (this.retries ?? 0) + 1;
    const n = this.cfg.steps.length;
    if (this.retries > (this.cfg.claimRetries ?? 8)) {          // salta alla meta successiva
      this.retries = 0;
      let j = this.i;
      for (let k = 1; k < n; k++) { const jj = (this.i + k) % n; if (this.cfg.steps[jj].goto) { j = jj; break; } }
      this.i = (j - 1 + n) % n;
    } else this.i = (this.i - 1 + n) % n;                        // riprova lo stesso passo
    if (this.idleClip) npcs.setLoop(this.npc, this.idleClip, 1, 0.3);
    this.step = { wait: 1 };
    this.dur = 1;
    return false;
  }

  _release() {
    if (this.claimed && this.ctx.spotClaims?.get(this.claimed) === this) this.ctx.spotClaims.delete(this.claimed);
    this.claimed = null;
  }

  // ---- camminata: tenere la destra, aggirare chi è fermo, fermarsi un attimo se si è addosso
  _avoid(vx, vz, dt) {
    const me = this.npc.position;
    const R = this.cfg.walkAvoid ?? 1.1;
    let sx = 0, sz = 0, block = false;
    const others = [];
    for (const o of this.ctx.npcs.npcs) {
      if (o === this.npc || !o.visible) continue;
      const r = this.ctx.routines?.find((x) => x.npc === o);
      if (r?.seated) continue;                                    // i vecchi seduti al tavolo non stanno nei corridoi
      others.push(o.position);
    }
    others.push(this.ctx.player.position);
    for (const p of others) {
      const rx = p.x - me.x, rz = p.z - me.z;
      const dist = Math.hypot(rx, rz);
      if (dist > R || dist < 1e-3) continue;
      const ahead = (rx * vx + rz * vz) / dist;
      const lateral = rx * -vz + rz * vx;                         // > 0: sta alla mia destra
      if (ahead < 0.2) {                                          // di fianco: solo non strisciargli addosso
        const S = this.cfg.sideGap ?? 0.5;
        if (ahead > -0.3 && dist < S) { const w = ((S - dist) / S) * 0.8 * Math.sign(lateral || 1); sx -= -vz * w; sz -= vx * w; }
        continue;
      }
      const side = lateral > 0.15 ? -1 : 1;                       // devio dalla parte libera (di norma a destra)
      const w = ((R - dist) / R) * ahead * 1.8;
      sx += -vz * side * w; sz += vx * side * w;
      if (dist < 0.5 && ahead > 0.75) block = true;
    }
    this.blockT = block ? (this.blockT ?? 0) + dt : 0;
    const x = vx + sx, z = vz + sz, l = Math.hypot(x, z) || 1;
    return { x: x / l, z: z / l, stop: block && this.blockT < 1.2 };
  }

  // Minigioco che ha bisogno di lui al tavolo (Peppino a scopa): di nuovo seduto, subito
  sitNow() {
    const npc = this.npc;
    if (!npc.userData.sit_clip) return;
    this.ctx.camerawork?.stop(npc);
    this._release();
    this.path = null; this.glide = null;
    npc.position.copy(this.home.pos);
    npc.rotation.y = this.home.yaw;
    this.idleClip = npc.userData.sit_clip;
    this.seated = true;
    npc.userData.lineSet = this.seatLines;
    this.ctx.npcs.setLoop(npc, this.idleClip);
    const sitIdx = this.cfg.steps.findIndex((x) => x.sit);
    if (sitIdx >= 0) this.i = sitIdx;
    this.step = { wait: 1 };
    this.t = 0; this.dur = 4;
    this.started = true;
  }

  // passaggio morbido di posizione e direzione (alzarsi, sedersi) con dissolvenza della clip
  _glide(pos, yaw, clip, dur) {
    const n = this.npc;
    this.glide = { from: n.position.clone(), to: pos.clone(), yaw0: n.rotation.y, yaw1: yaw, t: 0, dur };
    if (clip) this.ctx.npcs.setLoop(n, clip, 1, dur * 0.8);
    this.dur = Infinity;
  }

  // direzione del petto (perpendicolare alla linea delle spalle), nel piano orizzontale
  _bodyYaw() {
    this.shoulders ??= ['Left', 'Right'].map((side) => {
      let hit = null;
      const re = new RegExp(`^mixamorig${side}Shoulder(_\\d+)?$`);
      this.npc.traverse((o) => { if (!hit && o.isBone && re.test(o.name)) hit = o; });
      return hit;
    });
    const [L, R] = this.shoulders;
    if (!L || !R) return null;
    const s = L.getWorldPosition(new THREE.Vector3()).sub(R.getWorldPosition(new THREE.Vector3()));
    return Math.atan2(-s.z, s.x);                                  // avanti = (sinistra - destra) ruotata di 90° sul piano
  }

  _turnTo(yaw, dt, rate = 5) {
    const r = this.npc.rotation;
    let d = yaw - r.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    r.y += d * Math.min(1, dt * rate);
  }

  update(dt) {
    const ctx = this.ctx, npc = this.npc;
    if (npc.userData.minigameMoved) return;                    // in partita: ci pensa il minigioco
    // saluto la prima volta che si avvicina il giocatore (dopo il dialogo indicato)
    const g = this.cfg.greet;
    if (g && !this.greeted && !ctx.dialogue?.active && (!g.after || ctx.dialogue?.seen.has(g.after)) && this.near(g.distance)) {
      this.greeted = true;
      const p = ctx.player.position;
      npc.rotation.y = Math.atan2(p.x - npc.position.x, p.z - npc.position.z);
      ctx.npcs.playOnce(npc, this.clip(g.clip));
      this.say(g.say);
    }
    // mentre si parla con lui: fermo, girato verso il giocatore
    if (ctx.dialogue?.active?.npc === npc) {
      const p = ctx.player.position, q = npc.position;
      // le clip non sono sempre dritte (chi parla sta di tre quarti): si compensa di quanto il petto è girato
      const body = this._bodyYaw();
      if (body != null) {
        const off = Math.atan2(Math.sin(body - npc.rotation.y), Math.cos(body - npc.rotation.y));
        this.bodyOff = this.bodyOff == null ? off : this.bodyOff + (off - this.bodyOff) * Math.min(1, dt * 2);
      }
      this._turnTo(Math.atan2(p.x - q.x, p.z - q.z) - (this.bodyOff ?? 0), dt, 6);
      this.talking = true;
      return;
    }
    if (npc.userData.directed) return;                         // la serata lo sta guidando (invito, spettacolo)
    if (this.talking) {                                          // fine dialogo: riprende da dove era
      this.talking = false;
      if (this.path?.length && this.walkClip) ctx.npcs.setLoop(npc, this.walkClip, this.walkScale, 0.3);
    }
    if (!this.started) {
      const c = this.cfg.startAfter;
      this.waitStart = (this.waitStart ?? 0) + dt;
      if ((c && ctx.dialogue?.seen.has(c)) || this.waitStart > (this.cfg.startTimeout ?? 60)) { this.started = true; this._next(); }
      return;
    }
    if (this.glide) {
      const g = this.glide;
      g.t += dt;
      const k = Math.min(1, g.t / g.dur), e = k * k * (3 - 2 * k);
      npc.position.lerpVectors(g.from, g.to, e);
      const d = Math.atan2(Math.sin(g.yaw1 - g.yaw0), Math.cos(g.yaw1 - g.yaw0));
      npc.rotation.y = g.yaw0 + d * e;
      if (k >= 1) {
        this.glide = null;
        if (this.step?.sit) this.seated = true;
        this._next();
      }
      return;
    }
    const s = this.step;
    if (s.goto && this.path) {
      if (!this.path.length) {                                   // arrivato: si gira come il marcatore, poi idle
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.target.getWorldQuaternion(new THREE.Quaternion()));
        this._turnTo(Math.atan2(f.x, f.z), dt, 4);
        this.t += dt;
        if (this.t === dt && this.idleClip) ctx.npcs.setLoop(npc, this.idleClip, 1, 0.3);
        if (this.t > 0.6) { this.path = null; this._next(); }
        return;
      }
      const goal = this.path[0];
      const dx = goal.x - npc.position.x, dz = goal.z - npc.position.z;
      const d = Math.hypot(dx, dz);
      const step = (this.cfg.walkSpeed ?? 1.15) * dt;
      // un passaggio intermedio basta sfiorarlo (la deviazione può spostare di qualche decina di centimetri)
      const reach = this.path.length > 1 ? 0.25 : step;
      if (d <= reach) {
        if (this.path.length === 1) { npc.position.x = goal.x; npc.position.z = goal.z; }
        this.path.shift(); this.bestD = null; this.progT = 0;
        return;
      }
      // sblocco: se per 1.5 s non ci si avvicina alla meta, si salta il passaggio intermedio e per 2 s si passa oltre
      // ostacoli e persone (meglio un attimo di sovrapposizione che restare incastrati)
      this.progT = (this.progT ?? 0) + dt;
      if (this.bestD == null || d < this.bestD - 0.05) { this.bestD = d; this.progT = 0; }
      if (this.progT > 1.5) {
        this.progT = 0; this.bestD = null; this.ghostT = 2;
        if (this.path.length > 1) { this.path.shift(); return; }
      }
      const ghost = (this.ghostT = Math.max(0, (this.ghostT ?? 0) - dt)) > 0;
      const v = ghost ? { x: dx / d, z: dz / d } : this._avoid(dx / d, dz / d, dt);
      if (v.stop) { this._turnTo(Math.atan2(dx, dz), dt, 5); return; }
      npc.position.x += v.x * step; npc.position.z += v.z * step;
      if (!ghost) this.ctx.collisions?.resolve(npc.position, this.cfg.bodyRadius ?? 0.2);   // scivola lungo i mobili
      this._turnTo(Math.atan2(v.x, v.z), dt, 7);
      return;
    }
    this.t += dt;
    if (this.faceTarget) {                                         // commento: girata verso l'altro, poi la sua risposta
      const q = this.faceTarget.position, p = npc.position;
      this._turnTo(Math.atan2(q.x - p.x, q.z - p.z), dt, 5);
      if (this.reply && this.t >= this.reply.t) { this.say(this.reply.text, this.reply.who); this.reply = null; }
    }
    if (this.t >= this.dur) {
      if (this.faceTarget && this.idleClip) this.ctx.npcs.setLoop(npc, this.idleClip, 1, 0.3);
      this._next();
    }
  }
}

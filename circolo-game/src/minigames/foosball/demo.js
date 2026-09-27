// Partita dimostrativa al biliardino durante l'esplorazione: i due giocatori del circolo (npc_action = play_foosball)
// muovono davvero le aste. Fisica e IA come nel minigioco; le braccia seguono le impugnature con un'IK a due ossa
// applicata dopo l'animazione (spalla -> gomito -> polso), la mano allineata all'impugnatura.
import * as THREE from 'three';
import { getRig } from './rig.js';
import { makeState, step, kickoff } from './physics.js';
import { FoosballAI } from './ai.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

function findBone(root, base) {
  let hit = null;
  const re = new RegExp(`^${base}(_\\d+)?$`);
  root.traverse((o) => { if (!hit && o.isBone && re.test(o.name)) hit = o; });
  return hit;
}

// ruota l'osso (nello spazio del genitore) perché il suo asse locale `axis` punti verso `target` (mondo)
function aimBone(bone, target, axis) {
  bone.updateWorldMatrix(true, false);
  const wq = bone.getWorldQuaternion(_q);
  const pos = bone.getWorldPosition(_a);
  const cur = _b.copy(axis).applyQuaternion(wq).normalize();
  const want = _c.copy(target).sub(pos).normalize();
  const delta = _q2.setFromUnitVectors(cur, want);
  const nw = delta.multiply(wq);
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(pq.multiply(nw));
  bone.updateWorldMatrix(false, true);
}

class Arm {
  // Ossa di deformazione del rig Rigify (DEF-upper_arm, DEF-forearm, DEF-hand; braccio e avambraccio hanno un
  // secondo segmento .001 per la torsione). Con il vecchio rig: upperarm, forearm, hand.
  constructor(npc, side) {
    const s = side === 'R' ? 'R' : 'L';
    this.upper = findBone(npc, `DEF-upper_arm${s}`) ?? findBone(npc, `upperarm${s}`);
    this.fore = findBone(npc, `DEF-forearm${s}`) ?? findBone(npc, `forearm${s}`);
    this.hand = findBone(npc, `DEF-hand${s}`) ?? findBone(npc, `hand${s}`);
    this.ok = !!(this.upper && this.fore && this.hand);
    if (!this.ok) return;
    npc.updateWorldMatrix(true, true);
    const pu = this.upper.getWorldPosition(new THREE.Vector3());
    const pf = this.fore.getWorldPosition(new THREE.Vector3());
    const ph = this.hand.getWorldPosition(new THREE.Vector3());
    this.L1 = pu.distanceTo(pf);
    this.L2 = pf.distanceTo(ph);
    // asse locale di ciascun osso verso il giunto successivo (misurato, non presunto)
    const local = (bone, target) => target.clone().sub(bone.getWorldPosition(new THREE.Vector3()))
      .applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    this.axisU = local(this.upper, pf);
    this.axisF = local(this.fore, ph);
    this.target = null;
    this.side = s;
  }

  // grip: centro dell'impugnatura; out: direzione orizzontale verso l'esterno del corpo (per il gomito)
  solve(grip, bodyOut, down) {
    const S = this.upper.getWorldPosition(new THREE.Vector3());
    const toGrip = grip.clone().sub(S);
    const horiz = toGrip.clone().setY(0).normalize();
    const T = grip.clone().addScaledVector(horiz, -0.075);        // polso poco prima dell'impugnatura
    const dvec = T.clone().sub(S);
    const d = Math.min(dvec.length(), this.L1 + this.L2 - 1e-3);
    const dir = dvec.normalize();
    const a = (this.L1 * this.L1 - this.L2 * this.L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, this.L1 * this.L1 - a * a));
    const pole = bodyOut.clone().multiplyScalar(0.6).add(down).addScaledVector(horiz, -0.3);
    const pd = pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const E = S.clone().addScaledVector(dir, a).addScaledVector(pd, h);
    const W = S.clone().addScaledVector(dir, d);
    aimBone(this.upper, E, this.axisU);
    aimBone(this.fore, W, this.axisF);
    aimBone(this.hand, grip.clone().addScaledVector(horiz, 0.06), new THREE.Vector3(0, 1, 0));
  }
}

export class FoosballDemo {
  constructor(ctx) {
    this.ctx = ctx;
    this.rig = getRig(ctx.root, ctx.scene);
    if (!this.rig) return;
    this.players = [];
    for (const npc of ctx.npcs.npcs) {
      if (npc.userData.npc_action !== 'play_foosball') continue;
      const team = npc.userData.foos_team;
      const own = this.rig.views.filter((v) => v.rod.team === team);
      const byRole = (r) => own.find((v) => v.rod.role === r);
      // mano sinistra su portiere/difesa, destra su centrocampo/attacco (come un giocatore vero)
      this.players.push({ npc, team, arms: { L: new Arm(npc, 'L'), R: new Arm(npc, 'R') },
        pairs: { L: [byRole('GK'), byRole('DEF')], R: [byRole('MID'), byRole('ATT')] }, grips: {} });
    }
    this.st = makeState(this.rig.field, this.rig.rods, this.rig.P);
    this.ai = [new FoosballAI('facile', Math.random, 'A'), new FoosballAI('facile', Math.random, 'B')];
    kickoff(this.st, Math.random() < 0.5 ? 'A' : 'B', 0.3);
    this.active = true;
  }

  get enabled() { return !!this.rig && this.rig.owner === null; }

  update(dt) {
    if (!this.enabled) return;
    const st = this.st;
    for (const ai of this.ai) ai.update(st, dt);
    const ev = step(st, dt, this.rig.P);
    if (ev.goal || ev.stall) kickoff(st, ev.goal ?? null, 0.3);
    this.rig.draw(st);
    this._arms(dt);
  }

  _arms(dt) {
    const down = new THREE.Vector3(0, -1, 0);
    for (const p of this.players) {
      if (p.npc.userData.minigameMoved) continue;
      p.npc.updateWorldMatrix(true, true);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(p.npc.getWorldQuaternion(new THREE.Quaternion()));
      for (const side of ['L', 'R']) {
        const arm = p.arms[side];
        if (!arm.ok) continue;
        // asta della coppia più vicina alla palla
        const pair = p.pairs[side].filter(Boolean);
        const v = pair.reduce((a, b) => (Math.abs(b.rod.x - this.st.ball.x) < Math.abs(a.rod.x - this.st.ball.x) ? b : a));
        const want = this.rig.handleWorld(v);
        const g = p.grips[side] ?? (p.grips[side] = want.clone());
        g.lerp(want, Math.min(1, dt * 14));                         // la mano passa da un'asta all'altra in fretta ma non di scatto
        // lato esterno del corpo: la destra del personaggio è -X locale (fronte -Y)
        const out = right.clone().multiplyScalar(side === 'R' ? -1 : 1);
        arm.solve(g, out, down);
      }
    }
  }

  // il minigioco prende il tavolo: la demo si ferma e le aste tornano in posizione
  release() { this.rig.owner = null; kickoff(this.st, null, 0.3); }
  claim(owner) { if (this.rig) { this.rig.owner = owner; this.rig.reset(); } }
}

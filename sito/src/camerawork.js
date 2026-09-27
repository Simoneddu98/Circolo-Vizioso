// Kappa (foto) e Zucco (video) con la reflex in mano (Prop_Camera del glb, una copia a testa).
// La posa si fa con l'IK sopra l'animazione, nello spazio del personaggio (avanti +Z, su +Y, destra -X):
//   - mano destra sull'impugnatura, a destra del corpo macchina, dita in avanti attorno al grip;
//   - mano sinistra sotto l'obiettivo, dita in avanti, a sostenerlo;
//   - foto: macchina davanti agli occhi (mirino); video: più avanti e più bassa (si guarda lo schermo), luce REC.
// La macchina segue il polso destro mentre si alza e si abbassa e si mette in bolla quando la posa è completa.
// CONFIG.camerawork: tempi e misure. La routine avvia con { act: 'photo' | 'video', for: secondi }.
import * as THREE from 'three';
import { ArmIK, findBone } from './ik.js';
import { sfx } from './minigames/util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

export class CameraWork {
  constructor(ctx) {
    this.ctx = ctx;
    this.cfg = ctx.config.camerawork;
    this.rigs = new Map();
    const src = ctx.root.getObjectByName('Prop_Camera');
    if (!src) return;
    src.updateWorldMatrix(true, true);
    for (const npc of ctx.npcs.npcs) {
      const role = npc.userData.camera_role;
      if (!role) continue;
      // copia della macchina: origine al centro del corpo (lo scarto di meshopt si toglie col bounding box)
      const cam = src.clone(true);
      cam.visible = true;
      const holder = new THREE.Group();
      holder.name = `Camera_${npc.userData.npc_name}`;
      const box = new THREE.Box3().setFromObject(src);
      const center = box.getCenter(new THREE.Vector3());
      src.matrixWorld.decompose(cam.position, cam.quaternion, cam.scale);
      cam.position.sub(center);
      holder.add(cam);
      if (role === 'video') {                          // luce REC sul corpo macchina
        const rec = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
        rec.position.set(-0.03, 0.035, 0.02);
        holder.add(rec);
        holder.userData.rec = rec;
      }
      holder.visible = false;
      ctx.scene.add(holder);
      const flash = role === 'photo' ? new THREE.PointLight(0xffffff, 0, 4) : null;
      if (flash) ctx.scene.add(flash);
      this.rigs.set(npc, {
        npc, role, cam: holder, flash, head: findBone(npc, 'mixamorigHead'),
        R: new ArmIK(npc, 'Right'), L: new ArmIK(npc, 'Left'), t: 0, dur: 0, on: false,
      });
    }
  }

  // avvia foto o video per dur secondi (restituisce la durata totale, con salita e discesa)
  play(npc, dur) {
    const r = this.rigs.get(npc);
    if (!r || !r.R.ok || !r.L.ok) return 0;
    const c = this.cfg[r.role];
    r.t = 0; r.dur = dur; r.on = true; r.shots = 0; r.nextShot = c.raise + 0.5;
    return dur + c.raise + c.lower;
  }

  stop(npc) {
    const r = this.rigs.get(npc);
    if (!r?.on) return;
    r.on = false;
    r.cam.visible = false;
    if (r.flash) r.flash.intensity = 0;
    r.R.release(); r.L.release();
  }

  busy(npc) { return !!this.rigs.get(npc)?.on; }

  update(dt) {
    for (const r of this.rigs.values()) {
      if (!r.on) continue;
      // in dialogo o spostato da un minigioco: si ferma
      if (r.npc.userData.minigameMoved || this.ctx.dialogue?.active?.npc === r.npc || !r.npc.visible) { this.stop(r.npc); continue; }
      this._pose(r, dt);
    }
  }

  _pose(r, dt) {
    const c = this.cfg[r.role];
    r.t += dt;
    const total = c.raise + r.dur + c.lower;
    if (r.t >= total) { this.stop(r.npc); return; }
    const s = (x) => x * x * (3 - 2 * x);
    const w = r.t < c.raise ? s(r.t / c.raise) : r.t > c.raise + r.dur ? s(1 - (r.t - c.raise - r.dur) / c.lower) : 1;
    const npc = r.npc;
    npc.updateWorldMatrix(true, true);
    const q = npc.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const right = new THREE.Vector3(-1, 0, 0).applyQuaternion(q);
    const head = r.head.getWorldPosition(new THREE.Vector3());
    // centro della macchina in posa, con un leggero ondeggiare (chi inquadra si muove un po')
    const sway = Math.sin(r.t * 1.7) * c.sway;
    const C = head.clone().addScaledVector(fwd, c.forward).addScaledVector(Y, c.up).addScaledVector(right, c.side + sway);
    const at = (x, y, z) => C.clone().addScaledVector(right, x).addScaledVector(Y, y).addScaledVector(fwd, z);
    const gripR = at(...c.wristR), aimR = at(...c.aimR);          // polso destro e verso delle dita
    const gripL = at(...c.wristL), aimL = at(...c.aimL);
    // braccio destro: il polso va dalla posa dell'animazione all'impugnatura
    r.R.begin(); r.L.begin();
    // asse del palmo, misurato sulla posa di riposo (braccia lungo i fianchi, palmi verso le cosce)
    if (!r.R.palm) { r.R.calibratePalm(right.clone().negate()); r.L.calibratePalm(right.clone()); }
    const curR = r.R.hand.getWorldPosition(new THREE.Vector3());
    const curL = r.L.hand.getWorldPosition(new THREE.Vector3());
    // gomiti in basso, un po' in fuori e indietro (sotto le mani, come chi tiene una reflex all'occhio)
    const pole = (side) => new THREE.Vector3(0, -1, 0).addScaledVector(right, side * c.elbowOut).addScaledVector(fwd, -c.elbowBack);
    r.R.solveHinge(curR.clone().lerp(gripR, w), pole(1));
    r.L.solveHinge(curL.clone().lerp(gripL, w), pole(-1));
    // mani: la destra impugna il fianco destro del corpo macchina (palmo verso la macchina, dita in avanti),
    // la sinistra la sostiene da sotto con il palmo in su (dita in avanti, sotto l'obiettivo)
    const wrR = r.R.hand.getWorldPosition(new THREE.Vector3()), wrL = r.L.hand.getWorldPosition(new THREE.Vector3());
    r.R.orientHand(aimR.clone().sub(wrR), right.clone().negate(), w);
    r.L.orientHand(aimL.clone().sub(wrL), Y, w);
    r.R.end(); r.L.end();
    // macchina: attaccata al polso destro (stessa distanza della posa), in bolla solo quando è su
    const wristR = r.R.hand.getWorldPosition(new THREE.Vector3());
    r.cam.position.copy(C).add(_v.copy(wristR).sub(gripR));
    const level = q.clone().multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), c.pitch));
    const hang = q.clone().multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.2));
    r.cam.quaternion.slerpQuaternions(hang, level, w);
    r.cam.visible = true;
    if (r.cam.userData.rec) r.cam.userData.rec.visible = w > 0.9 && Math.floor(r.t * 2) % 2 === 0;
    // foto: scatti con il flash quando la macchina è all'occhio
    if (r.flash) {
      r.flash.intensity = Math.max(0, r.flash.intensity - dt * 400);
      if (w > 0.95 && r.t >= r.nextShot) {
        r.nextShot = r.t + c.shotEvery[0] + Math.random() * (c.shotEvery[1] - c.shotEvery[0]);
        r.flash.position.copy(r.cam.position).addScaledVector(fwd, 0.08).addScaledVector(Y, 0.05);
        r.flash.intensity = c.flash;
        if (npc.getWorldPosition(_w).distanceTo(this.ctx.player.position) < c.hearing) {
          sfx({ freq: 900, dur: 0.035, vol: 0.18, noise: 0.9 });
          setTimeout(() => sfx({ freq: 600, dur: 0.05, vol: 0.14, noise: 0.9 }), 70);
        }
      }
    }
  }
}

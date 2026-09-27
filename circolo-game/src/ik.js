// IK a due ossa per le braccia dei personaggi Mixamo (spalla -> gomito -> polso), applicata sopra l'animazione.
// Usata dal barista (versata) e da Kappa e Zucco (foto e video con la reflex in mano).
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export function findBone(root, base) {
  let hit = null;
  const re = new RegExp(`^${base}(_\\d+)?$`);
  root.traverse((o) => { if (!hit && o.isBone && re.test(o.name)) hit = o; });
  return hit;
}

// ruota l'osso perché il suo asse locale `axis` punti verso `target` (mondo)
export function aimBone(bone, target, axis) {
  bone.updateWorldMatrix(true, false);
  const wq = bone.getWorldQuaternion(_q);
  const pos = bone.getWorldPosition(_a);
  const cur = _b.copy(axis).applyQuaternion(wq).normalize();
  const want = _c.copy(target).sub(pos).normalize();
  const nw = _q2.setFromUnitVectors(cur, want).multiply(wq);
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(pq.multiply(nw));
  bone.updateWorldMatrix(false, true);
}

// braccio Mixamo (spalla -> gomito -> polso): lunghezze e assi misurati sulla posa corrente
export class ArmIK {
  constructor(npc, side) {
    this.upper = findBone(npc, `mixamorig${side}Arm`);
    this.fore = findBone(npc, `mixamorig${side}ForeArm`);
    this.hand = findBone(npc, `mixamorig${side}Hand`);
    this.ok = !!(this.upper && this.fore && this.hand);
    if (!this.ok) return;
    npc.updateWorldMatrix(true, true);
    const pu = this.upper.getWorldPosition(new THREE.Vector3());
    const pf = this.fore.getWorldPosition(new THREE.Vector3());
    const ph = this.hand.getWorldPosition(new THREE.Vector3());
    this.L1 = pu.distanceTo(pf);
    this.L2 = pf.distanceTo(ph);
    const local = (bone, target) => target.clone().sub(bone.getWorldPosition(new THREE.Vector3()))
      .applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    this.axisU = local(this.upper, pf);
    this.axisF = local(this.fore, ph);
  }

  // Il mixer di three.js scrive un osso solo quando il valore dell'animazione cambia: con una clip ferma sul braccio
  // (Idle) la posa dell'IK resterebbe lì per sempre. Prima di ogni IK si rimette la posa dell'animazione (quella scritta
  // dal mixer in questo fotogramma, oppure l'ultima salvata se il mixer non ha scritto niente), e release() la ripristina.
  begin() {
    const bones = [this.upper, this.fore, this.hand];
    this.anim ??= bones.map((b) => b.quaternion.clone());
    bones.forEach((b, i) => {
      if (this.ik && b.quaternion.equals(this.ik[i])) b.quaternion.copy(this.anim[i]);
      else this.anim[i].copy(b.quaternion);
    });
  }

  end() { this.ik = [this.upper, this.fore, this.hand].map((b) => b.quaternion.clone()); }

  release() {
    if (!this.ik) return;
    this.begin();
    this.ik = null;
    this.upper.updateWorldMatrix(false, true);
  }

  // Asse del gomito nello spazio del braccio: la piega che l'avambraccio ha nell'animazione (rotazione locale).
  // Serve a solveHinge per orientare le ossa senza torsioni; si misura la prima volta che il gomito è un po' piegato.
  _hinge() {
    if (this.hinge) return this.hinge;
    const q = this.fore.quaternion;
    const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    if (ang < 0.12) return null;
    const s = Math.sqrt(1 - q.w * q.w) * Math.sign(q.w || 1);
    this.hinge = new THREE.Vector3(q.x / s, q.y / s, q.z / s).normalize();
    // l'asse va perpendicolare all'osso (asse locale +Y)
    this.hinge.y = 0; this.hinge.normalize();
    return this.hinge;
  }

  // Come solve, ma ogni osso prende l'orientamento intero (direzione dell'osso e asse del gomito) invece della rotazione
  // più corta: il braccio che dal fianco sale davanti al viso non si attorciglia.
  solveHinge(T, pole) {
    const hinge = this._hinge();
    if (!hinge) { this.solve(T, pole); return; }
    const S = this.upper.getWorldPosition(new THREE.Vector3());
    const dvec = T.clone().sub(S);
    const d = Math.min(dvec.length(), this.L1 + this.L2 - 1e-3);
    const dir = dvec.normalize();
    const a = (this.L1 * this.L1 - this.L2 * this.L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, this.L1 * this.L1 - a * a));
    const pd = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const E = S.clone().addScaledVector(dir, a).addScaledVector(pd, h);
    const W = S.clone().addScaledVector(dir, d);
    const u = E.clone().sub(S).normalize(), v = W.clone().sub(E).normalize();
    let n = u.clone().cross(v);
    if (n.lengthSq() < 1e-8) n = pd.clone().cross(u);
    n.normalize();
    this._orient(this.upper, this.axisU, hinge, u, n);
    this._orient(this.fore, this.axisF, hinge, v, n);
  }

  // orientamento mondo dell'osso: asse locale `axis` -> dir, asse del gomito `hinge` -> n
  _orient(bone, axis, hinge, dir, n) {
    const ly = axis.clone().normalize();
    const lh = hinge.clone().sub(ly.clone().multiplyScalar(hinge.dot(ly))).normalize();
    const lz = new THREE.Vector3().crossVectors(ly, lh);
    const wy = dir.clone();
    const wh = n.clone().sub(wy.clone().multiplyScalar(n.dot(wy))).normalize();
    const wz = new THREE.Vector3().crossVectors(wy, wh);
    const Ml = new THREE.Matrix4().makeBasis(lh, ly, lz);
    const Mw = new THREE.Matrix4().makeBasis(wh, wy, wz);
    const qw = new THREE.Quaternion().setFromRotationMatrix(Mw.multiply(Ml.transpose()));
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(pq.multiply(qw));
    bone.updateWorldMatrix(false, true);
  }

  // Asse del palmo nello spazio della mano: con le braccia lungo i fianchi (animazione di riposo) il palmo guarda la
  // coscia, cioè verso il centro del corpo (inward, mondo). Si prende l'asse locale (±X, ±Z) più allineato.
  calibratePalm(inward) {
    if (this.palm) return this.palm;
    const q = this.hand.getWorldQuaternion(new THREE.Quaternion());
    let best = null, bd = -2;
    for (const v of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
      const l = new THREE.Vector3(...v);
      const d = l.clone().applyQuaternion(q).dot(inward);
      if (d > bd) { bd = d; best = l; }
    }
    this.palm = best;
    return best;
  }

  // Mano: dita (asse locale +Y) verso fingers, palmo verso palm (mondo); w = quanto (0 = posa dell'animazione)
  orientHand(fingers, palm, w = 1) {
    if (!this.palm) return;
    const bone = this.hand;
    const ly = new THREE.Vector3(0, 1, 0), lp = this.palm.clone();
    const lz = new THREE.Vector3().crossVectors(ly, lp);
    const wy = fingers.clone().normalize();
    const wp = palm.clone().sub(wy.clone().multiplyScalar(palm.dot(wy))).normalize();
    const wz = new THREE.Vector3().crossVectors(wy, wp);
    const Ml = new THREE.Matrix4().makeBasis(lp, ly, lz);
    const Mw = new THREE.Matrix4().makeBasis(wp, wy, wz);
    const qw = new THREE.Quaternion().setFromRotationMatrix(Mw.multiply(Ml.transpose()));
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const target = pq.multiply(qw);
    bone.quaternion.slerp(target, w);
    bone.updateWorldMatrix(false, true);
  }

  // polso su T, gomito verso pole
  solve(T, pole) {
    const S = this.upper.getWorldPosition(new THREE.Vector3());
    const dvec = T.clone().sub(S);
    const d = Math.min(dvec.length(), this.L1 + this.L2 - 1e-3);
    const dir = dvec.normalize();
    const a = (this.L1 * this.L1 - this.L2 * this.L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, this.L1 * this.L1 - a * a));
    const pd = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const E = S.clone().addScaledVector(dir, a).addScaledVector(pd, h);
    aimBone(this.upper, E, this.axisU);
    aimBone(this.fore, S.clone().addScaledVector(dir, d), this.axisF);
  }
}


// Parti mobili del biliardino condivise tra il minigioco e la partita dimostrativa dei due giocatori del circolo:
// perni delle aste (dall'extra axis_gltf, perché la compressione meshopt sposta l'origine dei nodi mesh), palla, fisica.
import * as THREE from 'three';
import { SurfaceFrame } from '../util.js';
import { makeRod, DEFAULTS } from './physics.js';

const Z = new THREE.Vector3(0, 0, 1);

export function getRig(root, scene) {
  if (root.userData.foosRig) return root.userData.foosRig;
  const fieldObj = root.getObjectByName('FOOSBALL_Field');
  if (!fieldObj) return null;
  const f = new SurfaceFrame(fieldObj);
  const goalA = root.getObjectByName('FOOSBALL_Goal_A');
  const ga = f.toLocal(goalA.getWorldPosition(new THREE.Vector3()));
  const flip = ga.x > 0 ? -1 : 1;                   // la porta A deve stare a -x nella fisica
  const P = { ...DEFAULTS, r: fieldObj.userData.ball_radius ?? DEFAULTS.r };
  const field = { hx: f.width / 2, hy: f.depth / 2, goalHalf: (goalA.userData.width ?? 0.2) / 2 };
  const lateral = f.dirWorld(0, 1).normalize();
  const views = [];
  root.traverse((o) => { if (/^FOOSBALL_Rod_/.test(o.name) && o.userData.axis_gltf) views.push({ node: o }); });
  views.sort((a, b) => a.node.userData.index - b.node.userData.index);
  const handleZ = field.hy + 0.41;                  // centro dell'impugnatura sull'asse, dal centro del campo
  for (const v of views) {
    const u = v.node.userData;
    const axis = new THREE.Vector3().fromArray(u.axis_gltf);
    const loc = f.toLocal(axis);
    v.rod = makeRod(loc.x * flip, u.team, u.figure_offsets.map((o) => o * flip), u.travel, u.leg);
    v.rod.role = u.role;
    v.base = axis.clone();
    v.pivot = new THREE.Group();
    v.pivot.name = `${v.node.name}_Pivot`;
    v.pivot.position.copy(axis);
    v.pivot.quaternion.copy(f.quat);
    scene.add(v.pivot);
    v.pivot.updateMatrixWorld(true);
    v.pivot.attach(v.node);
    v.lateral = lateral.clone().multiplyScalar(flip);
    // impugnature: squadra A sul lato -y del campo (= +z locale del perno), squadra B sul lato opposto
    v.handleLocal = new THREE.Vector3(0, 0, u.team === 'A' ? handleZ : -handleZ);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(P.r, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.35 }));
  ball.name = 'Foosball_Ball';
  ball.visible = false;                              // la palla c'è solo quando si gioca
  ball.castShadow = true;
  scene.add(ball);
  const rig = {
    frame: f, flip, P, field, views, ball, rods: views.map((v) => v.rod), owner: null,
    // disegna lo stato della fisica
    draw(st) {
      const b = st.ball;
      f.toWorld(b.x * flip, b.y * flip, P.r, ball.position);
      for (const v of views) {
        v.pivot.position.copy(v.base).addScaledVector(v.lateral, v.rod.slide);
        v.pivot.quaternion.copy(f.quat).multiply(new THREE.Quaternion().setFromAxisAngle(Z, v.rod.angle * flip));
      }
    },
    handleWorld(v, out = new THREE.Vector3()) { v.pivot.updateMatrixWorld(true); return v.pivot.localToWorld(out.copy(v.handleLocal)); },
    reset() { for (const r of this.rods) { r.slide = 0; r.slideVel = 0; r.angle = 0; r.omega = 0; } },
  };
  root.userData.foosRig = rig;
  return rig;
}

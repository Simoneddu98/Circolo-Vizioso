// Mani in prima persona (assets/hands.glb): tre pose statiche, punti di aggancio per bicchiere e sigaretta,
// movimenti procedurali (comparsa, verso la bocca, ritorno). Disegnate in una seconda passata sopra la scena,
// con il depth buffer pulito: non entrano mai nei muri o nel bancone.
import * as THREE from 'three';

const _e = new THREE.Euler();

export class Hands {
  constructor(gltf, config) {
    this.cfg = config.hands;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(config.render.fov, 1, 0.01, 5);
    this.scene.add(this.camera);
    this.rig = new THREE.Group();
    this.camera.add(this.rig);
    this.poses = {};
    this.sockets = {};
    if (gltf) {
      for (const name of ['Hand_Relaxed', 'Hand_Glass', 'Hand_Cigarette', 'Hand_Point']) {
        const o = gltf.scene.getObjectByName(name);
        if (!o) continue;
        o.removeFromParent();
        o.position.set(0, 0, 0);
        o.quaternion.identity();
        o.visible = false;
        o.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
        this.rig.add(o);
        this.poses[name] = o;
      }
      this.sockets.Socket_Glass = this.rig.getObjectByName('Socket_Glass');
      this.sockets.Socket_Cigarette = this.rig.getObjectByName('Socket_Cigarette');
      this.sockets.Socket_Fingertip = this.rig.getObjectByName('Socket_Fingertip');
    }
    // luce propria delle mani: calda come quella del circolo
    this.scene.add(new THREE.HemisphereLight(0xffe7c4, 0x3a2414, 1.1));
    const key = new THREE.DirectionalLight(0xffe0b0, this.cfg.lightIntensity);
    key.position.set(-0.4, 1, 0.6);
    this.camera.add(key);
    this.current = null;
    this.tween = null;
    this._place(this.cfg.hidden);
  }

  get available() { return Object.keys(this.poses).length > 0; }
  get busy() { return !!this.tween; }
  get active() { return !!this.current; }

  _place(p) {
    this.rig.position.fromArray(p.pos);
    this.rig.quaternion.setFromEuler(_e.set(p.rot[0], p.rot[1], p.rot[2], p.rot[3] ?? 'XYZ'));
  }

  // Muove la mano verso una posizione nominata di config.hands (rest, mouthGlass, mouthCig, hidden) o una posa { pos, rot }
  moveTo(name, duration, onDone) {
    const to = typeof name === 'string' ? this.cfg[name] : name;
    this.tween = {
      fromPos: this.rig.position.clone(), fromQ: this.rig.quaternion.clone(),
      toPos: new THREE.Vector3().fromArray(to.pos), toQ: new THREE.Quaternion().setFromEuler(_e.set(to.rot[0], to.rot[1], to.rot[2], to.rot[3] ?? 'XYZ')),
      t: 0, dur: Math.max(0.01, duration), onDone,
    };
  }

  // Mostra una posa e, se dato, aggancia un oggetto al suo socket
  hold(pose, obj, socket) {
    for (const [n, o] of Object.entries(this.poses)) o.visible = n === pose;
    this.current = pose;
    if (obj && this.sockets[socket]) {
      this.sockets[socket].add(obj);
      obj.position.set(0, 0, 0);
      obj.quaternion.identity();
      obj.scale.set(1, 1, 1);
      obj.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    }
    this._place(this.cfg.hidden);
    this.moveTo('rest', this.cfg.showTime);
  }

  // Porta il polpastrello dell'indice (posa Hand_Point) sul punto `world`, arrivando lungo la normale `normal`
  // (mondo): avvicinamento, contatto, ritorno a riposo. onTouch al contatto, onDone alla fine.
  press(world, normal, { onTouch, onDone, depth = 0.004, approach = 0.05, rot = null } = {}) {
    const tip = this.sockets.Socket_Fingertip;
    if (!tip) { onTouch?.(); onDone?.(); return; }
    if (this.current !== 'Hand_Point') this.hold('Hand_Point');
    const r = rot ?? this.cfg.press.rot;
    const q = new THREE.Quaternion().setFromEuler(_e.set(r[0], r[1], r[2], r[3] ?? 'XYZ'));
    const tipLocal = tip.getWorldPosition(new THREE.Vector3());
    this.rig.worldToLocal(tipLocal);                                  // punta nello spazio del rig
    const at = (w) => {                                               // posizione del rig perché la punta stia su w
      const cam = this.camera;
      cam.updateMatrixWorld();
      const local = cam.worldToLocal(w.clone());
      return local.sub(tipLocal.clone().applyQuaternion(q)).toArray();
    };
    const n = normal.clone().normalize();
    const above = at(world.clone().addScaledVector(n, approach));
    const touch = at(world.clone().addScaledVector(n, -depth));
    this.moveTo({ pos: above, rot: r }, this.cfg.press.reach, () => {
      this.moveTo({ pos: touch, rot: r }, this.cfg.press.push, () => {
        onTouch?.();
        this.moveTo({ pos: above, rot: r }, this.cfg.press.push, () => {
          this.moveTo('rest', this.cfg.press.reach, onDone);
        });
      });
    });
  }

  hide(onDone) {
    if (!this.current) { onDone?.(); return; }
    this.moveTo('hidden', this.cfg.showTime * 0.8, () => {
      for (const o of Object.values(this.poses)) o.visible = false;
      this.current = null;
      onDone?.();
    });
  }

  hideNow() {
    for (const o of Object.values(this.poses)) o.visible = false;
    this.current = null;
    this.tween = null;
    this._place(this.cfg.hidden);
  }

  update(dt, mainCamera) {
    // la camera delle mani copia quella di gioco (anche oscillazione e head bob)
    mainCamera.updateMatrixWorld();
    this.camera.position.setFromMatrixPosition(mainCamera.matrixWorld);
    this.camera.quaternion.setFromRotationMatrix(_m.extractRotation(mainCamera.matrixWorld));
    if (this.camera.fov !== mainCamera.fov || this.camera.aspect !== mainCamera.aspect) {
      this.camera.fov = mainCamera.fov; this.camera.aspect = mainCamera.aspect; this.camera.updateProjectionMatrix();
    }
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      const e = k * k * (3 - 2 * k);
      this.rig.position.lerpVectors(tw.fromPos, tw.toPos, e);
      this.rig.quaternion.slerpQuaternions(tw.fromQ, tw.toQ, e);
      if (k >= 1) { this.tween = null; tw.onDone?.(); }
    }
    this.scene.updateMatrixWorld();
  }

  render(renderer) {
    if (!this.current) return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
}

const _m = new THREE.Matrix4();

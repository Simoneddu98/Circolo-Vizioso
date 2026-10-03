// "La storia", capitolo 4: la tua macchina, una Dodge Challenger del 1970 (assets/macchina.glb; script in
// asset-props/macchina/). È parcheggiata in strada: ci sali con E, guidi con WASD o le frecce (o la levetta sul telefono),
// C cambia visuale (da dietro / dal posto di guida), E per scendere.
//
// Tutto si calcola in coordinate della strada (x lungo la via, z di traverso; vedi strada.js): la macchina resta sulla
// carreggiata, e quando arriva in fondo al tratto ricomincia dall'altro capo (un "giro"). Modello di guida semplice:
// velocità con accelerazione, freno e attrito, sterzo a bicicletta (passo 2,9 m). Nel modello il davanti è -Z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const RUOTE = ['Ruota_AS', 'Ruota_AD', 'Ruota_PS', 'Ruota_PD'];

export class Auto {
  constructor(ctx, cfg, strada) {
    this.ctx = ctx;
    this.cfg = cfg;                          // STORIA.auto
    this.strada = strada;
    this.root = new THREE.Group();
    this.root.name = 'Storia_Auto';
    this.x = cfg.parcheggio[0]; this.z = cfg.parcheggio[1]; this.h = cfg.parcheggio[2];   // h: direzione (0 = verso +x)
    this.v = 0; this.steer = 0;
    this.driving = false;
    this.vista = 'dietro';
    this.giri = 0;
    this.ready = null;
    this.eye = new THREE.Vector3();
  }

  load() {
    this.ready ??= new Promise((res) => {
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(this.cfg.url, (g) => { this._build(g.scene); res(true); },
        undefined, () => res(false));
    });
    return this.ready;
  }

  _build(model) {
    model.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
    // le gomme toccano terra: il punto più basso delle ruote va a y = 0
    const low = new THREE.Box3().setFromObject(model).min.y;
    model.position.y = -low;
    this.wheels = RUOTE.map((n) => model.getObjectByName(n)).filter(Boolean);
    for (const w of this.wheels) w.rotation.order = 'YXZ';  // prima gira sull'asse, poi sterza
    this.radius = 0.325;
    this.root.add(model);
    this.strada.group.add(this.root);
    this._place();
  }

  get loaded() { return !!this.wheels; }

  // posizione e rotazione del modello dalle coordinate della strada
  _place() {
    const C = this.cfg;
    this.root.position.set(this.x, C.quota, this.z);
    this.root.rotation.y = -this.h - Math.PI / 2;
  }

  get forward() { return new THREE.Vector2(Math.cos(this.h), Math.sin(this.h)); }

  // da parcheggiata è un ostacolo per chi cammina (rettangolo orientato, coordinate del mondo)
  collisionBox() {
    const o = this.strada.group.position, f = this.forward;
    return { name: 'Auto', cx: o.x + this.x, cz: o.z + this.z, ux: f.x, uz: f.y, vx: -f.y, vz: f.x, hx: 2.45, hz: 0.98, minY: 0, maxY: 1.4 };
  }

  // dove si scende: accanto alla portiera del guidatore (a sinistra), dentro i limiti della strada
  get uscita() {
    const f = this.forward, o = this.strada.group.position;
    const x = this.x + f.y * 1.6, z = this.z - f.x * 1.6;
    return new THREE.Vector3(o.x + x, 0, o.z + z);
  }

  // dove punta il guidatore, per sapere da che parte guardare scendendo
  get yaw() { return -this.h - Math.PI / 2; }

  sali() {
    const p = this.ctx.player;
    this.driving = true;
    this.v = 0;
    this._camera(true);
    p.sit({ eye: this.eye, yaw: this.yaw, pitch: this.vista === 'dietro' ? -0.12 : -0.04 });
    p.clearInput();
  }

  scendi() {
    this.driving = false;
    this.v = 0;
    const p = this.ctx.player;
    p.seat = null;
    p.position.copy(this.uscita);
    p.yaw = this.yaw; p.pitch = 0;
    p.velocity.set(0, 0, 0);
    p.clearInput();
  }

  cambiaVista() { this.vista = this.vista === 'dietro' ? 'dentro' : 'dietro'; this._camera(true); }

  // telecamera: da dietro (inseguimento morbido) o dal posto di guida
  _camera(snap = false) {
    const C = this.cfg, o = this.strada.group.position, f = this.forward;
    const target = new THREE.Vector3();
    if (this.vista === 'dietro') {
      target.set(o.x + this.x - f.x * C.dietro[0], C.dietro[1], o.z + this.z - f.y * C.dietro[0]);
    } else {
      // posto di guida: a sinistra e un po' indietro rispetto al centro (nel modello: x -0,40, z +0,25)
      const [lx, ly, lz] = C.guidatore;
      const s = -lz;                                          // avanti lungo f
      target.set(o.x + this.x + f.x * s - f.y * lx, C.quota + ly, o.z + this.z + f.y * s + f.x * lx);   // destra = (-f.z, f.x)
    }
    if (snap || this.vista === 'dentro') this.eye.copy(target);
    else this.eye.lerp(target, 1 - Math.exp(-C.inseguimento * this._dt));
    const seat = this.ctx.player.seat;
    if (seat) {
      const dy = this.yaw - seat.yaw;
      seat.yaw = this.yaw; seat.eye.copy(this.eye);
      seat.pitch = this.vista === 'dietro' ? -0.12 : -0.04;
      this.ctx.player.yaw += dy;                              // la testa gira con la macchina
    }
  }

  // ritorna true quando la macchina ha appena finito un giro (è ricomparsa all'altro capo del tratto)
  update(dt) {
    if (!this.loaded) return false;
    this._dt = dt;
    const C = this.cfg;
    let giro = false;
    if (this.driving) {
      const p = this.ctx.player, inp = p.input, an = p.analog;
      let gas = (inp.f ? 1 : 0) - (inp.b ? 1 : 0), dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
      if (an && !gas && !dir && Math.hypot(an.x, an.y) > 0.15) { gas = an.y; dir = an.x; }
      // gas e freno; indietro piano; da soli si rallenta
      if (gas > 0) this.v += (this.v < 0 ? C.freno : C.accelerazione) * gas * dt;
      else if (gas < 0) this.v += (this.v > 0 ? -C.freno : -C.accelerazione * 0.6) * -gas * dt;
      else this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), C.attrito * dt);
      this.v = THREE.MathUtils.clamp(this.v, -C.retro, C.massima);
      // sterzo: più stretto da fermi, più dolce veloci
      const max = C.sterzo / (1 + Math.abs(this.v) * 0.06);
      this.steer += (dir * max - this.steer) * Math.min(1, dt * 6);
      this.h += (this.v * Math.tan(this.steer) / C.passo) * dt;
      this.x += Math.cos(this.h) * this.v * dt;
      this.z += Math.sin(this.h) * this.v * dt;
      // bordi della carreggiata: si striscia sul marciapiede e si perde velocità
      const [z0, z1] = C.carreggiata;
      if (this.z < z0 || this.z > z1) { this.z = THREE.MathUtils.clamp(this.z, z0, z1); this.v *= 1 - Math.min(1, dt * 3); }
      // in fondo al tratto si ricomincia dall'altro capo: è sempre la stessa strada
      const L = this.strada.cfg.periodo;
      if (this.x > L / 2) { this.x -= L; giro = true; this._camera(true); }
      else if (this.x < -L / 2) { this.x += L; giro = true; this._camera(true); }
      if (giro) this.giri++;
      this._place();
      this._camera();
    }
    // ruote: girano con la velocità, le anteriori sterzano
    for (const [i, w] of this.wheels.entries()) {
      w.rotation.x -= (this.v / this.radius) * dt;
      w.rotation.y = i < 2 ? -this.steer : 0;
    }
    return giro;
  }

  get kmh() { return Math.round(Math.abs(this.v) * 3.6); }
}

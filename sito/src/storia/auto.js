// "La storia", capitolo 4: la tua macchina, una Dodge Challenger del 1970 (assets/macchina.glb; script in
// asset-props/macchina/). È parcheggiata in strada: E apre la portiera sinistra e sali; WASD o le frecce (o la levetta
// sul telefono) per guidare, Shift (o il pulsante TURBO sul telefono) per andare più forte, C cambia visuale (da dietro /
// dal posto di guida), E per scendere (solo sui rettilinei). Il volante gira con lo sterzo.
//
// La macchina vive nelle coordinate del tracciato (vedi strada.js): s = metri dall'inizio del tratto di riferimento,
// d = di traverso (come z nel modello della strada), psi = angolo rispetto alla via. Così resta sulla carreggiata anche in
// curva e quando passa al tratto dopo basta riposizionare la strada attorno a lei. Guida semplice: accelerazione, freno e
// attrito, sterzo a bicicletta (passo 2,9 m). La telecamera si aggiorna subito dopo la macchina, nello stesso fotogramma,
// e la visuale da dietro insegue la direzione con dolcezza: niente scatti. Nel modello il davanti è -Z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { L } from './strada.js';

const RUOTE = ['Ruota_AS', 'Ruota_AD', 'Ruota_PS', 'Ruota_PD'];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// asse del volante: la direzione in cui la sua forma è più sottile (autovettore minore della covarianza dei vertici)
function asseSottile(geo) {
  const p = geo.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) c.add(v.fromBufferAttribute(p, i));
  c.divideScalar(p.count);
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(c);
    const a = [v.x, v.y, v.z];
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) m[r][q] += a[r] * a[q];
  }
  // Jacobi: rotazioni finché la matrice è diagonale; le colonne di V sono gli autovettori
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 30; it++) {
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(m[i][j]) < 1e-12) continue;
      const th = 0.5 * Math.atan2(2 * m[i][j], m[j][j] - m[i][i]), cs = Math.cos(th), sn = Math.sin(th);
      for (let k = 0; k < 3; k++) { const a = m[k][i], b = m[k][j]; m[k][i] = cs * a - sn * b; m[k][j] = sn * a + cs * b; }
      for (let k = 0; k < 3; k++) { const a = m[i][k], b = m[j][k]; m[i][k] = cs * a - sn * b; m[j][k] = sn * a + cs * b; }
      for (let k = 0; k < 3; k++) { const a = V[k][i], b = V[k][j]; V[k][i] = cs * a - sn * b; V[k][j] = sn * a + cs * b; }
    }
  }
  const k = [0, 1, 2].reduce((a, b) => (m[b][b] < m[a][a] ? b : a));
  return new THREE.Vector3(V[0][k], V[1][k], V[2][k]).normalize();
}

export class Auto {
  constructor(ctx, cfg, strada) {
    this.ctx = ctx;
    this.cfg = cfg;                          // STORIA.auto
    this.strada = strada;
    this.root = new THREE.Group();
    this.root.name = 'Storia_Auto';
    this.parcheggia();
    this.driving = false;
    this.vista = 'dietro';
    this.ready = null;
    this.eye = new THREE.Vector3();
    this.porta = { t: 0, target: 0, poi: null };
  }

  // al suo posto: tratto di casa, accanto al marciapiede nord, rivolta verso -x (lato destro della via)
  parcheggia() {
    const [x, z, h] = this.cfg.parcheggio;
    this.s = x + L / 2; this.d = z; this.psi = h;
    this.v = 0; this.steer = 0; this.tratti = 0;
    this.hc = null;
    this.ferma = false;
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
    model.position.y = -new THREE.Box3().setFromObject(model).min.y;
    this.wheels = RUOTE.map((n) => model.getObjectByName(n)).filter(Boolean);
    for (const w of this.wheels) w.rotation.order = 'YXZ';  // prima gira sull'asse, poi sterza
    this.radius = 0.325;
    // portiera sinistra sui cardini: bordo anteriore (z minima), lato esterno. La compressione sposta l'origine dei
    // nodi al centro, quindi il perno si ricava dalla forma (come per le porte del circolo)
    const door = model.getObjectByName('Portiera_S');
    if (door) {
      const b = new THREE.Box3().setFromObject(door);
      const pivot = new THREE.Object3D();
      pivot.position.set(b.min.x + 0.06, 0, b.min.z + 0.03);
      door.parent.add(pivot);
      door.position.sub(pivot.position);
      pivot.add(door);
      this.cardine = pivot;
    }
    // il volante: gira attorno al suo asse (dal posto di guida si vede)
    const vol = model.getObjectByName('Volante');
    const volMesh = vol?.isMesh ? vol : vol?.getObjectByProperty('isMesh', true);
    if (volMesh) {
      this.volante = vol;
      this.volanteAsse = asseSottile(volMesh.geometry);
      if (volMesh !== vol) this.volanteAsse.applyQuaternion(volMesh.quaternion);
      this.volanteBase = vol.quaternion.clone();
      // l'asse punta verso il guidatore (+z nel modello): così sterzare a destra fa girare il volante in senso orario
      if (this.volanteAsse.clone().applyQuaternion(this.volanteBase).z < 0) this.volanteAsse.negate();
    }
    this.root.add(model);
    // bersaglio per "Apri la macchina": una scatola invisibile (provare il raggio sui 56 mila triangoli costa troppo)
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 4.9), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 0.65;
    this.root.add(this.hit);
    this.strada.group.add(this.root);
    this._place();
  }

  get loaded() { return !!this.wheels; }

  // posa nel gruppo della strada (x, z, direzione h: 0 = verso +x)
  get posa() { const p = this.strada.punto(this.s, this.d); return { x: p.x, z: p.z, h: p.a + this.psi }; }

  _place() {
    const p = this.posa;
    this.root.position.set(p.x, this.cfg.quota, p.z);
    this.root.rotation.y = -p.h - Math.PI / 2;
    return p;
  }

  // da parcheggiata è un ostacolo per chi cammina (rettangolo orientato, coordinate del mondo)
  collisionBox() {
    const o = this.strada.group.position, p = this.posa, fx = Math.cos(p.h), fz = Math.sin(p.h);
    return { name: 'Auto', cx: o.x + p.x, cz: o.z + p.z, ux: fx, uz: fz, vx: -fz, vz: fx, hx: 2.45, hz: 0.98, minY: 0, maxY: 1.4 };
  }

  // si scende solo sui rettilinei (a piedi si cammina nel tratto in cui si è, che dev'essere dritto)
  get puoiScendere() { return Math.abs(this.strada.k(this.strada.seg)) < 1e-6 && Math.abs(this.v) < 3; }

  // accanto alla portiera del guidatore (a sinistra)
  get uscita() {
    const o = this.strada.group.position, p = this.posa;
    return new THREE.Vector3(o.x + p.x + Math.sin(p.h) * 1.6, 0, o.z + p.z - Math.cos(p.h) * 1.6);
  }

  get yaw() { return -this.posa.h - Math.PI / 2; }

  // E: si apre la portiera, si sale, si richiude
  sali(fatto) {
    this.porta.target = 1;
    this.porta.poi = () => {
      this.driving = true;
      this.v = 0;
      this.hc = null;
      this._camera();
      this.ctx.player.sit({ eye: this.eye, yaw: this.yaw, pitch: this._pitch });
      this.porta.target = 0;
      fatto?.();
    };
  }

  scendi() {
    this.driving = false;
    this.ferma = false;
    this.v = 0; this.steer = 0;
    const p = this.ctx.player;
    p.seat = null;
    p.position.copy(this.uscita);
    p.yaw = this.yaw; p.pitch = 0;
    p.velocity.set(0, 0, 0);
    p.clearInput();
    this.porta.t = 1; this.porta.target = 1;
    this.porta.poi = () => { this.porta.target = 0; };
  }

  cambiaVista() { this.vista = this.vista === 'dietro' ? 'dentro' : 'dietro'; this._camera(); }

  get _pitch() { return this.vista === 'dietro' ? -0.12 : -0.04; }

  // telecamera nello stesso fotogramma della macchina: da dietro (insegue la direzione con dolcezza) o dal posto di guida
  _camera(dt = 0) {
    const C = this.cfg, o = this.strada.group.position, p = this.posa;
    // direzione della visuale: molla smorzata (anche la velocità di rotazione cambia con continuità)
    if (this.hc === null || dt === 0) { this.hc = p.h; this.hv = 0; } else {
      const w = C.inseguimento, n = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < n; i++) {
        this.hv += (w * w * wrap(p.h - this.hc) - 2 * w * this.hv) * (dt / n);
        this.hc += this.hv * (dt / n);
      }
    }
    if (this.vista === 'dietro') {
      const fx = Math.cos(this.hc), fz = Math.sin(this.hc);
      this.eye.set(o.x + p.x - fx * C.dietro[0], C.quota + C.dietro[1], o.z + p.z - fz * C.dietro[0]);
    } else {
      // posto di guida: nel modello x a destra, z indietro; destra nel mondo = (-sin h, cos h)
      const [lx, ly, lz] = C.guidatore, fx = Math.cos(p.h), fz = Math.sin(p.h);
      this.eye.set(o.x + p.x - fx * lz - fz * lx, C.quota + ly, o.z + p.z - fz * lz + fx * lx);
      this.hc = p.h;
    }
    if (this.scossa) {                                        // urto: la visuale trema un attimo
      const a = this.scossa * 0.25;
      this.eye.x += (Math.random() - 0.5) * a; this.eye.y += (Math.random() - 0.5) * a; this.eye.z += (Math.random() - 0.5) * a;
    }
    const pl = this.ctx.player, seat = pl.seat;
    if (seat && this.driving) {
      const yaw = -this.hc - Math.PI / 2;
      pl.yaw += wrap(yaw - seat.yaw);                         // la testa gira con la macchina
      seat.yaw = yaw; seat.pitch = this._pitch; seat.eye.copy(this.eye);
      pl._applyCamera(0);
    }
  }

  // la macchina passa al tratto dopo (o prima): la strada si ridispone attorno a lei e la telecamera la segue
  _rebase(dir) {
    const S = this.strada, f = S.frames.get(S.seg + dir), o = S.group.position;
    const ca = Math.cos(f.a), sa = Math.sin(f.a);
    const sposta = (v) => {                                   // coordinate del mondo: vecchio riferimento -> nuovo
      const x = v.x - o.x - f.x, z = v.z - o.z - f.z;
      v.x = o.x - L / 2 + x * ca + z * sa; v.z = o.z - x * sa + z * ca;
    };
    sposta(this.eye);
    if (this.ctx.player.seat) sposta(this.ctx.player.seat.eye);
    if (this.hc !== null) this.hc -= f.a;
    S.disponi(S.seg + dir);
    this.s -= dir * L;
    this.tratti += 1;
  }

  // restituisce true quando la macchina è appena passata a un altro tratto
  update(dt) {
    if (!this.loaded) return false;
    const C = this.cfg;
    // portiera
    const P = this.porta;
    if (P.t !== P.target) {
      P.t = THREE.MathUtils.clamp(P.t + Math.sign(P.target - P.t) * dt / C.portiera, 0, 1);
      if (this.cardine) this.cardine.rotation.y = -C.portieraAngolo * P.t * P.t * (3 - 2 * P.t);
      if (P.t === P.target && P.poi) { const f = P.poi; P.poi = null; f(); }
    }
    let nuovo = false;
    if (this.driving) {
      const p = this.ctx.player, inp = p.input, an = p.analog;
      let gas = (inp.f ? 1 : 0) - (inp.b ? 1 : 0), dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
      if (an && !gas && !dir && Math.hypot(an.x, an.y) > 0.15) { gas = an.y; dir = an.x; }
      // arrivati: la macchina frena da sola quanto basta per fermarsi davanti a casa (fermaDist: metri che mancano,
      // aggiornati dalla storia) e resta ferma; si scende con E
      if (this.ferma) {
        // accosta da sola sul lato di casa (anche in curva) mentre frena
        gas = 0;
        dir = THREE.MathUtils.clamp(-((this.d - C.accosta) + this.psi * 6) * 1.5, -1, 1);
        const dd = Math.max(0.3, this.fermaDist ?? 0.3);
        const a = Math.min(25, Math.max(2, (this.v * this.v) / (2 * dd)));
        this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), a * dt);
      }
      // turbo: Shift sul computer, il pulsante TURBO sul telefono
      this.turbo = !!inp.run && gas > 0;
      const acc = this.turbo ? C.accelerazioneTurbo : C.accelerazione, vmax = this.turbo ? C.turbo : C.massima;
      if (gas > 0) this.v += (this.v < 0 ? C.freno : (this.v > vmax ? -C.attrito : acc)) * gas * dt;
      else if (gas < 0) this.v += (this.v > 0 ? -C.freno : -C.accelerazione * 0.6) * -gas * dt;
      else if (!this.ferma) this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), C.attrito * dt);
      this.v = THREE.MathUtils.clamp(this.v, -C.retro, C.turbo);
      // sterzo: più stretto da fermi, più dolce veloci
      const max = C.sterzo / (1 + Math.abs(this.v) * 0.06);
      this.steer += (dir * max - this.steer) * Math.min(1, dt * 5);
      // moto nelle coordinate della via: la curva gira sotto la macchina
      const k = this.strada.k(this.strada.seg);
      this.psi = wrap(this.psi + (this.v * Math.tan(this.steer) / C.passo - k * this.v * Math.cos(this.psi)) * dt);
      this.s += this.v * Math.cos(this.psi) * dt;
      this.d += this.v * Math.sin(this.psi) * dt;
      // bordi della carreggiata, morbidi: oltre il bordo la macchina viene riportata in strada piano piano (raddrizzandosi
      // e rallentando, tanto più quanto più è fuori); mezzo metro più in là c'è il limite vero
      const [d0, d1] = C.carreggiata;
      const fuori = this.d < d0 ? this.d - d0 : this.d > d1 ? this.d - d1 : 0;
      if (fuori) {
        const e = Math.min(1, Math.abs(fuori) / 0.5);
        const lungo = Math.abs(this.psi) < Math.PI / 2 ? 0 : Math.PI;
        this.psi += wrap(lungo - this.psi) * Math.min(1, dt * 3 * e);
        this.d -= fuori * Math.min(1, dt * 2.5);
        this.v *= 1 - Math.min(1, dt * 1.5 * e);
        this.d = THREE.MathUtils.clamp(this.d, d0 - 0.5, d1 + 0.5);
      }
      if (this.s >= L) { this._rebase(1); nuovo = true; } else if (this.s < 0) { this._rebase(-1); nuovo = true; }
      // si disegna più strada dalla parte verso cui si va
      const verso = Math.cos(this.psi) * Math.sign(this.v || 1) >= 0 ? 1 : -1;
      if (verso !== this.strada.verso && Math.abs(this.v) > 0.5) this.strada.disponi(this.strada.seg, verso);
    }
    this._place();
    // ruote: girano con la velocità, le anteriori sterzano
    for (const [i, w] of this.wheels.entries()) {
      w.rotation.x -= (this.v / this.radius) * dt;
      w.rotation.y = i < 2 ? -this.steer : 0;
    }
    if (this.volante) {
      this._q ??= new THREE.Quaternion();
      this.volante.quaternion.copy(this.volanteBase).multiply(this._q.setFromAxisAngle(this.volanteAsse, -this.steer * this.cfg.volante));
    }
    if (this.scossa) this.scossa = Math.max(0, this.scossa - dt);
    if (this.driving) this._camera(dt);
    return nuovo;
  }

  get kmh() { return Math.round(Math.abs(this.v) * 3.6); }
}

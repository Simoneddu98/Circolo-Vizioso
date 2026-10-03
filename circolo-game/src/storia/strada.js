// "La storia", capitolo 4: la strada fuori dal circolo (modello City Street, assets/strada.glb; script in
// asset-props/strada/). Si carica solo quando serve e sta lontano dal circolo, come il cinema e la stanzetta: si arriva
// con una dissolvenza e il giocatore ha un mondo di collisioni tutto suo (marciapiedi e strada, pali, cestini, panchine).
//
// Nel modello la strada corre lungo x: carreggiata per z tra -3 e 3, marciapiedi fino a ±8, facciate a z ≈ -9 e ≈ 10.
// Il tratto è lungo 40 m e si ripete: c'è una copia per parte, così davanti c'è sempre strada, e chi arriva in fondo
// ricomincia dall'altro capo senza accorgersene (in macchina: è sempre la stessa strada). In lontananza la via sfuma nel
// colore del cielo (nebbia), così il cielo non la "taglia" mai.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export class Strada {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;                          // STORIA.strada
    this.group = new THREE.Group();
    this.group.name = 'Storia_Strada';
    this.group.position.fromArray(cfg.origine);
    this.group.visible = false;
    ctx.scene.add(this.group);
    this.boxes = [];
    this.ready = null;
  }

  // carica il modello una volta sola (5 MB): si può chiamare in anticipo, mentre si parla con Kappa
  load() {
    this.ready ??= new Promise((res) => {
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(this.cfg.url, (g) => { this._build(g.scene); res(true); },
        undefined, () => res(false));
    });
    return this.ready;
  }

  _build(model) {
    const g = this.group, C = this.cfg;
    // il cubo che avvolge tutta la scena nel file di Blender: qui il cielo è lo sfondo
    for (const n of C.nascondi) { const o = model.getObjectByName(n); if (o) o.visible = false; }
    model.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
    g.add(model);
    for (const k of [-1, 1]) {                               // stessa geometria e stessi materiali: costano solo i disegni
      const c = model.clone();
      c.position.x += k * C.periodo;
      g.add(c);
    }
    this._insegna();
    g.add(new THREE.HemisphereLight(C.cielo, 0x3a3026, C.luce));
    const sun = new THREE.DirectionalLight(0xffe2bc, C.sole);
    sun.position.set(-12, 20, 8);
    g.add(sun, sun.target);
    g.updateMatrixWorld(true);
    // ostacoli: tutto ciò che sta in piedi sui marciapiedi con una base piccola (pali, cestini, panchine, fioriere)
    const o = g.position, B = C.limiti;
    for (const m of model.children.flatMap((c) => [c, ...c.children])) {
      if (!m.isMesh || !m.visible) continue;
      const b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3());
      const cx = (b.min.x + b.max.x) / 2 - o.x, cz = (b.min.z + b.max.z) / 2 - o.z;
      if (b.min.y > 0.5 || b.max.y < 0.4 || s.x > 2.8 || s.z > 2.8 || s.x * s.z < 0.01) continue;
      if (cx < B[0] - 1 || cx > B[1] + 1 || cz < B[2] || cz > B[3]) continue;
      this.boxes.push({ name: m.name, cx: cx + o.x, cz: cz + o.z, ux: 1, uz: 0, vx: 0, vz: 1, hx: s.x / 2, hz: s.z / 2, minY: 0, maxY: 2 });
    }
    // i tronchi degli alberi (la chioma rende la scatola troppo grande): un quadrato piccolo alla base
    for (const [x, z] of C.alberi) this.boxes.push({ name: 'Albero', cx: o.x + x, cz: o.z + z, ux: 1, uz: 0, vx: 0, vz: 1, hx: 0.22, hz: 0.22, minY: 0, maxY: 3 });
  }

  // il locale con l'insegna accesa (sul portone con i gradini del marciapiede nord)
  _insegna() {
    const C = this.cfg.locale, [x, z] = C.porta;
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192;
    const c = cv.getContext('2d');
    c.fillStyle = '#120310'; c.fillRect(0, 0, 512, 192);
    c.font = '700 120px "Bebas Neue", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = '#ff17e4'; c.shadowBlur = 28; c.fillStyle = '#ffd6fa';
    for (let i = 0; i < 3; i++) c.fillText(C.insegna, 256, 100);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.72), new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false }));
    sign.position.set(x, C.altezza, z + 0.12);
    sign.name = 'Strada_Insegna';
    const glow = new THREE.PointLight(0xff4fd8, 5, 7, 1.6);
    glow.position.set(x, C.altezza - 0.5, z + 1.0);
    // dove si "bussa": un riquadro invisibile davanti al portone (le interazioni ignorano gli oggetti nascosti)
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.4), new THREE.MeshBasicMaterial({ visible: false }));
    door.position.set(x, 1.2, z + 0.4);
    door.name = 'Strada_Locale';
    this.locale = door;
    this.group.add(sign, glow, door);
  }

  local(v) { return new THREE.Vector3(v.x - this.group.position.x, v.y, v.z - this.group.position.z); }

  world(x, z) { return new THREE.Vector3(this.group.position.x + x, 0, this.group.position.z + z); }

  get arrivo() { const [x, z] = this.cfg.arrivo; return this.world(x, z); }
  get guarda() { const [x, z] = this.cfg.guarda; return this.world(x, z); }

  collisionBoxes() { return this.boxes; }

  bounds() {
    const o = this.group.position, [x0, x1, z0, z1] = this.cfg.limiti;
    return { minX: o.x + x0, maxX: o.x + x1, minZ: o.z + z0, maxZ: o.z + z1 };
  }

  // dentro la strada si vede lontano e c'è il cielo; fuori si torna come prima
  show(v) {
    const ctx = this.ctx;
    this.group.visible = v;
    if (v && !this.saved) {
      this.saved = { bg: ctx.scene.background, far: ctx.camera.far, fog: ctx.scene.fog };
      ctx.scene.background = new THREE.Color(this.cfg.cielo);
      ctx.scene.fog = new THREE.Fog(this.cfg.cielo, this.cfg.nebbia[0], this.cfg.nebbia[1]);
      ctx.camera.far = this.cfg.lontano;
    } else if (!v && this.saved) {
      ctx.scene.background = this.saved.bg;
      ctx.scene.fog = this.saved.fog;
      ctx.camera.far = this.saved.far;
      this.saved = null;
    } else return;
    ctx.camera.updateProjectionMatrix();
  }
}

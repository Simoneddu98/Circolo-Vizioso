// "La storia", capitolo 4: la strada fuori dal circolo (modello City Street, assets/strada.glb; script in
// asset-props/strada/). Sta lontano dal circolo, come il cinema e la stanzetta, e il giocatore ha un mondo di collisioni
// tutto suo. Si carica in sottofondo appena comincia la storia, così quando si apre la porta è già pronta.
//
// Il tracciato. Il modello è un tratto dritto di 40 m (la via corre lungo x, carreggiata per z tra -3 e 3, marciapiedi
// fino a ±8, facciate a z ≈ -9 e ≈ 10). Il percorso è una fila di tratti, ognuno con la sua curvatura (STORIA.strada.
// tracciato: 0 = dritto, 1/raggio = curva, positiva verso +z); la fila si ripete all'infinito. Le copie del tratto (una per
// ogni tratto vicino a chi guida) vengono piegate lungo la curva dallo shader: ogni vertice va dalle coordinate del tratto
// dritto (s lungo la via, z di traverso) al punto della curva. La geometria è la stessa per tutte le copie; i materiali
// sono copiati per ogni copia, perché ognuna ha i suoi parametri di curva.
//
// Riferimento mobile ("origine galleggiante"): il tratto in cui si trova la macchina ha sempre l'inizio in (-20, 0) del
// gruppo e direzione +x, cioè coincide con il tratto del modello. Quando la macchina passa al tratto dopo (o prima), tutto
// viene riposizionato attorno al nuovo tratto e la macchina, la telecamera e il giocatore con lui: non si vede niente.
// A piedi si cammina solo nel tratto in cui si è (sempre dritto: si scende dalla macchina solo sui rettilinei).
//
// Il portale: dalla porta nuova del circolo, aperta, si vede la strada vera. Si disegna la strada in una texture da una
// telecamera messa nel punto corrispondente (dietro la porta della strada, sulla facciata) e la si mostra nel vano della
// porta, con le coordinate dello schermo. Passata la soglia si è in strada, senza dissolvenze.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { creaPorta } from '../porta.js';

export const L = 40;                          // lunghezza di un tratto

// punto della linea di mezzo dopo s metri e direzione, in un tratto con curvatura k che parte da (0,0) verso +x
export function arco(k, s) {
  if (Math.abs(k) < 1e-6) return { x: s, z: 0, a: 0 };
  const a = k * s;
  return { x: Math.sin(a) / k, z: (1 - Math.cos(a)) / k, a };
}

// la piega, in GLSL: posizione del mondo dritta -> posizione del mondo piegata (uO: inizio del tratto, uA: direzione,
// uK: curvatura); g restituisce di quanto gira la via in quel punto (per le normali)
const PIEGA = `
uniform vec2 uO; uniform float uA; uniform float uK;
varying float vS;
vec3 piega(vec3 wp, out float g) {
  vec2 d = wp.xz - uO;
  float ca = cos(uA), sa = sin(uA);
  float s = d.x * ca + d.y * sa;
  float z = -d.x * sa + d.y * ca;
  g = uK * s;
  vS = s;
  vec2 p = vec2(s, 0.0), n = vec2(0.0, 1.0);
  if (abs(uK) > 1e-6) { p = vec2(sin(g) / uK, (1.0 - cos(g)) / uK); n = vec2(-sin(g), cos(g)); }
  vec2 l = p + z * n;
  return vec3(uO.x + l.x * ca - l.y * sa, wp.y, uO.y + l.x * sa + l.y * ca);
}
`;

function piegabile(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${PIEGA}`)
      .replace('#include <project_vertex>', `
        float gB; vec3 wB = piega((modelMatrix * vec4(transformed, 1.0)).xyz, gB);
        vec4 mvPosition = viewMatrix * vec4(wB, 1.0);
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        { float gN; piega((modelMatrix * vec4(position, 1.0)).xyz, gN);
          vec3 wn = mat3(modelMatrix) * objectNormal; float c = cos(gN), sn = sin(gN);
          wn = vec3(wn.x * c - wn.z * sn, wn.y, wn.x * sn + wn.z * c);
          transformedNormal = normalize(mat3(viewMatrix) * wn); }`);
    // ogni copia disegna solo i suoi 40 m: il modello sporge di qualche metro e si sovrapporrebbe al tratto vicino
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `varying float vS;
void main() {
  if (vS < -0.02 || vS > ${L.toFixed(1)} + 0.02) discard;`);
  };
  mat.customProgramCacheKey = () => 'piega';
}

export class Strada {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.cfg = ctx.touch ? { ...cfg, ...cfg.telefono } : cfg;   // STORIA.strada (sul telefono: più leggera)
    this.group = new THREE.Group();
    this.group.name = 'Storia_Strada';
    this.group.position.fromArray(cfg.origine);
    this.group.visible = false;
    ctx.scene.add(this.group);
    this.tiles = [];
    this.seg = 0;                            // tratto di riferimento (quello in cui si è)
    this.boxes = cfg.ostacoli.map(([x, z, hx, hz], i) => this._box(`Ostacolo${i}`, x, z, hx, hz))
      .concat(cfg.alberi.map(([x, z]) => this._box('Albero', x, z, 0.22, 0.22)));
    this.ready = null;
  }

  _box(name, x, z, hx, hz) {
    const o = this.group.position;
    return { name, cx: o.x + x, cz: o.z + z, ux: 1, uz: 0, vx: 0, vz: 1, hx, hz, minY: 0, maxY: 2.5 };
  }

  // carica il modello una volta sola: si può chiamare in anticipo (lo fa la storia appena comincia)
  load() {
    MeshoptDecoder.useWorkers?.(2);                          // la decompressione non blocca il gioco
    this.ready ??= new Promise((res) => {
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(this.cfg.url, (g) => { this._build(g.scene); res(true); },
        undefined, () => res(false));
    });
    return this.ready;
  }

  get loaded() { return this.tiles.length > 0; }

  _build(model) {
    const g = this.group, C = this.cfg;
    model.traverse((m) => {
      if (!m.isMesh) return;
      if (this.cfg.nascondi.includes(m.material.name)) { m.visible = false; return; }   // il cubo-cielo di Blender
      m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
      // vetri "a trasmissione": costringono a ridisegnare tutta la scena una seconda volta. Vetro trasparente semplice
      if (m.material.transmission > 0) { m.material.transmission = 0; m.material.transparent = true; m.material.opacity = 0.35; }
    });
    g.add(new THREE.HemisphereLight(C.cielo, 0x3a3026, C.luce));
    const sun = new THREE.DirectionalLight(0xffe2bc, C.sole);
    sun.position.set(-12, 20, 8);
    g.add(sun, sun.target);
    // copie del tratto, ognuna con i suoi materiali piegabili
    for (let i = 0; i < C.indietro + C.avanti; i++) {
      const U = { uO: { value: new THREE.Vector2() }, uA: { value: 0 }, uK: { value: 0 } };
      const tile = model.clone();
      const mats = new Map();
      tile.traverse((m) => {
        if (!m.isMesh) return;
        if (!mats.has(m.material)) { const c = m.material.clone(); piegabile(c, U); mats.set(m.material, c); }
        m.material = mats.get(m.material);
      });
      tile.add(this._insegna(U));
      g.add(tile);
      this.tiles.push({ obj: tile, U, seg: null });
    }
    this.locali = this.tiles.map((t) => t.obj.getObjectByName('Strada_Locale'));
    // la porta da cui si esce dal circolo, sulla facciata nord: c'è solo nel tratto di casa
    const [px, pz] = C.porta;
    this.porta = creaPorta(this.ctx, { name: 'Porta_Strada', width: C.portaLarga, height: C.portaAlta, swing: 'in', inset: true,
      center: this.world(px, pz), inward: new THREE.Vector3(0, 0, 1) });
    if (this.porta) {
      // una luce calda sopra la porta: è anche la porta di casa, alla fine del percorso
      const luce = new THREE.PointLight(0xffc27a, 5, 6, 1.6); luce.position.set(0, 2.6, 0.7);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }));
      lamp.position.set(0, 2.45, 0.25);
      this.porta.group.add(luce, lamp);
      // la porta sta dentro la copia del suo tratto (coordinate del modello: le copie dritte non sono piegate)
      // il tratto 0 sta nel gruppo senza spostamenti né rotazioni: coordinate del tratto = mondo - origine del gruppo
      this.disponi(0);
      const casa = this.tiles.find((t) => t.seg === 0);
      for (const o of [this.porta.group, this.porta.inset].filter(Boolean)) {
        const lp = o.position.clone().sub(g.position);
        casa.obj.add(o); o.position.copy(lp);
      }
    }
    this.disponi(0);
  }

  // il locale con l'insegna accesa (sul portone con i gradini del marciapiede nord), in ogni copia
  _insegna(U) {
    const C = this.cfg.locale, [x, z] = C.porta;
    const g = new THREE.Group();
    if (!this.insegnaTex) {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192;
      const c = cv.getContext('2d');
      c.fillStyle = '#120310'; c.fillRect(0, 0, 512, 192);
      c.font = '700 120px "Bebas Neue", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = '#ff17e4'; c.shadowBlur = 28; c.fillStyle = '#ffd6fa';
      for (let i = 0; i < 3; i++) c.fillText(C.insegna, 256, 100);
      this.insegnaTex = new THREE.CanvasTexture(cv); this.insegnaTex.colorSpace = THREE.SRGBColorSpace;
    }
    const mat = new THREE.MeshBasicMaterial({ map: this.insegnaTex, fog: false, toneMapped: false });
    piegabile(mat, U);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.72), mat);
    sign.position.set(x, C.altezza, z + 0.12);
    sign.frustumCulled = false;
    // dove si "bussa": un riquadro invisibile davanti al portone (conta per le interazioni, non si disegna)
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.4), new THREE.MeshBasicMaterial({ visible: false }));
    door.position.set(x, 1.2, z + 0.4);
    door.name = 'Strada_Locale';
    g.add(sign, door);
    return g;
  }

  // ---------------------------------------------------------------- il tracciato

  k(seg) { const T = this.cfg.tracciato; return T[((seg % T.length) + T.length) % T.length]; }

  // inizio (x, z) e direzione dei tratti vicini, con il tratto `seg` di riferimento in (-L/2, 0) verso +x.
  // verso: da che parte si va (+1 verso +x, -1 verso -x): da quella parte si disegnano più tratti
  disponi(seg, verso = this.verso ?? 1) {
    this.seg = seg; this.verso = verso;
    const C = this.cfg, frames = new Map();
    const avanti = verso > 0 ? C.avanti : C.indietro, indietro = verso > 0 ? C.indietro : C.avanti;
    frames.set(seg, { x: -L / 2, z: 0, a: 0 });
    for (let j = seg; j < seg + avanti; j++) {
      const f = frames.get(j), e = arco(this.k(j), L), ca = Math.cos(f.a), sa = Math.sin(f.a);
      frames.set(j + 1, { x: f.x + e.x * ca - e.z * sa, z: f.z + e.x * sa + e.z * ca, a: f.a + e.a });
    }
    for (let j = seg; j > seg - indietro; j--) {
      const f = frames.get(j), e = arco(this.k(j - 1), L), a = f.a - e.a, ca = Math.cos(a), sa = Math.sin(a);
      frames.set(j - 1, { x: f.x - (e.x * ca - e.z * sa), z: f.z - (e.x * sa + e.z * ca), a });
    }
    this.frames = frames;
    const o = this.group.position;
    this.tiles.forEach((t, i) => {
      const j = seg - indietro + i, f = frames.get(j);
      t.seg = j;
      // copia dritta lungo la direzione del tratto, poi piegata dallo shader
      t.obj.position.set(f.x + Math.cos(f.a) * L / 2, 0, f.z + Math.sin(f.a) * L / 2);
      t.obj.rotation.y = -f.a;
      t.U.uO.value.set(o.x + f.x, o.z + f.z); t.U.uA.value = f.a; t.U.uK.value = this.k(j);
    });
    // la porta (da cui si esce dal circolo, e casa alla fine del percorso) va nella copia del tratto 0 o di quello d'arrivo
    if (this.porta) {
      const t = this.tiles.find((x) => x.seg === 0 || x.seg === C.casa);
      this.porta.group.visible = !!t; if (this.porta.inset) this.porta.inset.visible = !!t;
      if (t && this.porta.group.parent !== t.obj) { t.obj.add(this.porta.group); if (this.porta.inset) t.obj.add(this.porta.inset); }
    }
  }

  // si disegnano solo i tratti che la telecamera vede (ogni tratto sta in una sfera attorno al suo punto di mezzo)
  cull(cam) {
    if (!this.loaded) return;
    cam.updateMatrixWorld();
    this._fr ??= new THREE.Frustum(); this._m4 ??= new THREE.Matrix4(); this._sf ??= new THREE.Sphere(new THREE.Vector3(), 34);
    this._fr.setFromProjectionMatrix(this._m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const o = this.group.position;
    for (const t of this.tiles) {
      const f = this.frames.get(t.seg), e = arco(this.k(t.seg), L / 2), ca = Math.cos(f.a), sa = Math.sin(f.a);
      this._sf.center.set(o.x + f.x + e.x * ca - e.z * sa, 4, o.z + f.z + e.x * sa + e.z * ca);
      // dentro l'inquadratura e non oltre la nebbia (lì sarebbe tutto del colore del cielo)
      t.obj.visible = this._fr.intersectsSphere(this._sf) && this._sf.center.distanceTo(cam.position) - 34 < this.cfg.nebbia[1];
    }
  }

  // posizione (gruppo) e direzione di un punto del tracciato: s metri dall'inizio del tratto di riferimento, d di traverso
  punto(s, d) {
    let seg = this.seg;
    while (s >= L && this.frames.has(seg + 1)) { s -= L; seg++; }
    while (s < 0 && this.frames.has(seg - 1)) { s += L; seg--; }
    const f = this.frames.get(seg), e = arco(this.k(seg), s);
    const lx = e.x - d * Math.sin(e.a), lz = e.z + d * Math.cos(e.a), ca = Math.cos(f.a), sa = Math.sin(f.a);
    return { x: f.x + lx * ca - lz * sa, z: f.z + lx * sa + lz * ca, a: f.a + e.a };
  }

  // ---------------------------------------------------------------- a piedi

  world(x, z) { return new THREE.Vector3(this.group.position.x + x, 0, this.group.position.z + z); }
  local(v) { return new THREE.Vector3(v.x - this.group.position.x, v.y, v.z - this.group.position.z); }

  get arrivo() { const [x, z] = this.cfg.arrivo; return this.world(x, z); }
  get guarda() { const [x, z] = this.cfg.guarda; return this.world(x, z); }

  collisionBoxes() { return this.boxes; }

  bounds() {
    const o = this.group.position, [x0, x1, z0, z1] = this.cfg.limiti;
    return { minX: o.x + x0, maxX: o.x + x1, minZ: o.z + z0, maxZ: o.z + z1 };
  }

  // ---------------------------------------------------------------- cielo, nebbia, distanza

  _ambiente(on) {
    const ctx = this.ctx;
    if (on && !this.saved) {
      this.saved = { bg: ctx.scene.background, far: ctx.camera.far, fog: ctx.scene.fog };
      ctx.scene.background = this.cielo ??= new THREE.Color(this.cfg.cielo);
      ctx.scene.fog = this.nebbia ??= new THREE.Fog(this.cfg.cielo, this.cfg.nebbia[0], this.cfg.nebbia[1]);
      ctx.camera.far = this.cfg.lontano;
      ctx.camera.updateProjectionMatrix();
    } else if (!on && this.saved) {
      ctx.scene.background = this.saved.bg;
      ctx.scene.fog = this.saved.fog;
      ctx.camera.far = this.saved.far;
      ctx.camera.updateProjectionMatrix();
      this.saved = null;
    }
  }

  show(v) { this.group.visible = v; this._ambiente(v); }

  // shader e texture pronti prima che servano (niente scatti la prima volta che si vede la strada)
  async prepara(extra = []) {
    const ctx = this.ctx, r = ctx.renderer;
    // solo la nebbia (fa parte degli shader): il cielo resta quello del circolo, e la strada a 200 m è oltre la
    // distanza di disegno, quindi nel frattempo non si vede niente di diverso
    const was = this.group.visible, fog = ctx.scene.fog;
    this.group.visible = true;
    ctx.scene.fog = this.nebbia ??= new THREE.Fog(this.cfg.cielo, this.cfg.nebbia[0], this.cfg.nebbia[1]);
    try { await r.compileAsync(ctx.scene, ctx.camera); } catch { /* vecchi browser: si compila al primo disegno */ }
    this.group.traverse((m) => { if (m.isMesh && m.material?.map) r.initTexture(m.material.map); });
    for (const t of extra) r.initTexture(t);
    ctx.scene.fog = fog;
    this.group.visible = was;
  }

  // ---------------------------------------------------------------- il portale dalla porta del circolo

  // centro: centro della porta del circolo (a filo del muro); fuori: verso l'esterno del circolo
  portale(centro, fuori) {
    const [px, pz] = this.cfg.porta;
    const S = this.world(px, pz), r = this.ctx.renderer;
    // di quanto si gira passando: "fuori" del circolo diventa +z della strada (angoli come le direzioni (cos, sin))
    const ang = Math.PI / 2 - Math.atan2(fuori.z, fuori.x);
    const P = {
      centro: centro.clone(), S, ang,
      // punto del circolo -> punto della strada
      mappa: (p, out = new THREE.Vector3()) => {
        const dx = p.x - centro.x, dz = p.z - centro.z, c = Math.cos(ang), s = Math.sin(ang);
        return out.set(S.x + dx * c - dz * s, p.y, S.z + dx * s + dz * c);
      },
      cam: new THREE.PerspectiveCamera(),
      rt: new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }),
      res: new THREE.Vector2(1, 1),
      clip: [new THREE.Plane(new THREE.Vector3(0, 0, 1), -(S.z + 0.08))],   // niente facciata tra la telecamera e la via
    };
    P.mat = new THREE.MeshBasicMaterial({ map: P.rt.texture, fog: false });
    P.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uRes = { value: P.res };
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec2 uRes;')
        .replace('#include <map_fragment>', 'diffuseColor *= texture2D( map, gl_FragCoord.xy / uRes );');
    };
    P.mat.customProgramCacheKey = () => 'portale';
    // al contrario: dalla porta della strada (casa) si vede il circolo
    P.inverso = (p, out = new THREE.Vector3()) => {
      const dx = p.x - S.x, dz = p.z - S.z, c = Math.cos(-ang), s = Math.sin(-ang);
      return out.set(centro.x + dx * c - dz * s, p.y, centro.z + dx * s + dz * c);
    };
    P.mat2 = P.mat.clone();
    P.mat2.onBeforeCompile = P.mat.onBeforeCompile; P.mat2.customProgramCacheKey = P.mat.customProgramCacheKey;
    P.mat2.map = P.rt.texture;
    P.clip2 = [new THREE.Plane(new THREE.Vector3(-fuori.x, 0, -fuori.z), fuori.x * centro.x + fuori.z * centro.z - 0.08)];
    P.renderInverso = () => {
      const ctx = this.ctx, cam = ctx.camera, v = P.cam;
      r.getDrawingBufferSize(P.res);
      const q = this.cfg.portaleQualita;
      const w = Math.max(4, Math.round(P.res.x * q)), h = Math.max(4, Math.round(P.res.y * q));
      if (P.rt.width !== w || P.rt.height !== h) P.rt.setSize(w, h);
      const sv = this.saved;                                     // il circolo: il suo sfondo, niente nebbia
      v.fov = cam.fov; v.aspect = cam.aspect; v.near = cam.near; v.far = sv?.far ?? 40; v.updateProjectionMatrix();
      P.inverso(cam.position, v.position);
      v.rotation.set(cam.rotation.x, cam.rotation.y + ang, cam.rotation.z, 'YXZ');
      v.updateMatrixWorld();
      const bg = ctx.scene.background, fog = ctx.scene.fog, clip = r.clippingPlanes, target = r.getRenderTarget();
      ctx.scene.background = sv?.bg ?? bg; ctx.scene.fog = sv ? sv.fog : null; this.group.visible = false;
      r.clippingPlanes = P.clip2;
      r.setRenderTarget(P.rt); r.clear(); r.render(ctx.scene, v);
      r.setRenderTarget(target);
      r.clippingPlanes = clip;
      ctx.scene.background = bg; ctx.scene.fog = fog; this.group.visible = true;
    };
    // disegna la strada vista dal punto corrispondente alla telecamera del giocatore
    P.render = () => {
      const ctx = this.ctx, cam = ctx.camera, v = P.cam;
      r.getDrawingBufferSize(P.res);
      const q = this.cfg.portaleQualita;
      const w = Math.max(4, Math.round(P.res.x * q)), h = Math.max(4, Math.round(P.res.y * q));
      if (P.rt.width !== w || P.rt.height !== h) P.rt.setSize(w, h);
      v.fov = cam.fov; v.aspect = cam.aspect; v.near = cam.near; v.far = this.cfg.lontano; v.updateProjectionMatrix();
      P.mappa(cam.position, v.position);
      v.rotation.set(cam.rotation.x, cam.rotation.y - ang, cam.rotation.z, 'YXZ');
      v.updateMatrixWorld();
      this.cull(v);
      const was = this.group.visible, clip = r.clippingPlanes, target = r.getRenderTarget();
      this.group.visible = true; this._ambiente(true);
      r.clippingPlanes = P.clip;
      r.setRenderTarget(P.rt); r.clear(); r.render(ctx.scene, v);
      r.setRenderTarget(target);
      r.clippingPlanes = clip;
      this._ambiente(false); this.group.visible = was;
    };
    return P;
  }
}

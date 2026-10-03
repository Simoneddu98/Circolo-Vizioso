// La sala del cinema della modalità "La storia": costruita in codice, lontana dal circolo (oltre il piano di taglio della
// camera, quindi il circolo da qui non si vede). Platea con file di poltrone rosse (A, B, C... dallo schermo), schermo
// grande con sipario, cartelli delle file, fascio del proiettore, porta d'uscita con la luce verde.
// Coordinate locali: x verso destra guardando lo schermo, z verso il fondo della sala (lo schermo è a z negativo).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CinemaRoom {
  constructor(scene, cfg) {
    this.cfg = cfg;
    const S = cfg.sala;
    this.group = new THREE.Group();
    this.group.name = 'Storia_Cinema';
    this.group.position.set(...S.origine);
    this.group.visible = false;
    scene.add(this.group);
    const g = this.group;
    const W = S.larghezza, D = S.profondita, H = S.altezza;
    const mat = (color, rough = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

    // pavimento a moquette, pareti scure, soffitto
    const carpet = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#3a0f17'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,200,120' : '0,0,0'},${Math.random() * 0.08})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.strokeStyle = 'rgba(214,170,69,0.25)'; c.lineWidth = 3;
      for (let x = 0; x < w; x += 64) for (let y = 0; y < h; y += 64) { c.beginPath(); c.arc(x + 32, y + 32, 10, 0, Math.PI * 2); c.stroke(); }
    });
    carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.repeat.set(W / 2, D / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(0xffffff, 0.95, { map: carpet }));
    floor.rotation.x = -Math.PI / 2;
    g.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(0x0c0608, 1));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H;
    g.add(ceil);
    const wallMat = mat(0x1c0c10, 0.9);
    const curtainTex = canvasTex(256, 64, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, 0);
      for (let i = 0; i <= 16; i++) gr.addColorStop(i / 16, i % 2 ? '#5a0d18' : '#8a1626');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    });
    curtainTex.wrapS = THREE.RepeatWrapping;
    const curtainMat = mat(0xffffff, 0.8, { map: curtainTex });
    const wall = (w, x, z, ry, m = wallMat) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, H), m); p.position.set(x, H / 2, z); p.rotation.y = ry; g.add(p); return p; };
    // pareti laterali con il velluto (tende a pieghe), parete di fondo e parete dello schermo scure
    const sideTex = curtainTex.clone(); sideTex.needsUpdate = true; sideTex.repeat.set(D / 2.5, 1);
    wall(D, -W / 2, 0, Math.PI / 2, mat(0xffffff, 0.8, { map: sideTex }));
    wall(D, W / 2, 0, -Math.PI / 2, mat(0xffffff, 0.8, { map: sideTex }));
    wall(W, 0, -D / 2, 0);
    wall(W, 0, D / 2, Math.PI);

    // schermo con cornice nera e sipario rosso ai lati
    const sw = S.schermo.larghezza, sh = S.schermo.altezza, sy = S.schermo.y, sz = -D / 2 + 0.25;
    this.screenCanvas = null;
    this.screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), this.screenMat);
    this.screen.position.set(0, sy, sz);
    g.add(this.screen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.3, sh + 0.3, 0.1), mat(0x050505, 0.6));
    frame.position.set(0, sy, sz - 0.07);
    g.add(frame);
    for (const side of [-1, 1]) {
      const cur = new THREE.Mesh(new THREE.PlaneGeometry(1.6, H - 0.3), curtainMat);
      cur.position.set(side * (sw / 2 + 0.9), (H - 0.3) / 2, sz + 0.05);
      g.add(cur);
    }
    const valance = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, 0.7), curtainMat);
    valance.position.set(0, H - 0.4, sz + 0.06);
    g.add(valance);
    const stage = new THREE.Mesh(new THREE.BoxGeometry(W - 1, 0.35, 1.2), mat(0x2a1208, 0.6));
    stage.position.set(0, 0.175, -D / 2 + 0.6);
    g.add(stage);
    this._showIdleScreen();

    // poltrone: file (A dallo schermo), posti numerati da sinistra; parti istanziate (cuscino, schienale, braccioli)
    const R = S.file;
    this.seats = [];
    const n = R.lettere.length * R.posti;
    const red = mat(0x8e1222, 0.7), dark = mat(0x1a1010, 0.6);
    const cushion = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, 0.48), red, n);
    const back = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.62, 0.1), red, n);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.2, 0.46), dark, n + R.lettere.length);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitGeo = new THREE.BoxGeometry(0.62, 1.0, 0.7);
    let k = 0, a = 0;
    R.lettere.forEach((L, row) => {
      const z = R.primaZ + row * R.passo;
      for (let i = 0; i < R.posti; i++) {
        const x = (i - (R.posti - 1) / 2) * R.larghezzaPosto;
        _m.compose(_p.set(x, 0.42, z), _q.identity(), _s); cushion.setMatrixAt(k, _m);
        _m.compose(_p.set(x, 0.72, z + 0.22), _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.12), _s); back.setMatrixAt(k, _m);
        _m.compose(_p.set(x - R.larghezzaPosto / 2, 0.55, z), _q.identity(), _s); arms.setMatrixAt(a++, _m);
        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.position.set(x, 0.5, z);
        hit.userData = { fila: L, posto: i + 1 };
        g.add(hit);
        this.seats.push({ fila: L, posto: i + 1, x, z, hit });
        k++;
      }
      const xr = (R.posti / 2) * R.larghezzaPosto;
      _m.compose(_p.set(xr, 0.55, z), _q.identity(), _s); arms.setMatrixAt(a++, _m);
      // cartello della fila, a lato del corridoio (luce bassa, si legge al buio)
      for (const side of [-1, 1]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({
          map: canvasTex(128, 128, (c, w, h) => {
            c.fillStyle = '#1a0a05'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d9aa45'; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8);
            c.fillStyle = '#ffd36a'; c.font = '700 84px Oswald, Arial Narrow, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(L, w / 2, h / 2 + 4);
          }) }));
        sign.position.set(side * (xr + 0.25), 0.8, z);
        sign.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;   // rivolto verso il corridoio
        g.add(sign);
        // lucine del corridoio sul pavimento
        const led = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
        led.rotation.x = -Math.PI / 2; led.position.set(side * (xr + 0.6), 0.01, z);
        g.add(led);
      }
    });
    for (const im of [cushion, back, arms]) { im.instanceMatrix.needsUpdate = true; g.add(im); }

    // porta d'uscita in fondo, con la scritta verde
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 0.1), mat(0x2b1a12, 0.5));
    door.position.set(S.uscita[0], 1.15, S.uscita[2]);
    door.name = 'Storia_Cinema_Uscita';
    g.add(door);
    this.door = door;
    const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({
      map: canvasTex(256, 86, (c, w, h) => { c.fillStyle = '#0a3d1a'; c.fillRect(0, 0, w, h); c.fillStyle = '#5dff8a'; c.font = '700 60px Oswald, Arial Narrow, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('USCITA', w / 2, h / 2 + 3); }) }));
    exit.position.set(S.uscita[0], 2.6, S.uscita[2] - 0.06);
    exit.rotation.y = Math.PI;
    g.add(exit);

    // fascio del proiettore (dalla parete di fondo allo schermo) e luci
    const beamLen = D - 0.6;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(sw * 0.55, beamLen, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(0, sy + 0.4, sz + beamLen / 2);
    beam.visible = false;
    g.add(beam);
    this.beam = beam;
    this.lights = new THREE.Group();
    const amb = new THREE.HemisphereLight(0xffd9b0, 0x200808, 0.6);
    this.lights.add(amb);
    this.house = [];
    for (const x of [-W / 2 + 0.4, W / 2 - 0.4]) for (const z of [-D / 4, D / 8, D / 3]) {
      const l = new THREE.PointLight(0xffb070, 3.2, 7, 2); l.position.set(x, 2.6, z); this.lights.add(l); this.house.push(l);
      const sconce = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc27a }));
      sconce.position.set(x * 0.98, 2.6, z); g.add(sconce); l.userData.bulb = sconce;
    }
    this.screenLight = new THREE.PointLight(0xbfd4ff, 0, 12, 1.5);
    this.screenLight.position.set(0, sy, sz + 2.5);
    this.lights.add(this.screenLight);
    g.add(this.lights);
    this.dim = 1;                           // 1 = luci accese, 0 = buio da proiezione
    this.target = 1;
    g.updateMatrixWorld(true);
  }

  // in coordinate mondo
  world(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.group.matrixWorld); }
  get screenCenter() { return this.screen.getWorldPosition(new THREE.Vector3()); }

  // rettangoli di collisione (stessa forma di CollisionWorld): una fila di poltrone = un rettangolo, più il palco
  collisionBoxes() {
    const S = this.cfg.sala, R = S.file, o = this.group.position, out = [];
    const half = (R.posti / 2) * R.larghezzaPosto + 0.05;
    R.lettere.forEach((L, row) => {
      const z = R.primaZ + row * R.passo;
      out.push({ name: `CIN_Fila_${L}`, cx: o.x, cz: o.z + z + 0.05, ux: 1, uz: 0, vx: 0, vz: 1, hx: half, hz: 0.33, minY: 0, maxY: 1 });
    });
    out.push({ name: 'CIN_Palco', cx: o.x, cz: o.z - S.profondita / 2 + 0.6, ux: 1, uz: 0, vx: 0, vz: 1, hx: (S.larghezza - 1) / 2, hz: 0.6, minY: 0, maxY: 0.4 });
    return out;
  }

  bounds() {
    const S = this.cfg.sala, o = this.group.position;
    return { minX: o.x - S.larghezza / 2, maxX: o.x + S.larghezza / 2, minZ: o.z - S.profondita / 2, maxZ: o.z + S.profondita / 2 };
  }

  // schermo: canvas del film (null = schermo d'attesa)
  setScreen(canvas) {
    this.screenTex?.dispose();
    if (!canvas) { this._showIdleScreen(); return; }
    this.screenTex = new THREE.CanvasTexture(canvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenMat.map = this.screenTex; this.screenMat.needsUpdate = true;
  }

  refreshScreen() { if (this.screenTex) this.screenTex.needsUpdate = true; }

  _showIdleScreen() {
    this.screenTex?.dispose();
    this.screenTex = canvasTex(1024, 440, (c, w, h) => {
      c.fillStyle = '#0d0d10'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8e2d0'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '700 64px Oswald, Arial Narrow, sans-serif'; c.fillText('CINEMA CIRCOLO', w / 2, h / 2 - 30);
      c.font = '400 30px "Source Sans 3", Arial, sans-serif'; c.fillStyle = '#9a927e'; c.fillText('Lo spettacolo sta per cominciare. Prendete posto.', w / 2, h / 2 + 40);
    });
    this.screenMat.map = this.screenTex; this.screenMat.needsUpdate = true;
  }

  // luci di sala: 1 accese, 0 spente (si arriva al valore con calma)
  setLights(v) { this.target = v; }

  update(dt, t) {
    this.dim += (this.target - this.dim) * Math.min(1, dt * 1.2);
    for (const l of this.house) { l.intensity = 3.2 * (0.12 + 0.88 * this.dim); l.userData.bulb.material.color.setScalar(0.35 + 0.65 * this.dim).multiply(new THREE.Color(0xffc27a)); }
    this.lights.children[0].intensity = 0.15 + 0.45 * this.dim;
    const film = 1 - this.dim;
    this.beam.visible = film > 0.05;
    this.beam.material.opacity = 0.05 * film * (0.85 + Math.sin(t * 23) * 0.08 + Math.sin(t * 7) * 0.07);
    this.screenLight.intensity = 6 * film;
  }

  show(v) { this.group.visible = v; }
}

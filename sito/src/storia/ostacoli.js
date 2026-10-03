// "La storia", capitolo 4: gli ostacoli in mezzo alla strada sul percorso verso casa (coni, barili, transenne da
// lavori in corso). Ognuno ha il suo posto nelle coordinate del tracciato (tratto, metri lungo la via, scostamento di
// traverso: vedi strada.js) e si disegna solo quando il suo tratto è vicino. Se la macchina lo prende, rallenta di colpo
// e l'ostacolo vola via. Forme semplici costruite in codice: niente modelli da caricare.
import * as THREE from 'three';
import { L } from './strada.js';

function strisce(c1, c2, n = 4) {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 64;
  const g = cv.getContext('2d');
  for (let i = 0; i < n * 2; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(0, (i * 64) / (n * 2), 16, 64 / (n * 2) + 1); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function forma(tipo) {
  const g = new THREE.Group();
  if (tipo === 'cono') {
    const m = new THREE.MeshStandardMaterial({ map: strisce('#ff5a12', '#f4f1ea', 2), roughness: 0.6 });
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.62, 16, 1, true), m); c.position.y = 0.33;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.8 }));
    b.position.y = 0.02;
    g.add(c, b);
  } else if (tipo === 'barile') {
    const m = new THREE.MeshStandardMaterial({ map: strisce('#ff6a1a', '#f4f1ea', 3), roughness: 0.5 });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.95, 18), m); c.position.y = 0.475;
    g.add(c);
  } else {                                                       // transenna: lungo il traverso della via
    const t = strisce('#d51c1c', '#f4f1ea', 5); t.wrapS = THREE.RepeatWrapping;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
    const asse = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 1.8), m); asse.position.y = 0.82;   // z locale = di traverso
    const gm = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
    for (const z of [-0.8, 0.8]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.05), gm); p.position.set(0, 0.475, z);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), gm); f.position.set(0, 0.025, z);
      g.add(p, f);
    }
    g.add(asse);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

const RAGGIO = { cono: 0.22, barile: 0.32, transenna: 0.95 };   // mezza larghezza di traverso (la transenna è lunga)

export class Ostacoli {
  constructor(strada, cfg, quota) {
    this.strada = strada;
    this.quota = quota;
    this.list = cfg.map(([seg, s, d, tipo]) => ({ seg, s, d, tipo, r: RAGGIO[tipo] ?? 0.3, obj: forma(tipo), volo: null }));
    this.group = new THREE.Group();
    this.group.name = 'Storia_Ostacoli';
    for (const o of this.list) this.group.add(o.obj);
    strada.group.add(this.group);
    this.attivi = false;
    this.urti = 0;
  }

  // tutti al loro posto (si ricomincia il percorso)
  reset() { for (const o of this.list) o.volo = null; this.urti = 0; }

  mostra(v) { this.attivi = v; this.group.visible = v; }

  // auto: la macchina (s, d nel tratto di riferimento, velocità); restituisce true se ne ha appena preso uno
  update(dt, auto) {
    if (!this.attivi) return false;
    const S = this.strada, sAuto = S.seg * L + auto.s;
    let urto = false;
    for (const o of this.list) {
      const ds = o.seg * L + o.s - sAuto;
      if (!o.volo && auto.driving && Math.abs(ds) < 2.35 + 0.2 && Math.abs(o.d - auto.d) < 0.95 + o.r) {
        // preso: vola via nella direzione della macchina e la macchina perde gran parte della velocità
        const v = Math.max(4, Math.abs(auto.v));
        o.volo = { s: 0, d: 0, y: 0, vs: Math.sign(auto.v || 1) * v * 0.9, vd: (Math.random() - 0.5) * 4, vy: 3 + v * 0.15,
          rx: (Math.random() - 0.5) * 10, rz: (Math.random() - 0.5) * 10, t: 0 };
        auto.v *= 0.4;
        auto.scossa = 0.35;
        this.urti++;
        urto = true;
      }
      if (o.volo) {
        const f = o.volo;
        f.t += dt;
        f.s += f.vs * dt; f.d += f.vd * dt; f.vy -= 9.8 * dt; f.y = Math.max(0, f.y + f.vy * dt);
        if (f.y === 0) { f.vs *= 1 - Math.min(1, dt * 4); f.vd *= 1 - Math.min(1, dt * 4); f.vy = Math.max(0, f.vy); }
      }
      // si disegna solo se il suo tratto è tra quelli vicini
      const sRel = (o.seg - S.seg) * L + o.s + (o.volo?.s ?? 0);
      if (Math.abs(sRel - auto.s) > 70 || !S.frames.has(Math.floor(sRel / L) + S.seg) || (o.volo && o.volo.t > 3)) { o.obj.visible = false; continue; }
      const p = S.punto(sRel, o.d + (o.volo?.d ?? 0));
      o.obj.visible = true;
      o.obj.position.set(p.x, this.quota + (o.volo?.y ?? 0), p.z);
      o.obj.rotation.set(o.volo ? o.volo.rx * o.volo.t : 0, -p.a, o.volo ? o.volo.rz * o.volo.t : 0);
    }
    return urto;
  }
}

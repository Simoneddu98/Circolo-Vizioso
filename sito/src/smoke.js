// Fumo leggero sulle sigarette accese: sprite che salgono, si allargano e svaniscono.
// Emettitori: nodi del glb con la custom property smoke_emitter = true (es. Cigarette_Lit_Smoke).
import * as THREE from 'three';

function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(235,235,235,0.9)');
  grd.addColorStop(0.5, 'rgba(210,210,210,0.35)');
  grd.addColorStop(1, 'rgba(200,200,200,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SmokeSystem {
  constructor(root, config) {
    this.cfg = config.smoke;
    this.emitters = [];
    root.traverse((o) => { if (o.userData.smoke_emitter) this.emitters.push(o); });
    if (!this.emitters.length) return;
    const tex = smokeTexture();
    const pos = new THREE.Vector3();
    for (const e of this.emitters) {
      const group = new THREE.Group();
      root.add(group);
      e.getWorldPosition(pos);
      group.position.copy(pos);
      const parts = [];
      for (let i = 0; i < this.cfg.count; i++) {
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xdedede });
        const s = new THREE.Sprite(mat);
        s.renderOrder = 5;
        group.add(s);
        parts.push({ s, age: (i / this.cfg.count) * this.cfg.life, seed: Math.random() * 10 });
      }
      e.userData.smoke = { group, parts };
    }
  }

  update(dt) {
    const c = this.cfg;
    for (const e of this.emitters) {
      for (const p of e.userData.smoke.parts) {
        p.age += dt;
        if (p.age > c.life) { p.age -= c.life; p.seed = Math.random() * 10; }
        const t = p.age / c.life;
        const wob = Math.sin(p.age * 1.7 + p.seed) * c.drift * t;
        p.s.position.set(wob, t * c.rise, Math.cos(p.age * 1.3 + p.seed) * c.drift * t * 0.6);
        const size = c.size[0] + (c.size[1] - c.size[0]) * t;
        p.s.scale.set(size, size, size);
        p.s.material.opacity = c.opacity * Math.min(1, t * 6) * (1 - t);
        p.s.material.rotation = p.seed + p.age * 0.3;
      }
    }
  }
}

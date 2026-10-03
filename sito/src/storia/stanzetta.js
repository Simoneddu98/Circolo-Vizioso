// La stanzetta del secondo capitolo ("La storia", brano Fumo): come una stanza del circolo, ma più vuota. Stessi
// pavimento e pareti del circolo, un tavolo, una sedia, il pacchetto di sigarette, il posacenere con la sigaretta accesa,
// una lampada sopra il tavolo e una porta (lo stesso modello dell'ingresso) da cui si esce. Costruita lontano dal
// circolo, oltre il piano di taglio della camera.
import * as THREE from 'three';
import { creaPorta } from '../porta.js';

// copia sicura di un oggetto del glb (clone() copierebbe userData con riferimenti circolari)
export function copia(src) {
  const out = src.isMesh ? new THREE.Mesh(src.geometry, src.userData.baseMaterial ?? src.material) : new THREE.Object3D();
  out.name = `${src.name}_copia`;
  out.position.copy(src.position); out.quaternion.copy(src.quaternion); out.scale.copy(src.scale);
  for (const c of src.children) if (c.isMesh || c.children.length) out.add(copia(c));
  return out;
}

// copia appoggiata con la base al centro (x, z) sul pavimento della stanza
function posa(ctx, name, group, x, z, y = 0, rotY = 0) {
  const src = ctx.root.getObjectByName(name);
  if (!src) return null;
  src.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(src);
  const c = box.getCenter(new THREE.Vector3());
  const inner = copia(src);
  // la copia parte dalla trasformazione mondo dell'originale, poi si porta con la base nel punto voluto
  src.matrixWorld.decompose(inner.position, inner.quaternion, inner.scale);
  inner.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  const holder = new THREE.Group();
  holder.add(inner);
  holder.position.set(x, y, z);
  holder.rotation.y = rotY;
  group.add(holder);
  return holder;
}

export class Stanzetta {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    const S = cfg;
    const g = this.group = new THREE.Group();
    g.name = 'Storia_Stanzetta';
    g.position.set(...S.origine);
    g.visible = false;
    ctx.scene.add(g);
    const W = S.larghezza, D = S.profondita, H = S.altezza;
    // Materiali del circolo con la stessa scala delle texture: dal pezzo originale si misura quante volte la texture si
    // ripete per metro (estensione delle UV / dimensioni), e le superfici della stanzetta ricevono le stesse UV per metro.
    const source = (name) => { let mesh = null; ctx.root.getObjectByName(name)?.traverse((o) => { if (!mesh && o.isMesh) mesh = o; }); return mesh; };
    const surface = (name, fallback, w, h, axes) => {
      const mesh = source(name);
      const mat = mesh ? (mesh.userData.baseMaterial ?? mesh.material) : new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.9 });
      const geo = new THREE.PlaneGeometry(w, h);
      const uv = mesh?.geometry.attributes.uv;
      if (uv) {
        const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
        let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
        for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
        const su = (u1 - u0) / Math.max(0.01, size[axes[0]]), sv = (v1 - v0) / Math.max(0.01, size[axes[1]]);
        const a = geo.attributes.uv;
        for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * w * su, a.getY(i) * h * sv);
      }
      return new THREE.Mesh(geo, mat);
    };
    const plane = (name, fallback, w, h, axes, pos, rot) => { const p = surface(name, fallback, w, h, axes); p.position.set(...pos); p.rotation.set(...rot); g.add(p); return p; };
    // pavimento e pareti con i materiali del circolo (piastrelle e intonaco), battiscopa scuro
    plane('Floor', 0x8a3b22, W, D, ['x', 'z'], [0, 0, 0], [-Math.PI / 2, 0, 0]);
    plane('Ceiling', 0xe8e0cc, W, D, ['x', 'z'], [0, H, 0], [Math.PI / 2, 0, 0]);
    plane('Wall_North', 0xd8c9a0, W, H, ['x', 'y'], [0, H / 2, -D / 2], [0, 0, 0]);
    plane('Wall_North', 0xd8c9a0, W, H, ['x', 'y'], [0, H / 2, D / 2], [0, Math.PI, 0]);
    plane('Wall_North', 0xd8c9a0, D, H, ['x', 'y'], [-W / 2, H / 2, 0], [0, Math.PI / 2, 0]);
    plane('Wall_North', 0xd8c9a0, D, H, ['x', 'y'], [W / 2, H / 2, 0], [0, -Math.PI / 2, 0]);
    const skirt = new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.7 });
    for (const [w, x, z, ry] of [[W, 0, -D / 2 + 0.01, 0], [W, 0, D / 2 - 0.01, Math.PI], [D, -W / 2 + 0.01, 0, Math.PI / 2], [D, W / 2 - 0.01, 0, -Math.PI / 2]]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.1), skirt); s.position.set(x, 0.05, z); s.rotation.y = ry; g.add(s);
    }
    // arredi: il tavolo da carte del circolo (senza carte), una sedia, posacenere con la sigaretta, pacchetto
    const [tx, tz] = S.tavolo;
    this.table = posa(ctx, 'Card_Table', g, tx, tz);
    this.chair = posa(ctx, 'Chair_Cards_01', g, tx, tz + 0.78, 0, Math.PI) ?? posa(ctx, 'Chair_Screen_01', g, tx, tz + 0.78, 0, Math.PI);
    g.updateMatrixWorld(true);
    const top = this.table ? new THREE.Box3().setFromObject(this.table).max.y - g.position.y : 0.8;
    this.top = top;
    this.ashtray = posa(ctx, 'Ashtray_Side', g, tx + 0.28, tz - 0.25, top);
    const lit = ctx.root.getObjectByName('Cigarette_Lit');
    const ash = ctx.root.getObjectByName('Ashtray_Side');
    if (lit && ash) {
      // la sigaretta nel posacenere, nella stessa posizione rispetto al posacenere che nel circolo
      const la = new THREE.Box3().setFromObject(ash), lc = new THREE.Box3().setFromObject(lit).getCenter(new THREE.Vector3());
      const off = lc.sub(new THREE.Vector3((la.min.x + la.max.x) / 2, la.min.y, (la.min.z + la.max.z) / 2));
      posa(ctx, 'Cigarette_Lit', g, tx + 0.28 + off.x, tz - 0.25 + off.z, top + off.y - 0.004);
    }
    this.pack = posa(ctx, 'Cigarette_Pack', g, tx - 0.3, tz - 0.22, top, 0.4);
    if (this.pack) this.pack.name = 'Stanzetta_Pack';
    // lampada sopra il tavolo: paralume e luce calda; un filo di luce ambiente
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x1f4a2e, roughness: 0.5, side: THREE.DoubleSide }));
    shade.position.set(tx, H - 0.75, tz);
    g.add(shade);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.64), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    cord.position.set(tx, H - 0.32, tz); g.add(cord);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
    bulb.position.set(tx, H - 0.82, tz); g.add(bulb);
    const lamp = new THREE.PointLight(0xffc98a, 6, 6, 1.6); lamp.position.set(tx, H - 0.9, tz); g.add(lamp);
    g.add(new THREE.HemisphereLight(0xffe6c0, 0x2a1408, 0.35));
    g.updateMatrixWorld(true);
    // porta da cui si entra e si esce (stesso modello dell'ingresso), sulla parete di fondo
    const [dx] = S.porta;
    this.door = creaPorta(ctx, {
      name: 'Porta_Stanzetta', width: 0.96, height: 2.18, swing: 'in', inset: true,
      center: this.world(dx, 0, D / 2), inward: new THREE.Vector3(0, 0, -1),
    });
    if (this.door) { g.attach(this.door.group); if (this.door.inset) g.attach(this.door.inset); }
  }

  world(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.group.matrixWorld); }

  // tavolo per il cibo che arriva (src/serata/cibo3d.js)
  get tableObject() { return this.table; }

  // dove si arriva entrando, la sedia, il posto di Rafka
  get arrivo() { const [dx] = this.cfg.porta; return this.world(dx, 0, this.cfg.profondita / 2 - 0.9); }
  get chairPos() { const [tx, tz] = this.cfg.tavolo; return this.world(tx, 0, tz + 0.78); }
  get tablePos() { const [tx, tz] = this.cfg.tavolo; return this.world(tx, this.top, tz); }
  get rafkaPos() { const [x, z] = this.cfg.rafka; return this.world(x, 0, z); }

  collisionBoxes() {
    const out = [];
    if (this.table) {
      const b = new THREE.Box3().setFromObject(this.table);
      out.push({ name: 'ST_Tavolo', cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2, ux: 1, uz: 0, vx: 0, vz: 1, hx: (b.max.x - b.min.x) / 2, hz: (b.max.z - b.min.z) / 2, minY: 0, maxY: 1 });
    }
    return out;
  }

  bounds() {
    const o = this.group.position, S = this.cfg;
    return { minX: o.x - S.larghezza / 2, maxX: o.x + S.larghezza / 2, minZ: o.z - S.profondita / 2, maxZ: o.z + S.profondita / 2 };
  }

  show(v) { this.group.visible = v; }
}

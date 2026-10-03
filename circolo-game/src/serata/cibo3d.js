// Il cibo ordinato nel secondo brano arriva sul tavolino in fondo: hamburger e bibita dal modello (assets/cibo.glb,
// "Low Poly Beach Assets" di JosephBennett, Blend Swap #73900, CC0), pizza nel cartone e kebab nella carta costruiti
// qui, con gli ingredienti scelti. Sul tavolino c'è anche il telefono (iPhone 5s) per ordinare.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// colore di ogni ingrediente sulla pizza e nel kebab
const COLORI = {
  salsiccia: 0x7a3b22, prosciutto: 0xd98c8c, funghi: 0xc9b089, cipolla: 0xd8b4d8, nduja: 0xb3261e, olive: 0x1c1a16, bufala: 0xf7f3ea,
  patatine: 0xf0c64a, peperoni: 0xe0402a, gorgonzola: 0xdfe6d8, pollo: 0xd9a066, vitello: 0x8a4a2a, falafel: 0x8a6a2a, pomodoro: 0xd8342a,
  insalata: 0x5fa83a, peperoncino: 0xc81e14, yogurt: 0xf4f1e6, salsapiccante: 0xd14a1a, feta: 0xf7f7f0,
};
const mat = (color, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });

export class Food {
  // table: il tavolo dove arriva il cibo (di norma il tavolino in fondo al circolo; la storia usa quello della stanzetta)
  // spots: posti sul tavolo in metri dal centro ([x, z]), se il tavolo ne vuole di suoi (la stanzetta: il centro è del pacchetto)
  constructor(ctx, url, table = ctx.root.getObjectByName('Side_Table'), spots = null) {
    this.ctx = ctx;
    this.spots = spots;
    this.items = [];
    this.models = null;
    const box = table ? new THREE.Box3().setFromObject(table) : null;
    this.top = box ? box.max.y : 0.6;
    this.center = box ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3(5.4, 0, 0.8);
    this.half = box ? Math.min(box.max.x - box.min.x, box.max.z - box.min.z) / 2 : 0.28;
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(url, (g) => {
      this.models = {};
      g.scene.traverse((o) => { if (/^(Food_|Prop_)/.test(o.name)) this.models[o.name] = o; });
      for (const o of Object.values(this.models)) o.traverse((m) => { if (m.isMesh) m.castShadow = false; });
      if (this.phoneWanted) this.showPhone(true);
    }, undefined, () => { this.models = {}; });
  }

  // posti sul piano del tavolino (il pacchetto di sigarette e il posacenere stanno verso est)
  _spot(i) {
    if (this.spots) { const [x, z] = this.spots[i % this.spots.length]; return new THREE.Vector3(this.center.x + x, this.top, this.center.z + z); }
    // lontano dal pacchetto (angolo sud-est) e dal posacenere (lato est)
    const s = [[-0.13, -0.06], [-0.03, 0.15], [0.02, -0.03], [-0.15, 0.17]][i % 4];
    return new THREE.Vector3(this.center.x + s[0] * (this.half / 0.28), this.top, this.center.z + s[1] * (this.half / 0.28));
  }

  showPhone(on) {
    this.phoneWanted = on;
    if (!on) { this.phone?.removeFromParent(); return; }
    if (!this.models?.Prop_Phone || this.phone?.parent) return;
    this.phone = this.models.Prop_Phone.clone(true);
    this.phone.position.set(this.center.x - 0.02 * (this.half / 0.28), this.top + 0.001, this.center.z - 0.2 * (this.half / 0.28));
    this.phone.rotation.y = 1.4;
    this.ctx.scene.add(this.phone);
  }

  deliver(locale, scelta) {
    const g = locale === 'burger' ? this._burger() : locale === 'pizza' ? this._pizza(scelta) : this._kebab(scelta);
    const same = this.items.filter((o) => o.userData.locale === locale && locale === 'pizza');
    // i cartoni delle pizze si impilano, il resto occupa un posto libero
    if (same.length) { const top = same[same.length - 1]; g.position.copy(top.position); g.position.y += 0.042; g.rotation.y = top.rotation.y + 0.2; }
    else { g.position.copy(this._spot(this.items.filter((o) => !o.userData.stacked).length)); g.rotation.y = Math.random() * Math.PI * 2; }
    g.userData = { locale, stacked: !!same.length };
    // arriva dall'alto, come appoggiato
    g.userData.drop = 0.25;
    g.position.y += 0.25;
    this.ctx.scene.add(g);
    this.items.push(g);
  }

  update(dt) {
    for (const o of this.items) {
      if (!o.userData.drop) continue;
      const d = Math.min(o.userData.drop, dt * 0.9);
      o.userData.drop -= d; o.position.y -= d;
    }
  }

  clear() { for (const o of this.items) o.removeFromParent(); this.items = []; this.showPhone(false); }

  _burger() {
    const g = new THREE.Group();
    if (this.models?.Food_Burger) g.add(this.models.Food_Burger.clone(true));
    else g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.07, 16), mat(0xc07a3a)));
    if (this.models?.Food_Drink) { const d = this.models.Food_Drink.clone(true); d.position.set(0.1, 0, -0.02); g.add(d); }
    return g;
  }

  _pizza(scelta) {
    const g = new THREE.Group();
    const cardboard = mat(0xc9a36a, 0.95);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.3), cardboard);
    tray.position.y = 0.0175;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.004, 0.3), cardboard);
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.035, -0.15);
    lid.position.set(0, 0, 0.15);
    hinge.add(lid);
    hinge.rotation.x = -1.95;                         // coperchio aperto
    g.add(tray, hinge);
    const crust = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.014, 32), mat(0xd9a45a));
    crust.position.y = 0.042;
    const red = scelta.base !== 'bianca';
    const sauce = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.004, 32), mat(red ? 0xb8321e : 0xf2ead2));
    sauce.position.y = 0.05;
    g.add(crust, sauce);
    const bits = [...(scelta.base === 'margherita' ? ['bufala'] : []), ...(scelta.carne !== 'nessuna' ? [scelta.carne] : []), ...scelta.extra];
    const geo = new THREE.CylinderGeometry(0.011, 0.011, 0.005, 8);
    let n = 0;
    for (const id of bits) {
      const m = mat(COLORI[id] ?? 0x888888);
      for (let i = 0; i < 7; i++, n++) {
        const a = n * 2.39996, r = 0.018 + Math.sqrt((n % 40) / 40) * 0.09;
        const b = new THREE.Mesh(geo, m);
        b.position.set(Math.cos(a) * r, 0.054, Math.sin(a) * r);
        b.scale.set(0.7 + Math.random() * 0.8, 1, 0.7 + Math.random() * 0.8);
        g.add(b);
      }
    }
    return g;
  }

  _kebab(scelta) {
    const g = new THREE.Group();
    if (scelta.base === 'piatto') {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.02, 24), mat(0xf2f2ee, 0.4));
      plate.position.y = 0.01;
      g.add(plate);
      [scelta.carne, ...scelta.extra].forEach((id, i) => {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat(COLORI[id] ?? 0x999999));
        const a = i * 2.1;
        b.position.set(Math.cos(a) * 0.05, 0.03, Math.sin(a) * 0.05);
        b.scale.y = 0.5;
        g.add(b);
      });
      return g;
    }
    // piadina o panino arrotolato nella carta, sdraiato sul tavolo
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.2, 18), mat(scelta.base === 'panino' ? 0xc68a48 : 0xe8cf9a));
    wrap.rotation.z = Math.PI / 2;
    wrap.position.y = 0.034;
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.033, 0.11, 18, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.9, side: THREE.DoubleSide }));
    paper.rotation.z = Math.PI / 2;
    paper.position.set(-0.05, 0.034, 0);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0395, 0.0395, 0.012, 18, 1, true), mat(0xc8341c));
    stripe.rotation.z = Math.PI / 2;
    stripe.position.set(-0.06, 0.034, 0);
    g.add(wrap, paper, stripe);
    // ripieno che si vede dalla parte aperta
    [scelta.carne, ...scelta.extra].slice(0, 6).forEach((id, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), mat(COLORI[id] ?? 0x999999));
      const a = i * 1.1;
      b.position.set(0.102, 0.034 + Math.sin(a) * 0.018, Math.cos(a) * 0.018);
      g.add(b);
    });
    return g;
  }
}

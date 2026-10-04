// Porte del circolo: il modello di Door.blend (assets/porta.glb, anta e telaio; script in asset-props/porta/).
// setupPorta() carica il modello una volta, mette la porta d'ingresso al posto della vecchia Door_Main (con un passaggio
// nero dietro, perché il muro lì ha l'apertura) e restituisce l'ingresso; creaPorta() ne aggiunge altre (per esempio
// quella accanto al maxischermo, su un muro pieno: dietro c'è un riquadro nero e l'anta si apre verso la stanza).
//
// L'anta ruota sui cardini: la compressione meshopt sposta l'origine dei nodi al centro della geometria, quindi il perno
// si ricava dalla forma dell'anta (il bordo dei cardini è quello opposto alla maniglia, x minima nel modello).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let template = null;

// copia sicura (clone() copierebbe userData con riferimenti circolari)
function cloneMeshes(src) {
  const out = src.isMesh ? new THREE.Mesh(src.geometry, src.material) : new THREE.Object3D();
  out.name = src.name;
  out.position.copy(src.position); out.quaternion.copy(src.quaternion); out.scale.copy(src.scale);
  for (const c of src.children) out.add(cloneMeshes(c));
  return out;
}

// un altro modello di porta (stessi nomi: Porta_Telaio, Porta_Anta; cerniere dal lato con x minima)
export function caricaPorta(url) {
  return new Promise((res) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(url, (g) => res(g.scene), undefined, () => res(null)));
}

// opts: { center: punto sul pavimento al centro dell'apertura, a filo del muro; inward: verso la stanza (Vector3);
//         width, height; swing: 'out' (verso il buio) | 'in' (verso la stanza); inset: riquadro nero dietro l'anta;
//         modello: un altro modello di porta (caricaPorta), altrimenti quella del circolo }
export function creaPorta(ctx, opts) {
  const src = opts.modello ?? template;
  if (!src) return null;
  const model = cloneMeshes(src);
  const telaio = model.getObjectByName('Porta_Telaio');
  const anta = model.getObjectByName('Porta_Anta');
  model.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(model);
  const size = bb.getSize(new THREE.Vector3()), mid = bb.getCenter(new THREE.Vector3());
  const sx = opts.width / size.x, sy = opts.height / size.y;
  model.scale.set(sx, sy, sx);
  // centrata sull'apertura e appoggiata a terra (non tutti i modelli hanno l'origine al centro della porta)
  model.position.set(-mid.x * sx, -bb.min.y * sy, -mid.z * sx);
  // perno sui cardini: bordo con x minima dell'anta, al centro del suo spessore (in coordinate del modello)
  const ab = new THREE.Box3().setFromObject(anta);              // modello ancora non trasformato: coordinate del modello
  const pivot = new THREE.Object3D();
  pivot.position.set(ab.min.x, 0, (ab.min.z + ab.max.z) / 2);
  anta.parent.add(pivot);
  anta.position.sub(pivot.position);
  pivot.add(anta);
  const group = new THREE.Group();
  group.name = opts.name ?? 'Porta';
  group.add(model);
  // la faccia con la maniglia (+z del modello) verso la stanza
  group.rotation.y = Math.atan2(opts.inward.x, opts.inward.z);
  // profondità: prima tutta la porta (telaio compreso, ~24 cm) sporgeva nella stanza. Ora conta il piano di mezzo
  // dell'anta (la maniglia sporge da entrambe le parti, quindi è il centro del suo ingombro):
  // - muro pieno (inset): l'anta appena davanti al muro, 3 cm (deve coprire il riquadro nero, che sta sul muro);
  // - apertura vera nel muro: l'anta un po' dentro il vano, il telaio nel muro
  const anta0 = ((ab.min.z + ab.max.z) / 2 - mid.z) * sx;
  const piano = opts.incasso ?? (opts.inset ? 0.03 : -0.05);
  group.position.copy(opts.center).addScaledVector(opts.inward, piano - anta0);
  ctx.scene.add(group);
  // la porta sta a pochi millimetri dal muro e dal riquadro nero: si disegna davanti a entrambi (spostamento di
  // profondità più forte di quello del riquadro), senza tremolii
  model.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = false; m.receiveShadow = false;
    m.material = m.material.clone();
    m.material.polygonOffset = true; m.material.polygonOffsetFactor = -4; m.material.polygonOffsetUnits = -4;
  });
  // verso di apertura: si prova un piccolo angolo e si sceglie il segno che porta l'anta dalla parte giusta
  const sideOf = (a) => {
    pivot.rotation.y = a; group.updateMatrixWorld(true);
    const c = new THREE.Box3().setFromObject(anta).getCenter(new THREE.Vector3());
    return c.sub(opts.center).dot(opts.inward);
  };
  const plus = sideOf(0.4), minus = sideOf(-0.4);
  pivot.rotation.y = 0;
  const wantIn = opts.swing === 'in';
  const sign = (plus > minus) === wantIn ? 1 : -1;
  // riquadro nero (muro pieno): sembra un'apertura sul buio
  let inset = null;
  if (opts.inset) {
    inset = new THREE.Mesh(new THREE.PlaneGeometry(opts.width * 0.9, opts.height * 0.97),
      new THREE.MeshBasicMaterial({ color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    inset.position.copy(opts.center).addScaledVector(opts.inward, 0.006);
    inset.position.y = (opts.height * 0.97) / 2;
    inset.rotation.y = group.rotation.y;
    ctx.scene.add(inset);
  }
  const state = { open: 0, target: 0 };
  return {
    group, anta, pivot, telaio, inset,
    get soglia() { return opts.center.clone(); },
    open() { state.target = 1; opts.onOpen?.(); },
    close() { state.target = 0; },
    get isOpen() { return state.open > 0.95; },
    update(dt) {
      if (state.open === state.target) return;
      state.open = Math.max(0, Math.min(1, state.open + Math.sign(state.target - state.open) * dt / 1.6));
      const k = state.open * state.open * (3 - 2 * state.open);       // parte e si ferma con dolcezza
      pivot.rotation.y = sign * k * THREE.MathUtils.degToRad(opts.angle ?? 95);
      if (state.open === 0) opts.onClosed?.();
    },
  };
}

export async function setupPorta(ctx, url) {
  const old = ctx.root.getObjectByName('Door_Main');
  if (!old) return null;
  const gltf = await new Promise((res) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(url, res, undefined, () => res(null)));
  if (!gltf) return null;
  template = gltf.scene;
  const box = new THREE.Box3().setFromObject(old);             // apertura nel muro sud
  const w = box.max.x - box.min.x, h = box.max.y - box.min.y;
  // il passaggio nero dietro l'ingresso (pavimento, pareti e fondo neri, senza luce)
  const depth = 4;
  const voidBox = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, h + 0.6, depth),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }));
  voidBox.position.set((box.min.x + box.max.x) / 2, h / 2, box.max.z + depth / 2 + 0.02);
  voidBox.visible = false;
  ctx.scene.add(voidBox);
  const door = creaPorta(ctx, {
    name: 'Porta_Circolo', width: w, height: h, swing: 'out',
    center: new THREE.Vector3((box.min.x + box.max.x) / 2, 0, box.min.z), inward: new THREE.Vector3(0, 0, -1),
    onOpen: () => { voidBox.visible = true; }, onClosed: () => { voidBox.visible = false; },
  });
  if (!door) return null;
  // la vecchia porta sparisce (anche come schermo per le interazioni)
  old.visible = false;
  old.traverse((m) => { const k = ctx.occluders.indexOf(m); if (k >= 0) ctx.occluders.splice(k, 1); });
  door.box = box;
  door.voidBox = voidBox;
  Object.defineProperty(door, 'soglia', { get: () => new THREE.Vector3((box.min.x + box.max.x) / 2, 0, box.max.z) });
  // rettangolo del passaggio oltre la porta (per le collisioni del giocatore)
  door.passaggio = () => ({ minX: box.min.x + 0.05, maxX: box.max.x - 0.05, minZ: box.min.z - 0.5, maxZ: box.max.z + depth - 0.3 });
  return door;
}

// Porta d'ingresso del circolo: il modello di Door.blend (assets/porta.glb, anta e telaio; script in
// asset-props/porta/export_porta.py) prende il posto della vecchia Door_Main, adattato all'apertura nel muro sud.
// L'anta ha il perno sui cardini e si può aprire; dietro c'è un passaggio nero (solo il buio, da attraversare a piedi):
// lo usa "La storia" per andare al cinema.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export async function setupPorta(ctx, url) {
  const old = ctx.root.getObjectByName('Door_Main');
  if (!old) return null;
  const gltf = await new Promise((res) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(url, res, undefined, () => res(null)));
  if (!gltf) return null;
  const box = new THREE.Box3().setFromObject(old);             // apertura nel muro (x, altezza, spessore)
  const telaio = gltf.scene.getObjectByName('Porta_Telaio');
  const anta = gltf.scene.getObjectByName('Porta_Anta');
  if (!telaio || !anta) return null;
  const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
  const group = new THREE.Group();
  group.name = 'Porta_Circolo';
  group.add(gltf.scene);
  // in scala con l'apertura: larghezza e altezza della vecchia porta; davanti la faccia interna del muro
  const w = box.max.x - box.min.x, h = box.max.y - box.min.y;
  gltf.scene.scale.set(w / size.x, h / size.y, w / size.x);
  group.position.set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
  group.rotation.y = Math.PI;                                    // la faccia con la maniglia verso l'interno del circolo
  ctx.scene.add(group);
  old.visible = false;
  gltf.scene.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
  // vecchia porta fuori dagli schermi per le interazioni; la nuova la sostituisce
  const i = ctx.occluders.indexOf(old); if (i >= 0) ctx.occluders.splice(i, 1);
  old.traverse((m) => { const k = ctx.occluders.indexOf(m); if (k >= 0) ctx.occluders.splice(k, 1); });

  // il passaggio nero dietro la porta (pavimento, pareti e fondo neri, senza luce)
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  const depth = 4;
  const voidBox = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, h + 0.6, depth), black);
  voidBox.position.set((box.min.x + box.max.x) / 2, h / 2, box.max.z + depth / 2 + 0.02);
  voidBox.visible = false;
  ctx.scene.add(voidBox);

  const state = { open: 0, target: 0 };
  return {
    group, anta, box, voidBox,
    // centro dell'apertura sul pavimento e punto "dentro il buio"
    get soglia() { return new THREE.Vector3((box.min.x + box.max.x) / 2, 0, box.max.z); },
    open() { state.target = 1; voidBox.visible = true; },
    close() { state.target = 0; },
    get isOpen() { return state.open > 0.95; },
    update(dt) {
      if (state.open === state.target) return;
      const d = Math.sign(state.target - state.open) * dt / 1.4;   // un secondo e mezzo per aprirsi
      state.open = Math.max(0, Math.min(1, state.open + d));
      const k = state.open * state.open * (3 - 2 * state.open);
      anta.rotation.y = -k * THREE.MathUtils.degToRad(100);         // verso l'esterno, nel buio
      if (state.open === 0) voidBox.visible = false;
    },
    // estensione delle collisioni del giocatore oltre la porta aperta (rettangolo del passaggio)
    passaggio() { return { minX: box.min.x + 0.05, maxX: box.max.x - 0.05, minZ: box.min.z - 0.5, maxZ: box.max.z + depth - 0.3 }; },
  };
}

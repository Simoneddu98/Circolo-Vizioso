// Registro delle interazioni.
//
// Ogni tipo di interactable (valore di userData.interactable nel glb) è un handler registrato per nome:
//
//   interactions.register('pool', {
//     range: 2.5,                               // opzionale, default CONFIG.interaction.range
//     setup(target, ctx) {},                     // opzionale: chiamato una volta per ogni oggetto trovato
//     label(target, ctx) { return 'Gioca'; },    // testo dopo "E —"; null = non interagibile adesso
//     action(target, ctx) {},                    // tasto E
//     primary(ctx) { return false; },            // clic sinistro; true = evento consumato
//     update(dt, ctx, targets) {},               // ogni frame
//     reset(target, ctx) {},                     // "Ricomincia"
//   });
//
// Un handler registrato dopo il caricamento riceve subito gli oggetti già presenti nella scena:
// un nuovo modulo (es. il biliardo giocabile) si aggiunge senza toccare questo file.
import * as THREE from 'three';

const _s = new THREE.Sphere();
const _b = new THREE.Box3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();

// personaggi animati: three.js, per sapere se il raggio li tocca, rifà la posa di ogni vertice (15 ms a personaggio).
// Basta un parallelepipedo attorno alla persona, dai piedi alla testa
function raggioPersonaggio(root) {
  return function (raycaster, intersects) {
    root.getWorldPosition(_p);
    _b.min.set(_p.x - 0.32, _p.y, _p.z - 0.32); _b.max.set(_p.x + 0.32, _p.y + 1.85, _p.z + 0.32);
    if (!raycaster.ray.intersectBox(_b, _q)) return;
    const distance = raycaster.ray.origin.distanceTo(_q);
    if (distance < raycaster.near || distance > raycaster.far) return;
    intersects.push({ distance, point: _q.clone(), object: this });
  };
}

export class InteractionSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.cfg = ctx.config.interaction;
    this.handlers = new Map();
    this.targets = [];            // { object, type, data, enabled, meshes }
    this.pending = [];            // oggetti con un tipo non (ancora) registrato
    this.modal = null;            // { label, action } — es. seduto: "E — Alzati" ovunque si guardi
    this.hovered = null;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 10;
    this.center = new THREE.Vector2(0, 0);
  }

  register(type, handler) {
    this.handlers.set(type, handler);
    const waiting = this.pending.filter((p) => p.type === type);
    this.pending = this.pending.filter((p) => p.type !== type);
    for (const p of waiting) this.addTarget(p.object, type, p.data);
    return this;
  }

  scan(root) {
    const found = [];
    root.traverse((o) => { if (typeof o.userData.interactable === 'string') found.push(o); });
    for (const o of found) this.addTarget(o, o.userData.interactable);
  }

  addTarget(object, type, data = {}) {
    const handler = this.handlers.get(type);
    if (!handler) { this.pending.push({ object, type, data }); return null; }
    const meshes = [];
    object.traverse((m) => { if (m.isMesh) meshes.push(m); });
    const target = { object, type, data, enabled: true, meshes, handler };
    for (const m of meshes) {
      m.userData.interactionTarget = target;
      prepareHighlight(m, this.cfg);
      if (m.isSkinnedMesh) m.raycast = raggioPersonaggio(object);
    }
    this.targets.push(target);
    handler.setup?.(target, this.ctx);
    return target;
  }

  setModal(modal) { this.modal = modal; this._setHover(null); }

  _pick() {
    const meshes = [];
    // solo i bersagli davvero visibili (anche i genitori: un gruppo nascosto, come la strada della storia lontano dal
    // circolo, non va provato triangolo per triangolo)
    const visible = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    for (const t of this.targets) if (t.enabled && visible(t.object)) meshes.push(...t.meshes);
    if (!meshes.length) return null;
    this.raycaster.setFromCamera(this.center, this.ctx.camera);
    // three.js guarda la distanza massima del raggio solo dopo aver provato i triangoli: si scartano prima i pezzi
    // troppo lontani (la sfera che li contiene è oltre la portata)
    const eye = this.raycaster.ray.origin, far = this.raycaster.far;
    const vicino = (m) => {
      const g = m.geometry;
      if (!g) return false;
      if (m.isSkinnedMesh) return true;                       // personaggi: il loro raggio è già un parallelepipedo
      if (!g.boundingSphere) g.computeBoundingSphere();
      _s.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
      return _s.center.distanceTo(eye) - _s.radius <= far;
    };
    // anche i muri e gli arredi bloccano il raggio: non si interagisce attraverso il bancone o una parete
    const hits = this.raycaster.intersectObjects([...meshes, ...this.ctx.occluders].filter(vicino), false);
    for (const h of hits) {
      const t = h.object.userData.interactionTarget;
      if (!t) return null;
      if (!t.enabled) continue;
      const range = t.handler.range ?? this.cfg.range;
      return h.distance <= range ? t : null;
    }
    return null;
  }

  _setHover(t) {
    if (this.hovered === t) return;
    if (this.hovered) for (const m of this.hovered.meshes) setHighlight(m, false);
    this.hovered = t;
    if (t) for (const m of t.meshes) setHighlight(m, true);
  }

  update(dt) {
    for (const [type, h] of this.handlers) h.update?.(dt, this.ctx, this.targets.filter((t) => t.type === type));
    let label = null;
    if (this.suspended) {
      this._setHover(null);
    } else if (this.modal) {
      label = this.modal.label;
    } else if (this.ctx.active()) {
      let t = this._pick();
      if (t) label = t.handler.label?.(t, this.ctx) ?? null;
      // progressione: un'interazione non ancora sbloccata mostra cosa fare prima, senza agire
      if (t && label && this.ctx.progress && !this.ctx.progress.allowed(t.type)) {
        label = this.ctx.progress.lockedLabel(t.type);
        this.lockedTarget = t;
      } else this.lockedTarget = null;
      if (!label) t = null;
      this._setHover(t);
    } else {
      this._setHover(null);
    }
    this.ctx.ui.setPrompt(label, !!this.modal);
  }

  interact() {
    if (this.modal) { this.modal.action(); return; }
    const t = this.hovered;
    if (t && t === this.lockedTarget) return;
    if (t && t.enabled) { t.handler.action?.(t, this.ctx); this._setHover(null); }
  }

  primary() {
    for (const h of this.handlers.values()) if (h.primary?.(this.ctx)) return true;
    return false;
  }

  reset() {
    this.modal = null;
    this._setHover(null);
    for (const t of this.targets) { t.enabled = true; t.handler.reset?.(t, this.ctx); }
  }
}

function prepareHighlight(mesh, cfg) {
  if (mesh.userData.baseMaterial) return;
  const base = mesh.material;
  const hl = base.clone();
  if (hl.emissive) {
    const c = new THREE.Color(cfg.highlightColor).multiplyScalar(cfg.highlightIntensity);
    hl.emissive = hl.emissiveMap ? hl.emissive.clone() : c;
    if (hl.emissiveMap) hl.emissiveIntensity = base.emissiveIntensity * 1.35; else hl.emissiveIntensity = 1;
  }
  mesh.userData.baseMaterial = base;
  mesh.userData.highlightMaterial = hl;
}

function setHighlight(mesh, on) {
  mesh.material = on ? mesh.userData.highlightMaterial : mesh.userData.baseMaterial;
}

// Aggiorna il materiale base (es. lo schermo riceve una nuova texture) mantenendo coerente l'evidenziazione.
export function refreshHighlight(mesh, cfg) {
  delete mesh.userData.baseMaterial;
  prepareHighlight(mesh, cfg);
}

// ------------------------------------------------------------------ handler: pickup (sigarette)

export function createPickupHandler() {
  return {
    label: (t, ctx) => ctx.config.interaction.labels.pickup,
    action(t, ctx) {
      t.object.visible = false;
      t.enabled = false;
      const id = t.object.userData.item_id;
      ctx.ui.addItem(id);
      ctx.ui.completeGoal(id);
      ctx.ui.toast(ctx.config.items[id]?.taken ?? 'Raccolto');
    },
    reset(t) { t.object.visible = true; },
  };
}

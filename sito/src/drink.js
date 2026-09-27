// Bancone: si ordina da Nicola (src/bar.js: schermata del bancone, menu con i prezzi, versata del drink scelto),
// poi il bicchiere si prende in mano e si beve. Con il vecchio barista Rigify la versata è la clip NPC_Barista_Pour.
// Il bicchiere parte vuoto (Glass.userData.starts_empty); colore e livello del liquido dipendono dal drink.
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function createBarHandlers() {
  const s = {
    state: 'empty',             // empty | pouring | full | held | drinking | done
    glass: null, glassTarget: null, liquid: null, liquidH: 0.1, home: null,
    barista: null, bottle: null, stream: null, t: 0,
    fillMax: 1, liquidMat: null,
  };

  function setFill(f) {
    if (!s.pivot) return;
    s.pivot.scale.y = Math.max(0.001, f);
    s.liquid.visible = f > 0.005;
  }

  // Il vino cresce dal fondo: perno sul punto più basso del liquido. Non si scala il nodo del liquido
  // direttamente perché la compressione meshopt vi scrive una scala di dequantizzazione.
  function makePivot(liquid) {
    const geo = liquid.isMesh ? liquid.geometry : liquid.getObjectByProperty('isMesh', true)?.geometry;
    if (!geo) return null;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const holder = liquid.isMesh ? liquid : liquid.getObjectByProperty('isMesh', true);
    const bottom = holder.localToWorld(new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2));
    const pivot = new THREE.Group();
    pivot.name = 'Glass_Liquid_Pivot';
    liquid.parent.add(pivot);
    pivot.position.copy(liquid.parent.worldToLocal(bottom));
    pivot.attach(liquid);
    return pivot;
  }

  // Collo della bottiglia: centro della faccia alta del bounding box locale (asse della bottiglia = +Y locale).
  function neckWorld(out) {
    const m = s.bottle.isMesh ? s.bottle : s.bottle.getObjectByProperty('isMesh', true);
    const bb = m.geometry.boundingBox ?? (m.geometry.computeBoundingBox(), m.geometry.boundingBox);
    return m.localToWorld(out.set((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2));
  }

  function putBack() {
    const g = s.glass;
    s.home.parent.add(g);
    g.position.copy(s.home.position);
    g.quaternion.copy(s.home.quaternion);
    g.scale.copy(s.home.scale);
    g.traverse((m) => { if (m.isMesh) m.frustumCulled = true; });
  }

  function glassUsable(ctx) {
    return !ctx.hands.active && !ctx.player.seated;
  }

  // ---- bicchiere: prendi, bevi, rimetti sul bancone
  const drink = {
    setup(t) {
      s.glassTarget = t;
      s.glass = t.object;
      s.home = { parent: s.glass.parent, position: s.glass.position.clone(), quaternion: s.glass.quaternion.clone(), scale: s.glass.scale.clone() };
      s.liquid = s.glass.getObjectByName('Glass_Liquid');
      if (s.liquid) {
        s.liquid.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); s.liquidMat = m.material; } });
        s.glass.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(s.liquid);
        s.liquidH = box.max.y - box.min.y;
        s.pivot = makePivot(s.liquid);
      }
      s.state = s.glass.userData.starts_empty ? 'empty' : 'full';
      setFill(s.state === 'full' ? 1 : 0);
    },
    label(t, ctx) {
      return s.state === 'full' && glassUsable(ctx) ? ctx.config.interaction.labels.pickup_drink : null;
    },
    action(t, ctx) {
      if (s.state !== 'full' || !glassUsable(ctx)) return;
      for (const m of t.meshes) m.material = m.userData.baseMaterial;
      if (ctx.hands.available) ctx.hands.hold('Hand_Glass', s.glass, 'Socket_Glass');
      else { ctx.camera.add(s.glass); s.glass.position.fromArray(ctx.config.interaction.drink.heldOffset); s.glass.quaternion.identity(); }
      s.state = 'held';
      ctx.ui.setHeldHint(ctx.config.ui.drinkHint);
    },
    primary(ctx) {
      if (s.state !== 'held' || !ctx.active() || ctx.hands.busy) return false;
      const d = ctx.config.interaction.drink;
      s.state = 'drinking';
      s.t = 0;
      ctx.ui.setHeldHint(null);
      ctx.hands.moveTo('mouthGlass', d.tiltDuration);
      return true;
    },
    update(dt, ctx) {
      if (s.state !== 'drinking' && s.state !== 'lowering') return;
      const d = ctx.config.interaction.drink;
      s.t += dt;
      if (s.state === 'drinking') {
        const drain = THREE.MathUtils.clamp((s.t - d.tiltDuration * 0.8) / d.drainDuration, 0, 1);
        setFill(s.fillMax * (1 - drain));
        if (s.t < d.tiltDuration + d.drainDuration + 0.2) return;
        s.state = 'lowering';
        s.t = 0;
        ctx.player.startSway();
        ctx.hands.moveTo('rest', d.tiltDuration);
      } else if (s.t >= d.tiltDuration + d.returnDelay) {
        s.state = 'done';
        ctx.hands.hide(() => {
          putBack();
          s.state = 'empty';                   // il barista può versarne un altro
          ctx.ui.completeGoal('glass');
          ctx.ui.toast(ctx.config.items.glass.taken);
          ctx.wallet?.checkBroke();
        });
      }
    },
    reset(t, ctx) {
      if (s.glass.parent !== s.home.parent) { ctx.hands.hideNow(); putBack(); }
      s.state = s.glass.userData.starts_empty ? 'empty' : 'full';
      setFill(s.state === 'full' ? 1 : 0);
      ctx.ui.setHeldHint(null);
    },
  };

  // ---- barista: "Chiedi da bere" -> versata
  const serve = {
    range: 2.6,
    setup(t, ctx) {
      s.barista = t.object;
      const u = s.barista.userData;
      s.bottle = ctx.scene.getObjectByName(u.bottle ?? 'Barista_Bottle');
      if (s.bottle) s.bottle.visible = false;
      const c = ctx.config.serve;
      const geo = new THREE.CylinderGeometry(c.streamRadius, c.streamRadius * 0.7, 1, 8, 1, true);
      geo.translate(0, -0.5, 0);               // origine in cima: si allunga verso il basso
      s.stream = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c.streamColor, roughness: 0.15, transparent: true, opacity: 0.9 }));
      s.stream.visible = false;
      s.stream.name = 'Wine_Stream';
      ctx.scene.add(s.stream);
    },
    label(t, ctx) {
      if (s.state !== 'empty' || !s.glass || s.glass.parent !== s.home.parent || ctx.hands.active) return null;
      return ctx.config.interaction.labels[ctx.bar?.enabled ? 'order_drink' : 'serve_drink'];
    },
    action(t, ctx) {
      if (s.state !== 'empty') return;
      if (ctx.bar?.enabled) { ctx.bar.open(); return; }     // Nicola Meshy: schermata del bancone
      const u = s.barista.userData;
      s.state = 'pouring';
      s.t = 0;
      ctx.npcs.playOnce(s.barista, u.pour_clip);
      ctx.npcs.say(s.barista, ctx.config.npcActions.serve.lines[0]);
    },
    update(dt, ctx) {
      if (s.state !== 'pouring') return;
      const u = s.barista.userData;
      s.t += dt;
      if (s.bottle) s.bottle.visible = s.t >= u.bottle_in && s.t < u.bottle_out;
      const f = THREE.MathUtils.clamp((s.t - u.pour_fill_start) / (u.pour_fill_end - u.pour_fill_start), 0, 1);
      setFill(f);
      const pouring = s.bottle && s.t > u.pour_fill_start - 0.05 && s.t < u.pour_fill_end;
      s.stream.visible = !!pouring;
      if (pouring) {
        // dal collo della bottiglia al pelo del vino, al centro del bicchiere
        neckWorld(_a);
        s.glass.getWorldPosition(_b);
        _b.y += 0.006 + s.liquidH * f;
        s.stream.position.copy(_a);
        const len = Math.max(0.01, _a.distanceTo(_b));
        s.stream.scale.set(1, len, 1);
        s.stream.quaternion.setFromUnitVectors(_up, _b.sub(_a).normalize().negate());
      }
      if (s.t >= u.pour_len) {
        s.state = 'full';
        setFill(1);
        s.stream.visible = false;
        if (s.bottle) s.bottle.visible = false;
        ctx.npcs.say(s.barista, ctx.config.serve.doneLine);
      }
    },
    reset(t, ctx) {
      s.stream.visible = false;
      if (s.bottle) s.bottle.visible = false;
      ctx.npcs.stopAction(s.barista);
    },
  };

  // per src/bar.js: bicchiere, liquido e stato
  const api = {
    get state() { return s.state; },
    set state(v) { s.state = v; },
    get glass() { return s.glass; },
    get liquidH() { return s.liquidH; },
    atHome: () => !!s.glass && s.glass.parent === s.home.parent,
    take: (ctx) => { if (s.state === 'full' && s.glassTarget) drink.action(s.glassTarget, ctx); },
    setFill,
    setDrink(color, opacity, fillMax) {
      s.fillMax = fillMax;
      if (s.liquidMat) {
        s.liquidMat.color.setHex(color);
        s.liquidMat.transparent = opacity < 1;
        s.liquidMat.opacity = opacity;
      }
    },
  };

  return { drink, serve, api };
}

// Sigaretta: la offre Cronico dal dialogo (give) oppure, se CONFIG.smoking.fromCronico è false, si prende dal
// pacchetto sul tavolino. È una copia di Cigarette_Lit tenuta tra indice e medio; a ogni clic si fa un tiro: mano alla
// bocca, brace che si ravviva, fumo espirato davanti alla camera.
import * as THREE from 'three';

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Sbuffi in coordinate mondo: la camera delle mani coincide con quella di gioco, quindi la punta della
// sigaretta (disegnata nella scena delle mani) ha la stessa posizione mondo e il fumo resta nell'aria.
class Puffs {
  constructor(scene, count) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(240,240,240,0.85)');
    grd.addColorStop(0.5, 'rgba(215,215,215,0.3)');
    grd.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.parts = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xe2e2e2 }));
      s.visible = false;
      s.renderOrder = 6;
      scene.add(s);
      this.parts.push({ s, age: 0, life: 0, vel: new THREE.Vector3(), size: [0, 0], op: 0, seed: 0 });
    }
    this.next = 0;
  }

  emit(pos, vel, life, size, opacity) {
    const p = this.parts[this.next];
    this.next = (this.next + 1) % this.parts.length;
    p.s.position.copy(pos);
    p.vel.copy(vel);
    p.age = 0; p.life = life; p.size = size; p.op = opacity; p.seed = Math.random() * 10;
    p.s.visible = true;
  }

  update(dt) {
    for (const p of this.parts) {
      if (!p.s.visible) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) { p.s.visible = false; continue; }
      p.vel.multiplyScalar(Math.exp(-dt * 1.8));   // il fumo rallenta nell'aria
      p.vel.y += dt * 0.12;                         // e sale
      p.s.position.addScaledVector(p.vel, dt);
      p.s.position.x += Math.sin(p.age * 1.6 + p.seed) * 0.01 * dt;
      const size = p.size[0] + (p.size[1] - p.size[0]) * t;
      p.s.scale.set(size, size, size);
      p.s.material.opacity = p.op * Math.min(1, t * 8) * (1 - t);
      p.s.material.rotation = p.seed + p.age * 0.4;
    }
  }

  clear() { for (const p of this.parts) p.s.visible = false; }
}

export function createSmokeHandler() {
  const s = {
    state: 'idle',              // idle | held | puff | done
    pack: null, left: 0, cig: null, ember: null, tip: null,
    t: 0, puffs: 0, tipAcc: 0, exhaleT: -1, fx: null, glow: 0,
    endless: false,             // la serata, durante lo spettacolo: la sigaretta non finisce
  };

  function makeCigarette(ctx) {
    const src = ctx.scene.getObjectByName('Cigarette_Lit');
    if (!src) return null;
    const cig = src.clone(true);
    cig.name = 'Player_Cigarette';
    cig.userData = {};
    for (const c of [...cig.children]) if (c.userData.smoke_emitter) c.removeFromParent();   // il fumo lo fa questo modulo
    const meshes = [];
    cig.traverse((m) => { if (m.isMesh) meshes.push(m); });
    const box = new THREE.Box3().setFromObject(src);
    const len = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    // presa verso il filtro (primo quarto) e asse della sigaretta sull'asse del socket
    const holder = new THREE.Group();
    holder.add(cig);
    cig.position.set(len * 0.25, -0.004, 0);
    cig.quaternion.identity();
    cig.scale.set(1, 1, 1);
    for (const m of meshes) {
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
      for (const mat of [m.material].flat()) if (/Ember/.test(mat.name)) s.ember = mat;
    }
    s.tip = new THREE.Object3D();
    s.tip.position.set(len * 0.5, 0.004, 0);
    cig.add(s.tip);
    return holder;
  }

  function finish(ctx) {
    s.state = 'done';
    ctx.ui.setHeldHint(null);
    ctx.hands.hide(() => {
      s.cig?.removeFromParent();
      s.cig = null;
      s.state = 'idle';
      ctx.ui.completeGoal('cigarettes');
      ctx.ui.toast(ctx.config.items.cigarettes.done);
    });
  }

  function light(ctx, toast) {
    s.cig = makeCigarette(ctx);
    if (!s.cig || !ctx.hands.available) return false;
    s.fx ??= new Puffs(ctx.scene, 90);
    s.puffs = 0;
    ctx.hands.hold('Hand_Cigarette', s.cig, 'Socket_Cigarette');
    s.state = 'held';
    ctx.ui.addItem('cigarettes');
    ctx.ui.toast(toast);
    ctx.ui.setHeldHint(ctx.config.ui.smokeHint);
    return true;
  }

  return {
    get holding() { return s.state !== 'idle'; },
    get puffs() { return s.puffs; },               // tiri fatti con la sigaretta di adesso
    set endless(v) { s.endless = v; },
    // spegne la sigaretta in mano (nel posacenere), senza contarla come "fumata"
    putOut(ctx, toast = null) {
      if (!s.cig) return;
      s.state = 'done';
      s.back = false;
      ctx.ui.setHeldHint(null);
      if (toast) ctx.ui.toast(toast);
      ctx.hands.hide(() => { s.cig?.removeFromParent(); s.cig = null; s.state = 'idle'; });
    },
    // Cronico ti dà una sigaretta e te la accende
    give(ctx) {
      if (s.state !== 'idle' || ctx.hands.active) { ctx.ui.toast(ctx.config.minigames.handsBusy); return; }
      light(ctx, ctx.config.items.cigarettes.given);
    },
    setup(t, ctx) {
      if (t.object.name !== 'Cigarette_Pack') return;          // la serata aggiunge altri oggetti con altri handler
      s.pack = t.object;
      s.left = s.pack.userData.cigarettes_left ?? 5;
      s.fx ??= new Puffs(ctx.scene, 90);
    },
    label(t, ctx) {
      if (ctx.config.smoking.fromCronico) return null;         // il pacchetto resta sul tavolino, per bellezza
      if (s.state !== 'idle' || ctx.hands.active || ctx.player.seated) return null;
      return s.left > 0 ? ctx.config.interaction.labels.smoke : null;
    },
    action(t, ctx) {
      if (s.state !== 'idle' || ctx.hands.active) return;
      if (ctx.config.smoking.fromCronico) return;
      if (s.left <= 0) { ctx.ui.toast(ctx.config.items.cigarettes.empty); return; }
      if (light(ctx, ctx.config.items.cigarettes.taken)) s.left--;
    },
    primary(ctx) {
      if (s.state !== 'held' || !ctx.active() || ctx.hands.busy) return false;
      const c = ctx.config.smoking;
      s.state = 'puff';
      s.t = 0;
      ctx.ui.setHeldHint(null);
      ctx.hands.moveTo('mouthCig', c.toMouth);
      return true;
    },
    update(dt, ctx) {
      const c = ctx.config.smoking;
      s.fx?.update(dt);
      if (!s.cig) return;
      // brace: si ravviva durante il tiro
      const target = s.state === 'puff' && s.t > c.toMouth * 0.7 && s.t < c.toMouth + c.hold ? 1 : 0;
      s.glow += (target - s.glow) * Math.min(1, dt * 6);
      if (s.ember) s.ember.emissiveIntensity = c.emberIdle + (c.emberPuff - c.emberIdle) * s.glow * (0.85 + Math.random() * 0.15);
      // filo di fumo dalla punta, in coordinate mondo
      if (ctx.hands.active && s.tip) {
        s.tipAcc += dt;
        while (s.tipAcc > 0.09) {
          s.tipAcc -= 0.09;
          s.tip.getWorldPosition(_p);
          s.fx.emit(_p, _v.set((Math.random() - 0.5) * 0.02, 0.05, (Math.random() - 0.5) * 0.02), 2.4, [0.006, 0.07], 0.16);
        }
      }
      // espirazione: sbuffi davanti alla bocca, spinti in avanti
      if (s.exhaleT >= 0) {
        s.exhaleT += dt;
        const cam = ctx.camera;
        const k = s.exhaleT / c.exhale;
        if (k < 0.7) {
          const n = Math.random() < 0.8 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            cam.getWorldQuaternion(_q);
            _p.set((Math.random() - 0.5) * 0.02, -0.07, -0.13).applyQuaternion(_q).add(cam.getWorldPosition(_v));
            const fwd = new THREE.Vector3((Math.random() - 0.5) * 0.12, -0.03 + Math.random() * 0.06, -1).normalize().applyQuaternion(_q);
            s.fx.emit(_p, fwd.multiplyScalar(0.55 * (1 - k)), 2.6, [0.03, 0.32], 0.28 * (1 - k * 0.6));
          }
        } else if (k >= 1) s.exhaleT = -1;
      }
      if (s.state !== 'puff') return;
      s.t += dt;
      if (s.t >= c.toMouth + c.hold && !s.back) {
        s.back = true;
        ctx.hands.moveTo('rest', c.back);
        s.exhaleT = 0;
      }
      if (s.t >= c.toMouth + c.hold + c.back) {
        s.back = false;
        s.puffs++;
        if (s.puffs >= c.puffs && !s.endless) finish(ctx);
        else { s.state = 'held'; ctx.ui.setHeldHint(ctx.config.ui.smokeHint); }
      }
    },
    reset(t, ctx) {
      if (s.cig) { ctx.hands.hideNow(); s.cig.removeFromParent(); s.cig = null; }
      s.state = 'idle';
      s.back = false;
      s.exhaleT = -1;
      s.left = s.pack?.userData.cigarettes_left ?? 5;
      s.fx?.clear();
      ctx.ui.setHeldHint(null);
    },
  };
}

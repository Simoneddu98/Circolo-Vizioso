// Maxischermo: texture della partita su MAT_Screen e handler "look" (sedersi davanti allo schermo).
import * as THREE from 'three';
import { yawTo, pitchTo } from './player.js';
import { refreshHighlight } from './interactions.js';

// ------------------------------------------------------------------ texture dello schermo

export async function setupScreen(root, config) {
  // tutti gli schermi: maxischermo (MAT_Screen), mini schermo sul bancone (MAT_Screen_Mini), TV laterale (MAT_Screen_Side)
  const mats = new Set();
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && /^MAT_Screen/.test(o.material?.name ?? '')) { mats.add(o.material); meshes.push(o); }
  });
  if (!mats.size) return { update() {}, source: 'MAT_Screen non trovato' };

  let tex = null, source = 'canvas', match = null;
  if (config.tv.videoMode !== 'off' && (config.tv.videoMode === 'on' || await exists(config.assets.video))) {
    tex = await videoTexture(config.assets.video).catch(() => null);
    if (tex) source = 'video';
  }
  if (!tex) {
    match = new CanvasMatch(config.tv);
    tex = new THREE.CanvasTexture(match.canvas);
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;                        // stessa convenzione delle UV glTF
  for (const mat of mats) {
    mat.map = tex;
    mat.emissiveMap = tex;
    mat.emissive.set(0xffffff);
    mat.emissiveIntensity = config.tv.emissiveIntensity;
    mat.color.set(0xffffff);
    mat.roughness = 0.9;                    // schermo opaco: niente riflesso delle plafoniere sul tabellone
    mat.metalness = 0;
    mat.envMapIntensity = 0.2;
    mat.needsUpdate = true;
  }
  for (const m of meshes) if (m.userData.baseMaterial) refreshHighlight(m, config.interaction);

  let acc = 0;
  let override = null;                      // { tex, draw } : il quiz del cinema al posto della partita
  const setMaps = (t) => {
    for (const mat of mats) { mat.map = t; mat.emissiveMap = t; mat.needsUpdate = true; }
    for (const m of meshes) if (m.userData.baseMaterial) refreshHighlight(m, config.interaction);
  };
  source = `${source} su ${mats.size} schermi`;
  return {
    source,
    // canvas disegnato da altri (null = torna la partita); draw(dt) viene chiamato a ogni aggiornamento dello schermo
    setOverride(canvas, draw = null) {
      override?.tex.dispose();
      override = null;
      if (canvas) {
        const t = new THREE.CanvasTexture(canvas);
        t.colorSpace = THREE.SRGBColorSpace;
        t.flipY = false;
        t.anisotropy = 16;                    // lo schermo si guarda un po' di lato: scritte nitide anche così
        override = { tex: t, draw };
        setMaps(t);
      } else setMaps(tex);
    },
    update(dt) {
      if (override) {
        acc += dt;
        if (acc < 1 / config.tv.fps) return;
        override.draw?.(acc);
        acc = 0;
        override.tex.needsUpdate = true;
        return;
      }
      if (!match) return;
      acc += dt;
      if (acc < 1 / config.tv.fps) return;
      match.step(acc);
      acc = 0;
      tex.needsUpdate = true;
    },
  };
}

async function exists(url) {
  try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; }
}

function videoTexture(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    Object.assign(v, { src: url, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });
    v.addEventListener('canplay', () => { v.play().catch(() => {}); resolve(new THREE.VideoTexture(v)); }, { once: true });
    v.addEventListener('error', reject, { once: true });
    v.load();
  });
}

// Partita disegnata: campo a strisce, 22 giocatori che seguono la palla, tabellone con minuto e punteggio.
class CanvasMatch {
  constructor(cfg) {
    this.cfg = cfg;
    this.canvas = document.createElement('canvas');
    this.canvas.width = cfg.canvasWidth;
    this.canvas.height = cfg.canvasHeight;
    this.g = this.canvas.getContext('2d');
    this.W = cfg.canvasWidth; this.H = cfg.canvasHeight;
    this.time = 0;
    this.score = [1, 0];
    this.goalFlash = 0;
    this.nextGoal = 70 + Math.random() * 60;
    this.ball = { x: this.W / 2, y: this.H / 2, tx: this.W / 2, ty: this.H / 2 };
    const formation = [[0.06, 0.5], [0.2, 0.2], [0.2, 0.4], [0.2, 0.6], [0.2, 0.8], [0.35, 0.3], [0.35, 0.5], [0.35, 0.7], [0.45, 0.25], [0.45, 0.5], [0.45, 0.75]];
    this.players = [];
    for (const team of [0, 1]) for (const [fx, fy] of formation) {
      const hx = team === 0 ? fx : 1 - fx;
      this.players.push({ team, hx, hy: fy, x: hx * this.W, y: fy * this.H, keeper: fx < 0.1 });
    }
    this.step(0);
  }

  step(dt) {
    const { W, H, ball } = this;
    this.time += dt;
    if (Math.hypot(ball.tx - ball.x, ball.ty - ball.y) < 6 || Math.random() < dt * 0.35) {
      ball.tx = W * (0.12 + Math.random() * 0.76);
      ball.ty = H * (0.15 + Math.random() * 0.7);
    }
    const bs = Math.min(1, dt * 1.6);
    ball.x += (ball.tx - ball.x) * bs;
    ball.y += (ball.ty - ball.y) * bs;
    for (const p of this.players) {
      const pull = p.keeper ? 0.08 : 0.38;
      const tx = p.hx * W + (ball.x - W / 2) * pull + Math.sin(this.time * 0.7 + p.hy * 9) * 6;
      const ty = p.hy * H + (ball.y - p.hy * H) * pull * 0.8;
      const k = Math.min(1, dt * 1.8);
      p.x += (tx - p.x) * k; p.y += (ty - p.y) * k;
    }
    if (this.time > this.nextGoal) {
      this.score[Math.random() < 0.55 ? 0 : 1]++;
      this.goalFlash = 3;
      this.nextGoal = this.time + 80 + Math.random() * 90;
    }
    this.goalFlash = Math.max(0, this.goalFlash - dt);
    this.draw();
  }

  draw() {
    const { g, W, H } = this;
    for (let i = 0; i < 12; i++) {
      g.fillStyle = i % 2 ? '#2f8a3c' : '#379a45';
      g.fillRect((i * W) / 12, 0, W / 12 + 1, H);
    }
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    const m = 14;
    g.strokeRect(m, m, W - 2 * m, H - 2 * m);
    g.beginPath(); g.moveTo(W / 2, m); g.lineTo(W / 2, H - m); g.stroke();
    g.beginPath(); g.arc(W / 2, H / 2, 34, 0, Math.PI * 2); g.stroke();
    g.strokeRect(m, H / 2 - 60, 60, 120);
    g.strokeRect(W - m - 60, H / 2 - 60, 60, 120);
    for (const p of this.players) {
      g.beginPath();
      g.arc(p.x, p.y, 6, 0, Math.PI * 2);
      g.fillStyle = p.team === 0 ? (p.keeper ? '#f2c230' : '#b3202a') : (p.keeper ? '#1c1c1c' : '#f4f4f4');
      g.fill();
      g.lineWidth = 2.5;
      g.strokeStyle = p.team === 0 ? '#1d3a8a' : '#7a1020';
      g.stroke();
    }
    g.beginPath(); g.arc(this.ball.x, this.ball.y, 3.2, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    // tabellone
    const minute = Math.min(90, 23 + Math.floor(this.time / 2));
    g.fillStyle = 'rgba(16,20,40,0.88)';
    g.fillRect(18, 18, 214, 30);
    g.fillStyle = '#b3202a'; g.fillRect(18, 18, 6, 30);
    g.font = '600 17px Oswald, Arial Narrow, sans-serif';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText(`${this.cfg.homeTeam.slice(0, 3)}  ${this.score[0]} - ${this.score[1]}  ${this.cfg.awayTeam.slice(0, 3)}`, 32, 34);
    g.fillStyle = '#ffd35a';
    g.fillText(`${minute}'`, 192, 34);
    if (this.goalFlash > 0) {
      g.fillStyle = 'rgba(10,10,10,0.55)';
      g.fillRect(0, H / 2 - 36, W, 72);
      g.fillStyle = '#ffd35a';
      g.font = '700 52px Oswald, Arial Narrow, sans-serif';
      g.textAlign = 'center';
      g.fillText('GOOOL!', W / 2, H / 2 + 2);
      g.textAlign = 'left';
    }
  }
}

// ------------------------------------------------------------------ handler "look": sedersi davanti allo schermo

// seduti sulla sedia, occhi verso il centro dello schermo (anche la serata ci mette il giocatore per il quiz)
export function seatInFront(ctx, chair, screen) {
  const seatPos = chair.getWorldPosition(new THREE.Vector3());
  const target = new THREE.Box3().setFromObject(screen).getCenter(new THREE.Vector3());
  const eye = seatPos.clone();
  eye.y = ctx.config.player.seatedEyeHeight;
  const away = new THREE.Vector3(eye.x - target.x, 0, eye.z - target.z).normalize();
  eye.addScaledVector(away, ctx.config.seat.backOffset);
  ctx.player.sit({ eye, yaw: yawTo(eye, target), pitch: pitchTo(eye, target) });
}

export function createLookHandler() {
  let screen = null;
  const chairs = [];
  let occupied = null;

  function standUp(ctx) {
    ctx.player.stand();
    occupied = null;
    ctx.interactions.setModal(null);
    ctx.ui.toast(null);
  }

  return {
    setup(t, ctx) {
      if (t.data.isSeat) { chairs.push(t.object); return; }
      screen = t.object;
      const found = [];
      ctx.scene.traverse((o) => { if (ctx.config.seat.chairPattern.test(o.name)) found.push(o); });
      for (const c of found) ctx.interactions.addTarget(c, 'look', { isSeat: true });
    },
    label: (t, ctx) => ctx.config.interaction.labels.look,
    action(t, ctx) {
      if (!chairs.length || !screen) return;
      const p = ctx.player.position;
      const wp = new THREE.Vector3();
      let best = null, bestD = Infinity;
      for (const c of chairs) {
        if (c === occupied) continue;
        c.getWorldPosition(wp);
        const d = Math.hypot(wp.x - p.x, wp.z - p.z);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (!best) return;
      occupied = best;
      seatInFront(ctx, best, screen);
      ctx.ui.completeGoal('match');
      ctx.ui.toast(ctx.config.ui.seatedHint);
      ctx.interactions.setModal({ label: ctx.config.interaction.labels.stand, action: () => standUp(ctx) });
    },
    reset(t, ctx) {
      if (occupied) standUp(ctx);
    },
  };
}

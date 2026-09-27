import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CONFIG } from './config.js';
import { Player, yawTo } from './player.js';
import { CollisionWorld } from './collisions.js';
import { InteractionSystem, createPickupHandler } from './interactions.js';
import { createBarHandlers } from './drink.js';
import { createSmokeHandler } from './smoking.js';
import { Hands } from './hands.js';
import { MinigameManager } from './minigames/manager.js';
import { FoosballDemo } from './minigames/foosball/demo.js';
import { DialogueSystem } from './dialogue.js';
import { NpcRoutine } from './routine.js';
import './minigames/darts/view.js';
import './minigames/scopa/view.js';
import './minigames/pool/view.js';
import './minigames/foosball/view.js';
import './minigames/slots/view.js';
import { setupScreen, createLookHandler } from './tv.js';
import { NPCManager } from './npc.js';
import { UI } from './ui.js';
import { Progress } from './progress.js';
import { SmokeSystem } from './smoke.js';
import { Wallet } from './wallet.js';
import { BarOrder } from './bar.js';
import { CameraWork } from './camerawork.js';
import { isTouchDevice, TouchControls } from './touch.js';
import { Serata } from './serata/director.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const ui = new UI(CONFIG);
const progress = new Progress(CONFIG, ui);
const wallet = new Wallet(CONFIG, () => broke());
const canvas = document.getElementById('scene');

// ------------------------------------------------------------------ renderer e scena

// telefono e tablet: controlli touch, niente pointer lock, rendering più leggero
const TOUCH = isTouchDevice();
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (TOUCH) {
  CONFIG.render.maxPixelRatio = CONFIG.touch.maxPixelRatio;
  CONFIG.render.shadowMapSize = CONFIG.touch.shadowMapSize;
}
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CONFIG.render.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;       // PCFSoft è stato rimosso in r18x
renderer.shadowMap.autoUpdate = false;              // scena statica: l'ombra del biliardo si calcola una volta
renderer.info.autoReset = false;                    // due passate (scena + mani): le statistiche si azzerano a mano

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0906);
const camera = new THREE.PerspectiveCamera(CONFIG.render.fov, window.innerWidth / window.innerHeight, CONFIG.render.near, CONFIG.render.far);
scene.add(camera);                                   // il bicchiere in mano è figlio della camera

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = CONFIG.render.environmentIntensity;
pmrem.dispose();

const collisions = new CollisionWorld(CONFIG);
const player = new Player(camera, CONFIG, collisions);

let state = 'loading';                               // loading | start | playing | paused
let dragMode = false;                                // ripiego se il browser rifiuta il pointer lock
let spawn = null;
let interactions, npcs, tv, smoke;

let minigames = null, foosDemo = null, dialogue = null, routines = [], barOrder = null, barHandlers = null, camerawork = null, serata = null;
const ctx = {
  config: CONFIG, scene, camera, player, ui, renderer, progress, wallet, occluders: [], requestLock: () => requestLock(),
  releaseLock: () => { if (document.pointerLockElement === canvas) document.exitPointerLock(); },
  pause: () => pause(),
  active: () => state === 'playing',
};

// ------------------------------------------------------------------ caricamento

function loadGLB(url, onProgress) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);   // il glb è compresso con meshopt + WebP
  return new Promise((resolve, reject) => loader.load(url, resolve, onProgress, reject));
}

// Un pezzo che non parte (per esempio un asset vecchio in cache) non deve bloccare tutto il gioco: si prosegue senza.
function optional(name, make) {
  try { return make(); } catch (err) { console.error(`[circolo] ${name} non disponibile`, err); return null; }
}

async function load() {
  if (TOUCH) ui.showTouchLegend(CONFIG.touch.legend, CONFIG.touch.rotate, IOS && !navigator.standalone ? CONFIG.touch.iosHome : null);
  let pMain = 0, pCol = 0;
  const progress = () => ui.setProgress(Math.min(0.99, pMain * 0.92 + pCol * 0.08));
  const track = (set) => (e) => { if (e.lengthComputable && e.total) { set(e.loaded / e.total); progress(); } };

  const [gltf, colGltf, handsGltf] = await Promise.all([
    loadGLB(CONFIG.assets.scene, track((v) => { pMain = v; })),
    loadGLB(CONFIG.assets.collision, track((v) => { pCol = v; })).catch(() => null),
    loadGLB(CONFIG.assets.hands).catch(() => null),
  ]);
  ctx.hands = new Hands(handsGltf, CONFIG);
  const root = gltf.scene;
  scene.add(root);
  ctx.root = root;
  // piani e oggetti dei minigiochi che non si vedono in esplorazione
  root.traverse((o) => { if (o.userData.marker_plane || o.userData.start_hidden) o.visible = false; });
  root.updateMatrixWorld(true);

  setupLights(root);
  setupShadows(root);

  // spawn: posizione, direzione (il fronte degli oggetti è +Z locale glTF) e altezza occhi
  const sp = root.getObjectByName('SPAWN_Player');
  const pos = sp ? sp.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  const fwd = new THREE.Vector3(0, 0, 1);
  if (sp) fwd.applyQuaternion(sp.getWorldQuaternion(new THREE.Quaternion()));
  spawn = { pos, yaw: Math.atan2(-fwd.x, -fwd.z), eye: sp?.userData.eye_height ?? CONFIG.player.eyeHeightFallback };

  // collisioni: circolo_collision.glb, altrimenti bounding box del glb principale
  if (colGltf) collisions.addFromCollisionScene(colGltf.scene);
  if (collisions.count === 0) collisions.addFromVisualScene(root);
  collisions.computeBounds(spawn.pos);

  // interazioni: i tipi base; altri moduli possono chiamare interactions.register() in qualsiasi momento
  interactions = new InteractionSystem(ctx);
  ctx.interactions = interactions;
  interactions.register('pickup', createPickupHandler());
  barHandlers = createBarHandlers();
  interactions.register('pickup_drink', barHandlers.drink);
  interactions.register('serve_drink', barHandlers.serve);
  ctx.smoking = createSmokeHandler();
  interactions.register('smoke', ctx.smoking);
  interactions.register('look', createLookHandler());
  interactions.scan(root);
  // i corpi animati non fanno da schermo: il raycast sulle mesh con scheletro costa troppo per ogni frame
  const isMarker = (o) => { for (let p = o; p; p = p.parent) if (p.userData.marker_plane || p.userData.start_hidden) return true; return false; };
  root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !o.userData.interactionTarget && !isMarker(o)) ctx.occluders.push(o); });

  tv = await setupScreen(root, CONFIG);
  npcs = new NPCManager(root, gltf.animations, CONFIG, ui);
  ctx.npcs = npcs;
  minigames = new MinigameManager(ctx);
  ctx.minigames = minigames;
  dialogue = new DialogueSystem(ctx);
  ctx.dialogue = dialogue;
  barOrder = optional('bancone', () => new BarOrder(ctx, barHandlers.api));   // bancone: menu e versata di Nicola
  ctx.bar = barOrder;
  routines = optional('routine', () => npcs.npcs.filter((o) => CONFIG.routines?.[o.userData.routine])
    .map((o) => new NpcRoutine(ctx, o, CONFIG.routines[o.userData.routine]))) ?? [];
  ctx.routines = routines;
  ctx.collisions = collisions;                               // chi cammina non attraversa i mobili
  camerawork = optional('reflex', () => new CameraWork(ctx));   // Kappa e Zucco: foto e video con la reflex
  ctx.touch = TOUCH ? new TouchControls(ctx, { pause }) : null;
  ctx.camerawork = camerawork;
  if (CONFIG.minigames.games.foosball.demoInExploration) {
    foosDemo = new FoosballDemo(ctx);                // i due giocatori del circolo al biliardino
    foosDemo.rig.ball.visible = true;
  }
  serata = optional('serata', () => new Serata(ctx, tv));    // la serata a brani (modalità storia)
  ctx.serata = serata;
  smoke = new SmokeSystem(root, CONFIG);
  player.spawn(spawn.pos, spawn.yaw, spawn.eye);
  renderer.shadowMap.needsUpdate = true;

  window.circolo = { register: (type, handler) => interactions.register(type, handler), scene, CONFIG };
  if (DEBUG) setupDebug(root);
  state = 'start';
  ui.ready();
  if (DEBUG) console.info(`[circolo] collisioni: ${collisions.count} rettangoli da ${collisions.source}; schermi: ${tv.source}; npc: ${npcs.npcs.length} (animati: ${npcs.animated}); mani: ${ctx.hands.available}; fumo: ${smoke.emitters.length}`);
}

function setupLights(root) {
  const lights = [];
  root.traverse((o) => { if (o.isLight) lights.push(o); });
  if (lights.length) {
    for (const l of lights) {
      l.intensity *= CONFIG.render.lightScale;
      for (const [prefix, k] of Object.entries(CONFIG.render.lightMultipliers)) if (l.name.startsWith(prefix)) l.intensity *= k;
      l.castShadow = false;
      if (l.isSpotLight && /Billiard/.test(l.name)) {
        l.castShadow = true;
        l.shadow.mapSize.set(CONFIG.render.shadowMapSize, CONFIG.render.shadowMapSize);
        l.shadow.bias = -0.0005;
        l.shadow.normalBias = 0.02;
        l.shadow.camera.near = 0.1;
        l.shadow.camera.far = 4;
      }
    }
  } else if (CONFIG.render.lightFallback) {
    // nessuna luce nel glb: plafoniere fredde + lampade calde
    for (const [x, z] of [[-2.6, -1.9], [-2.6, 1.9], [2.6, -1.9], [2.6, 1.9]]) {
      const l = new THREE.PointLight(0xe6f0ff, 16, 0, 2); l.position.set(x, 3.05, z); scene.add(l);
    }
    const spot = new THREE.SpotLight(0xffcc8a, 50, 0, 0.95, 0.4, 2);
    spot.position.set(0.8, 1.8, 1.2); spot.target.position.set(0.8, 0, 1.2);
    spot.castShadow = true;
    scene.add(spot, spot.target);
    for (const z of [0.3, -1.3]) { const l = new THREE.PointLight(0xffb870, 14, 0, 2); l.position.set(-5.2, 2.1, z); scene.add(l); }
  }
  scene.add(new THREE.HemisphereLight(0xffe2b0, 0x3a2012, CONFIG.render.hemisphereIntensity));
}

function setupShadows(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    let top = o;
    while (top.parent && top.parent !== root) top = top.parent;
    o.castShadow = CONFIG.render.shadowCasters.test(top.name);
    o.receiveShadow = /^(Floor|Pool_Table|Foosball_Table|Chair_Screen)/.test(top.name);
  });
}

// ------------------------------------------------------------------ stato di gioco

let lockFailures = 0;
async function requestLock() {
  if (dragMode || TOUCH || serata?.cursorFree) return;   // sul telefono si guarda trascinando; nei giochi della serata cursore libero
  try {
    if (!canvas.requestPointerLock) throw new DOMException('assente', 'NotSupportedError');
    await canvas.requestPointerLock();
    lockFailures = 0;
    ui.showLockHint(false);
  } catch (err) {
    // SecurityError = il browser chiede di attendere un attimo dopo Esc: basta un altro clic.
    // Altri errori (pagina in un iframe, browser senza pointer lock) o fallimenti ripetuti: si guarda trascinando.
    lockFailures++;
    // SecurityError / NotAllowedError: serve un clic dell'utente (per esempio dopo Esc o dopo un timer); basta cliccare.
    // Si passa al trascinamento solo se il pointer lock non esiste o continua a fallire anche dopo i clic.
    const needsClick = err?.name === 'SecurityError' || err?.name === 'NotAllowedError';
    if (!needsClick || lockFailures >= 4) {
      dragMode = true;
      ui.setLockHint(CONFIG.ui.dragHint);
    }
    ui.showLockHint(true);
  }
}

function enter(mode = 'storia') {
  if (state !== 'start') return;
  gameMode = serata ? mode : 'libero';
  ui.showStart(false);
  ui.showHUD(true);
  state = 'playing';
  player.enabled = true;
  wallet.show(true);
  // Android: schermo intero e orizzontale. Su iPhone/iPad no: Safari, a schermo intero, avvisa "Stai scrivendo in
  // modalità a tutto schermo?" appena la pagina riceve un tasto; lì lo schermo intero si ha aggiungendo il gioco alla Home
  // (manifest.webmanifest, display fullscreen).
  if (TOUCH && !IOS) {
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
      .then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  }
  serata?.begin(gameMode);
  requestLock();
  wallet.checkBroke();                                   // rientro con le tasche già vuote
}
let gameMode = 'storia';

// Soldi finiti: si chiude quello che è aperto e si ricomincia la serata da capo (soldi, obiettivi, accoglienza)
function broke() {
  if (state !== 'playing' && state !== 'paused') return;
  if (minigames?.active || barOrder?.active || ctx.hands.active) { setTimeout(broke, 1000); return; }
  dialogue?.close();
  ctx.releaseLock();
  wallet.showBroke(() => {
    wallet.reset();
    progress.reset();
    dialogue.seen.clear();
    restart();
    serata?.begin(gameMode);
    requestLock();
  });
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  player.clearInput();
  ui.showPause(true);
  serata?.onPause(true);
}

function resume() {
  if (state !== 'paused') return;
  ui.showPause(false);
  state = 'playing';
  serata?.onPause(false);
  requestLock();
}

function restart() {
  if (minigames.active) return;
  serata?.reset();
  interactions.reset();
  npcs.reset();
  ui.resetProgress();
  wallet.reset();
  player.spawn(spawn.pos, spawn.yaw, spawn.eye);
  if (state === 'paused') resume();
  if (serata?.story) serata.begin('storia');
}

ui.el.enter.addEventListener('click', () => enter('storia'));
ui.el.enterFree?.addEventListener('click', () => enter('libero'));
ui.bindPause({
  onResume: resume, onRestart: restart,
  onSensitivity: (v) => { player.sensitivity = v; },
  onHeadBob: (v) => { player.headBob = v; },
  sensitivity: CONFIG.player.mouseSensitivity, headBob: CONFIG.player.headBob,
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!dragMode) ui.showLockHint(!locked && state === 'playing');
  if (minigames?.active) { if (!locked) minigames.onPointerLockLost(); return; }
  if (dialogue?.active || barOrder?.active || serata?.cursorFree || document.getElementById('broke')) return;   // dialogo, bancone, serata: cursore libero
  if (!locked && state === 'playing' && !dragMode) pause();
});

document.addEventListener('mousemove', (e) => {
  if (state !== 'playing') return;
  if (minigames?.input('mousemove', e)) return;
  if (dialogue?.active || barOrder?.active || serata?.cursorFree) return;
  if (document.pointerLockElement === canvas) player.look(e.movementX, e.movementY);
  else if (dragMode && (e.buttons & 1)) player.look(e.movementX, e.movementY);
});

let dragStart = null;
canvas.addEventListener('mousedown', (e) => {
  if (dialogue?.active || barOrder?.active || document.getElementById('broke')) return;   // si sceglie con i pulsanti
  if (serata?.cursorFree) { if (state === 'playing' && e.button === 0) interactions.primary(); return; }   // clic sulla scena = un tiro
  if (state === 'playing' && minigames?.active) {
    if (minigames.game?.def.pointerLock !== false && document.pointerLockElement !== canvas && minigames.state === 'playing' && !minigames.paused) { requestLock(); return; }
    minigames.input('mousedown', e); return;
  }
  if (state !== 'playing' || e.button !== 0) return;
  if (dragMode) { dragStart = { x: e.clientX, y: e.clientY }; return; }   // in trascinamento: azione al rilascio
  if (document.pointerLockElement !== canvas) { requestLock(); return; }
  interactions.primary();
});
window.addEventListener('mouseup', (e) => { if (state === 'playing' && minigames?.active) minigames.input('mouseup', e); });
canvas.addEventListener('wheel', (e) => { if (state === 'playing' && minigames?.input('wheel', e)) e.preventDefault(); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => { if (minigames?.active) e.preventDefault(); });
canvas.addEventListener('mouseup', (e) => {
  if (minigames?.active) return;
  if (!dragMode || !dragStart || e.button !== 0 || state !== 'playing') return;
  if (Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) < 6) interactions.primary();
  dragStart = null;
});

window.addEventListener('keydown', (e) => {
  if (state === 'playing' && minigames?.active) { if (minigames.input('keydown', e)) e.preventDefault(); return; }
  if (state === 'playing' && dialogue?.key(e)) { e.preventDefault(); return; }
  if (state === 'playing' && serata?.key(e)) { e.preventDefault(); return; }
  if (state === 'playing' && barOrder?.key(e)) { e.preventDefault(); return; }
  if (document.getElementById('broke')) return;
  if (state === 'playing') {
    if (player.onKey(e.code, true)) e.preventDefault();
    if (e.code === 'KeyE' && !e.repeat) interactions.interact();
    if (e.code === 'Escape' && dragMode) pause();
  }
});
window.addEventListener('keyup', (e) => {
  if (minigames?.active) { minigames.input('keyup', e); return; }
  player.onKey(e.code, false);
});
window.addEventListener('blur', () => player.clearInput());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

// ------------------------------------------------------------------ ciclo principale

const clock = { last: performance.now() };
const stats = { frames: 0, acc: 0, fps: 0, samples: [] };
const debugTasks = new Set();

function tick(dt) {
  if (state !== 'loading') {
    for (const task of debugTasks) task(dt);
    if (state === 'playing' && minigames.active) {
      minigames.update(dt);
      npcs.update(dt, player.position, false);
    } else if (state === 'playing' && (dialogue?.active || barOrder?.active || serata?.freeze)) {
      npcs.update(dt, player.position, false);        // si parla, si ordina o si gioca un brano: il giocatore resta fermo
      if (serata?.freeze) player.update(dt);          // (solo la camera: seduto o fermo, niente input)
    } else if (state === 'playing') {
      player.update(dt);
      npcs.update(dt, player.position);
    }
    if (state === 'playing') { foosDemo?.update(dt); for (const r of routines) r.update(dt); barOrder?.update(dt); camerawork?.update(dt); serata?.update(dt); }   // dopo le animazioni: l'IK delle braccia le corregge
    ctx.touch?.update(state);
    ctx.hands.update(state === 'playing' ? dt : 0, camera);
    if (!minigames.active && !dialogue?.active && !barOrder?.active) interactions.update(dt);
    else ui.setPrompt(null);
    if (state !== 'playing') ui.setPrompt(null);
    tv.update(dt);
    smoke.update(dt);
  }
}

function draw() {
  renderer.info.reset();
  renderer.render(scene, camera);
  if (state !== 'loading') ctx.hands.render(renderer);   // mani sopra la scena, depth pulito
}

function frame(now) {
  const dt = Math.min((now - clock.last) / 1000, 0.1);
  clock.last = now;
  tick(dt);
  draw();
  stats.frames++; stats.acc += dt;
  if (stats.acc >= 0.5) {
    stats.fps = stats.frames / stats.acc;
    stats.samples.push(stats.fps);
    if (stats.samples.length > 240) stats.samples.shift();
    stats.frames = 0; stats.acc = 0;
    if (DEBUG && state !== 'loading') {
      const p = player.position;
      ui.debugText(`FPS ${stats.fps.toFixed(0)}\nPos x ${p.x.toFixed(2)}  z ${p.z.toFixed(2)}\nYaw ${THREE.MathUtils.radToDeg(player.yaw).toFixed(0)}°\n` +
        `Draw call ${renderer.info.render.calls}  Tri ${renderer.info.render.triangles}\nCollisioni ${collisions.count}`);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ debug (?debug=1)

function setupDebug() {
  scene.add(collisions.debugLines());
  const until = (fn) => new Promise((resolve) => {
    const task = (dt) => { const r = fn(dt); if (r) { debugTasks.delete(task); resolve(r); } };
    debugTasks.add(task);
  });
  // API usata per i test automatici: muove il giocatore con lo stesso input della tastiera.
  Object.assign(window.circolo, {
    THREE, camera, player, collisions, ui, stats, renderer, hands: ctx.hands, get npcs() { return npcs; },
    get interactions() { return interactions; },
    state: () => state,
    enter: (mode = 'storia') => { dragMode = true; enter(mode); },
    get serata() { return serata; },
    face(x, z, y = null) {
      player.yaw = yawTo(player.position, { x, z });
      if (y !== null) player.pitch = Math.atan2(y - camera.position.y, Math.hypot(x - player.position.x, z - player.position.z));
    },
    walkTo(x, z, { run = false, timeout = 30 } = {}) {
      let t = 0, lastCheck = 0, lastPos = player.position.clone();
      player.input.run = run;
      return until((dt) => {
        t += dt;
        const d = Math.hypot(x - player.position.x, z - player.position.z);
        if (d < 0.12 || t > timeout || state !== 'playing') {
          player.clearInput();
          return { reached: d < 0.12, pos: [+player.position.x.toFixed(3), +player.position.z.toFixed(3)], t: +t.toFixed(2) };
        }
        if (t - lastCheck > 1.0) {
          if (player.position.distanceTo(lastPos) < 0.02) { player.clearInput(); return { reached: false, stuck: true, pos: [+player.position.x.toFixed(3), +player.position.z.toFixed(3)] }; }
          lastCheck = t; lastPos.copy(player.position);
        }
        player.yaw = yawTo(player.position, { x, z });
        player.input.f = true;
        return null;
      });
    },
    // Come walkTo ma a passo fisso 1/60 s in un ciclo sincrono: stesso codice di movimento e collisione,
    // indipendente dal frame rate (utile se la scheda è in background). onStep(pos) viene chiamato a ogni passo.
    walkToSim(x, z, { run = false, timeout = 30, onStep = null } = {}) {
      const dt = 1 / 60;
      let t = 0, stuckT = 0;
      const last = player.position.clone();
      player.input.run = run;
      while (t < timeout) {
        const d = Math.hypot(x - player.position.x, z - player.position.z);
        if (d < 0.12) break;
        player.yaw = yawTo(player.position, { x, z });
        player.input.f = true;
        player.update(dt);
        onStep?.(player.position);
        t += dt;
        if ((stuckT += dt) >= 1) {
          if (player.position.distanceTo(last) < 0.02) break;
          stuckT = 0; last.copy(player.position);
        }
      }
      player.clearInput();
      for (let i = 0; i < 30; i++) { player.update(dt); onStep?.(player.position); }   // lascia smaltire l'inerzia
      const d = Math.hypot(x - player.position.x, z - player.position.z);
      return { reached: d < 0.2, pos: [+player.position.x.toFixed(3), +player.position.z.toFixed(3)], t: +t.toFixed(2) };
    },
    hold(codes, seconds) {
      let t = 0;
      for (const c of codes) player.onKey(c, true);
      return until((dt) => {
        t += dt;
        if (t < seconds) return null;
        for (const c of codes) player.onKey(c, false);
        return { pos: [+player.position.x.toFixed(3), +player.position.z.toFixed(3)] };
      });
    },
    wait: (s) => { let t = 0; return until((dt) => ((t += dt) >= s ? true : null)); },
    prompt: () => (ui.el.prompt.hidden ? null : ui.el.promptText.textContent),
    pressE: () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e' })),
    click: () => interactions.primary(),
    pause, resume, restart, get minigames() { return minigames; },
    progress, unlockAll: () => progress.unlockAll(),
    get foosDemo() { return foosDemo; }, get dialogue() { return dialogue; }, get routines() { return routines; },
    get bar() { return barOrder; }, wallet, broke: () => broke(), get camerawork() { return camerawork; },
    // avanza la simulazione di s secondi a passo fisso e disegna un frame (test con la scheda in background)
    advance(s, step = 1 / 60) { for (let t = 0; t < s; t += step) tick(step); draw(); return true; },
  });
}

load().catch((err) => {
  ui.loadError('Non è stato possibile caricare il circolo. Ricarica la pagina; se il problema continua, controlla che la cartella assets sia stata pubblicata.');
  throw err;
});

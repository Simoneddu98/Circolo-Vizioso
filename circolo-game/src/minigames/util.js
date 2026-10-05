// Utilità comuni ai minigiochi: lettura dei marcatori del glb, suoni sintetizzati, statistiche in localStorage.
import * as THREE from 'three';
import { sbloccaAudio, riprovaAlTocco } from '../audiosession.js';

// Camere e spot sono empty esportati da Blender: la camera Blender guarda lungo -Z locale con l'alto su +Y;
// dopo la conversione Y-up del glTF quegli assi diventano -Y (sguardo) e -Z (alto). Questa rotazione li riporta
// alla convenzione delle camere three.js (sguardo -Z, alto +Y).
const CAM_FIX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export function markerCamera(obj) {
  obj.updateWorldMatrix(true, false);
  const pos = obj.getWorldPosition(new THREE.Vector3());
  const quat = obj.getWorldQuaternion(new THREE.Quaternion()).multiply(CAM_FIX);
  return { pos, quat, fov: obj.userData.fov ?? 55 };
}

// Piano di gioco (marker_plane): origine al centro, X locale sul lato lungo, normale +Y locale (Z in Blender).
// La compressione meshopt scrive una scala sul nodo: il centro vero si prende dal bounding box della geometria
// e le dimensioni dall'extra "size"; la rotazione del nodo non viene toccata.
export class SurfaceFrame {
  constructor(obj) {
    obj.updateWorldMatrix(true, false);
    this.center = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    this.quat = obj.getWorldQuaternion(new THREE.Quaternion());
    this.inv = this.quat.clone().invert();
    [this.width, this.depth] = obj.userData.size ?? [1, 1];
    this.normal = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);
  }
  // 2D (x lungo X locale, y lungo -Z locale, cioè +Y di Blender) -> mondo, con altezza h sopra il piano
  toWorld(x, y, h = 0, out = new THREE.Vector3()) {
    return out.set(x, h, -y).applyQuaternion(this.quat).add(this.center);
  }
  toLocal(p, out = new THREE.Vector2()) {
    const v = p.clone().sub(this.center).applyQuaternion(this.inv);
    return out.set(v.x, -v.z);
  }
  height(p) { return p.clone().sub(this.center).dot(this.normal); }
  // direzione 2D -> vettore mondo
  dirWorld(dx, dy, out = new THREE.Vector3()) { return out.set(dx, 0, -dy).applyQuaternion(this.quat); }
}

// ------------------------------------------------------------------ audio (Web Audio, niente file)

let actx = null;
function audio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { actx = new AC(); } catch { return null; }
    sbloccaAudio(actx);
    riprovaAlTocco(actx);
  }
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}

// Colpo breve: rumore filtrato + tono (clack delle palle, tonfo della freccetta, tiro al biliardino)
export function sfx({ freq = 1800, dur = 0.05, vol = 0.3, noise = 0.6, type = 'triangle', decay = 30 } = {}) {
  const a = audio();
  if (!a || vol <= 0.001) return;
  const t = a.currentTime;
  const g = a.createGain();
  g.gain.setValueAtTime(Math.min(1, vol), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(a.destination);
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
  const og = a.createGain(); og.gain.value = 1 - noise;
  o.connect(og).connect(g);
  o.start(t); o.stop(t + dur);
  if (noise > 0) {
    const n = a.createBufferSource();
    const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate / decay));
    n.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    const ng = a.createGain(); ng.gain.value = noise;
    n.connect(f).connect(ng).connect(g);
    n.start(t);
  }
}

export function jingle(notes, step = 0.12, vol = 0.18) {
  const a = audio();
  if (!a) return;
  notes.forEach((f, i) => {
    const t = a.currentTime + i * step;
    const o = a.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + step);
  });
}

// ------------------------------------------------------------------ statistiche

const KEY = 'circolo.minigames.v1';
export function loadStats() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
export function saveStats(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* localStorage non disponibile: statistiche solo per questa sessione */ }
}

export function gauss(rng = Math.random) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Rumore morbido 1D (somma di sinusoidi con fasi casuali): oscillazione del mirino
export function smoothNoise(seed = Math.random() * 100) {
  const ph = [seed, seed * 1.7 + 1, seed * 2.3 + 2];
  return (t) => (Math.sin(t * 1.3 + ph[0]) * 0.5 + Math.sin(t * 2.9 + ph[1]) * 0.3 + Math.sin(t * 5.3 + ph[2]) * 0.2);
}

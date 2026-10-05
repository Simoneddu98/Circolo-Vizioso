// "La storia": Cronico ti consegna il biglietto in mano. Tre tempi:
//   tendi  Cronico fa il gesto e il biglietto è nella sua mano (segue l'osso della mano destra); la tua mano sale
//   vola   il biglietto passa dalla sua mano alla tua (stesso attacco della sigaretta, così non c'è salto)
//   leggi  lo tieni davanti agli occhi e si legge (fila e posto); poi la mano si abbassa e il biglietto va in tasca
// Senza mani in prima persona (hands.glb mancante) si salta tutto: finisce subito.
import * as THREE from 'three';
import { ArmIK } from '../ik.js';

const W = 0.1, H = 0.05, D = 0.002;                  // metri: un biglietto del cinema
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const lisce = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

function disegna(cfg) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 1024, 512);
  bg.addColorStop(0, '#2a0f3a'); bg.addColorStop(1, '#12071c');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = '#ffe100'; g.lineWidth = 8; g.setLineDash([26, 14]); g.strokeRect(22, 22, 980, 468); g.setLineDash([]);
  // strappo a destra
  g.strokeStyle = 'rgba(255,225,0,.55)'; g.lineWidth = 4; g.setLineDash([10, 12]); g.beginPath(); g.moveTo(790, 40); g.lineTo(790, 472); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#ffe100'; g.textBaseline = 'alphabetic';
  g.font = '600 44px Oswald, Impact, sans-serif'; g.fillText(cfg.sopra.toUpperCase(), 64, 100);
  g.fillStyle = '#ff17e4'; g.font = '700 190px Oswald, Impact, sans-serif'; g.fillText(cfg.titolo.toUpperCase(), 60, 290);
  g.fillStyle = '#f4f2fa'; g.font = '600 74px Oswald, Impact, sans-serif'; g.fillText(`FILA ${cfg.fila}   ·   POSTO ${cfg.posto}`, 64, 420);
  g.save(); g.translate(905, 256); g.rotate(-Math.PI / 2); g.fillStyle = '#ffe100'; g.font = '700 70px Oswald, Impact, sans-serif'; g.textAlign = 'center';
  g.fillText(`${cfg.fila}${cfg.posto}`, 0, 22); g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function creaMeshBiglietto(cfg) {
  const faccia = new THREE.MeshBasicMaterial({ map: disegna(cfg) });
  const dietro = new THREE.MeshBasicMaterial({ color: 0x241033 });
  const bordo = new THREE.MeshBasicMaterial({ color: 0xe9dcc0 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [bordo, bordo, bordo, bordo, faccia, dietro]);
  m.frustumCulled = false;
  m.name = 'Biglietto';
  return m;
}

export class Consegna {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;                                  // STORIA.consegna: tempi e posa
    this.fase = null;
    this.mesh = null;
  }

  get active() { return !!this.fase; }

  start(npc, bigl, onDone) {
    const ctx = this.ctx, C = this.cfg;
    if (!ctx.hands?.available || !npc) { onDone?.(); return; }
    this.cancel();
    this.npc = npc; this.onDone = onDone; this.t = 0;
    this.braccio = new ArmIK(npc, 'Right');
    this.mano = this.braccio.ok ? this.braccio.hand : null;
    this.mesh = creaMeshBiglietto(bigl);
    ctx.scene.add(this.mesh);
    if (C.clip) ctx.npcs.playOnce(npc, C.clip);
    ctx.hands.hold('Hand_Cigarette');               // la tua mano sale, ancora vuota
    this.fase = 'tendi';
  }

  // il braccio destro di Cronico si tende verso di te (w = 0: posa dell'animazione, 1: braccio teso)
  _braccio(w) {
    const R = this.braccio, C = this.cfg;
    if (!R?.ok) return;
    if (w <= 0) { R.release(); return; }
    const npc = this.npc, p = this.ctx.player.position;
    npc.updateWorldMatrix(true, true);
    R.begin();
    const q = npc.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(-1, 0, 0).applyQuaternion(q);
    if (!R.palm) R.calibratePalm(right.clone().negate());
    const S = R.upper.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(p.x - S.x, 0, p.z - S.z).normalize();
    const T = S.clone().addScaledVector(dir, C.braccio.avanti).addScaledVector(Y, -C.braccio.giu);
    const cur = R.hand.getWorldPosition(new THREE.Vector3());
    const pole = new THREE.Vector3(0, -1, 0).addScaledVector(right, C.braccio.gomitoFuori);
    R.solveHinge(cur.lerp(T, w), pole);
    R.orientHand(dir, Y, w);
    R.end();
  }

  // posizione e orientamento nella mano di Cronico (o, senza osso, davanti al suo petto)
  _dallaMano(out) {
    const C = this.cfg;
    if (this.mano) this.mano.getWorldPosition(out);
    else this.npc.getWorldPosition(out).add(_s.set(0, 1.1, 0));
    out.addScaledVector(Y, C.alzaMano);
    return out;
  }

  update(dt) {
    if (!this.fase) return;
    const ctx = this.ctx, C = this.cfg, cam = ctx.camera;
    this.t += dt;
    if (this.fase === 'tendi') {
      this._braccio(lisce(this.t / (C.tendi * 0.6)));
      this._dallaMano(_p);
      this.mesh.position.copy(_p);
      this.mesh.quaternion.copy(cam.quaternion);     // la faccia verso di te
      this.mesh.scale.setScalar(C.ingrandisci);
      if (this.t >= C.tendi) {
        this.da = { pos: this.mesh.position.clone(), q: this.mesh.quaternion.clone() };
        this.fase = 'vola'; this.t = 0;
      }
    } else if (this.fase === 'vola') {
      this._braccio(1);
      const sock = ctx.hands.sockets.Socket_Cigarette;
      sock.getWorldPosition(_p); sock.getWorldQuaternion(_q);
      const dest = new THREE.Quaternion().setFromEuler(new THREE.Euler(...C.rot)).premultiply(_q);
      const k = Math.min(1, this.t / C.vola), e = k * k * (3 - 2 * k);
      this.mesh.position.lerpVectors(this.da.pos, _p, e);
      this.mesh.position.y += Math.sin(k * Math.PI) * C.arco;
      this.mesh.quaternion.slerpQuaternions(this.da.q, dest, e);
      this.mesh.scale.setScalar(C.ingrandisci + (1 - C.ingrandisci) * e);
      if (k >= 1) {                                  // si aggancia alla tua mano
        sock.add(this.mesh);
        this.mesh.scale.setScalar(1);
        this.mesh.position.set(...C.pos);
        this.mesh.quaternion.setFromEuler(new THREE.Euler(...C.rot));
        this.fase = 'leggi'; this.t = 0;
        ctx.hands.moveTo(C.lettura.pose, C.lettura.durata);
      }
    } else if (this.fase === 'leggi') {
      this._braccio(1 - lisce(this.t / 0.5));                    // il braccio di Cronico torna giù
      if (this.t >= C.leggi) {
        this.fase = 'fine';
        ctx.hands.hide(() => this._chiudi());
      }
    }
  }

  _chiudi() {
    this.braccio?.release();
    this.mesh?.removeFromParent();
    this.mesh = null;
    this.fase = null;
    const f = this.onDone; this.onDone = null;
    f?.();
  }

  cancel() {
    if (!this.fase && !this.mesh) return;
    this.braccio?.release();
    this.mesh?.removeFromParent();
    this.mesh = null;
    this.fase = null;
    this.onDone = null;
    this.ctx.hands?.hideNow();
  }
}

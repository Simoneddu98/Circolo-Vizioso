// Giocatore in prima persona: input, movimento con collisioni, head bob, seduta e ondeggiamento.
import * as THREE from 'three';

const MOVE_KEYS = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b',
  KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
  ShiftLeft: 'run', ShiftRight: 'run',
};

export class Player {
  constructor(camera, config, collisions) {
    this.camera = camera;
    this.cfg = config.player;
    this.seatCfg = config.seat;
    this.drinkCfg = config.interaction.drink;
    this.collisions = collisions;
    this.position = new THREE.Vector3();      // piedi
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eyeHeight = this.cfg.eyeHeightFallback;
    this.sensitivity = this.cfg.mouseSensitivity;
    this.headBob = this.cfg.headBob;
    this.input = { f: false, b: false, l: false, r: false, run: false };
    this.analog = null;                        // levetta touch: { x (destra), y (avanti) } tra -1 e 1
    this.enabled = false;
    this.seat = null;                          // { eye: Vector3, yaw, pitch, standPos, standYaw }
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.swayTime = Infinity;
    this.swayOffset = { yaw: 0, pitch: 0, roll: 0 };
    camera.rotation.order = 'YXZ';
    this.baseFov = camera.fov;
  }

  spawn(pos, yaw, eyeHeight) {
    this.position.set(pos.x, 0, pos.z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    if (eyeHeight) this.eyeHeight = eyeHeight;
    this.seat = null;
    this.swayTime = Infinity;
    this.clearInput();
    this._applyCamera(0);
  }

  clearInput() { for (const k in this.input) this.input[k] = false; }

  onKey(code, down) {
    const k = MOVE_KEYS[code];
    if (!k) return false;
    this.input[k] = down;
    return true;
  }

  look(dx, dy) {
    const s = this.cfg.baseLookSpeed * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    if (this.seat) {
      const d = wrapAngle(this.yaw - this.seat.yaw);
      this.yaw = this.seat.yaw + THREE.MathUtils.clamp(d, -this.seatCfg.yawLimit, this.seatCfg.yawLimit);
      this.pitch = THREE.MathUtils.clamp(this.pitch, this.seat.pitch - this.seatCfg.pitchDown, this.seat.pitch + this.seatCfg.pitchUp);
    } else {
      this.pitch = THREE.MathUtils.clamp(this.pitch, -this.cfg.pitchLimit, this.cfg.pitchLimit);
    }
  }

  sit({ eye, yaw, pitch }) {
    this.seat = { eye: eye.clone(), yaw, pitch, standPos: this.position.clone(), standYaw: this.yaw };
    this.yaw = yaw;
    this.pitch = pitch;
    this.velocity.set(0, 0, 0);
    this.clearInput();
  }

  stand() {
    if (!this.seat) return;
    this.position.copy(this.seat.standPos);
    this.yaw = this.seat.standYaw;
    this.pitch = 0;
    this.seat = null;
  }

  startSway() { this.swayTime = 0; }

  update(dt) {
    dt = Math.min(dt, this.cfg.maxStepDt);
    let speed = 0;
    if (!this.seat) {
      let fwd = (this.input.f ? 1 : 0) - (this.input.b ? 1 : 0);
      let side = (this.input.r ? 1 : 0) - (this.input.l ? 1 : 0);
      let amount = 1, run = this.input.run;
      if (this.analog && !fwd && !side) {                  // levetta: la spinta decide la velocità, a fondo si corre
        const m = Math.min(1, Math.hypot(this.analog.x, this.analog.y));
        if (m > 0.12) { fwd = this.analog.y; side = this.analog.x; amount = m; run = m > 0.95; }
      }
      const target = new THREE.Vector3();
      if (this.enabled && (fwd || side)) {
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        // avanti = -Z locale della camera ruotata di yaw
        target.set(-sin * fwd + cos * side, 0, -cos * fwd - sin * side).normalize()
          .multiplyScalar((run ? this.cfg.runSpeed : this.cfg.walkSpeed) * (run ? 1 : amount));
      }
      const a = 1 - Math.exp(-this.cfg.acceleration * dt);
      this.velocity.lerp(target, a);
      const step = this.velocity.clone().multiplyScalar(dt);
      // sotto-passi: mai più di metà raggio per passo, niente attraversamenti
      const n = Math.max(1, Math.ceil(step.length() / (this.cfg.radius * 0.5)));
      for (let i = 0; i < n; i++) {
        this.position.addScaledVector(step, 1 / n);
        this.collisions.resolve(this.position, this.cfg.radius);
      }
      speed = Math.hypot(this.velocity.x, this.velocity.z);
    }
    this._applyCamera(dt, speed);
  }

  _applyCamera(dt, speed = 0) {
    // head bob: ampiezza proporzionale alla velocità, si spegne dolcemente da fermi
    const moving = speed > 0.2 && this.headBob && !this.seat;
    this.bobAmount += ((moving ? 1 : 0) - this.bobAmount) * Math.min(1, dt * 6);
    this.bobPhase += dt * this.cfg.headBobFrequency * Math.PI * 2 * Math.max(speed / this.cfg.walkSpeed, 0.5);
    const bobY = Math.sin(this.bobPhase * 2) * this.cfg.headBobAmplitude * this.bobAmount * 0.5;
    const bobRoll = Math.sin(this.bobPhase) * 0.006 * this.bobAmount;

    // ondeggiamento dopo aver bevuto: somma di sinusoidi, inviluppo che si spegne in swayDuration
    const d = this.drinkCfg;
    let sy = 0, sp = 0, sr = 0;
    if (this.swayTime < d.swayDuration) {
      this.swayTime += dt;
      const env = Math.pow(Math.max(0, 1 - this.swayTime / d.swayDuration), 1.6) * Math.min(1, this.swayTime / 0.8);
      const t = this.swayTime * d.swayFrequency * Math.PI * 2;
      sr = Math.sin(t) * d.swayRoll * env;
      sy = Math.sin(t * 0.63 + 1.1) * d.swayYaw * env;
      sp = Math.sin(t * 1.37 + 0.4) * d.swayPitch * env;
    }
    this.swayOffset.yaw = sy; this.swayOffset.pitch = sp; this.swayOffset.roll = sr;

    if (this.seat) this.camera.position.copy(this.seat.eye);
    else this.camera.position.set(this.position.x, this.eyeHeight + bobY, this.position.z);
    this.camera.rotation.set(this.pitch + sp, this.yaw + sy, bobRoll + sr);
    const fov = this.seat ? this.seatCfg.fov : this.baseFov;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * this.seatCfg.fovSpeed || 1);
      this.camera.updateProjectionMatrix();
    }
  }

  get seated() { return !!this.seat; }
  get swaying() { return this.swayTime < this.drinkCfg.swayDuration; }
}

export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// Imbardata di una camera che guarda da `from` verso `to` (la camera guarda lungo -Z locale).
export function yawTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

export function pitchTo(from, to) {
  return Math.atan2(to.y - from.y, Math.hypot(to.x - from.x, to.z - from.z));
}

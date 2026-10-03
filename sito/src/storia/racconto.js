// "La storia" (modalità sperimentale): primo capitolo, il cinema. Ha la stessa interfaccia della regia della serata
// (begin, update, key, freeze, cursorFree, decorate, startNode, action, ...): quando si sceglie questa modalità main.js la
// mette al posto della serata, che resta com'è. Usa l'interfaccia della serata (overlay) e il quiz del cinema.
import * as THREE from 'three';
import { CinemaRoom } from './cinemaroom.js';
import { createCinema } from '../serata/cinema.js';
import { yawTo, pitchTo } from '../player.js';
import { saltaPresentazioni } from '../serata/director.js';

export class Racconto {
  constructor(ctx, serata) {
    this.ctx = ctx;
    this.cfg = ctx.config.storia;
    this.serata = serata;                    // per l'overlay (barra, pannelli, titoli, dissolvenze) e i suoi testi
    this.ov = serata.ov;
    this.mode = null;
    this.stage = 'idle';
    this.freeze = false;
    this.cursorFree = false;
    this.wait = 0;
    this.t = 0;
    this.inCinema = false;
    const B = this.cfg.biglietto;
    this.steps = this.cfg.passi.map((s) => ({ ...s, text: s.text.replace('{fila}', B.fila).replace('{posto}', B.posto),
      locked: s.locked }));
    ctx.config.items.biglietto ??= { name: `${this.cfg.item} ${B.fila}${B.posto}` };
    this.room = new CinemaRoom(ctx.scene, this.cfg);
    new Image().src = this.cfg.logo;
    this._wrapBarista();
    this._targets();
  }

  get progress() { return this.ctx.progress; }
  get story() { return this.mode === 'racconto'; }

  // ------------------------------------------------------------------ inizio e ricominciare

  begin() {
    this.mode = 'racconto';
    this.progress.useSteps(this.steps, this.cfg.requires, this.cfg.storageKey);
    if (this.ctx.config.prova?.attiva) saltaPresentazioni(this.ctx, this.cfg.presentazioni);   // PROVA: niente giro iniziale
    this.stage = 'idle';
    this.wait = 1.5;
    if (this.progress.goal === 'nicola') {
      const n = this._npc('Nicola');
      if (n) {
        this.ctx.player.yaw = yawTo(this.ctx.player.position, n.getWorldPosition(new THREE.Vector3()));
        setTimeout(() => { this.ctx.npcs.say(n, 'Ohi, tu! Vieni al bancone, che ti spiego come funziona.'); this.ctx.npcs.lastTime = this.ctx.npcs.clock + 6; }, 900);
      }
    }
    // a metà del capitolo (ricaricando la pagina) si riparte dalla porta
    if (['biglietto', 'film', 'uscita'].includes(this.progress.goal)) { this.progress.done.delete('porta'); this.progress.done.delete('biglietto'); this.progress.done.delete('film'); this.progress.ui.renderGoals(); }
  }

  // PROVA: i punti a cui si può saltare dal menu di pausa
  get provaPunti() { return [['porta', 'Cronico alla porta'], ['biglietto', 'Dentro il cinema'], ['uscita', 'Dopo il film (uscita)']]; }

  jumpTo(goal) {
    if (!this.story) return;
    const ctx = this.ctx;
    clearTimeout(this.titleT);
    this._stopFilm();
    this.ov.clear(); this.ov.showBar(null); this.ov.big(null); this.ov.fade(false);
    this._setFree(false);
    document.body.classList.remove('srt-on');
    this._release();
    ctx.porta?.close();
    if (this.inCinema) this._leaveCinema(false);
    ctx.player.collisions = ctx.collisions;
    if (ctx.player.seated) ctx.player.stand();
    const steps = this.progress.steps;
    this.progress.done.clear();
    for (const s of steps) { if (s.goal === goal) break; this.progress.done.add(s.goal); }
    this.progress._save(); this.progress.ui.renderGoals();
    this.wait = 0.3;
    if (goal === 'porta') { this.stage = 'idle'; return; }
    // dentro il cinema (al posto, oppure all'uscita dopo il film)
    this.progress.done.delete('porta');
    this.stage = 'going';
    this._enterCinema();
    if (goal === 'uscita') setTimeout(() => { this.progress.complete('biglietto'); this.progress.complete('film'); }, 600);
  }

  reset() {
    clearTimeout(this.titleT);
    this.ctx.player.collisions = this.ctx.collisions;            // di nuovo le collisioni del circolo
    this.ctx.porta?.close();
    this._stopFilm();
    if (this.inCinema) this._leaveCinema(false);
    this._release();
    this.ov.clear(); this.ov.showBar(null); this.ov.big(null); this.ov.fade(false);
    this._setFree(false);
    this.stage = 'idle';
    this.wait = 1.5;
    this.ctx.dialogue.seen.clear();
  }

  // ------------------------------------------------------------------ servizi chiamati da dialoghi e main

  decorate(npc, text, node = null) {
    if (node && node !== 'benvenuto' && this.story && !this.progress.isDone('presentazioni') && Object.values(this.cfg.presentazioni).includes(node)) {
      return `${text} ${this.cfg.presentazioniCoda}`;
    }
    return text;
  }

  startNode(npc) {
    if (!this.story || this.progress.goal !== 'porta' || npc.userData.npc_name !== 'Cronico' || !['vaAllaPorta', 'aspetta'].includes(this.stage)) return null;
    this.stage = 'talk';
    return this.cfg.cronico.nodo;
  }

  action(what) {
    if (what !== 'segui' || this.stage !== 'talk') return;
    this.stage = 'porta';
    this._say('Cronico', this.cfg.cronico.apri, 5);
  }

  onDialogueClosed() {}

  onPause(p) { this.ov.pauseMusic(p); }

  key(e) {
    if (!this.freeze && this.stage !== 'result') return false;
    if (e.code === 'Escape') { this.ctx.pause?.(); return true; }
    if (this.stage === 'pronto' && (e.code === 'Enter' || e.code === 'Space')) { this._goFilm(); return true; }
    if (this.stage === 'film') this.film?.key?.(e);
    return true;
  }

  // ------------------------------------------------------------------ ciclo

  update(dt) {
    if (!this.story) return;
    const ctx = this.ctx;
    this.t += dt;
    if (this.inCinema) this.room.update(dt, this.t);
    if (this.stage === 'aperta') {                               // porta aperta: oltre la soglia, nel buio, si arriva al cinema
      const s = ctx.porta?.soglia;
      if (!s || ctx.player.position.z > s.z + this.cfg.buio) this._enterCinema();
    }
    if (this.inCinema && this.progress.goal === 'uscita' && this.stage === 'cinema') {
      const e = this.room.exitPoint;
      if (Math.hypot(ctx.player.position.x - e.x, ctx.player.position.z - e.z) < 0.85) this._exitCinema();
    }
    if (this.stage === 'film') {
      this.left -= dt;
      this.ov.setTime(this.left);
      this.film.update(dt);
      if ((this.screenAcc = (this.screenAcc ?? 0) + dt) > 1 / 30) { this.screenAcc = 0; this.filmDraw?.(); this.room.refreshScreen(); }
      if (this.left <= 0) this._endFilm();
      return;
    }
    if (this.wait > 0) { this.wait -= dt; return; }
    const goal = this.progress.goal;
    if (goal === 'presentazioni') {
      const need = Object.entries(this.cfg.presentazioni);
      const met = need.filter(([, node]) => ctx.dialogue.seen.has(node)).length;
      if (met !== this.progress.counts.presentazioni) this.progress.setCount('presentazioni', met);
      if (met >= need.length && !ctx.dialogue.active) {
        this.metT = (this.metT ?? 0) + dt;
        if (this.metT >= this.cfg.attesa) { this.metT = 0; this.progress.complete('presentazioni'); }
      }
    } else if (goal === 'porta') {
      if (this.stage === 'idle') this._cronicoAllaPorta();
      else if (this.stage === 'vaAllaPorta') this._walk(dt);
      else if (this.stage === 'aspetta') this._aspetta();
      else if (this.stage === 'talk' && !ctx.dialogue.active) this.stage = 'aspetta';   // chiuso senza "ti seguo": resta lì
    }
  }

  // ------------------------------------------------------------------ Cronico alla porta

  _npc(name) { return this.ctx.npcs.npcs.find((o) => o.userData.npc_name === name); }

  _say(who, text, dur = 5) {
    this.ctx.ui.subtitle(who, text, dur, { now: true });
    this.ctx.npcs.lastTime = this.ctx.npcs.clock + dur;
  }

  _cronicoAllaPorta() {
    const npc = this._npc('Cronico');
    if (!npc) { this.progress.complete('porta'); return; }
    this.guide = npc;
    npc.visible = true;
    npc.userData.directed = true;
    this.ctx.camerawork?.stop(npc);
    this.ctx.npcs.stopAction(npc);
    this.walkT = 0; this.stuckT = 0; this.bestD = Infinity; this.ghost = 0;
    const u = npc.userData;
    if (u.walk_clip) this.ctx.npcs.setLoop(npc, u.walk_clip, u.walk_speed ? 1.2 / u.walk_speed : 1, 0.3);
    this.stage = 'vaAllaPorta';
  }

  _walk(dt) {
    const ctx = this.ctx, npc = this.guide, q = npc.position, [sx, sz] = this.cfg.cronico.porta;
    const dx = sx - q.x, dz = sz - q.z, d = Math.hypot(dx, dz);
    this.walkT += dt;
    if (d < 0.12 || this.walkT > 25) {
      if (this.walkT > 25) { q.x = sx; q.z = sz; }
      const u = npc.userData;
      if (u.idle_clip) ctx.npcs.setLoop(npc, u.stand_clip ?? u.idle_clip, 1, 0.3);
      this.stage = 'aspetta';
      return;
    }
    if (d < this.bestD - 0.05) { this.bestD = d; this.stuckT = 0; } else this.stuckT += dt;
    if (this.stuckT > 1.5) { this.ghost = 2; this.stuckT = 0; this.bestD = d; }
    const step = Math.min(d, 1.2 * dt);
    q.x += (dx / d) * step; q.z += (dz / d) * step;
    if ((this.ghost = Math.max(0, this.ghost - dt)) <= 0) ctx.collisions?.resolve(q, 0.2);
    let a = Math.atan2(dx, dz) - npc.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a));
    npc.rotation.y += a * Math.min(1, dt * 7);
  }

  _aspetta() {
    const npc = this.guide, p = this.ctx.player.position, q = npc.position;
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < 6) { let a = Math.atan2(p.x - q.x, p.z - q.z) - npc.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); npc.rotation.y += a * 0.08; }
    if (!this.called && d < 4 && !this.ctx.dialogue.active) { this.called = true; this._say('Cronico', this.cfg.cronico.chiama, 4); }
  }

  _release() {
    if (!this.guide) return;
    this.guide.userData.directed = false;
    const u = this.guide.userData;
    if (u.idle_clip) this.ctx.npcs.setLoop(this.guide, u.idle_clip, 1, 0.3);
    this.guide = null;
    this.called = false;
  }

  // ------------------------------------------------------------------ porte e poltrone

  _targets() {
    const ctx = this.ctx, I = ctx.interactions;
    // la porta d'ingresso del circolo: si apre solo quando Cronico ti ci ha portato
    const door = ctx.porta?.group ?? ctx.root.getObjectByName('Door_Main');
    I.register('storia_porta', {
      range: 2.6,
      label: () => (this.story && this.progress.goal === 'porta' && this.stage === 'porta' ? this.cfg.portaLabel : null),
      action: () => { if (this.stage === 'porta') this._openDoor(); },
    });
    if (door) I.addTarget(door, 'storia_porta');
    // poltrone del cinema
    I.register('storia_posto', {
      range: 2.2,
      label: (t) => {
        if (!this.inCinema || this.progress.goal !== 'biglietto' || this.ctx.player.seated) return null;
        const { fila, posto } = t.object.userData, B = this.cfg.biglietto;
        return fila === B.fila && posto === B.posto ? `${this.cfg.postoGiusto}: fila ${fila}, posto ${posto}`
          : this.cfg.postoSbagliato.replace('{fila}', fila).replace('{posto}', posto);
      },
      action: (t) => {
        const { fila, posto } = t.object.userData, B = this.cfg.biglietto;
        if (fila !== B.fila || posto !== B.posto) { ctx.ui.toast(this.cfg.nonTuo.replace('{fila}', B.fila).replace('{posto}', B.posto), 3); return; }
        this._sit(t.object);
      },
    });
    for (const s of this.room.seats) I.addTarget(s.hit, 'storia_posto');
    // porta d'uscita del cinema (passaggio con le tende rosse): ci si passa attraverso, oppure E
    I.register('storia_uscita', {
      range: 2.4,
      label: () => (this.inCinema && this.progress.goal === 'uscita' ? this.cfg.uscitaLabel : null),
      action: () => { if (this.progress.goal === 'uscita') this._exitCinema(); },
    });
    I.addTarget(this.room.door, 'storia_uscita');
  }

  // ------------------------------------------------------------------ dentro il cinema

  // Collisioni del giocatore: un mondo a parte (quello del circolo lo usano anche i personaggi che camminano: se lo si
  // cambiasse, verrebbero spinti dentro i confini della sala del cinema).
  _playerWorld(boxes, bounds) {
    const w = this.ctx.makeCollisionWorld();
    w.boxes = boxes; w.bounds = bounds;
    this.ctx.player.collisions = w;
  }

  _swapCollisions(toCinema) {
    if (toCinema) this._playerWorld(this.room.collisionBoxes(), this.room.bounds());
    else this.ctx.player.collisions = this.ctx.collisions;
  }

  // la porta si apre: il giocatore può uscire dal circolo e camminare nel passaggio nero
  _openDoor() {
    const ctx = this.ctx, P = ctx.porta;
    if (!P) { this._enterCinema(); return; }
    P.open();
    this.stage = 'aperta';
    const col = ctx.collisions, ps = P.passaggio(), B = col.bounds;
    const boxes = col.boxes.filter((b) => b.name !== 'COL_Door_Main');
    const box = (name, x0, x1, z0, z1) => ({ name, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, ux: 1, uz: 0, vx: 0, vz: 1, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, minY: 0, maxY: 3 });
    const zw = P.box.max.z + 0.05;                               // oltre il muro: solo il passaggio largo quanto la porta
    boxes.push(box('PASS_Sx', B.minX - 1, ps.minX, zw, ps.maxZ + 1), box('PASS_Dx', ps.maxX, B.maxX + 1, zw, ps.maxZ + 1));
    this._playerWorld(boxes, { ...B, maxZ: ps.maxZ });
    this._say('Cronico', this.cfg.cronico.dentro, 4);
  }

  _enterCinema() {
    const ctx = this.ctx;
    this.stage = 'going';
    this.ov.fade(true, () => {
      this._release();
      this.progress.complete('porta');
      ctx.porta?.close();
      this.room.show(true);
      this.room.setLights(1); this.room.dim = 1;
      this._swapCollisions(true);
      this.inCinema = true;
      const [ax, az] = this.cfg.sala.arrivo;
      const p = this.room.world(ax, 0, az);
      if (ctx.player.seated) ctx.player.stand();
      ctx.interactions.setModal(null);
      ctx.player.position.set(p.x, 0, p.z);
      ctx.player.velocity.set(0, 0, 0);
      ctx.player.yaw = yawTo(ctx.player.position, this.room.screenCenter);
      ctx.player.pitch = 0;
      ctx.player.update(0);
      // il logo del cinema a tutto schermo, niente intorno
      this.stage = 'titolo';
      this.freeze = true;
      ctx.player.clearInput();
      ctx.ui.subtitle(null);
      document.body.classList.add('srt-on');
      this.ov.fade(false);
      this.ov.big(`<img src="${this.cfg.logo}" alt="Cinema">`);
      this.titleT = setTimeout(() => {
        this.ov.big(null);
        this.titleT = setTimeout(() => {
          this.freeze = false;
          document.body.classList.remove('srt-on');
          this.stage = 'cinema';
          ctx.ui.addItem('biglietto');
          const B = this.cfg.biglietto;
          ctx.ui.toast(this.cfg.arrivoHint.replace('{fila}', B.fila).replace('{posto}', B.posto), 6);
        }, 700);
      }, this.cfg.logoDurata * 1000);
    });
  }

  _sit(hit) {
    const ctx = this.ctx;
    const seat = hit.getWorldPosition(new THREE.Vector3());
    const target = this.room.screenCenter;
    const eye = new THREE.Vector3(seat.x, ctx.config.player.seatedEyeHeight, seat.z + 0.05);
    ctx.player.sit({ eye, yaw: yawTo(eye, target), pitch: pitchTo(eye, target) });
    this.progress.complete('biglietto');
    this.room.setLights(0);                                      // si spengono le luci
    this.stage = 'buio';
    this._setFree(true);
    this.titleT = setTimeout(() => this._filmCard(), 2600);
  }

  _setFree(on) {
    this.freeze = on;
    this.cursorFree = on;
    this.ctx.interactions.suspended = on;
    document.body.classList.toggle('srt-on', on);
    this.ctx.player.clearInput();
    if (on) this.ctx.releaseLock(); else this.ctx.requestLock();
  }

  // il film: le regole, poi il quiz del cinema sul grande schermo
  _filmCard() {
    const F = this.cfg.film;
    this.points = 0;
    this.ov.showBar({ label: `Cinema · ${F.titolo}` });
    this.ov.setPoints(0);
    this.ov.setTime(F.durata);
    this.stage = 'pronto';
    this.ov.panel(`<h2>${this.serata.cfg.ui.comeSiGioca}</h2><ul>${F.regole.map((r) => `<li>${r}</li>`).join('')}</ul>`,
      [{ label: this.serata.cfg.ui.inizia, main: true, action: () => this._goFilm() }]);
  }

  _goFilm() {
    if (this.stage !== 'pronto') return;
    const room = this.room;
    this.ov.clear();
    const api = {
      ctx: this.ctx, cfg: this.serata.cfg, overlay: this.ov, npc: 'Cronico', durata: this.cfg.film.durata,
      // lo "schermo" del quiz è quello del cinema
      tv: { setOverride: (canvas, draw) => { room.setScreen(canvas); this.filmDraw = draw; } },
      add: (p) => { this.points += p; this.ov.setPoints(this.points); },
      say: () => {},
    };
    this.film = createCinema(api);
    this.film.start();
    this.left = this.cfg.film.durata;
    this.stage = 'film';
  }

  _stopFilm() {
    if (!this.film) return;
    this.film.dispose?.();
    this.film = null;
    this.filmDraw = null;
    this.room.setScreen(null);
  }

  _endFilm() {
    const summary = this.film.summary?.() ?? '';
    this._stopFilm();
    this.stage = 'result';
    this.ov.panel(`<h2>Fine</h2><p>${summary}</p><table class="score"><tr class="tot"><td>Punti</td><td>${this.points}</td></tr></table>`,
      [{ label: this.serata.cfg.ui.continua, main: true, action: () => this._afterFilm() }]);
  }

  _afterFilm() {
    const ctx = this.ctx;
    this.ov.clear();
    this.ov.showBar(null);
    this.room.setLights(1);                                      // si riaccendono le luci
    if (ctx.player.seated) ctx.player.stand();
    this._setFree(false);
    this.stage = 'cinema';
    this.progress.complete('film');
  }

  _leaveCinema(placeAtDoor = true) {
    const ctx = this.ctx;
    this._swapCollisions(false);
    this.room.show(false);
    this.inCinema = false;
    if (ctx.player.seated) ctx.player.stand();
    if (placeAtDoor) {
      const [x, z] = this.cfg.cronico.porta;
      ctx.player.position.set(x - 0.45, 0, z - 0.6);
      ctx.player.velocity.set(0, 0, 0);
      ctx.player.yaw = 0; ctx.player.pitch = 0;               // verso l'interno del circolo
      ctx.player.update(0);
    }
  }

  _exitCinema() {
    const ctx = this.ctx;
    this.stage = 'going';
    this.ov.fade(true, () => {
      this._leaveCinema(true);
      this.progress.complete('uscita');
      this.ov.fade(false);
      this.stage = 'fine';
      ctx.ui.toast(this.cfg.ritorno, 5);
      const cr = this._npc('Cronico');
      if (cr) setTimeout(() => this._say('Cronico', this.cfg.cronicoDopo, 6), 1800);
    });
  }

  // ------------------------------------------------------------------ Nicola: prima ti spiega, poi serve da bere

  _wrapBarista() {
    const ctx = this.ctx;
    const h = ctx.interactions.handlers.get('serve_drink');
    if (!h) return;
    const label = h.label, act = h.action;
    const first = () => this.story && this.progress.goal === 'nicola';
    h.label = (t, c) => (first() ? `${ctx.config.interaction.labels.talk} Nicola` : label.call(h, t, c));
    h.action = (t, c) => {
      if (!first()) { act.call(h, t, c); return; }
      const n = ctx.npcs.npcs.find((o) => o.userData.npc_action === 'serve');
      if (n) ctx.dialogue.open(n, 'nicola_ciao');
    };
  }
}

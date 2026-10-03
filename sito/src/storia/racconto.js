// "La storia" (modalità sperimentale): primo capitolo, il cinema. Ha la stessa interfaccia della regia della serata
// (begin, update, key, freeze, cursorFree, decorate, startNode, action, ...): quando si sceglie questa modalità main.js la
// mette al posto della serata, che resta com'è. Usa l'interfaccia della serata (overlay) e il quiz del cinema.
import * as THREE from 'three';
import { CinemaRoom } from './cinemaroom.js';
import { Stanzetta } from './stanzetta.js';
import { createCinema } from '../serata/cinema.js';
import { createCibo } from '../serata/cibo.js';
import { Food } from '../serata/cibo3d.js';
import { creaPorta } from '../porta.js';
import { Esodo } from './esodo.js';
import { Idee } from './idee.js';
import { createScatola } from './scatola.js';
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
    // capitolo 2: la porta accanto al maxischermo (su un muro pieno: riquadro nero, l'anta si apre verso la stanza) e la
    // stanzetta che c'è dietro, con il suo tavolo per il cibo
    const PT = this.cfg.portaTv;
    this.portaTv = creaPorta(ctx, { name: 'Porta_TV', width: PT.larghezza, height: PT.altezza, swing: 'in', inset: true,
      center: new THREE.Vector3(PT.centro[0], 0, PT.centro[1]), inward: new THREE.Vector3(0, 0, 1) });
    this.stanza = new Stanzetta(ctx, this.cfg.stanzetta);
    this.food2 = new Food(ctx, ctx.config.assets.food, this.stanza.tableObject, this.cfg.stanzetta.posti);
    this.inStanza = false;
    // capitolo 3: chi se ne va, le idee della scatola nera, la scatola in mezzo al biliardo
    this.esodo = new Esodo(ctx, this.cfg.esodo);
    this.idee = new Idee(this.cfg.blackbox);
    this.bbox = this._makeScatola();
    for (const src of [this.cfg.logo, this.cfg.fumoLogo, this.cfg.bbLogo]) new Image().src = src;
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
    // a metà di un capitolo (ricaricando la pagina) si riparte dall'inizio del capitolo
    if (['biglietto', 'film', 'uscita'].includes(this.progress.goal)) { for (const g of ['porta', 'biglietto', 'film']) this.progress.done.delete(g); this.progress.ui.renderGoals(); }
    if (['stanzetta', 'fumo', 'uscita2'].includes(this.progress.goal)) { for (const g of ['rafka', 'stanzetta', 'fumo']) this.progress.done.delete(g); this.progress.ui.renderGoals(); }
    if (['lyuce', 'scatola', 'idee'].includes(this.progress.goal)) { for (const g of ['esodo', 'lyuce', 'scatola']) this.progress.done.delete(g); this.progress.ui.renderGoals(); }
    if (this.progress.goal === 'esodo') { this.stage = 'esodoAttesa'; this.wait = 1; }
  }

  // PROVA: i punti a cui si può saltare dal menu di pausa
  get provaPunti() {
    return [['porta', 'Cronico alla porta'], ['biglietto', 'Dentro il cinema'], ['uscita', 'Dopo il film (uscita)'],
      ['rafka', 'Capitolo 2: Rafka'], ['fumo', 'Dentro la stanzetta'], ['esodo', 'Capitolo 3: se ne vanno tutti'],
      ['lyuce', 'Capitolo 3: Lyuce e la scatola']];
  }

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
    if (this.inStanza) this._leaveStanza(false);
    this.portaTv?.close();
    this._stopIdee();
    if (this.esodo.walkers.length) this.esodo.ritorno();
    if (this.bbox) this.bbox.visible = false;
    if (ctx.smoking.holding) ctx.smoking.putOut(ctx);
    ctx.player.collisions = ctx.collisions;
    if (ctx.player.seated) ctx.player.stand();
    const steps = this.progress.steps;
    this.progress.done.clear();
    for (const s of steps) { if (s.goal === goal) break; this.progress.done.add(s.goal); }
    this.progress._save(); this.progress.ui.renderGoals();
    this.wait = 0.3;
    if (goal === 'porta' || goal === 'rafka') { this.stage = 'idle'; return; }
    if (goal === 'fumo') { this.progress.done.delete('stanzetta'); this._enterStanzetta(); return; }
    if (goal === 'esodo') { this.stage = 'esodoAttesa'; this.wait = 0.5; return; }
    if (goal === 'lyuce') {                                      // tutti già usciti, Lyuce già al suo posto
      this.esodo.start(ctx.porta?.soglia ?? new THREE.Vector3(-3.5, 0, 4.15), { Lyuce: this.cfg.lyuce.posto });
      this.esodo.skip();
      this._lyuceAspetta();
    }
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
    this._stopFumo();
    this._stopIdee();
    if (this.esodo.walkers.length) this.esodo.ritorno();
    if (this.bbox) this.bbox.visible = false;
    if (this.inCinema) this._leaveCinema(false);
    if (this.inStanza) this._leaveStanza(false);
    this.portaTv?.close();
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
    if (!this.story || !['vaAllaPorta', 'aspetta'].includes(this.stage)) return null;
    const goal = this.progress.goal, name = npc.userData.npc_name;
    if (goal === 'porta' && name === 'Cronico') { this.stage = 'talk'; return this.cfg.cronico.nodo; }
    if (goal === 'rafka' && name === 'Rafka') { this.stage = 'talk'; return this.cfg.rafka.nodo; }
    if (goal === 'lyuce' && name === 'Lyuce') { this.stage = 'talk'; return this.cfg.lyuce.nodo; }
    return null;
  }

  action(what) {
    if (this.stage !== 'talk') return;
    if (what === 'segui') { this.stage = 'porta'; this._say('Cronico', this.cfg.cronico.apri, 5); }
    if (what === 'scatola') this._titoloBlackBox();               // Lyuce: "vai a vedere la scatola"
    if (what === 'apri') {                                       // Rafka: "apri la porta accanto al maxischermo"
      this.progress.complete('rafka');
      this.stage = 'porta2';
      this._say('Rafka', this.cfg.rafka.vai, 5);
    }
  }

  onDialogueClosed() {}

  onPause(p) { this.ov.pauseMusic(p); }

  key(e) {
    if (!this.freeze && this.stage !== 'result') return false;
    if (e.code === 'Escape') { this.ctx.pause?.(); return true; }
    if (this.stage === 'pronto' && (e.code === 'Enter' || e.code === 'Space')) { this._goFilm(); return true; }
    if (this.stage === 'prontoFumo' && (e.code === 'Enter' || e.code === 'Space')) { this._goFumo(); return true; }
    if (this.stage === 'film') this.film?.key?.(e);
    if (this.stage === 'fumoGioco') this.fumo?.key?.(e);
    if (this.stage === 'ideeGioco') return e.code !== 'Escape' ? false : true;   // si scrive: i tasti vanno al campo di testo
    return true;
  }

  // ------------------------------------------------------------------ ciclo

  update(dt) {
    if (!this.story) return;
    const ctx = this.ctx;
    this.t += dt;
    if (this.inCinema) this.room.update(dt, this.t);
    this.portaTv?.update(dt);
    this.stanza.door?.update(dt);
    this.food2.update(dt);
    if (this.stage === 'aperta2') {                              // porta accanto alla TV aperta: ci si entra camminando
      const s = this.portaTv.soglia, p = ctx.player.position;
      if (Math.hypot(p.x - s.x, p.z - s.z) < this.cfg.ingresso) this._enterStanzetta();
    }
    if (this.stage === 'fumoGioco') {
      this.left -= dt;
      this.ov.setTime(this.left);
      this.fumo.update(dt);
      if (this.left <= 0) this._endFumo();
      return;
    }
    if (this.stage === 'prepFumo' && this.wait <= 0) this._prepFumo();
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
    } else if (goal === 'esodo') {
      if (this.stage === 'esodoAttesa') {                        // si apre la porta d'ingresso e se ne vanno tutti
        ctx.porta?.open();
        this.esodo.start(ctx.porta?.soglia ?? new THREE.Vector3(-3.5, 0, 4.15), { Lyuce: this.cfg.lyuce.posto });
        this.stage = 'esodo';
      } else if (this.stage === 'esodo') {
        this.esodo.update(dt);
        if (this.esodo.done) { ctx.porta?.close(); this._lyuceAspetta(); }
      }
    } else if (goal === 'lyuce') {
      if (this.stage === 'aspetta') this._aspetta();
      else if (this.stage === 'talk' && !ctx.dialogue.active) this.stage = 'aspetta';
    } else if (goal === 'porta' || goal === 'rafka') {
      if (this.stage === 'idle') goal === 'porta' ? this._cronicoAllaPorta() : this._rafkaInGiro();
      else if (this.stage === 'vaAllaPorta') this._walk(dt);
      else if (this.stage === 'aspetta') this._aspetta();
      else if (this.stage === 'talk' && !ctx.dialogue.active) this.stage = 'aspetta';   // chiuso senza partire: resta lì
    }
  }

  // ------------------------------------------------------------------ Cronico alla porta

  _npc(name) { return this.ctx.npcs.npcs.find((o) => o.userData.npc_name === name); }

  _say(who, text, dur = 5) {
    this.ctx.ui.subtitle(who, text, dur, { now: true });
    this.ctx.npcs.lastTime = this.ctx.npcs.clock + dur;
  }

  _cronicoAllaPorta() { this._mandaA('Cronico', this.cfg.cronico.porta, this.cfg.cronico.chiama, 'porta'); }

  // Rafka va ad aspettarti nel punto del circolo più lontano da te; l'obiettivo dice dove
  _rafkaInGiro() {
    const p = this.ctx.player.position;
    const spots = this.serata.cfg.attese;
    const spot = spots.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) > Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
    this.progress.setWhere('rafka', spot.dove);
    this._mandaA('Rafka', [spot.x, spot.z], this.cfg.rafka.chiama, 'rafka');
  }

  _mandaA(name, dest, chiama, goal) {
    const npc = this._npc(name);
    if (!npc) { this.progress.complete(goal); return; }
    this.dest = dest; this.chiama = chiama; this.guideName = name;
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
    const ctx = this.ctx, npc = this.guide, q = npc.position, [sx, sz] = this.dest;
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
    if (!this.called && d < 4 && !this.ctx.dialogue.active) { this.called = true; this._say(this.guideName, this.chiama, 4); }
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
    // capitolo 2: la porta accanto al maxischermo, il pacchetto sul tavolo della stanzetta, la porta per uscire
    I.register('storia_portatv', {
      range: 2.4,
      label: () => (this.story && this.progress.goal === 'stanzetta' && this.stage === 'porta2' ? this.cfg.portaLabel : null),
      action: () => { if (this.stage === 'porta2') { this.portaTv.open(); this.stage = 'aperta2'; } },
    });
    if (this.portaTv) I.addTarget(this.portaTv.group, 'storia_portatv');
    if (this.stanza.pack) I.addTarget(this.stanza.pack, 'smoke');
    I.register('storia_esci2', {
      range: 2.4,
      label: () => (this.inStanza && this.progress.goal === 'uscita2' ? this.cfg.esciStanzetta : null),
      action: () => { if (this.progress.goal === 'uscita2') this._exitStanzetta(); },
    });
    if (this.stanza.door) I.addTarget(this.stanza.door.group, 'storia_esci2');
  }

  // ------------------------------------------------------------------ capitolo 2: la stanzetta e il fumo

  _enterStanzetta() {
    const ctx = this.ctx, S = this.stanza;
    this.stage = 'going';
    this.ov.fade(true, () => {
      this._release();
      this.progress.complete('stanzetta');
      this.portaTv?.close();
      S.show(true);
      this.inStanza = true;
      this._playerWorld(S.collisionBoxes(), S.bounds());
      if (ctx.player.seated) ctx.player.stand();
      ctx.interactions.setModal(null);
      const a = S.arrivo;
      ctx.player.position.set(a.x, 0, a.z); ctx.player.velocity.set(0, 0, 0);
      ctx.player.yaw = yawTo(ctx.player.position, S.tablePos); ctx.player.pitch = -0.25;
      ctx.player.update(0);
      // Rafka è già lì, accanto al tavolo
      const rf = this._npc('Rafka');
      if (rf) {
        this.guide = rf; rf.visible = true; rf.userData.directed = true;
        this.ctx.camerawork?.stop(rf); this.ctx.npcs.stopAction(rf);
        const rp = rf.parent.worldToLocal(S.rafkaPos.clone());
        rf.position.set(rp.x, rf.userData.stand_lift ?? rf.position.y, rp.z);
        rf.rotation.y = Math.atan2(a.x - S.rafkaPos.x, a.z - S.rafkaPos.z);
        if (rf.userData.idle_clip) ctx.npcs.setLoop(rf, rf.userData.stand_clip ?? rf.userData.idle_clip, 1, 0.3);
      }
      // la scritta FUMO a tutto schermo
      this.stage = 'titolo';
      this.freeze = true;
      ctx.player.clearInput();
      ctx.ui.subtitle(null);
      document.body.classList.add('srt-on');
      this.ov.fade(false);
      this.ov.big(`<img src="${this.cfg.fumoLogo}" alt="Fumo">`);
      this.titleT = setTimeout(() => {
        this.ov.big(null);
        this.titleT = setTimeout(() => {
          this.freeze = false;
          document.body.classList.remove('srt-on');
          this.stage = 'prepFumo'; this.prep = 'sigaretta'; this.wait = 0;
          this._say('Rafka', this.cfg.rafka.dentro, 5);
          ctx.ui.toast('Prendi una sigaretta dal tavolo', 4);
        }, 700);
      }, this.cfg.logoDurata * 1000);
    });
  }

  // come nella serata: sigaretta, ci si siede, due tiri, poi a Rafka viene fame e si ordina
  _prepFumo() {
    const ctx = this.ctx, S = this.stanza;
    if (this.prep === 'sigaretta' && ctx.smoking.holding && !ctx.hands.busy) {
      this.prep = 'tiri';
      const c = S.chairPos, t = S.tablePos;
      const eye = new THREE.Vector3(c.x, ctx.config.player.seatedEyeHeight, c.z + 0.05);
      ctx.player.sit({ eye, yaw: yawTo(eye, t), pitch: pitchTo(eye, t) });
      this._say('Rafka', this.cfg.rafka.siediti, 5);
      ctx.ui.toast(`Fai ${this.cfg.tiri} tiri (clic)`, 4);
    } else if (this.prep === 'tiri' && (ctx.smoking.puffs >= this.cfg.tiri || !ctx.smoking.holding) && !ctx.hands.busy) {
      this.prep = 'fame';
      this._say('Rafka', this.cfg.rafka.fame, 5);
      this.wait = 3;
    } else if (this.prep === 'fame') {
      this.prep = null;
      this._fumoCard();
    }
  }

  _fumoCard() {
    const B = this.serata.cfg.brani.fumo;
    this.points = 0;
    this._setFree(true);
    this.ov.showBar({ label: 'Fumo' });
    this.ov.setPoints(0);
    this.ov.setTime(this.cfg.fumoGioco);
    this.stage = 'prontoFumo';
    this.ov.panel(`<h2>${this.serata.cfg.ui.comeSiGioca}</h2><ul>${B.regole.map((r) => `<li>${r}</li>`).join('')}</ul>`,
      [{ label: this.serata.cfg.ui.inizia, main: true, action: () => this._goFumo() }]);
  }

  _goFumo() {
    if (this.stage !== 'prontoFumo') return;
    this.ov.clear();
    this.food2.showPhone(true);
    const api = {
      ctx: this.ctx, cfg: this.serata.cfg, overlay: this.ov, npc: 'Rafka', durata: this.cfg.fumoGioco, food: this.food2,
      add: (p) => { this.points += p; this.ov.setPoints(this.points); },
      say: () => {},
    };
    this.fumo = createCibo(api);
    this.fumo.start();
    this.left = this.cfg.fumoGioco;
    this.stage = 'fumoGioco';
  }

  _stopFumo() {
    if (!this.fumo) return;
    this.fumo.dispose?.();
    this.fumo = null;
  }

  _endFumo() {
    const summary = this.fumo.summary?.() ?? '';
    this._stopFumo();
    this.stage = 'result';
    this.ov.panel(`<h2>Fumo</h2><p>${summary}</p><table class="score"><tr class="tot"><td>Punti</td><td>${this.points}</td></tr></table>`,
      [{ label: this.serata.cfg.ui.continua, main: true, action: () => this._afterFumo() }]);
  }

  _afterFumo() {
    const ctx = this.ctx;
    this.ov.clear();
    this.ov.showBar(null);
    if (ctx.smoking.holding) ctx.smoking.putOut(ctx, this.serata.cfg.indicazioni.spenta);
    if (ctx.player.seated) ctx.player.stand();
    this._setFree(false);
    this.stage = 'stanza';
    this.progress.complete('fumo');
    this._say('Rafka', this.cfg.rafka.fine, 5);
  }

  _leaveStanza(placeAtDoor = true) {
    const ctx = this.ctx;
    this.stanza.show(false);
    this.inStanza = false;
    this.food2.clear();
    ctx.player.collisions = ctx.collisions;
    if (ctx.player.seated) ctx.player.stand();
    if (placeAtDoor) {
      const s = this.portaTv?.soglia ?? new THREE.Vector3(0.15, 0, -4);
      ctx.player.position.set(s.x, 0, s.z + 1.1); ctx.player.velocity.set(0, 0, 0);
      ctx.player.yaw = Math.PI; ctx.player.pitch = 0;          // di spalle alla porta, verso il circolo
      ctx.player.update(0);
    }
    // Rafka torna nel circolo, accanto alla porta, e riprende il suo giro
    const rf = this._npc('Rafka');
    if (rf && this.guide === rf) {
      const s = this.portaTv?.soglia ?? new THREE.Vector3(0.15, 0, -4);
      const rp = rf.parent.worldToLocal(new THREE.Vector3(s.x + 0.9, 0, s.z + 1.2));
      rf.position.set(rp.x, rf.userData.stand_lift ?? rf.position.y, rp.z);
    }
    this._release();
  }

  _exitStanzetta() {
    const ctx = this.ctx;
    this.stage = 'going';
    this.ov.fade(true, () => {
      this._leaveStanza(true);
      this.progress.complete('uscita2');
      this.ov.fade(false);
      this.stage = 'esodoAttesa';                                // capitolo 3: tra poco se ne vanno tutti
      this.wait = this.cfg.esodo.attesa;
      setTimeout(() => this._say('Rafka', this.cfg.rafka.dopo, 4), 600);
    });
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
      this.stage = 'idle';                                       // capitolo 2: Rafka va ad aspettarti da qualche parte
      this.wait = 6;
      ctx.ui.toast(this.cfg.ritorno, 5);
      const cr = this._npc('Cronico');
      if (cr) setTimeout(() => this._say('Cronico', this.cfg.cronicoDopo, 6), 1800);
    });
  }

  // ------------------------------------------------------------------ capitolo 3: Lyuce e la scatola nera

  // finito l'esodo resta solo Lyuce, accanto al biliardo: ti chiama quando ti avvicini
  _lyuceAspetta() {
    this.progress.complete('esodo');
    const ly = this.esodo.stayer ?? this._npc('Lyuce');
    if (!ly) { this.progress.complete('lyuce'); return; }
    this.guide = ly; this.guideName = 'Lyuce'; this.chiama = this.cfg.lyuce.chiama; this.called = false;
    ly.userData.directed = true;
    this.stage = 'aspetta';
  }

  // la scatola nera, in mezzo al biliardo (nera opaca, con una riga di luce magenta)
  _makeScatola() {
    const ctx = this.ctx;
    const surf = ctx.root.getObjectByName('POOL_Surface') ?? ctx.root.getObjectByName('Pool_Table');
    if (!surf) return null;
    const b = new THREE.Box3().setFromObject(surf), c = b.getCenter(new THREE.Vector3());
    const y = surf.name === 'POOL_Surface' ? c.y : b.max.y;
    const g = new THREE.Group();
    g.name = 'Storia_BlackBox';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.26), new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.9, metalness: 0 }));
    body.position.y = 0.1;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.264, 0.008, 0.264), new THREE.MeshStandardMaterial({ color: 0x220018, emissive: 0xff17e4, emissiveIntensity: 1.8 }));
    seam.position.y = 0.15;
    g.add(body, seam);
    g.position.set(c.x, y, c.z);
    g.visible = false;
    ctx.scene.add(g);
    ctx.interactions.register('storia_bbox', {
      range: 2.6,
      label: () => (this.story && this.progress.goal === 'scatola' && this.stage === 'scatola' ? this.cfg.apriScatola : null),
      action: () => { if (this.stage === 'scatola') this._startIdee(); },
    });
    ctx.interactions.addTarget(g, 'storia_bbox');
    return g;
  }

  // la scritta BLACK BOX dove sei (nessuno ti porta da nessuna parte); poi compare la scatola sul biliardo
  _titoloBlackBox() {
    const ctx = this.ctx;
    this.stage = 'titolo';
    this.freeze = true;
    ctx.player.clearInput();
    ctx.ui.subtitle(null);
    document.body.classList.add('srt-on');
    this.ov.big(`<img src="${this.cfg.bbLogo}" alt="Black Box">`);
    this.titleT = setTimeout(() => {
      this.ov.big(null);
      this.titleT = setTimeout(() => {
        this.freeze = false;
        document.body.classList.remove('srt-on');
        if (this.bbox) this.bbox.visible = true;
        this.progress.complete('lyuce');
        this.stage = 'scatola';
        this._say('Lyuce', this.cfg.lyuce.vai, 5);
      }, 700);
    }, this.cfg.logoDurata * 1000);
  }

  _startIdee() {
    this.progress.complete('scatola');
    this._setFree(true);
    this.ov.clear();
    this.ov.showBar(null);
    const api = {
      cfg: this.cfg.blackbox, overlay: this.ov, idee: this.idee,
      finish: (r) => this._endIdee(r),
    };
    this.idea = createScatola(api);
    this.idea.start();
    this.stage = 'ideeGioco';
  }

  _stopIdee() {
    if (!this.idea) return;
    this.idea.dispose?.();
    this.idea = null;
  }

  _endIdee() {
    const summary = this.idea?.summary?.() ?? '';
    this._stopIdee();
    this.stage = 'result';
    this.ov.panel(`<h2>${this.cfg.blackbox.titolo}</h2><p>${this.cfg.blackbox.fine}</p><p>${summary}</p>`,
      [{ label: this.serata.cfg.ui.continua, main: true, action: () => this._afterIdee() }]);
  }

  _afterIdee() {
    const ctx = this.ctx;
    this.ov.clear();
    this._setFree(false);
    if (this.bbox) this.bbox.visible = false;
    this.progress.complete('idee');
    this.stage = 'fine';
    this._say('Lyuce', this.cfg.lyuce.dopo, 5);
    // poco dopo rientrano tutti, come ogni sera
    this.titleT = setTimeout(() => {
      this.ov.fade(true, () => {
        this.esodo.ritorno();
        this._release();
        this.ov.fade(false);
        ctx.ui.toast(this.cfg.ritornoTutti, 5);
      });
    }, 6000);
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

// "La storia" (modalità sperimentale): primo capitolo, il cinema. Ha la stessa interfaccia della regia della serata
// (begin, update, key, freeze, cursorFree, decorate, startNode, action, ...): quando si sceglie questa modalità main.js la
// mette al posto della serata, che resta com'è. Usa l'interfaccia della serata (overlay) e il quiz del cinema.
import { aperto } from '../accesso.js';
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
import { Strada } from './strada.js';
import { Auto } from './auto.js';
import { Ostacoli } from './ostacoli.js';
import { Consegna } from './biglietto.js';
import { yawTo, pitchTo } from '../player.js';

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
    let passi = this.cfg.passi;
    const F = this.cfg.fermaDopo;                                    // contenuto ancora chiuso: la storia finisce qui
    this.fermata = !!F && !aperto(F.contenuto);
    if (this.fermata) passi = [...passi.slice(0, passi.findIndex((x) => x.goal === F.passo) + 1), F.ultimo];
    this.steps = passi.map((s) => ({ ...s, text: s.text.replace('{fila}', B.fila).replace('{posto}', B.posto),
      locked: s.locked }));
    ctx.config.items.biglietto ??= { name: this.cfg.item };
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
    // capitolo 4: la porta nuova accanto al tavolo da carte (si prepara in begin(), solo in questa modalità) e la strada
    this.portaEst = null;
    this.strada = new Strada(ctx, this.cfg.strada);
    this.consegna = new Consegna(ctx, this.cfg.consegna);
    this.auto = new Auto(ctx, this.cfg.auto, this.strada);
    this.inStrada = false;
    for (const src of [this.cfg.logo, this.cfg.fumoLogo, this.cfg.bbLogo]) new Image().src = src;
    this._targets();
    if (new URLSearchParams(location.search).get('debug') === '1') window.__storia = this;   // per le prove
  }

  get progress() { return this.ctx.progress; }
  get story() { return this.mode === 'racconto'; }

  // ------------------------------------------------------------------ inizio e ricominciare

  begin() {
    this.mode = 'racconto';
    this.progress.useSteps(this.steps, this.cfg.requires, this.cfg.storageKey);
    // niente giro iniziale: i personaggi sono già in giro e Cronico ti aspetta con il biglietto
    for (const n of ['nicola_ciao', 'benvenuto']) this.ctx.dialogue.seen.add(n);
    // salvataggi di prima: Cronico si salta solo se la storia era già oltre l'ingresso (porta o passi successivi).
    // Chi aveva fatto solo Nicola e le presentazioni ricomincia da Cronico, che gli dà il biglietto.
    const dallaPorta = this.progress.steps.slice(this.progress.steps.findIndex((s) => s.goal === 'porta')).map((s) => s.goal);
    if (dallaPorta.some((g) => this.progress.done.has(g))) this.progress.done.add('cronico');
    this._preparaEst();
    clearTimeout(this.precaricaT);
    this.precaricaT = setTimeout(() => this._precarica(), 800);    // la strada e la macchina si caricano in sottofondo
    this.stage = 'idle';
    this.wait = 1.5;
    if (this.progress.isDone('cronico')) this.ctx.ui.addItem('biglietto');
    if (this.progress.goal === 'cronico') this._cronicoTiAspetta();
    // a metà di un capitolo (ricaricando la pagina) si riparte dall'inizio del capitolo
    if (['biglietto', 'film', 'uscita'].includes(this.progress.goal)) { for (const g of ['porta', 'biglietto', 'film']) this.progress.done.delete(g); this.progress.ui.renderGoals(); }
    if (['stanzetta', 'fumo', 'uscita2'].includes(this.progress.goal)) { for (const g of ['rafka', 'stanzetta', 'fumo']) this.progress.done.delete(g); this.progress.ui.renderGoals(); }
    if (['lyuce', 'scatola', 'idee'].includes(this.progress.goal)) { for (const g of ['esodo', 'lyuce', 'scatola']) this.progress.done.delete(g); this.progress.ui.renderGoals(); }
    if (this.progress.goal === 'esodo') { this.stage = 'esodoAttesa'; this.wait = 1; }
    if (['rientro', 'kappa', 'strada', 'macchina', 'guida', 'casa'].includes(this.progress.goal)) {   // tutti dentro, Kappa alla porta
      for (const g of ['rientro', 'kappa', 'strada', 'macchina', 'guida']) this.progress.done.delete(g);
      this.progress.ui.renderGoals();
      this._kappaAspetta(true);
    }
  }

  // PROVA: i punti a cui si può saltare dal menu di pausa
  get provaPunti() {
    return [['porta', 'Cronico alla porta'], ['biglietto', 'Dentro il cinema'], ['uscita', 'Dopo il film (uscita)'],
      ['rafka', 'Capitolo 2: Rafka'], ['fumo', 'Dentro la stanzetta'], ['esodo', 'Capitolo 3: se ne vanno tutti'],
      ['lyuce', 'Capitolo 3: Lyuce e la scatola'], ['rientro', 'Capitolo 4: rientrano tutti'], ['kappa', 'Capitolo 4: Kappa'],
      ['strada', 'Capitolo 4: in strada'], ['guida', 'Capitolo 4: in macchina'], ['casa', 'Capitolo 4: davanti a casa']];
  }

  jumpTo(goal) {
    if (!this.story) return;
    const ctx = this.ctx;
    clearTimeout(this.titleT);
    this._stopFilm();
    this.consegna?.cancel();
    this.ov.clear(); this.ov.showBar(null); this.ov.big(null); this.ov.fade(false);
    this._setFree(false);
    document.body.classList.remove('srt-on');
    this._release();
    ctx.porta?.close();
    if (this.inCinema) this._leaveCinema(false);
    if (this.inStanza) this._leaveStanza(false);
    this.portaTv?.close();
    this.portaEst?.close();
    if (this.inStrada) this._leaveStrada();
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
    if (goal === 'rientro') {                                    // tutti fuori (Lyuce accanto al biliardo): stanno per rientrare
      this.esodo.start(ctx.porta?.soglia ?? new THREE.Vector3(-3.5, 0, 4.15), { Lyuce: this.cfg.lyuce.posto });
      this.esodo.skip();
      this._lyuceAspetta();
      this.stage = 'rientroAttesa';
      this.wait = 0.5;
      return;
    }
    if (goal === 'kappa') { this._kappaAspetta(true); return; }
    if (['strada', 'macchina', 'guida', 'casa'].includes(goal)) { this._enterStrada(goal); return; }
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
    this.consegna?.cancel();
    this._stopFumo();
    this._stopIdee();
    if (this.esodo.walkers.length) this.esodo.ritorno();
    if (this.bbox) this.bbox.visible = false;
    if (this.inCinema) this._leaveCinema(false);
    if (this.inStanza) this._leaveStanza(false);
    this.portaTv?.close();
    this.portaEst?.close();
    if (this.inStrada) this._leaveStrada();
    this._release();
    this.ov.clear(); this.ov.showBar(null); this.ov.big(null); this.ov.fade(false);
    this._setFree(false);
    this.stage = 'idle';
    this.wait = 1.5;
    this.ctx.dialogue.seen.clear();
  }

  // ------------------------------------------------------------------ servizi chiamati da dialoghi e main

  decorate(npc, text, node = null) {
    const B = this.cfg.biglietto;
    return text.replace('{fila}', B.fila).replace('{posto}', B.posto);
  }

  startNode(npc) {
    if (!this.story || !['vaAllaPorta', 'aspetta'].includes(this.stage)) return null;
    const goal = this.progress.goal, name = npc.userData.npc_name;
    if (goal === 'cronico' && name === 'Cronico') { this.stage = 'talk'; return this.cfg.cronico.nodo; }
    if (goal === 'rafka' && name === 'Rafka') { this.stage = 'talk'; return this.cfg.rafka.nodo; }
    if (goal === 'lyuce' && name === 'Lyuce') { this.stage = 'talk'; return this.cfg.lyuce.nodo; }
    if (goal === 'kappa' && name === 'Kappa') { this.stage = 'talk'; return this.cfg.kappa.nodo; }
    return null;
  }

  action(what) {
    if (this.stage !== 'talk') return;
    if (what === 'biglietto') {                                  // Cronico ti dà il biglietto e ti porta alla porta
      this.progress.complete('cronico');
      const B = this.cfg.biglietto;
      const dopo = () => {                                       // il biglietto è in tasca: Cronico ti porta alla porta
        this._setFree(false);
        this.ctx.ui.addItem('biglietto');
        this.ctx.ui.toast(this.cfg.cronico.biglietto.replace('{fila}', B.fila).replace('{posto}', B.posto), 5);
        this._say('Cronico', this.cfg.cronico.alla_porta, 3);
        this.stage = 'idle';
      };
      const cronico = this._npc('Cronico');
      this.stage = 'consegna';
      this.freeze = true;                                        // si guarda Cronico: niente movimento
      this.ctx.interactions.suspended = true;                    // niente "E — Parla" durante la consegna
      this.ctx.interactions.setModal(null);
      this.ctx.player.clearInput();
      if (cronico) { const p = this.ctx.player; p.yaw = yawTo(p.position, cronico.position); p.pitch = -0.08; }
      this.consegna.start(cronico, { ...this.cfg.consegna, fila: B.fila, posto: B.posto }, dopo);
    }
    if (what === 'scatola') this._titoloBlackBox();               // Lyuce: "vai a vedere la scatola"
    if (what === 'strada') {                                     // Kappa: "apri la porta, ti seguo"
      this.progress.complete('kappa');
      this.stage = 'porta3';
      this._say('Kappa', this.cfg.kappa.vai, 5);
    }
    if (what === 'apri') {                                       // Rafka: "apri la porta accanto al maxischermo"
      this.progress.complete('rafka');
      this.stage = 'porta2';
      this._say('Rafka', this.cfg.rafka.vai, 5);
    }
  }

  onDialogueClosed() {}

  onPause(p) { this.ov.pauseMusic(p); }

  key(e) {
    if (this.stage === 'salendo') return ['KeyE', 'KeyC'].includes(e.code);
    if (this.stage === 'guida') {                                // in macchina: E scende, C cambia visuale, il resto guida
      if (e.code === 'KeyE' && !e.repeat) { this._scendi(); return true; }
      if (e.code === 'KeyC' && !e.repeat) { this.auto.cambiaVista(); return true; }
      return false;
    }
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
    this.portaEst?.update(dt);
    this.strada.porta?.update(dt);
    if (this.inStrada) this._updateStrada(dt);
    if (this.portaleOn && !this.inStrada) this.portaleP?.render();
    if (this.stage === 'casaAperta') {                           // dalla porta di casa si vede il circolo; oltre la soglia ci si è
      const S = this.strada, [px, pz] = S.cfg.porta, p = this.strada.local(ctx.player.position);
      this.portaleP.renderInverso();
      if (p.z < pz + 0.12 && Math.abs(p.x - px) < 0.6) this._tornaACasa();
    }
    if (this.stage === 'aperta3') {                              // porta nuova aperta: oltre la soglia si è in strada
      const s = this.portaEst.soglia, p = ctx.player.position;
      if (p.x > s.x - 0.1 && Math.abs(p.z - s.z) < 0.6) this._attraversa();
    }
    this.food2.update(dt);
    if (this.stage === 'consegna') { this.consegna.update(dt); return; }
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
    if (goal === 'cronico') {                                    // aspetta con il biglietto; se non gli parli ti chiama lui
      if (this.stage === 'vaAllaPorta') this._walk(dt);
      else if (this.stage === 'aspetta') {
        this._aspetta();
        this.attesaT = (this.attesaT ?? 0) + dt;
        if (this.attesaT > this.cfg.cronico.attesaAuto && !ctx.dialogue.active) { this.attesaT = -1e9; this._parlaCon('Cronico'); }
      } else if (this.stage === 'talk' && !ctx.dialogue.active) this.stage = 'aspetta';
    } else if (goal === 'esodo') {
      if (this.stage === 'esodoAttesa') {                        // si apre la porta d'ingresso e se ne vanno tutti
        ctx.porta?.open();
        this.esodo.start(ctx.porta?.soglia ?? new THREE.Vector3(-3.5, 0, 4.15), { Lyuce: this.cfg.lyuce.posto });
        this.stage = 'esodo';
      } else if (this.stage === 'esodo') {
        this.esodo.update(dt);
        if (this.esodo.done) { ctx.porta?.close(); this._lyuceAspetta(); }
      }
    } else if (goal === 'rientro') {
      if (this.stage === 'rientroAttesa') {                      // la porta si riapre e rientrano tutti, uno alla volta
        this._release();
        ctx.porta?.open();
        this.esodo.rientro(ctx.porta?.soglia ?? new THREE.Vector3(-3.5, 0, 4.15), { Kappa: this.cfg.kappa.posto }, this.cfg.rientro.intervallo);
        ctx.ui.toast(this.cfg.ritornoTutti, 5);
        this.stage = 'rientro';
      } else if (this.stage === 'rientro') {
        this.esodo.update(dt);
        if (this.esodo.done) { ctx.porta?.close(); this._kappaAspetta(); }
      }
    } else if (goal === 'kappa') {
      if (this.stage === 'aspetta') this._aspetta();
      else if (this.stage === 'talk' && !ctx.dialogue.active) this.stage = 'aspetta';
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

  // all'inizio Cronico resta dov'è, girato verso di te: il dialogo si apre da solo dopo qualche secondo
  _cronicoTiAspetta() {
    const n = this._npc('Cronico');
    if (!n) { this.progress.complete('cronico'); return; }
    this.attesaT = 0;
    this._mandaA('Cronico', [n.position.x, n.position.z], this.cfg.cronico.daTe, 'cronico');
    this.called = true;
    this.ctx.player.yaw = yawTo(this.ctx.player.position, n.position);
    this.ctx.player.pitch = -0.04;
  }

  _parlaCon(name) { const n = this._npc(name); if (n) this.ctx.dialogue.open(n); }

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
      if (this.progress.goal === 'porta') { this.stage = 'porta'; this._say('Cronico', this.cfg.cronico.apri, 5); }   // la porta si apre da sé
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
      if (cr) setTimeout(() => this._say('Cronico', this.fermata ? this.cfg.cronicoPresto : this.cfg.cronicoDopo, 6), 1800);
      this._chiediCodice();
    });
  }

  // Dopo il film: se il Jukebox del brano non è ancora sbloccato su questo dispositivo, si apre il riquadro del codice
  _chiediCodice() {
    const C = this.cfg.codice, P = this.ctx.plusUI;
    if (!C || !P || P.ha(C.lotto)) return;
    setTimeout(() => { if (this.stage === 'idle') { this.ctx.releaseLock?.(); P.apri(C.testo); } }, 9000);
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
    this.ov.clear();
    this._setFree(false);
    if (this.bbox) this.bbox.visible = false;
    this.progress.complete('idee');
    this._say('Lyuce', this.cfg.lyuce.dopo, 5);
    this.stage = 'rientroAttesa';                                // poco dopo la porta si riapre: rientrano tutti
    this.wait = this.cfg.rientro.attesa;
    this.strada.load();                                          // la strada si carica intanto
  }

  // ------------------------------------------------------------------ capitolo 4: Kappa, la porta nuova, la strada

  // in questa modalità il tavolino con sigarette e posacenere accanto al tavolo da carte lascia il posto a una porta
  _preparaEst() {
    if (this.portaEst !== null) return;
    const ctx = this.ctx, P = this.cfg.portaEst;
    for (const name of P.togli) {
      const o = ctx.root.getObjectByName(name) ?? ctx.scene.getObjectByName(name);
      if (!o) continue;
      o.visible = false;
      o.traverse((m) => { const k = ctx.occluders.indexOf(m); if (k >= 0) ctx.occluders.splice(k, 1); });
    }
    if (ctx.collisions) ctx.collisions.boxes = ctx.collisions.boxes.filter((b) => !P.collisioni.includes(b.name));
    this.portaEst = creaPorta(ctx, { name: 'Porta_Est', width: P.larghezza, height: P.altezza, swing: 'in', inset: true,
      center: new THREE.Vector3(P.centro[0], 0, P.centro[1]), inward: new THREE.Vector3(-1, 0, 0),
      onOpen: () => this._portale(true), onClosed: () => this._portale(false) });
    if (!this.portaEst) return;
    ctx.interactions.register('storia_portaest', {
      range: 2.4,
      label: () => (this.story && this.progress.goal === 'strada' && this.stage === 'porta3' ? this.cfg.esciLabel : null),
      action: () => { if (this.stage === 'porta3') this._titoloComeTiVa(); },
    });
    ctx.interactions.addTarget(this.portaEst.group, 'storia_portaest');
  }

  // strada e macchina in sottofondo, poi shader e texture pronti: quando si apre la porta non si aspetta niente
  async _precarica() {
    if (this.precaricata) return;
    this.precaricata = true;
    await this.strada.load();
    await this.auto.load();
    this._targetsStrada();
    await this.strada.prepara();
    // il portale si disegna una volta subito, così i suoi shader (con il piano di taglio) sono già pronti
    const P = this.cfg.portaEst;
    this.portaleP ??= this.strada.portale(new THREE.Vector3(P.centro[0], 0, P.centro[1]), new THREE.Vector3(1, 0, 0));
      this.portaleP.altraPorta = [this.portaEst?.group, this.portaEst?.inset];
    this.portaleP.render();
  }

  // dalla porta nuova aperta si vede la strada vera (portale: vedi strada.js)
  _portale(on) {
    const inset = this.portaEst?.inset;
    if (!inset) return;
    if (on && this.strada.loaded) {
      const P = this.cfg.portaEst;
      this.portaleP ??= this.strada.portale(new THREE.Vector3(P.centro[0], 0, P.centro[1]), new THREE.Vector3(1, 0, 0));
      this.portaleP.altraPorta = [this.portaEst?.group, this.portaEst?.inset];
      this.insetNero ??= inset.material;
      inset.material = this.portaleP.mat;
      this.strada.porta?.open(); this.strada.porta?.update(5);    // dall'altra parte la porta della strada è già aperta
      inset.material.polygonOffset = true; inset.material.polygonOffsetFactor = -2; inset.material.polygonOffsetUnits = -2;
      this.portaleOn = true;
    } else {
      if (this.insetNero) inset.material = this.insetNero;
      this.portaleOn = false;
    }
  }

  // come per gli altri brani: la scritta COME TI VA, poi la porta si apre sulla strada
  async _titoloComeTiVa() {
    const ctx = this.ctx;
    this.stage = 'titolo';
    this.freeze = true;
    ctx.player.clearInput();
    ctx.ui.subtitle(null);
    document.body.classList.add('srt-on');
    this.ov.big(`<img src="${this.cfg.ctvLogo}" alt="Come ti va">`);
    const pronta = this._precarica();
    await new Promise((r) => { this.titleT = setTimeout(r, this.cfg.logoDurata * 1000); });
    await pronta; await this.strada.ready; await this.auto.ready;
    if (this.stage !== 'titolo') return;
    this.ov.big(null);
    this.titleT = setTimeout(() => {
      this.freeze = false;
      document.body.classList.remove('srt-on');
      this.portaEst.open();
      this._varco(true);
      this.stage = 'aperta3';
    }, 500);
  }

  // con la porta nuova aperta si può entrare nel vano (il muro lì ha un'apertura finta: dietro c'è il portale)
  _varco(on) {
    const ctx = this.ctx;
    if (!on) { ctx.player.collisions = ctx.collisions; return; }
    const col = ctx.collisions, B = col.bounds, [cx, cz] = this.cfg.portaEst.centro, w = this.cfg.portaEst.larghezza / 2 + 0.02;
    const box = (name, z0, z1) => ({ name, cx: cx + 0.4, cz: (z0 + z1) / 2, ux: 1, uz: 0, vx: 0, vz: 1, hx: 0.42, hz: (z1 - z0) / 2, minY: 0, maxY: 3 });
    this._playerWorld([...col.boxes.filter((b) => b.name !== 'COL_Wall_East'), box('Varco_N', B.minZ - 1, cz - w), box('Varco_S', cz + w, B.maxZ + 1)], { ...B, maxX: cx + 0.8 });
  }

  _metti(npc, [x, z]) {
    const p = npc.parent.worldToLocal(new THREE.Vector3(x, 0, z));
    npc.position.x = p.x; npc.position.z = p.z;
  }

  // Kappa aspetta accanto alla porta nuova (subito lì se si salta o si ricarica la pagina) e ti chiama
  _kappaAspetta(subito = false) {
    this.progress.complete('rientro');
    const k = this._npc('Kappa');
    this.strada.load();
    if (!k) { this.progress.complete('kappa'); this.stage = 'porta3'; return; }
    this._release();
    if (subito) {
      k.visible = true;
      this.ctx.camerawork?.stop(k); this.ctx.npcs.stopAction(k);
      const r = this.ctx.routines?.find((o) => o.npc === k);
      if (r) { r.path = null; r.glide = null; r._release?.(); }
      this._metti(k, this.cfg.kappa.posto);
      if (k.userData.idle_clip) this.ctx.npcs.setLoop(k, k.userData.stand_clip ?? k.userData.idle_clip, 1, 0.3);
    }
    this.guide = k; this.guideName = 'Kappa'; this.chiama = this.cfg.kappa.chiama; this.called = false;
    k.userData.directed = true;
    this.stage = 'aspetta';
  }

  // si passa la soglia: stessa posizione e stesso sguardo, ma dall'altra parte (dalla porta della strada), senza dissolvenze
  _attraversa() {
    const ctx = this.ctx, S = this.strada, P = this.portaleP, pl = ctx.player;
    const q = P.mappa(pl.position);
    pl.position.set(q.x, 0, Math.max(q.z, P.S.z + 0.45));
    pl.yaw -= P.ang;
    this._entraInStrada();
    S.porta?.open(); S.porta?.update(5);                         // la porta della strada è aperta, alle tue spalle
    setTimeout(() => S.porta?.close(), 1400);
    this.portaEst.close();
    pl.update(0);
  }

  // in strada: il mondo della strada, Kappa che arriva, il primo obiettivo
  _entraInStrada() {
    const ctx = this.ctx, S = this.strada;
    this._release();
    S.disponi(0);
    S.show(true);
    this.inStrada = true;
    ctx.ui.subtitle(null);                                       // niente battute del circolo rimaste in coda
    ctx.npcs.zitti = true;
    this._mondoStrada();
    this.progress.done.add('kappa');
    this.progress.complete('strada');
    this.progress.setCount('guida', 0);
    this.stage = 'strada';
    const k = this._npc('Kappa');
    if (k) {
      this.kappaFuori = k;
      k.userData.directed = true;
      k.userData.muto = true;                                    // fuori niente battute del circolo
      this.ctx.camerawork?.stop(k); this.ctx.npcs.stopAction(k);
      k.visible = false;                                         // esce anche lei, poco dopo
      this.titleT = setTimeout(() => {
        if (!this.inStrada || this.stage !== 'strada' || this.auto.driving || this.strada.seg !== 0) return;
        const [kx, kz] = S.cfg.kappa, kw = S.world(kx, kz), p = ctx.player.position;
        this._metti(k, [kw.x, kw.z]);
        k.visible = true;
        k.rotation.y = Math.atan2(p.x - kw.x, p.z - kw.z);         // verso di te
        if (k.userData.idle_clip) ctx.npcs.setLoop(k, k.userData.stand_clip ?? k.userData.idle_clip, 1, 0.3);
        this._say('Kappa', this.cfg.kappa.fuori, 6);
      }, 2200);
    }
    setTimeout(() => { if (this.inStrada && this.progress.goal === 'macchina') ctx.ui.toast(S.cfg.arrivoHint, 7); }, 1200);
  }

  // oltre la porta nuova: la strada (con una dissolvenza, come per il cinema). Kappa arriva subito dopo.
  // salto: per le prove si può arrivare già in macchina ('guida') o davanti a casa ('casa')
  _enterStrada(salto = null) {
    const ctx = this.ctx, S = this.strada;
    this.stage = 'going';
    this.ov.fade(true, async () => {
      await this._precarica(); await S.ready; await this.auto.ready;
      this.portaEst?.close();
      if (ctx.player.seated) ctx.player.stand();
      ctx.interactions.setModal(null);
      const a = S.arrivo;
      ctx.player.position.set(a.x, 0, a.z); ctx.player.velocity.set(0, 0, 0);
      ctx.player.yaw = yawTo(ctx.player.position, S.guarda); ctx.player.pitch = 0;
      this._entraInStrada();
      ctx.player.update(0);
      this.ov.fade(false);
      if (salto === 'guida') { this.progress.complete('macchina'); this._sali(); return; }
      if (salto === 'casa') {                                    // arrivati: la macchina davanti a casa, tu sul marciapiede
        S.disponi(S.cfg.casa);
        this.auto.s = 28; this.auto.d = 1.9; this.auto.psi = 0; this.auto._place();
        if (this.kappaFuori) this.kappaFuori.visible = false;
        this._mondoStrada();
        const [px, pz] = S.cfg.porta;
        ctx.player.position.copy(S.world(px, pz + 2.5)); ctx.player.yaw = yawTo(ctx.player.position, S.world(px, pz)); ctx.player.update(0);
      }
    });
  }

  // collisioni di chi cammina in strada: marciapiedi, ostacoli e la macchina parcheggiata
  _mondoStrada() {
    const S = this.strada;
    this._playerWorld([...S.collisionBoxes(), this.auto.collisionBox()], S.bounds());
  }

  _targetsStrada() {
    if (this.stradaPronta) return;
    this.stradaPronta = true;
    const ctx = this.ctx, I = ctx.interactions, A = this.cfg.auto, S = this.strada;
    this.ostacoli = new Ostacoli(S, A.ostacoli, A.quota);
    this.ostacoli.mostra(false);
    I.register('storia_auto', {
      range: 3.2,
      label: () => (this.inStrada && this.stage === 'strada' && !this.auto.driving ? A.sali : null),
      action: () => { if (this.inStrada && this.stage === 'strada') this._sali(); },
    });
    I.addTarget(this.auto.hit, 'storia_auto');
    // casa: la stessa porta da cui sei uscito, alla fine del percorso
    I.register('storia_casa', {
      range: 3,
      label: () => (this.inStrada && this.stage === 'strada' && this.progress.goal === 'casa' && S.seg === S.cfg.casa ? S.cfg.casaLabel : null),
      action: () => { if (this.inStrada && this.stage === 'strada' && this.progress.goal === 'casa') this._apriCasa(); },
    });
    if (S.porta) I.addTarget(S.porta.group, 'storia_casa');
  }

  _sali() {
    const ctx = this.ctx;
    this.stage = 'salendo';                                      // si apre la portiera, si sale, si richiude
    ctx.interactions.suspended = true;
    this.auto.sali(() => {
      this.progress.complete('macchina');
      this.stage = 'guida';
      if (this.kappaFuori) this.kappaFuori.visible = false;      // Kappa resta lì a fare foto
      this._cruscotto(true);
      if (!this.comandiVisti) { this.comandiVisti = true; ctx.ui.toast(this.cfg.auto.comandi, 7); }
    });
  }

  _scendi() {
    const ctx = this.ctx;
    if (!this.auto.puoiScendere) { ctx.ui.toast(this.cfg.auto.soloRettilinei, 3); return; }
    this.auto.scendi();
    this._cruscotto(false);
    ctx.interactions.suspended = false;
    this.stage = 'strada';
    this._mondoStrada();
    ctx.player.collisions.resolve(ctx.player.position, ctx.config.player.radius);
    ctx.player.update(0);
  }

  // in macchina: la velocità; sul telefono anche i pulsanti TURBO, VISUALE e SCENDI
  _cruscotto(on) {
    if (!on) { this.cruscotto?.remove(); this.cruscotto = null; this.ctx.player.input.run = false; return; }
    if (this.cruscotto) return;
    if (!document.getElementById('cruscotto-css')) {
      const css = document.createElement('style'); css.id = 'cruscotto-css';
      css.textContent = `#cruscotto { position: fixed; z-index: 16; right: 16px; bottom: 16px; display: flex; gap: 10px; align-items: flex-end;
          pointer-events: none; font-family: var(--display, sans-serif); color: #f1e6d2; }
        #cruscotto .kmh { background: rgba(20,12,6,.72); border: 1px solid rgba(230,190,120,.5); border-radius: 12px; padding: 6px 12px;
          font-size: 30px; font-weight: 700; min-width: 92px; text-align: right; }
        #cruscotto .kmh small { display: block; font-size: 11px; letter-spacing: .12em; opacity: .7; }
        #cruscotto .kmh .casa { display: block; font-size: 14px; font-weight: 600; color: #ffd27a; white-space: nowrap; }
        #cruscotto .kmh .casa:empty { display: none; }
        #cruscotto .kmh.turbo { border-color: #ff17e4; box-shadow: 0 0 16px rgba(255,23,228,.5); }
        #cruscotto button { pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none; border-radius: 50%;
          width: 74px; height: 74px; border: 1px solid #e6be78; background: rgba(28,18,11,.82); color: #f1e6d2; font: 700 13px var(--display, sans-serif); }
        #cruscotto button.turbo { width: 96px; height: 96px; background: rgba(255,23,228,.75); border-color: #ffd6fa; font-size: 16px; }
        #cruscotto button.on { background: #ff17e4; }`;
      document.head.appendChild(css);
    }
    const el = document.createElement('div'); el.id = 'cruscotto';
    el.innerHTML = '<div class="kmh">0<small>km/h</small><span class="casa"></span></div>';
    if (this.ctx.touch) {
      const btn = (label, cls, down, up) => {
        const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls;
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); down(); });
        for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, (e) => { e.stopPropagation(); b.classList.remove('on'); up?.(); });
        el.prepend(b);
      };
      btn('Scendi', '', () => this._scendi());
      btn('Visuale', '', () => this.auto.cambiaVista());
      btn('Turbo', 'turbo', () => { this.ctx.player.input.run = true; }, () => { this.ctx.player.input.run = false; });
    }
    document.body.appendChild(el);
    this.cruscotto = el;
    this.kmhEl = el.querySelector('.kmh');
    this.casaEl = el.querySelector('.casa');
  }

  _updateStrada(dt) {
    const A = this.cfg.auto, S = this.strada, ctx = this.ctx;
    this.auto.update(dt);
    const percorso = ['macchina', 'guida', 'casa'].includes(this.progress.goal);
    if (S.segnaOn !== percorso) S.segnaCasa(percorso);
    if (this.ostacoli) {
      if (this.ostacoli.attivi !== percorso) this.ostacoli.mostra(percorso);
      this.ostacoli.update(dt, this.auto);
    }
    if (this.kmhEl) {
      this.kmhEl.firstChild.textContent = String(this.auto.kmh);
      this.kmhEl.classList.toggle('turbo', !!this.auto.turbo);
      // quanto manca a casa (o quanto l'hai superata)
      const fine = S.cfg.casa * 40 + S.cfg.porta[0] + 20, m = Math.round(fine - (S.seg * 40 + this.auto.s));
      this.casaEl.textContent = !percorso ? '' : Math.abs(m) < 6 ? 'Casa: sei arrivato' : m > 0 ? `Casa: ${m} m` : `Casa: ${-m} m indietro`;
    }
    // il percorso: quanto manca a casa (in percentuale); arrivati davanti a casa, si scende
    if (this.progress.goal === 'guida') {
      const fine = S.cfg.casa * 40 + S.cfg.porta[0] + 20, fatto = S.seg * 40 + this.auto.s;
      const n = Math.max(0, Math.min(100, Math.round((100 * fatto) / fine)));
      if (n !== this.progress.counts.guida) this.progress.setCount('guida', n);
      S.tinta(n / 100);
      for (const [soglia, testo] of Object.entries(A.tappe ?? {})) {                 // a un quarto, a metà, a tre quarti
        if (n >= +soglia && !(this.tappeFatte ??= new Set()).has(soglia)) { this.tappeFatte.add(soglia); this._say('Tu', testo, 5); }
      }
      // la frenata comincia in tempo per fermarsi davanti al portone (spazio di frenata v²/2a)
      const frena = (this.auto.v * this.auto.v) / (2 * A.frenata) + 2;
      if (fine - fatto < frena && fatto - fine < 12) {
        this.auto.ferma = true;
        this.auto.fermaDist = fine - fatto;
        this.progress.complete('guida');
        this._say('Tu', A.arrivato, 5);
        ctx.ui.toast(A.fermati, 5);
      }
    }
    if (this.auto.ferma) this.auto.fermaDist = S.cfg.casa * 40 + S.cfg.porta[0] + 20 - (S.seg * 40 + this.auto.s);
    if (this.progress.goal === 'casa' && this.auto.driving && S.seg > S.cfg.casa && !this.oltreDetto) {
      this.oltreDetto = true;
      ctx.ui.toast(A.oltre, 4);
    }
    S.cull(ctx.camera);                                          // dopo la telecamera: solo i tratti inquadrati
  }

  // casa: la porta si apre e dietro... c'è il circolo (lo stesso portale, al contrario)
  _apriCasa() {
    const ctx = this.ctx, S = this.strada, P = this.portaleP;
    if (!P || !S.porta) return;
    S.porta.open();
    this.portaEst?.open(); this.portaEst?.update(5);             // dall'altra parte la porta del circolo è aperta
    if (this.portaEst?.inset && this.insetNero) this.portaEst.inset.material = this.insetNero;
    this.portaleOn = false;
    if (S.porta.inset) { this.insetStrada ??= S.porta.inset.material; S.porta.inset.material = P.mat2; }
    // si può entrare nel vano della porta
    const [px, pz] = S.cfg.porta, o = S.group.position, w = S.cfg.portaLarga / 2 + 0.02, B = S.bounds();
    const box = (name, x0, x1) => ({ name, cx: o.x + (x0 + x1) / 2, cz: o.z + pz + 0.2, ux: 1, uz: 0, vx: 0, vz: 1, hx: (x1 - x0) / 2, hz: 0.75, minY: 0, maxY: 3 });
    this._playerWorld([...S.collisionBoxes(), this.auto.collisionBox(), box('Casa_O', -25, px - w), box('Casa_E', px + w, 25)], { ...B, minZ: o.z + pz - 0.8 });
    this.stage = 'casaAperta';
    this._say('Tu', this.cfg.auto.casa, 5);
  }

  // passata la soglia di casa si è nel circolo, nello stesso punto e con lo stesso sguardo, dalla porta nuova
  _tornaACasa() {
    const ctx = this.ctx, S = this.strada, P = this.portaleP, pl = ctx.player;
    const q = P.inverso(pl.position);
    this._cruscotto(false);
    if (S.porta?.inset && this.insetStrada) S.porta.inset.material = this.insetStrada;
    S.porta?.close();
    this._leaveStrada();
    pl.position.set(Math.min(q.x, 5.55), 0, q.z);
    pl.yaw += P.ang;
    this._varco(true);
    pl.update(0);
    this.progress.complete('casa');
    this.stage = 'idle';
    setTimeout(() => { this.portaEst?.close(); }, 1500);
    setTimeout(() => { if (this.stage === 'idle' && !this.inStrada) this._varco(false); }, 3200);
    setTimeout(() => this._say('Kappa', this.cfg.auto.rientro, 7), 2200);
  }

  _leaveStrada() {
    const ctx = this.ctx;
    clearTimeout(this.titleT);
    if (this.auto.driving) { this.auto.driving = false; ctx.player.seat = null; }
    this._cruscotto(false);
    this.ostacoli?.reset(); this.ostacoli?.mostra(false);
    this.oltreDetto = false; this.tappeFatte = null;
    ctx.interactions.suspended = false;
    this.auto.driving = false;                                   // la macchina torna al suo parcheggio
    this.auto.parcheggia();
    if (this.strada.loaded) this.strada.disponi(0);
    if (this.auto.loaded) this.auto._place();
    this.strada.show(false);
    this.inStrada = false;
    ctx.npcs.zitti = false;
    ctx.player.collisions = ctx.collisions;
    const k = this.kappaFuori;
    if (k) {                                                     // Kappa torna nel circolo, al suo giro di foto
      const r = ctx.routines?.find((o) => o.npc === k);
      if (r) { k.position.copy(r.home.pos); k.rotation.y = r.home.yaw; }
      k.userData.directed = false;
      k.userData.muto = false;
      k.visible = true;
      if (k.userData.idle_clip) ctx.npcs.setLoop(k, k.userData.idle_clip, 1, 0.3);
      this.kappaFuori = null;
    }
  }
}

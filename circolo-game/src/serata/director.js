// Regia della serata (modalità storia). I passi sono in CONFIG.serata.passi e usano la progressione normale:
//   nicola -> presentazioni -> cinema -> fumo -> blackbox -> cometiva -> bicchiere -> spettacolo -> games (libero)
// Per ogni brano: il personaggio dell'invito ti raggiunge camminando, ti parla (nodo *_invito del suo dialogo), con
// "Andiamo" si va al buio nel posto del gioco, si prepara (sigaretta, scatola nera) e il gioco dura un minuto (`gioco` del brano).
// Durante i giochi il giocatore è fermo e il cursore è libero (pulsanti a schermo); un clic sulla scena è un tiro di
// sigaretta. In gioco libero la regia non fa niente: tutto è sbloccato come a serata finita.
import * as THREE from 'three';
import { Overlay } from './overlay.js';
import { createCinema } from './cinema.js';
import { createCibo } from './cibo.js';
import { createBlackbox } from './blackbox.js';
import { createCometiva } from './cometiva.js';
import { createBicchiere } from './bicchiere.js';
import { Food } from './cibo3d.js';
import { Spettacolo } from './spettacolo.js';
import { titoloDellaSerata } from './contenuti.js';
import { euroDaPunti } from './regole.js';
import { seatInFront } from '../tv.js';
import { yawTo, pitchTo } from '../player.js';
import { euro } from '../wallet.js';

const GIOCHI = { cinema: createCinema, fumo: createCibo, blackbox: createBlackbox, cometiva: createCometiva, bicchiere: createBicchiere };
const V = (a) => new THREE.Vector3(a[0], a.length === 3 ? a[1] : 0, a.length === 3 ? a[2] : a[1]);

// PROVA: Nicola e presentazioni già fatti (le routine partono, i dialoghi sanno che vi conoscete)
export function saltaPresentazioni(ctx, nodi) {
  ctx.dialogue.seen.add('nicola_ciao');
  for (const n of Object.values(nodi)) ctx.dialogue.seen.add(n);
  ctx.progress.complete('nicola');
  ctx.progress.complete('presentazioni');
}

export class Serata {
  constructor(ctx, tv) {
    this.ctx = ctx;
    this.cfg = ctx.config.serata;
    this.tv = tv;
    this.mode = null;                       // 'storia' | 'libero'
    this.ov = new Overlay(this.cfg);
    this.stage = 'idle';                    // idle | approach | talk | going | prep | play | result | ritorno | show | fine
    this.freeze = false;                    // giocatore fermo (gioco in corso)
    this.cursorFree = false;                // cursore libero per i pulsanti
    this.wait = 0;
    this.game = null;
    this.guide = null;                      // personaggio che accompagna nel brano corrente
    this.scores = this._load();
    this.food = new Food(ctx, ctx.config.assets.food);
    ctx.npcs.decorate = (npc, text) => this.decorate(npc, text);
    // titoli dei brani e logo finale: scaricati subito, così compaiono senza attese
    this.preload = [...Object.values(this.cfg.brani).map((b) => b.titoloImg), './assets/logo.webp'].filter(Boolean)
      .map((src) => { const i = new Image(); i.src = src; return i; });
    this._wrapBarista();
    this._makeBox();
    this._makeSeat();
  }

  get progress() { return this.ctx.progress; }
  get story() { return this.mode === 'storia'; }
  get busy() { return this.stage === 'play' || this.stage === 'result' || this.stage === 'going' || this.stage === 'fine'; }

  // ------------------------------------------------------------------ inizio

  begin(mode) {
    this.mode = mode;
    const ctx = this.ctx;
    if (mode === 'libero') {
      this.progress.setFree();
      for (const r of ctx.routines) r.waitStart = 1e9;          // tutti in giro da subito
      return false;
    }
    this.progress.useSteps(this.cfg.passi, this.cfg.requires, 'circolo.progress.serata.v1');
    if (ctx.config.prova?.attiva) saltaPresentazioni(ctx, this.cfg.presentazioni);   // PROVA: niente giro iniziale
    this.stage = 'idle';
    this.wait = 1.5;
    if (this.progress.goal === 'nicola') {                       // accoglienza: Nicola ti chiama dal bancone
      const n = this._npc('Nicola');
      if (n) {
        const p = n.getWorldPosition(new THREE.Vector3());
        ctx.player.yaw = yawTo(ctx.player.position, p);
        ctx.player.pitch = -0.04;
        setTimeout(() => { ctx.npcs.say(n, 'Ohi, tu! Vieni al bancone, che ti spiego come funziona la serata.'); ctx.npcs.lastTime = ctx.npcs.clock + 6; }, 900);
      }
    }
    return false;
  }

  // PROVA: i punti a cui si può saltare dal menu di pausa
  get provaPunti() {
    return [...Object.entries(this.cfg.brani).map(([id, b]) => [id, `${b.n} · ${b.titolo}`]), ['spettacolo', 'Finale (sigaretta e spettacolo)']];
  }

  // PROVA: salta a un passo (ferma quello che c'è in corso, segna come fatti i passi prima)
  jumpTo(goal) {
    if (!this.story) return;
    const ctx = this.ctx;
    clearTimeout(this.titleT);
    this._stopGame();
    this.show?.stop(); this.show = null;
    this.ov.clear(); this.ov.showBar(null); this.ov.big(null); this.ov.fade(false); this.ov.stopMusic();
    this._release();
    this.box.visible = false; this.food.clear(); this.tv?.setOverride(null);
    this._setFree(false);
    ctx.ui.showHUD(true); ctx.wallet.show(true);
    if (ctx.smoking.holding) ctx.smoking.putOut(ctx);
    ctx.smoking.endless = false;
    if (ctx.player.seated) ctx.player.stand();
    this.progress.done.clear();
    for (const s of this.progress.steps) { if (s.goal === goal) break; this.progress.done.add(s.goal); }
    this.progress._save(); this.progress.ui.renderGoals();
    this.trackLeft = null;
    this.stage = goal === 'spettacolo' ? 'ritorno' : 'idle';
    this.called = null;
    this.wait = 0.5;
    if (goal === 'spettacolo') { this.trackLeft = this.cfg.brani.bicchiere.durata - this.cfg.brani.bicchiere.gioco; this.ov.showBar(this.cfg.brani.bicchiere); this.ov.setPoints(0); }
  }

  reset() {
    clearTimeout(this.titleT);
    this._stopGame();
    this.show?.stop(); this.show = null;
    this.ov.clear(); this.ov.showBar(null); this.ov.big(null); this.ov.fade(false); this.ov.stopMusic();
    this.ctx.ui.showHUD(true);
    this.ctx.wallet.show(true);
    this._release();
    this.food.clear();
    this.box.visible = false;
    this.tv?.setOverride(null);
    this._setFree(false);
    this.stage = 'idle';
    this.trackLeft = null;
    this.wait = 1.5;
    this.scores.brani = {};
    this._save();
    this.ctx.dialogue.seen.clear();                             // la serata ricomincia: ci si presenta di nuovo
  }

  // ------------------------------------------------------------------ servizi per gli altri moduli

  // "Posso dire?" di Rafka, dal secondo brano in poi (e in gioco libero)
  decorate(npc, text, node = null) {
    // prima battuta di chi devi conoscere: "fatti un giro, poi arriva Cronico" (solo nella serata, prima del primo brano)
    if (node && node !== 'benvenuto' && this.story && !this.progress.isDone('presentazioni') && Object.values(this.cfg.presentazioni).includes(node)) {
      return `${text} ${this.cfg.presentazioniCoda}`;
    }
    const c = this.cfg.possoDire;
    if (npc?.userData.npc_name !== c.npc || !text || text.startsWith(c.prefisso.trim())) return text;
    if (!this.mode || !this.progress.isDone(c.dal) || Math.random() > c.probabilita) return text;
    return c.prefisso + text;
  }

  // azioni dei dialoghi: 'go' = si parte
  action(what, npc) {
    if (what !== 'go' || this.stage !== 'talk') return;
    this.stage = 'going';
    const goal = this.progress.goal;
    this.ov.fade(true, () => { this._place(goal, npc); this._titolo(goal, npc); });
  }

  // Titolo del brano a tutto schermo (come "Benvenuti al Circolo Vizioso"): niente card, dialoghi o sottotitoli intorno,
  // il giocatore fermo. Poi si prepara il gioco (sigaretta, scatola nera) o parte la scheda "Come si gioca".
  _titolo(goal, npc) {
    const ctx = this.ctx, img = this.cfg.brani[goal]?.titoloImg;
    this.stage = 'titolo';
    this.freeze = true;
    ctx.player.clearInput();
    ctx.ui.subtitle(null);
    document.body.classList.add('srt-on');
    this.ov.fade(false);
    if (!img) { this._afterTitolo(goal, npc); return; }
    this.ov.big(`<img src="${img}" alt="${this.cfg.brani[goal].titolo}">`);
    clearTimeout(this.titleT);
    this.titleT = setTimeout(() => {
      this.ov.big(null);
      this.titleT = setTimeout(() => this._afterTitolo(goal, npc), 700);   // il titolo sfuma, poi si continua
    }, this.cfg.titoloDurata * 1000);
  }

  _afterTitolo(goal, npc) {
    if (this.stage !== 'titolo') return;
    const ctx = this.ctx;
    this.freeze = false;
    document.body.classList.remove('srt-on');
    ctx.ui.subtitle(null);
    ctx.npcs.lastTime = ctx.npcs.clock;                          // una pausa prima delle chiacchiere di sottofondo
    if (goal === 'fumo') {
      this.food.showPhone(true);
      this.stage = 'prep'; this.prep = 'sigaretta';
      this._hint(this.cfg.indicazioni.prendiSigaretta);
      this._say(npc.userData.npc_name, 'Posso dire? Prendine una dal pacchetto sul tavolino. Offre la casa.', 4);
    } else if (goal === 'blackbox') {
      this.box.visible = true;
      this.stage = 'prep'; this.prep = 'scatola';
      this._hint(this.cfg.indicazioni.prendiScatola);
    } else this._startGame(goal);
  }

  onDialogueClosed(npc) {
    if (this.stage !== 'talk' || npc !== this.guide) return;
    // chiuso senza "Andiamo": chi è venuto a prenderti riprova tra poco (vedi update); chi hai cercato torna ai fatti suoi
    // (chi hai cercato: se non si è partiti, al prossimo aggiornamento torna ai fatti suoi; vedi update)
    if (!this.cfg.inviti[this.progress.goal]?.cerca) this.wait = 0.4;
  }

  // parlando con il personaggio del prossimo brano (quando lo trovi) parte il suo invito
  startNode(npc) {
    const invito = this.story && this.cfg.inviti[this.progress.goal];
    if (!invito?.cerca || !['idle', 'vaAlPosto', 'aspetta'].includes(this.stage) || npc.userData.npc_name !== invito.npc) return null;
    this.guide = npc;
    npc.userData.directed = true;                               // resta fermo mentre ti parla
    this.ctx.camerawork?.stop(npc);
    this.ctx.npcs.stopAction(npc);
    const u = npc.userData;
    if (u.idle_clip) this.ctx.npcs.setLoop(npc, u.stand_clip ?? u.idle_clip, 1, 0.3);
    this.stage = 'talk';
    return invito.nodo;
  }

  // in attesa di essere trovato: quando ti avvicini ti chiama (una volta)
  // Il personaggio del prossimo brano va ad aspettarti nel punto più lontano da te (CONFIG.serata.attese): l'obiettivo dice
  // dove, e sei tu a raggiungerlo.
  _sendAway(invito) {
    const npc = this._npc(invito.npc);
    if (!npc) { this.progress.complete(this.progress.goal); return; }
    const p = this.ctx.player.position;
    const spots = this.cfg.attese.filter((s) => s !== this.lastSpot);
    const spot = spots.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) > Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
    this.lastSpot = spot;
    this.progress.setWhere(this.progress.goal, spot.dove);
    this.guide = npc;
    npc.visible = true;
    npc.userData.directed = true;
    this.ctx.camerawork?.stop(npc);
    this.ctx.npcs.stopAction(npc);
    this.walkT = 0; this.stuckT = 0; this.bestD = Infinity; this.ghost = 0;
    this.spot = spot;
    const u = npc.userData;
    if (u.walk_clip) this.ctx.npcs.setLoop(npc, u.walk_clip, u.walk_speed ? 1.2 / u.walk_speed : 1, 0.3);
    this.stage = 'vaAlPosto';
  }

  // cammina fino al punto d'attesa (scivola lungo i mobili; se resta incastrato per un po' passa oltre)
  _walkTo(dt) {
    const ctx = this.ctx, npc = this.guide, q = npc.position, s = this.spot;
    const dx = s.x - q.x, dz = s.z - q.z, d = Math.hypot(dx, dz);
    this.walkT += dt;
    if (d < 0.12 || this.walkT > 25) {
      if (this.walkT > 25) { q.x = s.x; q.z = s.z; }
      const u = npc.userData;
      if (u.idle_clip) ctx.npcs.setLoop(npc, u.stand_clip ?? u.idle_clip, 1, 0.3);
      this.stage = 'aspetta';
      return;
    }
    const step = Math.min(d, 1.2 * dt);
    if (d < this.bestD - 0.05) { this.bestD = d; this.stuckT = 0; } else this.stuckT += dt;
    if (this.stuckT > 1.5) { this.ghost = 2; this.stuckT = 0; this.bestD = d; }
    q.x += (dx / d) * step; q.z += (dz / d) * step;
    if ((this.ghost = Math.max(0, this.ghost - dt)) <= 0) ctx.collisions?.resolve(q, 0.2);
    let a = Math.atan2(dx, dz) - npc.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a));
    npc.rotation.y += a * Math.min(1, dt * 7);
  }

  // fermo al suo posto: ti guarda quando sei vicino e ti chiama (una volta)
  _waitToBeFound(invito) {
    const npc = this.guide;
    if (!npc) return;
    const p = this.ctx.player.position, q = npc.position;
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < 5) { let a = Math.atan2(p.x - q.x, p.z - q.z) - npc.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); npc.rotation.y += a * 0.08; }
    if (this.called !== invito.npc && d < 3.5 && !this.ctx.dialogue.active) {
      this.called = invito.npc;
      this._say(invito.npc, invito.chiama, 4);
    }
  }

  key(e) {
    if (!this.freeze && this.stage !== 'result' && this.stage !== 'fine') return false;
    if (e.code === 'Escape') { this.ctx.pause?.(); return true; }
    if (this.stage === 'pronto' && (e.code === 'Enter' || e.code === 'Space')) { this._go(); return true; }
    if (this.stage === 'play') this.game?.key?.(e);
    return true;
  }

  onPause(p) { this.ov.pauseMusic(p); }

  // ------------------------------------------------------------------ ciclo

  update(dt) {
    this.food.update(dt);
    if (!this.story) return;
    const ctx = this.ctx;
    const goal = this.progress.goal;
    // brano che continua dopo il gioco (il quinto): il tempo scorre anche mentre cerchi le sigarette e ti siedi
    if (this.trackLeft != null && this.stage !== 'play') {
      this.trackLeft -= dt;
      this.ov.setTime(this.trackLeft);
      if (this.stage === 'ritorno' && this.trackLeft <= this.cfg.spettacolo.durata && this._playerFree()) this._autoSeat();
    }
    if (this.stage === 'play' && this.game) {
      this.left -= dt;
      if (this.trackLeft != null) this.trackLeft -= dt;
      this.ov.setTime(this.left);
      this.game.update(dt);
      if (this.left <= 0) this._endGame();
      return;
    }
    if (this.stage === 'show') {
      ctx.npcs.lastTime = Math.max(ctx.npcs.lastTime, ctx.npcs.clock);   // durante lo spettacolo si guarda e basta
      if (this.show.update(dt)) this._endShow();
      return;
    }
    if (this.wait > 0) { this.wait -= dt; return; }
    if (goal === 'presentazioni') {
      const need = Object.entries(this.cfg.presentazioni);
      const met = need.filter(([, node]) => ctx.dialogue.seen.has(node)).length;
      if (met !== this.progress.counts.presentazioni) this.progress.setCount('presentazioni', met);
      if (met >= need.length && !ctx.dialogue.active) {
        this.metT = (this.metT ?? 0) + dt;
        if (this.metT >= this.cfg.attesaCronico) { this.metT = 0; this.progress.complete('presentazioni'); }
      }
      return;
    }
    const invito = this.cfg.inviti[goal];
    if (invito) {
      if (this.stage === 'idle' && invito.cerca) this._sendAway(invito);
      else if (this.stage === 'vaAlPosto') this._walkTo(dt);
      else if (this.stage === 'aspetta') this._waitToBeFound(invito);
      else if (this.stage === 'idle' && this._playerFree()) this._approach(invito);
      else if (this.stage === 'approach') this._walk(dt);
      else if (this.stage === 'talk' && invito.cerca && !ctx.dialogue.active) { this.stage = 'aspetta'; this.wait = 1; }   // resta lì ad aspettarti
      else if (this.stage === 'talk' && !ctx.dialogue.active && this._playerFree()) {
        const q = this.guide.position, pp = ctx.player.position;
        if (Math.hypot(q.x - pp.x, q.z - pp.z) > 2.2) { this._approach(invito); return; }   // si è allontanato: ti segue
        this._face(this.guide);
        ctx.dialogue.open(this.guide, invito.nodo);             // di nuovo l'invito: si parte solo con "Andiamo"
      } else if (this.stage === 'prep') this._prep();
      return;
    }
  }

  _playerFree() {
    const c = this.ctx;
    return !c.dialogue.active && !c.bar?.active && !c.minigames.active && !c.hands.busy;
  }

  // ------------------------------------------------------------------ inviti: il personaggio ti raggiunge

  _npc(name) { return this.ctx.npcs.npcs.find((o) => o.userData.npc_name === name); }

  _approach(invito) {
    const npc = this._npc(invito.npc);
    if (!npc) { this.progress.complete(this.progress.goal); return; }
    this.guide = npc;
    npc.visible = true;
    npc.userData.directed = true;
    this.ctx.camerawork?.stop(npc);
    this.ctx.npcs.stopAction(npc);
    this.walkT = 0; this.stuckT = 0; this.bestD = Infinity; this.ghost = 0;
    const u = npc.userData;
    if (u.walk_clip) this.ctx.npcs.setLoop(npc, u.walk_clip, u.walk_speed ? 1.3 / u.walk_speed : 1, 0.3);
    this.stage = 'approach';
  }

  _walk(dt) {
    const ctx = this.ctx, npc = this.guide;
    const p = ctx.player.position, q = npc.position;
    const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz);
    this.walkT += dt;
    if (this.walkT > 18) {                                        // non ci arriva: compare accanto al giocatore
      q.x = p.x - (dx / d) * 1.3; q.z = p.z - (dz / d) * 1.3;
    }
    if (d < 0.9) { q.x = p.x - (dx / (d || 1)) * 1.2; q.z = p.z - (dz / (d || 1)) * 1.2; }   // troppo addosso: un passo indietro
    if (d <= 1.35 || this.walkT > 18) {
      const u = npc.userData;
      if (u.idle_clip) ctx.npcs.setLoop(npc, u.stand_clip ?? u.idle_clip, 1, 0.3);
      this._face(npc);
      if (!this._playerFree()) return;
      this.stage = 'talk';
      ctx.player.clearInput();
      ctx.dialogue.open(npc, this.cfg.inviti[this.progress.goal].nodo);
      return;
    }
    const step = 1.3 * dt;
    if (d < this.bestD - 0.05) { this.bestD = d; this.stuckT = 0; } else this.stuckT += dt;
    if (this.stuckT > 1.5) { this.ghost = 2; this.stuckT = 0; this.bestD = d; }
    q.x += (dx / d) * step; q.z += (dz / d) * step;
    if ((this.ghost = Math.max(0, this.ghost - dt)) <= 0) ctx.collisions?.resolve(q, 0.2);
    let a = Math.atan2(dx, dz) - npc.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a));
    npc.rotation.y += a * Math.min(1, dt * 7);
  }

  _face(npc, target = this.ctx.player.position) {
    npc.rotation.y = Math.atan2(target.x - npc.position.x, target.z - npc.position.z);
  }

  _release() {
    if (this.guide) {
      this.guide.userData.directed = false;
      const u = this.guide.userData;
      if (u.idle_clip) this.ctx.npcs.setLoop(this.guide, u.idle_clip, 1, 0.3);
    }
    this.guide = null;
  }

  // ------------------------------------------------------------------ posti e preparazione

  _placeNpc(npc, xz, lookAt) {
    if (!npc || !xz) return;
    const p = npc.parent.worldToLocal(new THREE.Vector3(xz[0], 0, xz[1]));
    npc.position.set(p.x, npc.userData.stand_lift ?? npc.position.y, p.z);
    this._face(npc, lookAt);
    npc.updateMatrixWorld(true);
  }

  _placePlayer(xz, look, pitch = -0.1) {
    const pl = this.ctx.player;
    if (pl.seated) pl.stand();
    this.ctx.interactions.setModal(null);
    pl.position.set(xz[0], 0, xz[1]);
    pl.velocity.set(0, 0, 0);
    pl.yaw = yawTo(pl.position, { x: look[0], z: look[1] });
    pl.pitch = pitch;
    pl.update(0);
  }

  _place(goal, npc) {
    const ctx = this.ctx, P = this.cfg.posti[goal];
    if (goal === 'cinema') {
      const chair = ctx.root.getObjectByName(P.sedia), screen = ctx.root.getObjectByName('TV_Screen');
      if (ctx.player.seated) ctx.player.stand();
      this._bigScreen(true);
      if (chair && screen) seatInFront(ctx, chair, screen);
      const tvc = screen ? new THREE.Box3().setFromObject(screen).getCenter(new THREE.Vector3()) : new THREE.Vector3(-1.5, 0, -4);
      this._placeNpc(npc, P.npc, tvc);
      return;
    }
    this._placePlayer(P.player, P.guarda, P.pitch ?? -0.3);
    this._placeNpc(npc, P.npc, ctx.player.position);
  }

  // Durante il quiz del cinema il maxischermo si ingrandisce e scende davanti alla sedia, all'altezza degli occhi,
  // così si legge dritto e non di sbieco; poi torna com'era. In profondità non cambia, così non entra nel muro.
  _bigScreen(on) {
    const screen = this.ctx.root.getObjectByName('TV_Screen'), S = this.cfg.cinema.schermo;
    if (!screen || !S || !!this.screenBase === on) return;
    if (on) {
      this.screenBase = { pos: screen.position.clone(), scale: screen.scale.clone() };
      const k = S.scala, b = this.screenBase.scale;
      screen.scale.set(b.x * k, b.y * k, b.z);
      screen.updateMatrixWorld(true);
      const disp = screen.getObjectByName('TV_Screen_Display') ?? screen;
      const c = new THREE.Box3().setFromObject(disp).getCenter(new THREE.Vector3());
      const chair = this.ctx.root.getObjectByName(this.cfg.posti.cinema.sedia);
      const x = chair ? chair.getWorldPosition(new THREE.Vector3()).x : c.x;
      screen.position.x += x - c.x;
      screen.position.y += S.altezza - c.y;
    } else {
      screen.position.copy(this.screenBase.pos);
      screen.scale.copy(this.screenBase.scale);
      this.screenBase = null;
    }
    screen.updateMatrixWorld(true);
  }

  _hint(text) { this.ctx.ui.toast(text, 4); }

  // battuta della storia: niente chiacchiere di sottofondo sopra finché non è finita
  _say(who, text, dur = 5) {
    this.ctx.ui.subtitle(who, text, dur, { now: true });
    this.ctx.npcs.lastTime = this.ctx.npcs.clock + dur;
  }

  _prep() {
    const ctx = this.ctx;
    if (this.prep === 'sigaretta' && ctx.smoking.holding && !ctx.hands.busy) {
      // sigaretta accesa: ci si siede e si fuma con calma
      this.prep = 'tiri';
      const [who, line] = this.cfg.battute.fumoSiediti;
      this._say(who, line, 5);
      this._sitTavolino(this.cfg.posti.fumo.guarda);
      this._hint(`Fai ${this.cfg.tiriPrimaDiOrdinare} tiri (clic)`);
    } else if (this.prep === 'tiri' && (ctx.smoking.puffs >= this.cfg.tiriPrimaDiOrdinare || !ctx.smoking.holding) && !ctx.hands.busy) {
      // dopo un paio di tiri a Rafka viene fame
      this.prep = 'fame';
      const [who, line] = this.cfg.battute.fumoFame;
      this._say(who, line, 5);
      this.wait = 3;
    } else if (this.prep === 'fame') {
      this._startGame('fumo');
    }
    // la scatola nera si prende con E (handler 'serata_box')
  }

  // seduti sulla sedia accanto al tavolino, guardando look ([x, z] = il piano del tavolino, [x, y, z] = un punto)
  _sitTavolino(look) {
    const S = this.cfg.posti.sedia, pl = this.ctx.player;
    if (pl.seated) pl.stand();
    const target = look.length === 3 ? V(look) : new THREE.Vector3(look[0], 0.62, look[1]);
    const eye = new THREE.Vector3(S.pos[0], this.ctx.config.player.seatedEyeHeight, S.pos[1]);
    const away = new THREE.Vector3(eye.x - target.x, 0, eye.z - target.z).normalize();
    eye.addScaledVector(away, this.ctx.config.seat.backOffset);
    pl.sit({ eye, yaw: yawTo(eye, target), pitch: pitchTo(eye, target) });
  }

  // scatola nera sul tavolino: si prende con E e parte il terzo gioco
  _makeBox() {
    const ctx = this.ctx;
    const g = new THREE.Group();
    g.name = 'Serata_BlackBox';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.17),
      new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.85, metalness: 0, envMapIntensity: 0 }));
    body.position.y = 0.06;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.174, 0.006, 0.174),
      new THREE.MeshStandardMaterial({ color: 0x220018, emissive: 0xff17e4, emissiveIntensity: 1.6 }));
    seam.position.y = 0.09;
    g.add(body, seam);
    g.position.set(this.food.center.x + 0.02, this.food.top, this.food.center.z - 0.02);
    g.visible = false;
    ctx.scene.add(g);
    this.box = g;
    ctx.interactions.register('serata_box', {
      range: 2.2,
      label: () => (this.stage === 'prep' && this.prep === 'scatola' ? 'Prendi la scatola nera' : null),
      action: () => { if (this.stage === 'prep' && this.prep === 'scatola') { this.prep = null; this._startGame('blackbox'); } },
    });
    ctx.interactions.addTarget(g, 'serata_box');
  }

  // Sedia accanto al tavolino (copia di una sedia della TV) e pacchetto spostato nell'angolo, lontano dal cibo.
  // Nel quinto brano, con la sigaretta in mano, sulla sedia ci si siede per lo spettacolo.
  _makeSeat() {
    const ctx = this.ctx, S = this.cfg.posti.sedia;
    const pack = ctx.root.getObjectByName('Cigarette_Pack');
    if (pack && this.cfg.posti.pacchetto) {
      const w = pack.getWorldPosition(new THREE.Vector3());
      const [x, z] = this.cfg.posti.pacchetto;
      pack.position.x += x - w.x; pack.position.z += z - w.z;
      pack.updateMatrixWorld(true);
    }
    const src = ctx.root.getObjectByName('Chair_Screen_01');
    if (!src) return;
    // (clone() copierebbe anche userData, che ha riferimenti circolari: nuova mesh con la stessa geometria)
    // la compressione meshopt mette scala e spostamento sul nodo: la mesh va in un gruppo, centrata e appoggiata a terra
    const mesh = new THREE.Mesh(src.geometry, src.userData.baseMaterial ?? src.material);
    mesh.scale.copy(src.scale);
    mesh.quaternion.copy(src.quaternion);
    const sb = new THREE.Box3().setFromObject(src), sc = sb.getCenter(new THREE.Vector3());
    mesh.position.set(src.position.x - sc.x, src.position.y - sb.min.y, src.position.z - sc.z);
    const chair = new THREE.Group();
    chair.name = 'Serata_Chair';
    chair.add(mesh);
    const look = V(S.guarda);
    chair.position.set(S.pos[0], 0, S.pos[1]);
    // le sedie della TV guardano verso nord (-z): si gira verso dove si guarda lo spettacolo
    chair.rotation.set(0, Math.atan2(-(look.x - S.pos[0]), -(look.z - S.pos[1])), 0);
    ctx.scene.add(chair);
    chair.updateMatrixWorld(true);
    this.chair = chair;
    const cb = new THREE.Box3().setFromObject(chair);
    ctx.collisions?.boxes.push({ name: 'COL_Serata_Chair', cx: (cb.min.x + cb.max.x) / 2, cz: (cb.min.z + cb.max.z) / 2, ux: 1, uz: 0, vx: 0, vz: 1,
      hx: (cb.max.x - cb.min.x) / 2, hz: (cb.max.z - cb.min.z) / 2, minY: 0, maxY: cb.max.y });
    ctx.interactions.register('serata_seat', {
      range: 2.4,
      label: () => {
        if (!this.story || this.progress.goal !== 'spettacolo' || this.stage !== 'ritorno' || ctx.player.seated) return null;
        return ctx.smoking.holding ? 'Siediti e goditi lo spettacolo' : this.cfg.indicazioni.primaSigaretta;
      },
      action: () => {
        if (this.stage !== 'ritorno') return;
        if (!ctx.smoking.holding) { this._hint(this.cfg.indicazioni.primaSigaretta); return; }
        this._sitTavolino(this.cfg.posti.sedia.guarda);
        this._startShow();
      },
    });
    ctx.interactions.addTarget(chair, 'serata_seat');
  }

  // il brano sta finendo e non ti sei ancora seduto: ti ci porta Nicola, con la sigaretta accesa
  _autoSeat() {
    const ctx = this.ctx;
    this.stage = 'going';
    this.ov.fade(true, () => {
      if (!ctx.smoking.holding) { ctx.smoking.give(ctx); ctx.ui.toast('Nicola ti accende una sigaretta', 3); }
      this._sitTavolino(this.cfg.posti.sedia.guarda);
      this.ov.fade(false);
      this._startShow();
    });
  }

  // ------------------------------------------------------------------ gioco del brano

  _setFree(on) {
    this.freeze = on;
    this.cursorFree = on;
    this.ctx.interactions.suspended = on;
    document.body.classList.toggle('srt-on', on);
    this.ctx.player.clearInput();
    if (on) this.ctx.releaseLock(); else this.ctx.requestLock();
  }

  async _startGame(goal) {
    const brano = this.cfg.brani[goal];
    this.stage = 'loading';
    this._setFree(true);
    this.ov.clear();
    this.ov.showBar(brano);
    this.points = 0;
    this.ov.setPoints(0);
    const api = {
      ctx: this.ctx, cfg: this.cfg, overlay: this.ov, tv: this.tv, food: this.food, npc: this.cfg.inviti[goal].npc, durata: brano.durata,
      add: (p) => { this.points += p; this.ov.setPoints(this.points); },
      say: (name, text) => this._say(name, name === 'Rafka' ? this.decorate(this.guide, text) : text, 4),
    };
    this.gameId = goal;
    this.game = GIOCHI[goal](api);
    this.api = api;
    // prima le regole: il tempo (e la musica) partono solo con Inizia
    this.ov.setTime(brano.gioco ?? brano.durata);
    this.stage = 'pronto';
    this.ov.panel(`<h2>${this.cfg.ui.comeSiGioca}</h2><ul>${(brano.regole ?? []).map((r) => `<li>${r}</li>`).join('')}</ul>
      <p style="opacity:.8">${this.cfg.ui.durata.replace('{s}', brano.gioco ?? brano.durata)}</p>`,
    [{ label: this.cfg.ui.inizia, main: true, action: () => this._go() }]);
  }

  async _go() {
    if (this.stage !== 'pronto') return;
    const goal = this.gameId, brano = this.cfg.brani[goal], api = this.api;
    this.stage = 'loading';
    this.ov.clear();
    const dur = await this.ov.music(brano);
    if (this.stage !== 'loading') return;                        // ricominciato nel frattempo
    // il gioco dura `gioco` secondi (un minuto); il quinto brano poi continua (`continua`) con il finale
    const gioco = brano.gioco ? Math.min(brano.gioco, dur) : dur;
    this.trackLeft = brano.continua ? dur : null;
    api.durata = gioco;
    this.left = gioco;
    this.ov.setTime(gioco);
    this.game.start();
    this.stage = 'play';
  }

  _stopGame(keepMusic = false) {
    if (!this.game) return;
    this.game.dispose?.();
    this.game = null;
    this._bigScreen(false);
    if (!keepMusic) this.ov.stopMusic();
  }

  _endGame() {
    const goal = this.gameId, brano = this.cfg.brani[goal];
    const summary = this.game.summary?.() ?? '';
    this._stopGame(this.trackLeft != null);                      // il quinto brano continua a suonare
    this.stage = 'result';
    this.scores.brani[goal] = this.points;
    this._save();
    const tot = this._total();
    this.ov.panel(`<h2>${this.cfg.ui.risultato.replace('{n}', brano.n).replace('{titolo}', brano.titolo)}</h2>
      <p>${summary}</p><table class="score"><tr><td>Punti del brano</td><td>${this.points}</td></tr>
      <tr class="tot"><td>${this.cfg.ui.totale}</td><td>${tot}</td></tr></table>`,
    [{ label: this.cfg.ui.continua, main: true, action: () => this._afterGame(goal) }]);
  }

  _afterGame(goal) {
    const ctx = this.ctx;
    this.ov.clear();
    if (this.trackLeft == null) this.ov.showBar(null);           // il quinto brano va avanti: la barra resta col tempo
    this.box.visible = false;
    if (goal === 'fumo') this.food.clear();                      // si è mangiato: il tavolino si libera (arriva la scatola nera)
    if (ctx.smoking.holding) ctx.smoking.putOut(ctx, this.cfg.indicazioni.spenta);   // la sigaretta della cena finisce nel posacenere
    const key = { cinema: 'cinemaFine', fumo: 'fumoFine', blackbox: 'bbFine', cometiva: 'ctvFine', bicchiere: 'bicFine' }[goal];
    const [who, line] = this.cfg.battute[key];
    this._say(who, this.decorate(this._npc(who), line), 5);
    if (goal === 'bicchiere') {
      const [w2, l2] = this.cfg.battute.bicLibero;
      setTimeout(() => this._say(w2, l2, 8), 5200);
    }
    if (ctx.player.seated) ctx.player.stand();
    this._release();
    this._setFree(false);
    this.stage = goal === 'bicchiere' ? 'ritorno' : 'idle';
    this.called = null;
    this.wait = 4;
    if (goal === 'bicchiere') setTimeout(() => { if (this.stage === 'ritorno') this._hint(this.cfg.indicazioni.siediti); }, 10500);
    this.progress.complete(goal);
  }

  // ------------------------------------------------------------------ finale

  _startShow() {
    const ctx = this.ctx;
    this.stage = 'show';
    // visuale fissa sul biliardo, cursore libero: un clic sulla scena resta un tiro di sigaretta
    this.freeze = true; this.cursorFree = true;
    ctx.interactions.suspended = true;
    ctx.player.clearInput();
    ctx.releaseLock();
    const [who, line] = this.cfg.battute.spettacolo;
    this._say(who, line, 6);
    ctx.smoking.endless = true;                                  // la sigaretta dura tutto lo spettacolo
    this.show = new Spettacolo(ctx, this.cfg.spettacolo);
  }

  _endShow() {
    const ctx = this.ctx;
    this.stage = 'fine';
    this.trackLeft = null;
    this.ov.showBar(null);
    this.ov.stopMusic();
    ctx.smoking.endless = false;
    this.ov.fade(true, () => {
      this.show.stop();
      this.show = null;
      if (ctx.smoking.holding) ctx.smoking.putOut(ctx);
      ctx.ui.showHUD(false);                                     // il logo da solo: niente obiettivi, tasca o sottotitoli dietro
      ctx.wallet.show(false);
      ctx.ui.subtitle(null);
      this.ov.big(`<img src="./assets/logo.webp" alt="${this.cfg.battute.benvenuti}">`);
      this.ov.fade(false);
      setTimeout(() => { this.ov.big(null); this._finalCard(); }, this.cfg.spettacolo.logo * 1000);
    });
  }

  _finalCard() {
    const ctx = this.ctx, c = this.cfg;
    const tot = this._total();
    const titolo = titoloDellaSerata(tot, { ...this.scores.brani });
    const bonus = euroDaPunti(tot, c.euroPerPunti, c.euroMax);
    const newRecord = tot > (this.scores.record ?? 0);
    if (newRecord) { this.scores.record = tot; this._save(); }
    const righe = Object.entries(c.brani).map(([id, b]) => `<tr><td>${b.n} · ${b.titolo}</td><td>${this.scores.brani[id] ?? 0}</td></tr>`).join('');
    const share = c.ui.condivisione.replace('{punti}', tot).replace('{titolo}', titolo) + (c.ep.url ? ` ${c.ep.url}` : '');
    this._setFree(true);
    this.freeze = false;                                          // si può ancora guardare intorno dietro al pannello
    this.ov.panel(`<h2>${c.ui.fine}</h2><p style="font:700 24px var(--display);color:#ffe100;text-transform:uppercase">${titolo}</p>
      <table class="score">${righe}<tr class="tot"><td>${c.ui.totale}</td><td>${tot}</td></tr></table>
      ${bonus ? `<p>${c.ui.euro.replace('{euro}', euro(bonus))}</p>` : ''}
      <p>${newRecord ? 'Nuovo record!' : c.ui.record.replace('{n}', this.scores.record ?? tot)}</p><p style="opacity:.8">${c.ep.riga}</p>`, [
      { label: c.ui.condividi, action: () => this._share(share) },
      { label: c.ui.giocaLibero, main: true, action: () => {
        this.ov.clear();
        ctx.ui.showHUD(true);
        ctx.wallet.show(true);
        if (bonus) ctx.wallet.earn(bonus);
        if (ctx.player.seated) ctx.player.stand();
        this._setFree(false);
        this.stage = 'idle';
        this.progress.complete('spettacolo');
      } },
    ]);
  }

  async _share(text) {
    try {
      if (navigator.share) { await navigator.share({ title: this.cfg.ep.titolo, text }); return; }
      await navigator.clipboard.writeText(text);
      this.ov.pop(this.cfg.ui.copiato, 1.5);
    } catch { /* condivisione annullata */ }
  }

  // ------------------------------------------------------------------ punti

  _total() { return Object.values(this.scores.brani).reduce((s, v) => s + v, 0); }

  _load() {
    try { const s = JSON.parse(localStorage.getItem(this.cfg.storageKey) || 'null'); if (s?.brani) return s; } catch { /* niente */ }
    return { brani: {}, record: 0 };
  }

  _save() { try { localStorage.setItem(this.cfg.storageKey, JSON.stringify(this.scores)); } catch { /* ok */ } }

  // ------------------------------------------------------------------ Nicola: prima ti spiega la serata, poi serve da bere

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

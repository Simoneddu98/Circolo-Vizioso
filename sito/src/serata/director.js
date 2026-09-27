// Regia della serata (modalità storia). I passi sono in CONFIG.serata.passi e usano la progressione normale:
//   nicola -> presentazioni -> cinema -> fumo -> blackbox -> cometiva -> bicchiere -> spettacolo -> games (libero)
// Per ogni brano: il personaggio dell'invito ti raggiunge camminando, ti parla (nodo *_invito del suo dialogo), con
// "Andiamo" si va al buio nel posto del gioco, si prepara (sigaretta, scatola nera) e il gioco dura quanto il brano.
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

  reset() {
    this._stopGame();
    this.show?.stop(); this.show = null;
    this.ov.clear(); this.ov.showBar(null); this.ov.big(null); this.ov.fade(false); this.ov.stopMusic();
    this._release();
    this.food.clear();
    this.box.visible = false;
    this.tv?.setOverride(null);
    this._setFree(false);
    this.stage = 'idle';
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
    this.ov.fade(true, () => { this._place(this.progress.goal, npc); this.ov.fade(false); });
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
    if (!invito?.cerca || this.stage !== 'idle' || npc.userData.npc_name !== invito.npc) return null;
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
  _waitToBeFound(invito) {
    if (this.called === invito.npc) return;
    const npc = this._npc(invito.npc);
    if (!npc) { this.progress.complete(this.progress.goal); return; }
    npc.visible = true;
    const p = this.ctx.player.position, q = npc.getWorldPosition(new THREE.Vector3());
    if (Math.hypot(p.x - q.x, p.z - q.z) < 3.5 && !this.ctx.dialogue.active) {
      this.called = invito.npc;
      this._say(invito.npc, invito.chiama, 4);
    }
  }

  key(e) {
    if (!this.freeze && this.stage !== 'result' && this.stage !== 'fine') return false;
    if (e.code === 'Escape') { this.ctx.pause?.(); return true; }
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
    if (this.stage === 'play' && this.game) {
      this.left -= dt;
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
      if (this.stage === 'idle' && invito.cerca) this._waitToBeFound(invito);
      else if (this.stage === 'idle' && this._playerFree()) this._approach(invito);
      else if (this.stage === 'approach') this._walk(dt);
      else if (this.stage === 'talk' && invito.cerca && !ctx.dialogue.active) { this._release(); this.stage = 'idle'; this.wait = 1; }
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
      if (chair && screen) seatInFront(ctx, chair, screen);
      const tvc = screen ? new THREE.Box3().setFromObject(screen).getCenter(new THREE.Vector3()) : new THREE.Vector3(-1.5, 0, -4);
      this._placeNpc(npc, P.npc, tvc);
      this._startGame(goal);
      return;
    }
    this._placePlayer(P.player, P.guarda, P.pitch ?? -0.3);
    this._placeNpc(npc, P.npc, ctx.player.position);
    if (goal === 'fumo') {
      this.food.showPhone(true);
      this.stage = 'prep'; this.prep = 'sigaretta';
      this._hint(this.cfg.indicazioni.prendiSigaretta);
      ctx.npcs.say(npc, 'Posso dire? Prendine una dal pacchetto sul tavolino. Offre la casa.');
    } else if (goal === 'blackbox') {
      this.box.visible = true;
      this.stage = 'prep'; this.prep = 'scatola';
      this._hint(this.cfg.indicazioni.prendiScatola);
    } else this._startGame(goal);
  }

  _hint(text) { this.ctx.ui.toast(text, 4); }

  // battuta della storia: niente chiacchiere di sottofondo sopra finché non è finita
  _say(who, text, dur = 5) {
    this.ctx.ui.subtitle(who, text, dur);
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

  _sitTavolino(look) {
    const T = this.cfg.posti.tavolino, pl = this.ctx.player;
    if (pl.seated) pl.stand();
    const eye = V(T.eye);
    const target = look.length === 3 ? V(look) : new THREE.Vector3(look[0], 0.62, look[1]);
    pl.sit({ eye, yaw: yawTo(eye, target), pitch: pitchTo(eye, target) });
  }

  // scatola nera sul tavolino: si prende con E e parte il terzo gioco
  _makeBox() {
    const ctx = this.ctx;
    const g = new THREE.Group();
    g.name = 'Serata_BlackBox';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.17),
      new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.18, metalness: 0.4 }));
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

  // posto a sedere al tavolino per lo spettacolo finale
  _makeSeat() {
    const ctx = this.ctx;
    const table = ctx.root.getObjectByName('Side_Table');
    if (!table) return;
    ctx.interactions.register('serata_seat', {
      range: 2.2,
      label: () => {
        if (!this.story || this.progress.goal !== 'spettacolo' || this.stage !== 'ritorno' || ctx.player.seated) return null;
        return ctx.smoking.holding ? 'Siediti e goditi lo spettacolo' : null;
      },
      action: () => {
        if (this.stage !== 'ritorno' || !ctx.smoking.holding) return;
        this._sitTavolino(this.cfg.posti.tavolino.guarda);
        this._startShow();
      },
    });
    ctx.interactions.addTarget(table, 'serata_seat');
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
    const dur = await this.ov.music(brano);
    if (this.stage !== 'loading') return;                        // ricominciato nel frattempo
    api.durata = dur;
    this.left = dur;
    this.ov.setTime(dur);
    this.game.start();
    this.stage = 'play';
  }

  _stopGame() {
    if (!this.game) return;
    this.game.dispose?.();
    this.game = null;
    this.ov.stopMusic();
  }

  _endGame() {
    const goal = this.gameId, brano = this.cfg.brani[goal];
    const summary = this.game.summary?.() ?? '';
    this._stopGame();
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
    this.ov.showBar(null);
    this.box.visible = false;
    if (goal !== 'fumo') this.food.showPhone(false);
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
    if (goal === 'bicchiere') setTimeout(() => this._hint(this.cfg.indicazioni.siediti), 12000);
    this.progress.complete(goal);
  }

  // ------------------------------------------------------------------ finale

  _startShow() {
    const ctx = this.ctx;
    this.stage = 'show';
    ctx.interactions.suspended = true;                           // niente "Alzati" durante lo spettacolo; il clic resta un tiro
    const [who, line] = this.cfg.battute.spettacolo;
    this._say(who, line, 6);
    this.show = new Spettacolo(ctx, this.cfg.spettacolo);
  }

  _endShow() {
    const ctx = this.ctx;
    this.stage = 'fine';
    this.ov.fade(true, () => {
      this.show.stop();
      this.show = null;
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

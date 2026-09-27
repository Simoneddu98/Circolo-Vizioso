// Scopa contro Peppino: seduti al tavolo da carte, cursore libero. Le carte sono mesh 3D che si spostano con brevi
// animazioni tra mazzo, mano, tavola e pile; le posizioni vengono dai marcatori SCOPA_* del glb.
import * as THREE from 'three';
import { registerMinigame } from '../manager.js';
import { SurfaceFrame, sfx, jingle, pick, markerCamera } from '../util.js';
import { ScopaGame } from './rules.js';
import { chooseMove } from './ai.js';
import { CardFactory } from './cards.js';

registerMinigame('scopa', {
  camera: 'CAM_Scopa_Seat',
  opponentSpot: null,                       // Peppino è già seduto di fronte
  seated: ['Peppino'],                      // se era andato al bancone torna al tavolo
  extraSpots: ['SCOPA_Spectator_1'],        // chi occupava la sedia del giocatore si alza
  pointerLock: false,
  modes: [{ id: 'normale', label: 'Gioca contro Peppino' }, { id: 'facile', label: 'Peppino alla buona (facile)' }],
  create: (host) => new Scopa(host),
});

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const TWEEN = 0.35;

class Scopa {
  constructor(host) {
    this.h = host;
    this.c = host.cfg;
    this.table = new SurfaceFrame(host.marker('SCOPA_Table'));
    const pos = (n) => this.table.toLocal(host.marker(n).getWorldPosition(new THREE.Vector3()));
    this.spots = { deck: pos('SCOPA_Deck'), pile0: pos('SCOPA_Pile_Player'), pile1: pos('SCOPA_Pile_Opponent'),
      hand1: pos('SCOPA_Hand_Opponent'), area: pos('SCOPA_TableArea') };
    this.areaSize = host.marker('SCOPA_TableArea').userData.size ?? [0.4, 0.22];
    this.cards = new CardFactory(host.marker('SCOPA_Table').userData.card_size);
    this.group = new THREE.Group();
    host.scene.add(this.group);
    this.meshes = new Map();
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-9, -9);
    this.flatUp = this.table.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2));
    this.flatDown = this.flatUp.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI));
    this.state = 'idle';
    this.elders = ['Efisio', 'Tonino', 'Gavino'];
    // Peppino gioca con le carte sul tavolo: il ventaglio che tiene in mano in esplorazione si nasconde durante la partita
    this.hiddenFan = [];
    host.npc(this.c.opponent)?.traverse((o) => {
      if (o.isMesh && /Card/i.test(o.material?.name ?? '') && o.visible) { o.visible = false; this.hiddenFan.push(o); }
    });
  }

  // ------------------------------------------------------------------ partita

  start(mode) {
    this.h.setCamera({ ...markerCamera(this.h.marker('CAM_Scopa_Seat')), fov: this.c.fov });
    this.difficulty = mode;
    this.game = new ScopaGame({ dealer: Math.random() < 0.5 ? 0 : 1 });
    this._syncMeshes(true);
    this._nextTurn();
  }

  inProgress() { return !!this.game && this.game.winner === null; }

  _nextTurn() {
    const g = this.game;
    this._hud();
    if (g.handResult) { this._showHandResult(); return; }
    if (g.current === 0) {
      this.state = 'player';
      this.h.hint(this.c.hint);
    } else {
      this.state = 'ai';
      this.h.hint(null);
      this.aiDelay = 0.8 + Math.random() * 0.7;
    }
  }

  _hud() {
    const g = this.game;
    this.h.hud(`<div class="box me">Tu ${g.totals[0]}</div><div class="box opp">${this.c.opponent} ${g.totals[1]}</div>`
      + `<div class="box">Mazzo ${g.deck.length}</div><div class="box turn">${g.current === 0 ? 'Tocca a te' : `Tocca a ${this.c.opponent}`}</div>`);
  }

  _play(player, cardId, optionIndex) {
    const g = this.game;
    const before = g.table.length;
    const ev = g.play(cardId, optionIndex);
    sfx({ freq: 1400, dur: 0.05, vol: 0.12, noise: 0.9 });
    if (ev.scopa) {
      this.h.message('Scopa!', 1.8);
      jingle([659, 784, 1046], 0.1, 0.12);
      if (player === 1) this.h.banter('hit'); else this._elderComment('scopa');
    } else if (ev.take.some((c) => c.id === '7D') || ev.card.id === '7D' && ev.take.length) {
      this.h.message('Settebello!', 1.4);
      if (player === 1) this.h.banter('hit'); else this._elderComment('settebello');
    } else if (player === 1 && !ev.take.length && before >= 3 && Math.random() < 0.25) this.h.banter('miss');
    else if (Math.random() < 0.06) this._elderComment('generic');
    this._syncMeshes();
    this.state = 'anim';
    this.wait = TWEEN + 0.15 + (ev.dealt ? 0.4 : 0);
  }

  _elderComment(kind) {
    const lines = this.c.elders?.[kind];
    if (!lines?.length) return;
    this.h.say(pick(this.elders), pick(lines));
  }

  _showHandResult() {
    this.state = 'handover';
    this.h.hint(null);
    const g = this.game;
    const r = g.handResult;
    const rows = r.rows.map((x) => `<tr><td>${x.label}</td><td>${x.values[0]}</td><td>${x.values[1]}</td><td>${x.winner === 0 ? '+1 tu' : x.winner === 1 ? `+1 ${this.c.opponent}` : x.key === 'scope' ? `+${g.scope[0]} / +${g.scope[1]}` : '—'}</td></tr>`).join('');
    const html = `<table class="score-table"><tr><th></th><th>Tu</th><th>${this.c.opponent}</th><th>Punto</th></tr>${rows}
      <tr><td>Smazzata</td><td>${r.points[0]}</td><td>${r.points[1]}</td><td></td></tr>
      <tr><td>Totale</td><td>${g.totals[0]}</td><td>${g.totals[1]}</td><td></td></tr></table>`;
    if (g.winner !== null) {
      const win = g.winner === 0;
      this.h.banter(win ? 'lose' : 'win');
      if (win) jingle([523, 659, 784, 1046]); else jingle([392, 330, 262], 0.18);
      this.h.finish({ title: win ? this.c.youWin : this.c.youLose.replace('{name}', this.c.opponent), win, html, delay: 600 });
      return;
    }
    const box = document.createElement('div');
    box.className = 'panel';
    box.innerHTML = `<h2>${this.c.handOver}</h2>${html}<div class="btns"><button>${this.c.nextHand}</button></div>`;
    this.h.layer.appendChild(box);
    box.querySelector('button').addEventListener('click', (e) => {
      e.stopPropagation();
      box.remove();
      g.nextHand();
      this._clearMeshes();
      this._syncMeshes(true);
      this._nextTurn();
    });
    this.handBox = box;
  }

  // ------------------------------------------------------------------ disposizione delle carte

  _mesh(card) {
    let m = this.meshes.get(card.id);
    if (!m) {
      m = this.cards.make(card);
      m.userData.target = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
      this.group.add(m);
      this.meshes.set(card.id, m);
    }
    return m;
  }

  _clearMeshes() {
    for (const m of this.meshes.values()) m.removeFromParent();
    this.meshes.clear();
  }

  _place(card, pos, quat, snap) {
    const m = this._mesh(card);
    m.userData.target.pos.copy(pos);
    m.userData.target.quat.copy(quat);
    m.visible = true;
    if (snap) { m.position.copy(pos); m.quaternion.copy(quat); }
    return m;
  }

  _syncMeshes(snap = false) {
    const g = this.game, T = this.table;
    const seen = new Set();
    const deckPos = T.toWorld(this.spots.deck.x, this.spots.deck.y, 0.001);
    g.deck.forEach((c, i) => { seen.add(c.id); this._place(c, T.toWorld(this.spots.deck.x, this.spots.deck.y, 0.0012 + i * 0.0004), this.flatDown, snap); });
    // tavola: griglia nell'area centrale
    const [aw, ah] = this.areaSize;
    const n = g.table.length, cols = Math.min(5, Math.max(1, n)), rows = Math.ceil(n / cols);
    g.table.forEach((c, i) => {
      seen.add(c.id);
      const col = i % cols, row = Math.floor(i / cols);
      const x = this.spots.area.x + (col - (cols - 1) / 2) * Math.min(0.075, aw / cols);
      const y = this.spots.area.y + ((rows - 1) / 2 - row) * Math.min(0.105, ah / Math.max(1, rows));
      const m = this._place(c, T.toWorld(x, y, 0.002), this.flatUp, snap && !deckPos);
      if (snap) { m.position.copy(deckPos); m.quaternion.copy(this.flatDown); }
    });
    // pile: coperte, la carta della scopa di traverso e scoperta
    for (const p of [0, 1]) {
      const s = this.spots[`pile${p}`];
      g.piles[p].forEach((c, i) => {
        seen.add(c.id);
        const scopa = g.scopaMarks[p].includes(c.id);
        const q = scopa ? this.flatUp.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Z, Math.PI / 2)) : this.flatDown;
        this._place(c, T.toWorld(s.x, s.y, 0.0012 + i * 0.0004 + (scopa ? 0.001 : 0)), q, snap);
      });
    }
    // mano dell'avversario: coperte in fila
    g.hands[1].forEach((c, i) => {
      seen.add(c.id);
      const x = this.spots.hand1.x + (i - (g.hands[1].length - 1) / 2) * 0.065;
      const m = this._place(c, T.toWorld(x, this.spots.hand1.y, 0.002), this.flatDown, false);
      if (snap) { m.position.copy(deckPos); m.quaternion.copy(this.flatDown); }
    });
    // mano del giocatore: ventaglio davanti alla camera
    this._layoutHand(snap);
    g.hands[0].forEach((c) => seen.add(c.id));
    for (const [id, m] of this.meshes) if (!seen.has(id)) m.visible = false;
  }

  _layoutHand(snap) {
    const cam = this.h.camera;
    const hand = this.game.hands[0];
    hand.forEach((c, i) => {
      const k = i - (hand.length - 1) / 2;
      const lift = this.hover === c.id ? 0.012 : 0;
      const local = new THREE.Vector3(k * 0.05, -0.072 + lift - Math.abs(k) * 0.006, -0.34);
      const pos = local.applyQuaternion(cam.quaternion).add(cam.position);
      const q = cam.quaternion.clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(X, -0.55))
        .multiply(new THREE.Quaternion().setFromAxisAngle(Z, -k * 0.12));
      const m = this._place(c, pos, q, false);
      if (snap) { m.position.copy(this.table.toWorld(this.spots.deck.x, this.spots.deck.y, 0.01)); m.quaternion.copy(this.flatDown); }
    });
  }

  _highlight(ids) {
    for (const [id, m] of this.meshes) {
      const on = ids.has(id);
      m.userData.front.material.emissive.setHex(on ? 0x6a4a10 : 0x000000);
    }
  }

  // ------------------------------------------------------------------ input

  _pickCard(e) {
    const r = this.h.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.h.camera);
    const hits = this.ray.intersectObjects([...this.meshes.values()].filter((m) => m.visible), true);
    return hits.length ? hits[0].object.userData.cardId : null;
  }

  input(type, e) {
    if (type === 'mousemove' && (this.state === 'player' || this.state === 'choose')) {
      const id = this._pickCard(e);
      const inHand = this.game.hands[0].some((c) => c.id === id);
      const hov = this.state === 'player' && inHand ? id : null;
      if (hov !== this.hover) { this.hover = hov; this._layoutHand(false); }
      this.h.renderer.domElement.style.cursor = (this.state === 'player' && inHand) || (this.state === 'choose' && this.chooseIds?.has(id)) ? 'pointer' : 'default';
    } else if (type === 'mousedown' && e.button === 0) {
      const id = this._pickCard(e);
      if (this.state === 'player') {
        if (!this.game.hands[0].some((c) => c.id === id)) return;
        const opts = this.game.options(id);
        if (opts.length <= 1) { this.hover = null; this._play(0, id, 0); return; }
        // più prese possibili: si evidenziano e il giocatore sceglie cliccando una carta della presa
        this.state = 'choose';
        this.chooseCard = id;
        this.chooseOpts = opts;
        this.chooseIds = new Set(opts.flat().map((c) => c.id));
        this._highlight(new Set([id, ...this.chooseIds]));
        this.h.hint(this.c.chooseHint);
      } else if (this.state === 'choose') {
        if (id === this.chooseCard || !this.chooseIds.has(id)) { this.state = 'player'; this._highlight(new Set()); this.h.hint(this.c.hint); return; }
        const oi = this.chooseOpts.findIndex((o) => o.some((c) => c.id === id));
        this._highlight(new Set());
        this.hover = null;
        this._play(0, this.chooseCard, oi);
      }
    }
  }

  // ------------------------------------------------------------------ aggiornamento

  _tween(dt) {
    const k = 1 - Math.exp(-dt / (TWEEN / 4));
    for (const m of this.meshes.values()) {
      if (!m.visible) continue;
      m.position.lerp(m.userData.target.pos, k);
      m.quaternion.slerp(m.userData.target.quat, k);
    }
  }

  update(dt) {
    this._tween(dt);
    if (this.state === 'anim') {
      this.wait -= dt;
      if (this.wait <= 0) this._nextTurn();
    } else if (this.state === 'ai') {
      this.aiDelay -= dt;
      if (this.aiDelay <= 0) {
        const m = chooseMove(this.game, { difficulty: this.difficulty });
        this._play(1, m.cardId, m.optionIndex);
      }
    }
  }

  idle(dt) { this._tween(dt); }

  dispose() {
    for (const o of this.hiddenFan) o.visible = true;
    this.handBox?.remove();
    this._clearMeshes();
    this.group.removeFromParent();
    this.cards.dispose();
    this.h.renderer.domElement.style.cursor = '';
    this.h.hud('');
  }
}

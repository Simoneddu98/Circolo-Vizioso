// Dialoghi a scelta con i personaggi (interactable = "talk" nel glb). I testi sono alberi di nodi in CONFIG.dialogues:
//   { start: [ { if: 'games', node: 'sfida' }, ..., 'benvenuto' ], nodes: { id: { text, options: [ { text, next | action } ] } } }
// Azioni: 'end', 'challenge:<minigioco>' (sfida con il personaggio come avversario), 'give:cigarette' (te la accende lui),
// 'serata:<azione>' (la serata a brani: 'go' = si parte con il brano). Un'opzione con goal completa quel passo.
// Condizioni ('if'): obiettivo completato ('match', 'games', ...), 'seen:<nodo>' già visto, '!' davanti per negare,
// più condizioni insieme con '&' ('match&!cigarettes').
import { pick } from './minigames/util.js';

export class DialogueSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.cfg = ctx.config.dialogues;
    this.seen = new Set();
    this.active = null;                   // { npc, tree, node }
    this._ui();
    ctx.interactions.register('talk', {
      range: 2.6,
      label: (t) => (this.cfg[t.object.userData.npc_name] ? `${ctx.config.interaction.labels.talk} ${t.object.userData.npc_name}` : null),
      action: (t) => this.open(t.object),
    });
  }

  _ui() {
    const css = document.createElement('style');
    css.textContent = `
      #dlg { position: fixed; left: 50%; bottom: 5%; transform: translateX(-50%); width: min(760px, calc(100% - 32px)); z-index: 14;
        background: rgba(28,18,11,0.93); border: 1px solid rgba(230,190,120,0.4); border-radius: 8px; padding: 18px 22px; color: #f1e6d2;
        font-family: var(--body, sans-serif); box-shadow: 0 16px 50px rgba(0,0,0,0.5); }
      #dlg .who { font: 600 16px var(--display, sans-serif); letter-spacing: 0.08em; color: #e6be78; text-transform: uppercase; }
      #dlg .txt { margin: 6px 0 14px; font-size: 20px; line-height: 1.45; }
      #dlg ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
      #dlg li button { width: 100%; text-align: left; font: 17px var(--body, sans-serif); color: #f1e6d2; background: rgba(255,255,255,0.05);
        border: 1px solid rgba(241,230,210,0.2); border-radius: 5px; padding: 8px 12px; cursor: pointer; }
      #dlg li button:hover, #dlg li button:focus-visible { background: rgba(230,190,120,0.2); border-color: #e6be78; outline: none; }
      #dlg li b { color: #e6be78; margin-right: 8px; }`;
    document.head.appendChild(css);
    this.el = document.createElement('div');
    this.el.id = 'dlg';
    this.el.hidden = true;
    document.body.appendChild(this.el);
  }

  _check(cond) {
    if (!cond) return true;
    if (cond.includes('&')) return cond.split('&').every((c) => this._check(c));
    const neg = cond.startsWith('!');
    const c = neg ? cond.slice(1) : cond;
    const ok = c.startsWith('seen:') ? this.seen.has(c.slice(5)) : !!this.ctx.progress?.isDone(c);
    return neg ? !ok : ok;
  }

  // node: nodo da cui partire (la serata apre gli inviti); se manca si sceglie da tree.start
  open(npc, node = null) {
    const tree = this.cfg[npc.userData.npc_name];
    if (!tree || this.active) return false;
    const start = node ?? this.ctx.serata?.startNode(npc) ?? tree.start.find((s) => typeof s === 'string' || this._check(s.if));
    this.active = { npc, tree };
    this.ctx.player.clearInput();
    this.ctx.interactions.setModal(null);           // toglie anche evidenziazione e indicazione "E —"
    this.ctx.ui.setPrompt(null);
    this.ctx.ui.subtitle(null);                     // niente battute di sottofondo sotto il dialogo
    if (npc.userData.talk_clip) this.prevClip = this.ctx.npcs.setLoop(npc, npc.userData.talk_clip);
    this.ctx.releaseLock?.();
    this._show(typeof start === 'string' ? start : start.node);
    return true;
  }

  _show(id) {
    const { tree, npc } = this.active;
    const node = tree.nodes[id];
    if (!node) { this.close(); return; }
    this.seen.add(id);
    this.active.node = node;
    let text = Array.isArray(node.text) ? pick(node.text) : node.text;
    text = this.ctx.serata?.decorate(npc, text, id) ?? text;
    const opts = (node.options ?? [{ text: this.ctx.config.dialogueUi.bye, action: 'end' }]).filter((o) => this._check(o.if));
    this.active.opts = opts;
    this.el.innerHTML = `<div class="who">${npc.userData.npc_name}</div><div class="txt"></div><ol></ol>`;
    this.el.querySelector('.txt').textContent = text;
    const ol = this.el.querySelector('ol');
    opts.forEach((o, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.innerHTML = `<b>${i + 1}</b>`;
      b.append(o.text);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.choose(i); });
      li.append(b);
      ol.append(li);
    });
    this.el.hidden = false;
  }

  choose(i) {
    const o = this.active?.opts[i];
    if (!o) return;
    if (o.goal) this.ctx.ui.completeGoal(o.goal);
    if (o.next) { this._show(o.next); return; }
    const npc = this.active.npc;
    this.close();
    if (o.action === 'give:cigarette') this.ctx.smoking?.give(this.ctx, npc);
    if (o.action?.startsWith('serata:')) this.ctx.serata?.action(o.action.slice(7), npc);
    if (o.action?.startsWith('challenge:')) {
      const game = o.action.slice(10);
      this.ctx.minigames.start(game, null, { opponent: npc.userData.npc_name });
    }
  }

  close() {
    if (!this.active) return;
    const { npc } = this.active;
    if (this.prevClip) this.ctx.npcs.setLoop(npc, this.prevClip);
    this.prevClip = null;
    this.active = null;
    this.el.hidden = true;
    this.ctx.npcs.lastTime = this.ctx.npcs.clock;  // una pausa prima della prossima battuta di sottofondo
    this.ctx.requestLock?.();
    this.ctx.serata?.onDialogueClosed(npc);
  }

  // tasti durante il dialogo: 1-9 scelgono, Esc chiude
  key(e) {
    if (!this.active) return false;
    if (e.code === 'Escape') { this.close(); return true; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) this.choose(n - 1);
    return true;
  }
}

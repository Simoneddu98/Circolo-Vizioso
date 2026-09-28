// Progressione: obiettivi in ordine, ciascuno sblocca le interazioni che lo richiedono (CONFIG.progression).
// La serata (modalità storia) usa i suoi passi (CONFIG.serata.passi, via useSteps); in gioco libero è tutto sbloccato
// e non si salva niente.
export class Progress {
  constructor(config, ui) {
    this.cfg = { ...config.progression };
    this.ui = ui;
    this.done = new Set();
    this.counts = {};                      // numeri mostrati nel testo del passo ({n})
    this.free = false;
    this._load();
    ui.attachProgress(this);
  }

  _load() {
    this.done.clear();
    try { for (const g of JSON.parse(localStorage.getItem(this.cfg.storageKey) || '[]')) this.done.add(g); } catch { /* niente salvataggi */ }
  }

  // passi della serata al posto di quelli di CONFIG.progression (stesse regole, altro salvataggio)
  useSteps(steps, requires, storageKey) {
    Object.assign(this.cfg, { steps, requires, storageKey });
    this.free = false;
    this._load();
    this.ui.renderGoals();
  }

  // gioco libero: tutto sbloccato, come a serata finita
  setFree() { this.free = true; this.ui.renderGoals(); }

  setCount(goal, n) { this.counts[goal] = n; this.ui.renderGoals(); }

  // dove si trova chi devi raggiungere ({dove} nel testo del passo)
  setWhere(goal, text) { (this.where ??= {})[goal] = text; this.ui.renderGoals(); }

  get steps() { return this.cfg.steps; }

  // indice del primo passo non completato (= passo corrente)
  get current() {
    if (this.free) return this.steps.length;
    const i = this.steps.findIndex((s) => !this.done.has(s.goal)); return i < 0 ? this.steps.length : i;
  }

  get goal() { return this.steps[this.current]?.goal ?? null; }

  isDone(goal) { return this.free || this.done.has(goal); }

  // un tipo di interazione è disponibile se il passo richiesto è completato
  allowed(type) {
    const need = this.cfg.requires[type];
    return this.free || !need || this.done.has(need);
  }

  lockedLabel(type) {
    const need = this.cfg.requires[type];
    return this.steps.find((s) => s.goal === need)?.locked ?? null;
  }

  complete(goal) {
    if (this.free || this.done.has(goal) || !this.steps.some((s) => s.goal === goal)) return;
    // un passo conta solo se tutti quelli prima sono già fatti (l'ordine è quello della lista)
    const i = this.steps.findIndex((s) => s.goal === goal);
    if (this.steps.slice(0, i).some((s) => !this.done.has(s.goal))) return;
    this.done.add(goal);
    this._save();
    const next = this.steps[this.current];
    if (next) this.ui.toast(this.cfg.unlockedToast.replace('{text}', this.text(next)), 3.5);
    this.ui.renderGoals();
  }

  text(step) {
    const where = this.where?.[step.goal];
    return step.text.replace('{n}', this.counts[step.goal] ?? 0).replace(where ? '{dove}' : / ?\(\{dove\}\)/, where ?? '');
  }

  reset() { this.done.clear(); this.counts = {}; this._save(); this.ui.renderGoals(); }

  unlockAll() { for (const s of this.steps) this.done.add(s.goal); this._save(); this.ui.renderGoals(); }

  _save() { if (this.free) return; try { localStorage.setItem(this.cfg.storageKey, JSON.stringify([...this.done])); } catch { /* ok */ } }
}

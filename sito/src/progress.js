// Progressione: obiettivi in ordine, ciascuno sblocca le interazioni che lo richiedono (CONFIG.progression).
export class Progress {
  constructor(config, ui) {
    this.cfg = config.progression;
    this.ui = ui;
    this.done = new Set();
    try { for (const g of JSON.parse(localStorage.getItem(this.cfg.storageKey) || '[]')) this.done.add(g); } catch { /* niente salvataggi */ }
    ui.attachProgress(this);
  }

  get steps() { return this.cfg.steps; }

  // indice del primo passo non completato (= passo corrente)
  get current() { const i = this.steps.findIndex((s) => !this.done.has(s.goal)); return i < 0 ? this.steps.length : i; }

  isDone(goal) { return this.done.has(goal); }

  // un tipo di interazione è disponibile se il passo richiesto è completato
  allowed(type) {
    const need = this.cfg.requires[type];
    return !need || this.done.has(need);
  }

  lockedLabel(type) {
    const need = this.cfg.requires[type];
    return this.steps.find((s) => s.goal === need)?.locked ?? null;
  }

  complete(goal) {
    if (this.done.has(goal) || !this.steps.some((s) => s.goal === goal)) return;
    // un passo conta solo se tutti quelli prima sono già fatti (l'ordine è quello della lista)
    const i = this.steps.findIndex((s) => s.goal === goal);
    if (this.steps.slice(0, i).some((s) => !this.done.has(s.goal))) return;
    this.done.add(goal);
    this._save();
    const next = this.steps[this.current];
    if (next) this.ui.toast(this.cfg.unlockedToast.replace('{text}', next.text), 3.5);
    this.ui.renderGoals();
  }

  reset() { this.done.clear(); this._save(); this.ui.renderGoals(); }

  unlockAll() { for (const s of this.steps) this.done.add(s.goal); this._save(); this.ui.renderGoals(); }

  _save() { try { localStorage.setItem(this.cfg.storageKey, JSON.stringify([...this.done])); } catch { /* ok */ } }
}

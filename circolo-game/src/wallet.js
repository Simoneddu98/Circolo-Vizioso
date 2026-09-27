// Portafoglio del protagonista: euro del gioco (non soldi veri) per il bar e i gettoni dei giochi (CONFIG.money).
// Il saldo resta salvato nel browser. Quando non basta più per niente (il drink o il gettone più economico) compare
// la schermata "Hai finito i soldi" e si ricomincia la serata da capo.
// Donazioni (CONFIG.donations): per ora disattivate; quando ci saranno i link (Stripe/PayPal) la schermata finale e il
// bancone mostrano i pulsanti "Ricarica crediti" e "Offrimi da bere".

export function euro(v) {
  return `${v.toFixed(2).replace('.', ',')} €`;
}

export class Wallet {
  constructor(config, onBroke) {
    this.cfg = config.money;
    this.donations = config.donations;
    this.onBroke = onBroke;
    this.amount = this.cfg.start;
    try {
      const v = parseFloat(localStorage.getItem(this.cfg.storageKey));
      if (Number.isFinite(v)) this.amount = v;
    } catch { /* niente salvataggi */ }
    this._ui();
    this._render();
  }

  _ui() {
    const css = document.createElement('style');
    css.textContent = `
      #wallet { position: fixed; right: 18px; top: 18px; z-index: 11; pointer-events: none; font-family: var(--display, sans-serif);
        background: rgba(30, 18, 10, .8); border: 1px solid rgba(217, 170, 69, .25); border-radius: 6px; padding: 8px 14px; color: #f1e6d2; }
      #wallet h3 { margin: 0 0 2px; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: #d9aa45; }
      #wallet .v { font-weight: 700; font-size: 24px; letter-spacing: .02em; }
      #wallet .delta { position: absolute; right: 14px; top: 100%; margin-top: 4px; font-weight: 700; font-size: 18px; transition: opacity .6s, transform .6s; }
      #wallet .delta.minus { color: #ff9f8a; } #wallet .delta.plus { color: #9fe0a2; }
      #broke { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: rgba(10, 6, 3, .82); font-family: var(--body, sans-serif); color: #f1e6d2; }
      #broke .box { width: min(560px, calc(100% - 32px)); background: rgba(28,18,11,.96); border: 1px solid rgba(230,190,120,.4); border-radius: 8px; padding: 26px 28px; text-align: center; }
      #broke h2 { margin: 0 0 8px; font: 700 34px var(--display, sans-serif); color: #e6be78; text-transform: uppercase; }
      #broke p { font-size: 18px; line-height: 1.5; margin: 0 0 18px; }
      #broke .btns { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
      #broke button, #broke a { font: 600 18px var(--display, sans-serif); padding: 10px 18px; border-radius: 5px; cursor: pointer; border: 1px solid #e6be78;
        background: #e6be78; color: #2a1a0e; text-decoration: none; }
      #broke a { background: transparent; color: #f1e6d2; }`;
    document.head.appendChild(css);
    this.el = document.createElement('div');
    this.el.id = 'wallet';
    this.el.hidden = true;
    this.el.innerHTML = `<h3>${this.cfg.label}</h3><div class="v"></div>`;
    document.body.appendChild(this.el);
  }

  show(v) { this.el.hidden = !v; }

  _render() { this.el.querySelector('.v').textContent = euro(this.amount); }

  _save() { try { localStorage.setItem(this.cfg.storageKey, String(this.amount)); } catch { /* ok */ } }

  _delta(v) {
    const d = document.createElement('div');
    d.className = `delta ${v < 0 ? 'minus' : 'plus'}`;
    d.textContent = `${v < 0 ? '−' : '+'}${euro(Math.abs(v))}`;
    this.el.append(d);
    requestAnimationFrame(() => { d.style.opacity = '0'; d.style.transform = 'translateY(10px)'; });
    setTimeout(() => d.remove(), 1600);
  }

  canPay(v) { return this.amount + 1e-6 >= v; }

  // Paga v euro; false se non bastano. check: controlla subito se si è rimasti senza soldi.
  pay(v, check = true) {
    if (!v) return true;
    if (!this.canPay(v)) return false;
    this.amount = Math.round((this.amount - v) * 100) / 100;
    this._save(); this._render(); this._delta(-v);
    if (check) this.checkBroke();
    return true;
  }

  earn(v) {
    if (!v) return;
    this.amount = Math.round((this.amount + v) * 100) / 100;
    this._save(); this._render(); this._delta(v);
  }

  // il prezzo più basso di quello che si può comprare (drink, gettoni)
  get cheapest() { return Math.min(...this.cfg.prices()); }

  checkBroke() {
    if (this.amount + 1e-6 < this.cheapest) setTimeout(() => this.onBroke?.(), this.cfg.brokeDelay * 1000);
  }

  reset() { this.amount = this.cfg.start; this._save(); this._render(); }

  // Schermata di fine soldi: si ricomincia (restart del gioco). Con le donazioni attive, anche "Ricarica crediti".
  showBroke(onRestart) {
    if (document.getElementById('broke')) return;
    const c = this.cfg.broke;
    const box = document.createElement('div');
    box.id = 'broke';
    const donate = this.donations?.enabled && this.donations.creditsUrl
      ? `<a href="${this.donations.creditsUrl}" target="_blank" rel="noopener">${this.donations.creditsLabel}</a>` : '';
    box.innerHTML = `<div class="box"><h2>${c.title}</h2><p>${c.text}</p><div class="btns"><button>${c.restart}</button>${donate}</div></div>`;
    document.body.append(box);
    const b = box.querySelector('button');
    b.addEventListener('click', () => { box.remove(); onRestart(); });
    b.focus();
  }
}

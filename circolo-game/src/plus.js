// Giochi "plus": si sbloccano con un codice personale, valido per un solo browser. Il controllo sta nel database
// (funzione riscatta() di Supabase, vedi supabase/schema.sql): qui c'è solo il client.
// - dispositivo: un id casuale salvato nel browser; il database lega il codice a quello.
// - la chiave "anon" è pubblica per progetto: da sola non legge niente, le tabelle sono chiuse (RLS).
// - lo sblocco resta salvato nel browser; all'avvio si riconferma in silenzio. Senza rete resta com'è.

const KEY = 'circolo.plus.v1';

const ERRORI = {
  non_valido: 'Questo codice non esiste. Controlla di averlo scritto giusto.',
  gia_usato: 'Questo codice è già stato usato su un altro dispositivo.',
  troppi_tentativi: 'Troppi tentativi sbagliati. Riprova tra qualche minuto.',
  rete: 'Non riesco a collegarmi. Controlla la connessione e riprova.',
  vuoto: 'Scrivi il codice che hai ricevuto.',
};

const uuid = () => globalThis.crypto?.randomUUID?.()
  ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });

export class Plus {
  constructor(cfg, storage = globalThis.localStorage) {
    this.cfg = cfg;                          // { url, anonKey, lotti: { id: { nome, ... } } }
    this.storage = storage;
    this.state = { dispositivo: null, codici: {} };            // codici: { <lotto>: <codice> }
    try { Object.assign(this.state, JSON.parse(this.storage?.getItem(KEY) || '{}')); } catch { /* niente salvataggi */ }
    if (!this.state.dispositivo) { this.state.dispositivo = uuid(); this._save(); }
  }

  get attivo() { return !!(this.cfg?.url && this.cfg?.anonKey); }
  get dispositivo() { return this.state.dispositivo; }
  get sbloccati() { return Object.keys(this.state.codici); }
  ha(lotto) { return lotto in this.state.codici; }
  nome(lotto) { return this.cfg.lotti?.[lotto]?.nome ?? lotto; }
  messaggio(errore) { return ERRORI[errore] ?? ERRORI.rete; }

  _save() { try { this.storage?.setItem(KEY, JSON.stringify(this.state)); } catch { /* ok */ } }

  // chiama riscatta(): { ok: true, lotto } | { ok: false, errore }
  async _chiama(codice) {
    try {
      const r = await fetch(`${this.cfg.url}/rest/v1/rpc/riscatta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.cfg.anonKey, Authorization: `Bearer ${this.cfg.anonKey}` },
        body: JSON.stringify({ p_codice: codice, p_dispositivo: this.state.dispositivo }),
      });
      if (!r.ok) return { ok: false, errore: 'rete' };
      const j = await r.json();
      return j && typeof j.ok === 'boolean' ? j : { ok: false, errore: 'rete' };
    } catch { return { ok: false, errore: 'rete' }; }
  }

  async riscatta(testo) {
    const codice = String(testo ?? '').trim();
    if (!codice) return { ok: false, errore: 'vuoto' };
    if (!this.attivo) return { ok: false, errore: 'rete' };
    const r = await this._chiama(codice);
    if (r.ok) { this.state.codici[r.lotto] = codice; this._save(); }
    return r;
  }

  // all'avvio: se un codice salvato non vale più (sganciato o rifiutato) si toglie; gli errori di rete non tolgono niente
  async riconferma() {
    if (!this.attivo) return;
    for (const [lotto, codice] of Object.entries(this.state.codici)) {
      const r = await this._chiama(codice);
      if (!r.ok && (r.errore === 'non_valido' || r.errore === 'gia_usato')) delete this.state.codici[lotto];
    }
    this._save();
  }
}

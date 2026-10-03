// La scatola nera raccoglie le idee di chi gioca (capitolo 3 della storia). Ogni idea è legata a una domanda.
// - Senza archivio online (STORIA.blackbox.archivio = null) le idee restano nel browser di chi gioca, insieme alle idee
//   di partenza dei personaggi (STORIA.blackbox.domande[].semi): la scatola non è mai vuota.
// - Con un archivio online le idee di tutti finiscono lì e ognuno legge quelle degli altri. Due possibilità:
//   { tipo: 'foglio', url } — un foglio Google con lo script di strumenti/idee-foglio/ pubblicato come app web
//     (GET ?domanda=<id> → [{ domanda, testo }], POST { domanda, testo } come testo semplice: niente richieste preliminari)
//   { url, chiave, tabella } — una tabella Supabase con accesso anonimo in aggiunta e lettura (API REST).

const LOCAL = 'circolo.blackbox.idee.v1';

// pulizia minima di un'idea: niente link, niente spazi doppi, lunghezza massima
export function pulisci(testo, max = 160) {
  return String(testo ?? '').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export class Idee {
  constructor(cfg) {
    this.cfg = cfg;                          // STORIA.blackbox
    this.local = {};
    try { this.local = JSON.parse(localStorage.getItem(LOCAL) || '{}') || {}; } catch { /* niente salvataggi */ }
  }

  _saveLocal() { try { localStorage.setItem(LOCAL, JSON.stringify(this.local)); } catch { /* ok */ } }

  get foglio() { const a = this.cfg.archivio; return a?.tipo === 'foglio' && !!a.url; }
  get online() { const a = this.cfg.archivio; return this.foglio || !!(a?.url && a?.chiave && a?.tabella); }

  async invia(domanda, testo) {
    const t = pulisci(testo, this.cfg.lunghezza);
    if (t.length < 3) return false;
    (this.local[domanda] ??= []).unshift({ testo: t, mio: true });
    this._saveLocal();
    if (!this.online) return true;
    const a = this.cfg.archivio;
    if (this.foglio) {
      try { await fetch(a.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ domanda, testo: t }) }); } catch { /* resta almeno qui */ }
      return true;
    }
    try {
      await fetch(`${a.url}/rest/v1/${a.tabella}`, {
        method: 'POST',
        headers: { apikey: a.chiave, Authorization: `Bearer ${a.chiave}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ domanda, testo: t }),
      });
    } catch { /* senza rete l'idea resta almeno qui */ }
    return true;
  }

  // le idee degli altri per una domanda: dall'archivio online se c'è, altrimenti quelle dei personaggi (+ le proprie già date)
  async leggi(domanda, n = 4) {
    const semi = (this.cfg.domande.find((d) => d.id === domanda)?.semi ?? []).map(([chi, testo]) => ({ chi, testo }));
    let altri = [];
    if (this.foglio) {
      try {
        const r = await fetch(`${this.cfg.archivio.url}?domanda=${encodeURIComponent(domanda)}`);
        if (r.ok) altri = (await r.json()).map((x) => ({ chi: null, testo: pulisci(x.testo, this.cfg.lunghezza) })).filter((x) => x.testo);
      } catch { /* fuori linea: si usano i semi */ }
    } else if (this.online) {
      const a = this.cfg.archivio;
      try {
        const r = await fetch(`${a.url}/rest/v1/${a.tabella}?domanda=eq.${encodeURIComponent(domanda)}&select=testo&order=creato.desc&limit=40`,
          { headers: { apikey: a.chiave, Authorization: `Bearer ${a.chiave}` } });
        if (r.ok) altri = (await r.json()).map((x) => ({ chi: null, testo: pulisci(x.testo, this.cfg.lunghezza) })).filter((x) => x.testo);
      } catch { /* fuori linea: si usano i semi */ }
    }
    const miei = new Set((this.local[domanda] ?? []).map((x) => x.testo));
    const pool = [...altri.filter((x) => !miei.has(x.testo)), ...semi];
    // un po' a caso, ma prima le più recenti
    const out = [];
    for (const x of pool) { if (out.length >= n) break; if (Math.random() < 0.8 || pool.length - pool.indexOf(x) <= n - out.length) out.push(x); }
    return out;
  }
}

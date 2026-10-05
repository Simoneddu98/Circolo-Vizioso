import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Plus } from '../src/plus.js';

const cfg = { url: 'https://x.supabase.co', anonKey: 'chiave', lotti: { 'jukebox-cinema': { nome: 'Jukebox: Cinema' } } };
const memoria = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const rete = (risposte) => {
  const chiamate = [];
  globalThis.fetch = async (url, opt) => {
    chiamate.push({ url, opt, body: JSON.parse(opt.body) });
    const r = risposte.shift();
    if (r instanceof Error) throw r;
    return { ok: r.http ?? true, json: async () => r };
  };
  return chiamate;
};

test('il dispositivo è un id che resta lo stesso tra una partita e l\'altra', () => {
  const s = memoria();
  const a = new Plus(cfg, s).dispositivo, b = new Plus(cfg, s).dispositivo;
  assert.match(a, /^[0-9a-f-]{36}$/);
  assert.equal(a, b);
});

test('riscatto riuscito: chiama la funzione giusta con chiave e dispositivo, e salva lo sblocco', async () => {
  const s = memoria();
  const calls = rete([{ ok: true, lotto: 'jukebox-cinema' }]);
  const p = new Plus(cfg, s);
  const r = await p.riscatta('  abcde-fghjk ');
  assert.deepEqual(r, { ok: true, lotto: 'jukebox-cinema' });
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/rpc/riscatta');
  assert.equal(calls[0].opt.headers.apikey, 'chiave');
  assert.deepEqual(calls[0].body, { p_codice: 'abcde-fghjk', p_dispositivo: p.dispositivo });
  assert.ok(p.ha('jukebox-cinema'));
  assert.ok(new Plus(cfg, s).ha('jukebox-cinema'), 'resta salvato');
  assert.equal(p.nome('jukebox-cinema'), 'Jukebox: Cinema');
});

test('errori: codice vuoto senza rete, rifiuti del database e rete assente non sbloccano nulla', async () => {
  const p = new Plus(cfg, memoria());
  assert.equal((await p.riscatta('   ')).errore, 'vuoto');
  rete([{ ok: false, errore: 'gia_usato' }, { ok: false, errore: 'non_valido' }, new Error('offline'), { http: false }, { sbagliata: 1 }]);
  assert.equal((await p.riscatta('A')).errore, 'gia_usato');
  assert.equal((await p.riscatta('B')).errore, 'non_valido');
  assert.equal((await p.riscatta('C')).errore, 'rete');
  assert.equal((await p.riscatta('D')).errore, 'rete');
  assert.equal((await p.riscatta('E')).errore, 'rete');
  assert.equal(p.sbloccati.length, 0);
  for (const e of ['non_valido', 'gia_usato', 'troppi_tentativi', 'rete', 'vuoto']) assert.ok(p.messaggio(e).length > 10);
});

test('senza configurazione (url o chiave mancanti) il modulo è spento', async () => {
  const p = new Plus({ ...cfg, anonKey: '' }, memoria());
  assert.equal(p.attivo, false);
  assert.equal((await p.riscatta('X')).ok, false);
});

test('riconferma: toglie i codici rifiutati, tiene quelli confermati e quelli con la rete assente', async () => {
  const s = memoria();
  const p = new Plus({ ...cfg, lotti: {} }, s);
  p.state.codici = { uno: 'C1', due: 'C2', tre: 'C3' };
  rete([{ ok: true, lotto: 'uno' }, { ok: false, errore: 'gia_usato' }, new Error('offline')]);
  await p.riconferma();
  assert.deepEqual(p.sbloccati.sort(), ['tre', 'uno']);
});

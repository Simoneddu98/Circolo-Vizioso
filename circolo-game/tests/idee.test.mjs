import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Idee, pulisci } from '../src/storia/idee.js';
import { STORIA } from '../src/storia/contenuti.js';

const cfg = (archivio) => ({ ...STORIA.blackbox, archivio });

test('pulizia: niente link, spazi doppi, lunghezza massima', () => {
  assert.equal(pulisci('  ciao   https://x.it/a  mondo '), 'ciao mondo');
  assert.equal(pulisci('a'.repeat(300), 160).length, 160);
});

test('senza archivio: nessuna risposta già pronta; le idee troppo corte non passano', async () => {
  const I = new Idee(cfg(null));
  assert.equal(await I.invia('paura', 'no'), false);
  assert.equal(await I.invia('paura', 'Ho smesso di guardarla.'), true);
  assert.equal((await I.leggi('paura', 3)).length, 0);
  for (const d of STORIA.blackbox.domande) assert.ok(!d.semi && d.inizio && d.fine && d.domanda, d.id);
});

test('foglio Google: scrive con POST testo semplice e legge con ?domanda=', async () => {
  const calls = [];
  globalThis.fetch = async (url, opt = {}) => {
    calls.push({ url, opt });
    if (opt.method === 'POST') return { ok: true, json: async () => ({ ok: true }) };
    return { ok: true, json: async () => [{ domanda: 'notte', testo: 'Il silenzio  del frigo' }, { domanda: 'notte', testo: '' }] };
  };
  const I = new Idee(cfg({ tipo: 'foglio', url: 'https://script.google.com/macros/s/ID/exec' }));
  assert.ok(I.online);
  await I.invia('notte', 'Un sogno che ripara le cose');
  const post = calls.find((c) => c.opt.method === 'POST');
  assert.equal(post.url, 'https://script.google.com/macros/s/ID/exec');
  assert.equal(post.opt.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(post.opt.body), { domanda: 'notte', testo: 'Un sogno che ripara le cose' });
  const altri = await I.leggi('notte', 10);
  assert.ok(calls.some((c) => c.url.endsWith('?domanda=notte')));
  assert.ok(altri.some((x) => x.testo === 'Il silenzio del frigo' && x.chi === null));
  assert.ok(!altri.some((x) => x.testo === ''));
  delete globalThis.fetch;
});

test('foglio irraggiungibile: l\'idea resta nel browser e non si rompe niente', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  const I = new Idee(cfg({ tipo: 'foglio', url: 'https://example.invalid/exec' }));
  assert.equal(await I.invia('casa', 'Una voce che conosci'), true);
  assert.deepEqual(await I.leggi('casa', 3), []);
  delete globalThis.fetch;
});

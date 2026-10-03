import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Idee, pulisci } from '../src/storia/idee.js';
import { STORIA } from '../src/storia/contenuti.js';

const cfg = (archivio) => ({ ...STORIA.blackbox, archivio });

test('pulizia: niente link, spazi doppi, lunghezza massima', () => {
  assert.equal(pulisci('  ciao   https://x.it/a  mondo '), 'ciao mondo');
  assert.equal(pulisci('a'.repeat(300), 160).length, 160);
});

test('senza archivio: le idee dei personaggi, e quelle troppo corte non passano', async () => {
  const I = new Idee(cfg(null));
  assert.equal(await I.invia('ritorno', 'no'), false);
  assert.equal(await I.invia('ritorno', 'La porta, sempre aperta.'), true);
  const altri = await I.leggi('ritorno', 3);
  assert.ok(altri.length >= 1 && altri.every((x) => x.chi));      // solo i semi (la propria idea la mostra il gioco)
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

test('foglio irraggiungibile: restano le idee dei personaggi', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  const I = new Idee(cfg({ tipo: 'foglio', url: 'https://example.invalid/exec' }));
  assert.equal(await I.invia('amici', 'Una rivincita'), true);
  const altri = await I.leggi('amici', 3);
  assert.ok(altri.length >= 1);
  delete globalThis.fetch;
});

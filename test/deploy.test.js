// Hosting behaviour: health check, preview password gate, sign-in code visibility.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { startApp } from './helpers.js';

const { config } = await import('../src/config.js');
const t = await startApp();
after(() => { config.previewPassword = ''; config.production = false; t.close(); });
const basic = pass => `Basic ${Buffer.from(`x:${pass}`).toString('base64')}`;

test('preview password guards sign-in, members and admin; public pages stay open', async () => {
  config.previewPassword = 'segreto';
  try {
    assert.equal((await fetch(`${t.base}/healthz`)).status, 200);
    // Public pages, their files and read-only public data: no password
    for (const p of ['/', '/rientro-dei-cervelli', '/territori/napoli', '/legal/privacy', '/app/main.js', '/data/paesi.json', '/api/public/launch', '/api/public/territory/napoli', '/api/catalog', '/api/session']) {
      assert.equal((await fetch(`${t.base}${p}`, { redirect: 'manual' })).status, 200, p);
    }
    // Sign-in (the code is shown on the page without email), member area, admin, other APIs
    for (const p of ['/accedi', '/onboarding', '/profilo', '/admin', '/api/me']) {
      const denied = await fetch(`${t.base}${p}`, { redirect: 'manual' });
      assert.equal(denied.status, 401, p);
      assert.match(denied.headers.get('www-authenticate'), /^Basic /);
    }
    const code = await fetch(`${t.base}/api/auth/request-code`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'rientro' }, body: JSON.stringify({ email: 'a@x.it' }) });
    assert.equal(code.status, 401);
    assert.equal((await fetch(`${t.base}/accedi`, { headers: { authorization: basic('sbagliata') } })).status, 401);
    assert.equal((await fetch(`${t.base}/accedi`, { headers: { authorization: basic('segreto') } })).status, 200);
  } finally { config.previewPassword = ''; }
});

test('in production the code is shown only behind the preview password', async () => {
  const ask = async headers => (await fetch(`${t.base}/api/auth/request-code`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'rientro', ...headers }, body: JSON.stringify({ email: `p${Date.now()}${Math.random()}@x.it` }),
  })).json();
  config.production = true;
  try {
    assert.equal((await ask()).dev_code, undefined);
    config.previewPassword = 'segreto';
    assert.match((await ask({ authorization: basic('segreto') })).dev_code, /^\d{6}$/);
  } finally { config.production = false; config.previewPassword = ''; }
});

test('sign-in page accepts only real comuni in ?citta=; unknown addresses are an HTML 404', async () => {
  const get = p => fetch(`${t.base}${p}`, { redirect: 'manual' });
  assert.equal((await get('/accedi?citta=Torino')).status, 200);
  assert.equal((await get(`/accedi?citta=${encodeURIComponent("Sant'Agata de' Goti")}`)).status, 200);
  assert.equal((await get('/accedi?citta=')).status, 200);
  const lower = await get('/accedi?citta=torino&next=%2Fprofilo');
  assert.equal(lower.status, 302);
  assert.equal(lower.headers.get('location'), '/accedi?citta=Torino&next=%2Fprofilo');
  for (const p of ['/accedi?citta=cacca', '/accedi?citta=Torin', '/pagina-che-non-esiste']) {
    const r = await get(p);
    assert.equal(r.status, 404, p);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /Questa pagina/);
  }
  assert.equal((await get('/api/non-esiste')).headers.get('content-type').includes('json'), true);
});

test('updated Terms/Privacy: onboarding is never interrupted; approved members are asked first', async () => {
  const stale = id => t.app.db.prepare("UPDATE legal_acknowledgements SET version = 'old' WHERE user_id = ?").run(id);
  // Still onboarding: fills in and sends the profile; the update is asked afterwards
  const o = await t.member('onboarding-legal@x.it');
  stale(o.id);
  assert.equal((await o.patch('/api/me/profile', { bio: 'Ciao' })).status, 200);
  assert.equal((await o.post('/api/me/submit')).status, 200);
  assert.equal((await o.get('/api/me')).body.legal.needs.length, 2);
  // Approved member: profile changes wait for the confirmation
  const a = await t.approved('approvato-legal@x.it');
  stale(a.id);
  assert.equal((await a.get('/api/me')).body.legal.needs.length, 2);
  assert.equal((await a.patch('/api/me/profile', { bio: 'Ciao' })).status, 409);
  await a.post('/api/me/legal', { accept: true });
  assert.equal((await a.patch('/api/me/profile', { bio: 'Ciao' })).status, 200);
});

test('face check library: self-hosted, WebAssembly allowed by the CSP, cached for good', async () => {
  const r = await fetch(`${t.base}/vendor/mediapipe-1.0.1/wasm/vision_wasm_internal.wasm`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/wasm');
  assert.match(r.headers.get('cache-control'), /immutable/);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self' 'wasm-unsafe-eval'/);
  assert.equal((await fetch(`${t.base}/vendor/mediapipe-1.0.1/blaze_face_short_range.tflite`)).status, 200);
  // iPhone photos: HEIC decoder (worker from a blob: URL)
  assert.match(r.headers.get('content-security-policy'), /worker-src 'self' blob:/);
  assert.equal((await fetch(`${t.base}/vendor/heic-to-1.5.2/heic-to.js`)).status, 200);
});

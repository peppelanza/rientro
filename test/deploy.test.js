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

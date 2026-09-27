// Hosting behaviour: health check, preview password gate, sign-in code visibility.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { startApp } from './helpers.js';

const { config } = await import('../src/config.js');
const t = await startApp();
after(() => { config.previewPassword = ''; config.production = false; t.close(); });
const basic = pass => `Basic ${Buffer.from(`x:${pass}`).toString('base64')}`;

test('preview password gates every page and API, except the health check', async () => {
  config.previewPassword = 'segreto';
  try {
    assert.equal((await fetch(`${t.base}/healthz`)).status, 200);
    const denied = await fetch(`${t.base}/`);
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get('www-authenticate'), /^Basic /);
    assert.equal((await fetch(`${t.base}/api/public/launch`)).status, 401);
    assert.equal((await fetch(`${t.base}/`, { headers: { authorization: basic('sbagliata') } })).status, 401);
    assert.equal((await fetch(`${t.base}/`, { headers: { authorization: basic('segreto') } })).status, 200);
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

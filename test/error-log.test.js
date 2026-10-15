import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';
import { captureConsole, logError } from '../src/error-log.js';

let t;
before(async () => { t = await startApp(); });
after(() => t.close());

const H = { 'content-type': 'application/json', 'x-requested-with': 'rientro' };

test('Admin › Errori: refused sign-ins (warn), browser errors, server errors; the same within an hour counted once', async () => {
  // a sign-in refused: an address that can't be one
  const r = await fetch(`${t.base}/api/auth/request-code`, { method: 'POST', headers: H, body: JSON.stringify({ email: 'non-una-email' }) });
  assert.equal(r.status, 400);
  // the browser reports twice the same thing, and once something else
  for (let i = 0; i < 2; i++) await fetch(`${t.base}/api/client-error`, { method: 'POST', headers: H, body: JSON.stringify({ kind: 'turnstile', message: 'Verifica anti-robot non riuscita nel browser: turnstile timeout', path: '/accedi' }) });
  await fetch(`${t.base}/api/client-error`, { method: 'POST', headers: H, body: JSON.stringify({ kind: 'js', message: 'x is not defined', stack: 'at y (main.js:1)' }) });
  // the server: console.error, as captured in production
  const original = console.error;
  console.error = () => {};
  captureConsole(t.app.db);
  console.error('[mail] Brevo 401');
  console.error = original;
  logError(t.app.db, { message: 'diretto' });

  const a = await t.asAdmin();
  const list = (await a.get('/api/admin/errors')).body;
  const find = m => list.items.find(x => x.message.includes(m));
  assert.equal(find('anti-robot').count, 2);
  assert.equal(find('anti-robot').source, 'browser');
  assert.equal(find('anti-robot').kind, 'turnstile');
  assert.equal(find('Brevo').kind, 'mail');
  assert.match(find('not defined').detail, /main\.js/);
  const refused = list.items.find(x => x.kind?.startsWith('accesso:'));
  assert.equal(refused.level, 'warn');
  assert.equal(refused.path, '/api/auth/request-code');
  assert.ok(!JSON.stringify(list).includes('non-una-email'), 'no addresses in the log');
  assert.ok(list.last24 >= 4);
  assert.ok((await a.get('/api/admin/sidebar')).body.errors >= 4);
  // filters
  assert.ok((await a.get('/api/admin/errors?source=browser')).body.items.every(x => x.source === 'browser'));
  assert.ok((await a.get('/api/admin/errors?level=warn')).body.items.every(x => x.level === 'warn'));
  // only admins
  const m = await t.member('noerrori@x.it');
  assert.equal((await m.get('/api/admin/errors')).status, 403);
});

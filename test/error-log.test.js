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
  // not ours, even from a page with older code: an outside script stopped by a blocker, an in-app browser's
  await fetch(`${t.base}/api/client-error`, { method: 'POST', headers: H, body: JSON.stringify({ kind: 'js', message: 'https://static.cloudflareinsights.com/beacon.min.js' }) });
  await fetch(`${t.base}/api/client-error`, { method: 'POST', headers: H, body: JSON.stringify({ kind: 'js', message: 'Uncaught Error: Java object is gone', stack: 'at sendDataToNative (iabjs://navigation_performance_logger_android:1:11853)' }) });
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
  assert.ok(!find('cloudflareinsights') && !find('Java object'), 'outside scripts are not logged');
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

test('admin user card: a deletion request is said, with when it is erased; the admin still opens the profile, members do not', async () => {
  const a = await t.approved('va-via@x.it');
  const other = await t.approved('altro-membro@x.it');
  assert.equal((await a.del('/api/me', { confirm: 'ELIMINA', reason: 'Non mi serve più' })).status, 200);
  const admin = await t.asAdmin();
  const card = (await admin.get(`/api/admin/users/${a.id}`)).body.user;
  assert.equal(card.status_label, 'In eliminazione');
  assert.ok(card.deletion_requested_at && card.erase_on > card.deletion_requested_at);
  assert.equal(card.deletion_reason, 'Non mi serve più');
  assert.equal((await admin.get(`/api/profiles/${a.id}`)).status, 200);
  assert.equal((await other.get(`/api/profiles/${a.id}`)).status, 404);
  const row = (await admin.get('/api/admin/users?q=va-via')).body.users.find(u => u.id === a.id);
  assert.equal(row.status_label, 'In eliminazione');
});

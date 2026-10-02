// Every retention rule in the privacy policy (§9) really deletes data.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { startApp } from './helpers.js';
import { runRetention } from '../src/retention.js';

const t = await startApp();
after(() => t.close());
const db = t.app.db;
const count = (sql, ...a) => db.prepare(sql).get(...a).n;
const ago = (months, from = new Date()) => { const d = new Date(from); d.setMonth(d.getMonth() - months); return d.toISOString(); };

const DAY = 86_400_000;
const exists = id => count('SELECT COUNT(*) AS n FROM users WHERE id = ?', id) === 1;
const requestedAt = id => db.prepare('SELECT deletion_requested_at FROM users WHERE id = ?').get(id)?.deletion_requested_at;
const del = (u, reason) => u.del('/api/me', { confirm: 'ELIMINA', ...(reason ? { reason } : {}) });

test('deleting the account hides it at once and signs it out; data is kept for 30 days', async () => {
  const a = await t.approved('lascia@x.it', {});
  const b = await t.approved('guarda@x.it', {});
  await t.connect(a, b);
  const r = await del(a, 'Ho trovato quello che cercavo');
  assert.equal(r.status, 200);
  assert.ok(Date.parse(r.body.erase_on) - Date.now() > 29 * DAY);
  assert.equal((await a.get('/api/me')).status, 401, 'signed out');
  assert.ok(exists(a.id) && requestedAt(a.id), 'still stored, marked for deletion');
  // For everyone else it is as if it were gone
  assert.equal((await b.get(`/api/profiles/${a.id}`)).status, 404);
  const conns = (await b.get('/api/connections')).body;
  assert.equal(conns.counts.connected, 0);
  assert.equal((await b.post(`/api/threads/${a.id}`, { body: 'Ci sei?' })).status, 403);
  assert.equal((await b.get('/api/threads')).body.total, 0);
  assert.ok(!JSON.stringify((await b.get('/api/profiles')).body).includes(a.id), 'not in discover');
  // Day 29: still there
  runRetention(db, { at: new Date(Date.now() + 29 * DAY) });
  assert.ok(exists(a.id));
});

test('signing in within 30 days restores everything as it was', async () => {
  const a = await t.approved('ripensa@x.it', {});
  const b = await t.approved('amico@x.it', {});
  await t.connect(a, b);
  await del(a);
  runRetention(db, { at: new Date(Date.now() + 20 * DAY) });
  const again = await t.login('ripensa@x.it');
  assert.equal(requestedAt(a.id), null);
  assert.equal((await b.get(`/api/profiles/${a.id}`)).status, 200, 'visible again');
  assert.equal((await b.get('/api/connections')).body.counts.connected, 1, 'connection back');
  assert.equal((await again.get('/api/me')).status, 200);
  runRetention(db, { at: new Date(Date.now() + 60 * DAY) });
  assert.ok(exists(a.id), 'not erased later: the request was cancelled');
});

test('the sign-in response says the account was restored', async () => {
  await t.login('dice-ripristinato@x.it');
  const c = await t.login('dice-ripristinato@x.it');
  await del(c);
  const h = { 'content-type': 'application/json', 'x-requested-with': 'rientro' };
  await fetch(`${t.base}/api/auth/request-code`, { method: 'POST', headers: h, body: JSON.stringify({ email: 'dice-ripristinato@x.it' }) });
  const r = await fetch(`${t.base}/api/auth/verify-code`, { method: 'POST', headers: h, body: JSON.stringify({ email: 'dice-ripristinato@x.it', code: t.codes.get('dice-ripristinato@x.it') }) });
  assert.equal((await r.json()).restored, true);
});

test('after 30 days the account is erased for good, once, with the reason kept anonymously', async () => {
  const a = await t.approved('va-via@x.it', {});
  const b = await t.approved('rimane@x.it', {});
  await t.connect(a, b);
  db.prepare("INSERT INTO preference_events (user_id, subject_ref, preference, value, source, privacy_policy_version, created_at) VALUES (?, 'r-va-via', 'marketing_email', 1, 'signup', 'v', ?)").run(a.id, ago(3));
  await del(a, 'Motivo di prova 30gg');
  const r = runRetention(db, { at: new Date(Date.now() + 31 * DAY) });
  assert.ok(r.accounts_erased >= 1);
  assert.ok(!exists(a.id) && exists(b.id));
  assert.equal(count('SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?', a.id), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM connections WHERE requester_id = ? OR addressee_id = ?', a.id, a.id), 0);
  assert.equal(count("SELECT COUNT(*) AS n FROM deletion_feedback WHERE reason = 'Motivo di prova 30gg'"), 1);
  assert.equal(count("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'retention.account_erased'") >= 1, true);
  const proof = db.prepare("SELECT user_id, purge_after FROM preference_events WHERE subject_ref = 'r-va-via'").get();
  assert.equal(proof.user_id, null);
  assert.ok(Date.parse(proof.purge_after) - Date.now() > 35 * 30 * DAY, 'consent proof kept 36 months, pseudonymously');
  // Signing in with the same email later is a brand-new account
  const fresh = await t.login('va-via@x.it');
  assert.notEqual(fresh.id, a.id);
  assert.equal(runRetention(db, { at: new Date(Date.now() + 32 * DAY) }).accounts_erased, 0);
});

test('members who never asked to delete are never erased, however long they are away', async () => {
  const u = await t.member('lontano@x.it');
  db.prepare('UPDATE users SET last_seen_at = ?, created_at = ? WHERE id = ?').run(ago(60), ago(60), u.id);
  runRetention(db, { at: new Date(Date.now() + 400 * DAY) });
  assert.ok(exists(u.id));
});

test('closed reports, admin access log and export records go after 24 months; open reports stay', async () => {
  const ins = db.prepare("INSERT INTO reports (id, reason, status, created_at, resolved_at) VALUES (?, 'spam', ?, ?, ?)");
  ins.run('old-closed', 'resolved', ago(30), ago(26));
  ins.run('new-closed', 'dismissed', ago(3), ago(2));
  ins.run('old-open', 'open', ago(30), null);
  db.prepare("INSERT INTO admin_audit_log (admin_id, action, created_at) VALUES ('a', 'old.view', ?), ('a', 'new.view', ?)").run(ago(25), ago(1));
  db.prepare('INSERT INTO data_exports (user_id, created_at) VALUES (NULL, ?), (NULL, ?)').run(ago(25), ago(1));
  db.prepare('INSERT INTO deletion_feedback (reason, created_at) VALUES (?, ?), (?, ?)').run('vecchio', ago(26).slice(0, 7), 'recente', ago(1).slice(0, 7));

  runRetention(db);
  assert.deepEqual(db.prepare('SELECT id FROM reports ORDER BY id').all().map(r => r.id), ['new-closed', 'old-open']);
  assert.deepEqual(db.prepare("SELECT action FROM admin_audit_log WHERE action LIKE '%.view' AND admin_id = 'a'").all().map(r => r.action), ['new.view']);
  assert.equal(count('SELECT COUNT(*) AS n FROM data_exports WHERE created_at < ?', ago(24)), 0);
  const reasons = db.prepare('SELECT reason FROM deletion_feedback').all().map(r => r.reason);
  assert.ok(reasons.includes('recente') && !reasons.includes('vecchio'));
  // The admin log still refuses early deletion
  assert.throws(() => db.prepare("DELETE FROM admin_audit_log WHERE action = 'new.view'").run(), /24 months/);
});

test('expired codes and sessions and consent proof past its date are purged', async () => {
  const u = await t.login('scaduto@x.it');
  db.prepare("INSERT INTO login_codes (email, code_hash, expires_at, created_at) VALUES ('z@x.it', 'h', ?, ?)").run(ago(1), ago(1));
  db.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run(ago(1), u.id);
  db.prepare("INSERT INTO preference_events (subject_ref, preference, value, source, privacy_policy_version, created_at, purge_after) VALUES ('ref', 'marketing_email', 1, 'signup', 'v', ?, ?)").run(ago(40), ago(1));
  const r = runRetention(db);
  assert.ok(r.login_codes >= 1 && r.sessions >= 1 && r.preference_events >= 1);
  assert.equal(count("SELECT COUNT(*) AS n FROM login_codes WHERE email = 'z@x.it'"), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', u.id), 0);
  assert.equal(count("SELECT COUNT(*) AS n FROM preference_events WHERE subject_ref = 'ref'"), 0);
});


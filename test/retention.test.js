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

test('24 months without signing in: warning email, then deletion 30 days later', async () => {
  const idle = await t.member('dormiente@x.it');
  const back = await t.member('ritorna@x.it');
  const active = await t.member('attivo@x.it');
  for (const u of [idle, back]) db.prepare('UPDATE users SET last_seen_at = ?, created_at = ? WHERE id = ?').run(ago(25), ago(30), u.id);
  const sent = [];
  const send = async (email, deleteOn) => { sent.push([email, deleteOn]); };

  const r1 = await runRetention(db, { sendInactivityNotice: send });
  assert.deepEqual(sent.map(s => s[0]).sort(), ['dormiente@x.it', 'ritorna@x.it']);
  assert.ok(sent[0][1] - Date.now() > 29 * 86_400_000, 'the email names a deletion date 30 days out');
  assert.equal(r1.inactive_accounts_deleted, 0, 'nobody is deleted on the day of the warning');

  // A second run doesn't send the warning again
  await runRetention(db, { sendInactivityNotice: send });
  assert.equal(sent.length, 2);

  // One of the two signs in again: that clears the warning
  assert.equal((await back.get('/api/me')).status, 200);
  assert.equal(db.prepare('SELECT inactivity_notice_at FROM users WHERE id = ?').get(back.id).inactivity_notice_at, null);

  // 31 days later the silent one is deleted, with everything attached
  const later = new Date(Date.now() + 31 * 86_400_000);
  const r2 = await runRetention(db, { sendInactivityNotice: send, at: later });
  assert.equal(r2.inactive_accounts_deleted, 1);
  assert.equal(count('SELECT COUNT(*) AS n FROM users WHERE id = ?', idle.id), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?', idle.id), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM users WHERE id IN (?, ?)', back.id, active.id), 2);
});

test('without an email provider nobody is warned, so nobody is deleted for inactivity', async () => {
  const u = await t.member('senzaemail@x.it');
  db.prepare('UPDATE users SET last_seen_at = ?, created_at = ? WHERE id = ?').run(ago(40), ago(40), u.id);
  const r = await runRetention(db, { at: new Date(Date.now() + 60 * 86_400_000) });
  assert.equal(r.inactivity_notices, 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM users WHERE id = ?', u.id), 1);
});

test('closed reports, admin access log and export records go after 24 months; open reports stay', async () => {
  const ins = db.prepare("INSERT INTO reports (id, reason, status, created_at, resolved_at) VALUES (?, 'spam', ?, ?, ?)");
  ins.run('old-closed', 'resolved', ago(30), ago(26));
  ins.run('new-closed', 'dismissed', ago(3), ago(2));
  ins.run('old-open', 'open', ago(30), null);
  db.prepare("INSERT INTO admin_audit_log (admin_id, action, created_at) VALUES ('a', 'old.view', ?), ('a', 'new.view', ?)").run(ago(25), ago(1));
  db.prepare('INSERT INTO data_exports (user_id, created_at) VALUES (NULL, ?), (NULL, ?)').run(ago(25), ago(1));
  db.prepare('INSERT INTO deletion_feedback (reason, created_at) VALUES (?, ?), (?, ?)').run('vecchio', ago(26).slice(0, 7), 'recente', ago(1).slice(0, 7));

  await runRetention(db);
  assert.deepEqual(db.prepare('SELECT id FROM reports ORDER BY id').all().map(r => r.id), ['new-closed', 'old-open']);
  assert.deepEqual(db.prepare("SELECT action FROM admin_audit_log WHERE action LIKE '%.view' AND admin_id = 'a'").all().map(r => r.action), ['new.view']);
  assert.equal(count('SELECT COUNT(*) AS n FROM data_exports WHERE created_at < ?', ago(24)), 0);
  assert.deepEqual(db.prepare('SELECT reason FROM deletion_feedback').all().map(r => r.reason), ['recente']);
  // The admin log still refuses early deletion
  assert.throws(() => db.prepare("DELETE FROM admin_audit_log WHERE action = 'new.view'").run(), /24 months/);
});

test('expired codes and sessions and consent proof past its date are purged', async () => {
  const u = await t.login('scaduto@x.it');
  db.prepare("INSERT INTO login_codes (email, code_hash, expires_at, created_at) VALUES ('z@x.it', 'h', ?, ?)").run(ago(1), ago(1));
  db.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run(ago(1), u.id);
  db.prepare("INSERT INTO preference_events (subject_ref, preference, value, source, privacy_policy_version, created_at, purge_after) VALUES ('ref', 'marketing_email', 1, 'signup', 'v', ?, ?)").run(ago(40), ago(1));
  const r = await runRetention(db);
  assert.ok(r.login_codes >= 1 && r.sessions >= 1 && r.preference_events >= 1);
  assert.equal(count("SELECT COUNT(*) AS n FROM login_codes WHERE email = 'z@x.it'"), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', u.id), 0);
  assert.equal(count("SELECT COUNT(*) AS n FROM preference_events WHERE subject_ref = 'ref'"), 0);
});

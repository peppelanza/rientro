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

// ---- edge cases -------------------------------------------------------------------------------
const DAY = 86_400_000;
const inactive = (id, months = 25) => db.prepare('UPDATE users SET last_seen_at = ?, created_at = ?, inactivity_notice_at = NULL WHERE id = ?').run(ago(months), ago(months + 6), id);
const exists = id => count('SELECT COUNT(*) AS n FROM users WHERE id = ?', id) === 1;
const notice = id => db.prepare('SELECT inactivity_notice_at FROM users WHERE id = ?').get(id)?.inactivity_notice_at;
const quiet = async () => {};

test('signing in again with a new code cancels the pending deletion', async () => {
  const u = await t.member('torna-col-codice@x.it');
  inactive(u.id);
  await runRetention(db, { sendInactivityNotice: quiet });
  assert.ok(notice(u.id));
  await t.login('torna-col-codice@x.it'); // request code + verify, nothing else
  assert.equal(notice(u.id), null);
  await runRetention(db, { sendInactivityNotice: quiet, at: new Date(Date.now() + 40 * DAY) });
  assert.ok(exists(u.id));
});

test('the deletion happens only after the full 30 days, and only once', async () => {
  const u = await t.member('trenta@x.it');
  inactive(u.id);
  await runRetention(db, { sendInactivityNotice: quiet });
  await runRetention(db, { sendInactivityNotice: quiet, at: new Date(Date.now() + 29 * DAY) });
  assert.ok(exists(u.id), 'still there on day 29');
  const r = await runRetention(db, { sendInactivityNotice: quiet, at: new Date(Date.now() + 31 * DAY) });
  assert.ok(!exists(u.id));
  assert.equal(count("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'retention.inactive_account_deleted'") >= 1, true);
  const again = await runRetention(db, { sendInactivityNotice: quiet, at: new Date(Date.now() + 32 * DAY) });
  assert.equal(again.inactive_accounts_deleted, 0);
  assert.ok(r.inactive_accounts_deleted >= 1);
});

test('admins and members active in the last 24 months are never warned', async () => {
  const admin = await t.asAdmin();
  db.prepare('UPDATE users SET last_seen_at = ?, created_at = ? WHERE id = ?').run(ago(40), ago(40), admin.id);
  const old = await t.member('iscritto-da-anni@x.it');
  db.prepare('UPDATE users SET created_at = ?, last_seen_at = ? WHERE id = ?').run(ago(60), ago(23), old.id);
  const sent = [];
  await runRetention(db, { sendInactivityNotice: async e => sent.push(e) });
  assert.ok(!sent.includes('admin@rientro.test') && !sent.includes('iscritto-da-anni@x.it'));
  assert.ok(exists(admin.id) && exists(old.id));
});

test('if the warning email fails nothing is marked, and it is retried next time', async () => {
  const u = await t.member('email-ko@x.it');
  inactive(u.id);
  await runRetention(db, { sendInactivityNotice: async e => { if (e === 'email-ko@x.it') throw new Error('Brevo down'); } });
  assert.equal(notice(u.id), null);
  await runRetention(db, { sendInactivityNotice: quiet, at: new Date(Date.now() + 40 * DAY) });
  assert.ok(exists(u.id), 'not deleted: the warning only now went out');
  assert.ok(notice(u.id));
});

test('signing in while the warning is being sent leaves no warning behind', async () => {
  const u = await t.member('in-contemporanea@x.it');
  inactive(u.id);
  await runRetention(db, { sendInactivityNotice: async e => { if (e === 'in-contemporanea@x.it') await t.login(e); } });
  assert.equal(notice(u.id), null);
  // …so when they go quiet again for 24 months they get a fresh warning
  inactive(u.id);
  const sent = [];
  await runRetention(db, { sendInactivityNotice: async e => sent.push(e) });
  assert.ok(sent.includes('in-contemporanea@x.it'));
});

test('an inactive deletion removes the person, not the other members; consent proof stays 36 months', async () => {
  const a = await t.approved('parte@x.it', {});
  const b = await t.approved('resta@x.it', {});
  await t.connect(a, b);
  await b.post('/api/messages', { to: a.id, text: 'Ciao' }).catch(() => {});
  db.prepare("INSERT INTO preference_events (user_id, subject_ref, preference, value, source, privacy_policy_version, created_at) VALUES (?, 'r-parte', 'marketing_email', 1, 'signup', 'v', ?)").run(a.id, ago(30));
  inactive(a.id);
  await runRetention(db, { sendInactivityNotice: async () => {} });
  await runRetention(db, { sendInactivityNotice: async () => {}, at: new Date(Date.now() + 31 * DAY) });
  assert.ok(!exists(a.id) && exists(b.id));
  assert.equal(count('SELECT COUNT(*) AS n FROM connections WHERE requester_id = ? OR addressee_id = ?', a.id, a.id), 0);
  const proof = db.prepare("SELECT user_id, purge_after FROM preference_events WHERE subject_ref = 'r-parte'").get();
  assert.equal(proof.user_id, null);
  assert.ok(Date.parse(proof.purge_after) - Date.now() > 35 * 30 * DAY, 'kept pseudonymously for 36 months');
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';
import { REMINDER_AFTER_HOURS, sendOnboardingReminders } from '../src/onboarding-reminder.js';

let t;
before(async () => { t = await startApp(); });
after(() => t.close());

test('profile left halfway: one email a day after the last change, never twice, not for who finished or opted out', async () => {
  const db = t.app.db;
  const halfway = await t.login('meta@x.it');
  await halfway.patch('/api/me/profile', { first_name: 'Giulia' });
  const busy = await t.login('ancora@x.it'); // still at it
  const done = await t.approved('finito@x.it');
  const optedOut = await t.login('noemail@x.it');
  db.prepare("INSERT INTO communication_preferences (user_id, notify_status_email, updated_at) VALUES (?, 0, '') ON CONFLICT(user_id) DO UPDATE SET notify_status_email = 0").run(optedOut.id);

  const old = new Date(Date.now() - (REMINDER_AFTER_HOURS + 1) * 3600_000).toISOString();
  for (const u of [halfway, done, optedOut]) {
    db.prepare('UPDATE users SET created_at = ?, last_seen_at = ? WHERE id = ?').run(old, old, u.id);
    db.prepare('UPDATE profiles SET updated_at = ? WHERE user_id = ?').run(old, u.id);
  }
  db.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(old, busy.id);

  const sent = [];
  const send = async m => { sent.push(m); };
  await sendOnboardingReminders(db, { send });
  assert.deepEqual(sent.map(m => m.to), ['meta@x.it']);
  assert.equal(sent[0].subject, 'Ti manca poco per entrare su Rientro');
  assert.match(sent[0].text, /^Ciao Giulia, per pubblicare il profilo ti manca solo:\n- Dove vivi\n/);
  assert.match(sent[0].text, /- Foto\n/);
  assert.match(sent[0].html, /\/onboarding/);

  // Once only
  await sendOnboardingReminders(db, { send });
  assert.equal(sent.length, 1);
});

test('"Completa il tuo profilo": one email 24 hours after signing up, listing what is left; not for a complete profile', async () => {
  const { PROFILE_REMINDER_AFTER_HOURS, sendProfileReminders } = await import('../src/profile-reminder.js');
  const db = t.app.db;
  const gaps = await t.login('a-meta-profilo@x.it');
  await gaps.patch('/api/me/profile', { lives_in: 'abroad', lives_in_country: 'Svezia', lives_in_city: 'Stoccolma', desired_comuni: ['Milano'], move_when: '0_3m', primary_intent: 'networking', first_name: 'Ada', last_name: 'Rossi', birth_year: 1990, bio: 'Vivo a Stoccolma da sei anni e lavoro nel design.' });
  const { PNG } = await import('./helpers.js');
  await gaps.raw('POST', '/api/me/photo', PNG);
  assert.equal((await gaps.post('/api/me/submit')).status, 200, 'online with Presentati done');
  const left = (await gaps.get('/api/me')).body.gaps.map(g => g.key);
  assert.ok(left.includes('chi') && left.includes('manca') && left.includes('fonte'));
  const sent = [];
  await sendProfileReminders(db, { send: async m => sent.push(m) });
  assert.equal(sent.length, 0, 'not before 24 hours');
  const old = new Date(Date.now() - (PROFILE_REMINDER_AFTER_HOURS + 1) * 3600_000).toISOString();
  db.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(old, gaps.id);
  await sendProfileReminders(db, { send: async m => sent.push(m) });
  assert.deepEqual(sent.map(m => m.to), ['a-meta-profilo@x.it']);
  assert.match(sent[0].text, /Chi stai cercando/);
  await sendProfileReminders(db, { send: async m => sent.push(m) });
  assert.equal(sent.length, 1, 'once');
});

test('name and surname from Google / LinkedIn: online without Presentati (photo, year and Su di me in Completa); from email, Presentati is needed', async () => {
  const db = t.app.db;
  const base = { lives_in: 'abroad', lives_in_country: 'Svezia', lives_in_city: 'Stoccolma', desired_comuni: ['Milano'], move_when: '0_3m', primary_intent: 'networking' };
  const g = await t.login('dal-login@x.it');
  db.prepare("UPDATE profiles SET first_name = 'Lia', last_name = 'Verdi' WHERE user_id = ?").run(g.id);
  db.prepare("INSERT INTO login_methods (user_id, method, first_used_at, last_used_at) VALUES (?, 'google', '', '')").run(g.id);
  await g.patch('/api/me/profile', base);
  const me = (await g.get('/api/me')).body;
  assert.equal(me.name_from_login, true);
  assert.deepEqual(me.missing, []);
  assert.equal((await g.post('/api/me/submit')).status, 200);
  const after = (await g.get('/api/me')).body;
  assert.equal(after.user.status, 'approved');
  assert.deepEqual(after.gaps.slice(0, 3).map(x => x.key), ['foto', 'anno', 'bio']);
  // other sections save without them; the bio once written can't be emptied
  assert.equal((await g.patch('/api/me/profile', { bio: null, achievement: 'Ho aperto uno studio.' })).status, 200);
  assert.equal((await g.patch('/api/me/profile', { birth_year: null })).status, 200);

  const e = await t.login('da-email@x.it');
  await e.patch('/api/me/profile', { ...base, first_name: 'Ugo', last_name: 'Neri' });
  const meE = (await e.get('/api/me')).body;
  assert.equal(meE.name_from_login, false);
  assert.ok(meE.missing.includes('Foto') && meE.missing.includes('Su di me'));
  assert.equal((await e.post('/api/me/submit')).status, 409);
});

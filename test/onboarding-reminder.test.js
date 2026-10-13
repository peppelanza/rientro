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
  assert.equal(sent[0].subject, 'Il tuo profilo su Rientro è quasi pronto');
  assert.match(sent[0].text, /Ciao Giulia/);
  assert.match(sent[0].html, /\/onboarding/);

  // Once only
  await sendOnboardingReminders(db, { send });
  assert.equal(sent.length, 1);
});

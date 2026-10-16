// Who started the profile and left it halfway gets one email, an hour after their last change, with
// what's still missing, inviting them back to finish it. Once per account (users.onboarding_reminded_at), never while they're still
// at it. Runs every minute from server.js, a small batch at a time.
import { canSendEmail, onboardingReminderEmail, sendEmail } from './mail.js';
import { getCommunicationPreferences } from './preferences.js';
import { now } from './db.js';
import { effectiveProfile, missingForSubmit, nameFromLogin } from './profiles.js';

export const REMINDER_AFTER_HOURS = 1;
const BATCH = 20;

export async function sendOnboardingReminders(db, { send = sendEmail, at = Date.now() } = {}) {
  if (send === sendEmail && !canSendEmail()) return { sent: 0 };
  const due = new Date(at - REMINDER_AFTER_HOURS * 3600_000).toISOString();
  const users = db.prepare(
    `SELECT u.id, u.email, p.first_name FROM users u JOIN profiles p ON p.user_id = u.id
     WHERE u.status = 'onboarding' AND u.onboarding_reminded_at IS NULL AND u.deletion_requested_at IS NULL
       AND u.created_at <= ? AND p.updated_at <= ? AND (u.last_seen_at IS NULL OR u.last_seen_at <= ?)
     ORDER BY u.created_at LIMIT ${BATCH}`,
  ).all(due, due, due);
  let sent = 0;
  for (const u of users) {
    // Marked first: a failed send isn't retried, nobody gets it twice
    db.prepare('UPDATE users SET onboarding_reminded_at = ? WHERE id = ?').run(now(), u.id);
    if (!getCommunicationPreferences(db, u.id).notify_status_email) continue;
    const missing = missingForSubmit(effectiveProfile(db, u.id), { nameKnown: nameFromLogin(db, u.id) });
    try { await send({ to: u.email, ...onboardingReminderEmail({ firstName: u.first_name, missing }) }); sent++; } catch (err) { console.error('[onboarding reminder]', err); }
  }
  return { sent };
}

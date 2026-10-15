// The profile is online but not complete (onboarding ends with Presentati: the rest is "Completa il
// tuo profilo", profiles.js profileGaps): one email, 24 hours after signing up, listing what's left.
// Once per account (users.profile_reminded_at). Runs every minute from server.js, a small batch.
import { canSendEmail, profileReminderEmail, sendEmail } from './mail.js';
import { getCommunicationPreferences } from './preferences.js';
import { effectiveProfile, profileGaps } from './profiles.js';
import { now } from './db.js';

export const PROFILE_REMINDER_AFTER_HOURS = 24;
const BATCH = 20;

export async function sendProfileReminders(db, { send = sendEmail, at = Date.now() } = {}) {
  if (send === sendEmail && !canSendEmail()) return { sent: 0 };
  const due = new Date(at - PROFILE_REMINDER_AFTER_HOURS * 3600_000).toISOString();
  const users = db.prepare(
    `SELECT u.id, u.email FROM users u
     WHERE u.status = 'approved' AND u.profile_reminded_at IS NULL AND u.deletion_requested_at IS NULL AND u.created_at <= ?
     ORDER BY u.created_at LIMIT ${BATCH}`,
  ).all(due);
  let sent = 0;
  for (const u of users) {
    // Marked first: a failed send isn't retried, nobody gets it twice (a complete profile: nothing to send)
    db.prepare('UPDATE users SET profile_reminded_at = ? WHERE id = ?').run(now(), u.id);
    const p = effectiveProfile(db, u.id);
    const gaps = profileGaps(p);
    if (!gaps.length || !getCommunicationPreferences(db, u.id).notify_status_email) continue;
    try { await send({ to: u.email, ...profileReminderEmail({ firstName: p.first_name, gaps }) }); sent++; } catch (err) { console.error('[profile reminder]', err); }
  }
  return { sent };
}

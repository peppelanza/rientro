// Retention rules from the privacy policy (§9), applied once a day by the server (see server.js).
// Each rule really deletes rows; tests in test/retention.test.js cover every one of them.
//   · expired sign-in codes and sessions; consent proof 36 months after account deletion
//   · accounts with no sign-in for 24 months: warning email, then deletion 30 days later if the
//     person still hasn't signed in (never without a warning: no email provider, no deletion)
//   · resolved/dismissed reports, admin access log, data-export records and anonymous leaving
//     feedback after 24 months
import { config } from './config.js';
import { eraseAccount, purgeExpired } from './privacy.js';

const monthsBefore = (date, months) => { const d = new Date(date); d.setMonth(d.getMonth() - months); return d.toISOString(); };

export async function runRetention(db, { sendInactivityNotice = null, at = new Date() } = {}) {
  const R = config.retention;
  const n = r => Number(r.changes);
  const out = purgeExpired(db);

  // 1. Warn members inactive for 24 months (admins are never removed this way)
  out.inactivity_notices = 0;
  if (sendInactivityNotice) {
    const deleteOn = new Date(at.getTime() + R.inactiveGraceDays * 86_400_000);
    const due = db.prepare(`SELECT id, email FROM users WHERE role = 'member' AND inactivity_notice_at IS NULL
      AND COALESCE(last_seen_at, created_at) < ?`).all(monthsBefore(at, R.inactiveMonths));
    for (const u of due) {
      try {
        await sendInactivityNotice(u.email, deleteOn);
        db.prepare('UPDATE users SET inactivity_notice_at = ? WHERE id = ?').run(at.toISOString(), u.id);
        out.inactivity_notices++;
      } catch (err) { console.error('[retention] inactivity notice failed', err?.message ?? err); }
    }
  }

  // 2. Delete accounts warned at least 30 days ago with no sign-in since (signing in clears the warning)
  const warnedBefore = new Date(at.getTime() - R.inactiveGraceDays * 86_400_000).toISOString();
  const expired = db.prepare(`SELECT * FROM users WHERE role = 'member' AND inactivity_notice_at IS NOT NULL
    AND inactivity_notice_at <= ? AND COALESCE(last_seen_at, created_at) < inactivity_notice_at`).all(warnedBefore);
  for (const u of expired) eraseAccount(db, u);
  out.inactive_accounts_deleted = expired.length;

  // 3. Records kept for 24 months
  out.closed_reports = n(db.prepare("DELETE FROM reports WHERE status <> 'open' AND COALESCE(resolved_at, created_at) < ?").run(monthsBefore(at, R.closedReportsMonths)));
  out.admin_log = n(db.prepare('DELETE FROM admin_audit_log WHERE created_at < ?').run(monthsBefore(at, R.adminLogMonths)));
  out.export_log = n(db.prepare('DELETE FROM data_exports WHERE created_at < ?').run(monthsBefore(at, R.exportLogMonths)));
  out.leaving_feedback = n(db.prepare('DELETE FROM deletion_feedback WHERE created_at < ?').run(monthsBefore(at, R.exportLogMonths).slice(0, 7)));
  return out;
}

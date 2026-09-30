// Retention rules from the privacy policy (§9), applied once a day by the server (see server.js).
// Each rule really deletes rows; tests in test/retention.test.js cover every one of them.
//   · accounts whose owner asked to delete them 30 or more days ago and hasn't signed in since
//     (signing in cancels the request: auth.verifyCode)
//   · expired sign-in codes and sessions; consent proof 36 months after account deletion
//   · resolved/dismissed reports, admin access log, data-export records and anonymous leaving
//     feedback after 24 months
import { config } from './config.js';
import { subjectRef } from './db.js';
import { purgeQuarantine } from './moderation.js';
import { eraseAccount, purgeExpired } from './privacy.js';

const monthsBefore = (date, months) => { const d = new Date(date); d.setMonth(d.getMonth() - months); return d.toISOString(); };

export function runRetention(db, { at = new Date() } = {}) {
  const R = config.retention;
  const n = r => Number(r.changes);

  // 1. Deletion requests past their 30 days: erase for good, and note it (pseudonymously) in the admin log
  const due = new Date(at.getTime() - R.deletionGraceDays * 86_400_000).toISOString();
  const log = db.prepare("INSERT INTO admin_audit_log (admin_id, action, target_ref, details, created_at) VALUES ('system', 'retention.account_erased', ?, ?, ?)");
  let erased = 0;
  for (const u of db.prepare('SELECT * FROM users WHERE deletion_requested_at IS NOT NULL AND deletion_requested_at <= ?').all(due)) {
    eraseAccount(db, u, u.deletion_reason);
    log.run(subjectRef(u.id).slice(0, 12), JSON.stringify({ requested_at: u.deletion_requested_at }), new Date().toISOString());
    erased++;
  }

  // 2. Expired codes and sessions, consent proof past its date (after step 1, which sets those dates)
  const out = { accounts_erased: erased, ...purgeExpired(db) };

  // 3. Records kept for 24 months
  out.closed_reports = n(db.prepare("DELETE FROM reports WHERE status <> 'open' AND COALESCE(resolved_at, created_at) < ?").run(monthsBefore(at, R.closedReportsMonths)));
  out.admin_log = n(db.prepare('DELETE FROM admin_audit_log WHERE created_at < ?').run(monthsBefore(at, R.adminLogMonths)));
  out.export_log = n(db.prepare('DELETE FROM data_exports WHERE created_at < ?').run(monthsBefore(at, R.exportLogMonths)));
  // 4. Images stopped as explicit (moderation.js): 30 days in quarantine at most
  out.quarantine = purgeQuarantine(db, new Date(at.getTime() - 30 * 86_400_000).toISOString());
  out.leaving_feedback = n(db.prepare('DELETE FROM deletion_feedback WHERE created_at < ?').run(monthsBefore(at, R.exportLogMonths).slice(0, 7)));
  return out;
}

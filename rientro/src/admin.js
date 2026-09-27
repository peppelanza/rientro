// Internal moderation tools. Every read or write of a user's personal data is written to
// admin_audit_log. There is deliberately no bulk export and no job-seeker search here:
// Rientro Talent (B2B) is out of scope for the MVP.
import { now, subjectRef } from './db.js';
import { getCommunicationPreferences, getJobPreferences, preferenceHistory } from './preferences.js';
import { getOwnProfile } from './profiles.js';
import { HttpError, oneOf, only, text } from './validate.js';

export function audit(db, adminId, action, targetUserId = null, details = {}) {
  db.prepare(
    `INSERT INTO admin_audit_log (admin_id, action, target_user_id, target_ref, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(adminId, action, targetUserId, targetUserId ? subjectRef(targetUserId) : null, JSON.stringify(details), now());
}

const STATUSES = ['onboarding', 'in_review', 'approved', 'paused', 'suspended'];

export function listUsers(db, admin, query) {
  const status = oneOf(query.get('status') || undefined, STATUSES, 'status');
  const rows = db.prepare(
    `SELECT u.id, u.email, u.status, u.created_at, p.first_name, p.last_name, p.primary_intent,
            COALESCE(j.looking_for_italian_job, 0) AS looking_for_italian_job
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN job_preferences j ON j.user_id = u.id
     WHERE ($status IS NULL OR u.status = $status)
     ORDER BY u.created_at DESC LIMIT 200`,
  ).all({ $status: status ?? null });
  audit(db, admin.id, 'users.list', null, { status: status ?? 'all', count: rows.length });
  return rows.map(r => ({ ...r, looking_for_italian_job: r.looking_for_italian_job === 1 }));
}

export function getUser(db, admin, userId) {
  const user = db.prepare('SELECT id, email, role, status, created_at FROM users WHERE id = ?').get(userId);
  if (!user) throw new HttpError(404, 'not_found');
  audit(db, admin.id, 'user.view', userId);
  return {
    user,
    profile: getOwnProfile(db, userId),
    job_seeking: getJobPreferences(db, userId),
    communication_preferences: getCommunicationPreferences(db, userId),
    preference_history: preferenceHistory(db, userId),
  };
}

export function setUserStatus(db, admin, userId, body) {
  only(body, ['status', 'note']);
  const status = oneOf(body.status, ['approved', 'paused', 'suspended', 'onboarding'], 'status', { nullable: false });
  const note = text(body.note, 'note', { max: 500 });
  const user = db.prepare('SELECT status FROM users WHERE id = ?').get(userId);
  if (!user) throw new HttpError(404, 'not_found');
  db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), userId);
  audit(db, admin.id, 'user.status', userId, { from: user.status, to: status, note: note ?? null });
  return { status };
}

export function auditLog(db, admin) {
  const rows = db.prepare(
    `SELECT l.id, l.action, l.target_user_id, substr(l.target_ref, 1, 12) AS target_ref, l.details, l.created_at,
            a.email AS admin_email
     FROM admin_audit_log l LEFT JOIN users a ON a.id = l.admin_id ORDER BY l.id DESC LIMIT 200`,
  ).all();
  audit(db, admin.id, 'audit.view');
  return rows.map(r => ({ ...r, details: JSON.parse(r.details) }));
}

export function processingRegister(db) {
  return db.prepare('SELECT * FROM processing_register ORDER BY purpose').all();
}

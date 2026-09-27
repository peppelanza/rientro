import { config, LEGAL_VERSIONS } from './config.js';
import { now, subjectRef, tx } from './db.js';
import { deleteFilesOf } from './files.js';
import { getCommunicationPreferences, getJobPreferences, preferenceHistory } from './preferences.js';
import { getOwnProfile } from './profiles.js';
import { HttpError, only, text } from './validate.js';

// Design 40a: "Ricevi un archivio con tutto quello che Rientro conserva su di te".
export function exportData(db, user) {
  const last = db.prepare('SELECT created_at FROM data_exports WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id);
  if (last && Date.now() - Date.parse(last.created_at) < config.exportCooldownHours * 3600_000) {
    throw new HttpError(429, 'export_cooldown', `Puoi richiederne uno ogni ${config.exportCooldownHours} ore.`);
  }
  db.prepare('INSERT INTO data_exports (user_id, created_at) VALUES (?, ?)').run(user.id, now());
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  return {
    generated_at: now(),
    format_version: 2,
    account: { id: user.id, email: user.email, role: user.role, status: user.status, created_at: user.created_at },
    profile: getOwnProfile(db, user.id),
    job_seeking: getJobPreferences(db, user.id),
    communication_preferences: getCommunicationPreferences(db, user.id),
    preference_history: preferenceHistory(db, user.id),
    legal_acknowledgements: all('SELECT doc, version, created_at FROM legal_acknowledgements WHERE user_id = ? ORDER BY id', user.id),
    connections: all(
      `SELECT CASE WHEN requester_id = ? THEN 'sent' ELSE 'received' END AS direction,
              CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS other_user_id,
              status, note, created_at, responded_at
       FROM connections WHERE requester_id = ? OR addressee_id = ?`, user.id, user.id, user.id, user.id),
    messages: all(
      `SELECT CASE WHEN sender_id = ? THEN 'sent' ELSE 'received' END AS direction,
              CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS other_user_id, body, created_at, read_at
       FROM messages WHERE sender_id = ? OR recipient_id = ? ORDER BY id`, user.id, user.id, user.id, user.id),
    notifications: all('SELECT kind, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY id', user.id),
    blocked: all('SELECT blocked_id, created_at FROM blocks WHERE blocker_id = ?', user.id),
    reports_made: all('SELECT reported_id, reason, details, status, created_at FROM reports WHERE reporter_id = ?', user.id),
    files: all('SELECT id, kind, mime_type, size_bytes, created_at FROM files WHERE owner_id = ?', user.id)
      .map(f => ({ ...f, download_url: `/api/files/${f.id}` })),
    active_sessions: all('SELECT created_at, last_used_at, user_agent FROM sessions WHERE user_id = ?', user.id),
    current_legal_versions: LEGAL_VERSIONS,
  };
}

// Design 41a/41b: two steps, "Scrivi ELIMINA per confermare", optional reason.
export function deleteAccount(db, user, body) {
  only(body, ['confirm', 'reason']);
  if (body.confirm !== 'ELIMINA') throw new HttpError(400, 'confirm_required', 'Scrivi ELIMINA per confermare.');
  const reason = text(body.reason, 'Motivo', { max: 200 }) ?? null;
  const purgeAfter = new Date();
  purgeAfter.setMonth(purgeAfter.getMonth() + config.ledgerRetentionMonthsAfterDeletion);
  const removeFromDisk = deleteFilesOf(db, user.id);
  tx(db, () => {
    // Keep pseudonymous proof of past choices until purge_after; drop the identity now.
    db.prepare('UPDATE preference_events SET user_id = NULL, purge_after = ? WHERE user_id = ?').run(purgeAfter.toISOString(), user.id);
    db.prepare('UPDATE admin_audit_log SET target_user_id = NULL WHERE target_user_id = ?').run(user.id);
    db.prepare('DELETE FROM login_codes WHERE email = ?').run(user.email);
    // Cascades: profile, education, experiences, job prefs, communication prefs, sessions,
    // connections, messages (both directions), notifications, blocks, files, acknowledgements,
    // admin notes, review events, reports about this user. Reports this user made keep the
    // report but lose the reporter (reporter_id → NULL).
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    // The optional "Perché te ne vai?" answer is kept only as anonymous feedback.
    if (reason) db.prepare('INSERT INTO deletion_feedback (reason, created_at) VALUES (?, ?)').run(reason, now().slice(0, 7));
  });
  removeFromDisk();
  return { deleted: true, ledger_subject_ref: subjectRef(user.id).slice(0, 12), ledger_purge_after: purgeAfter.toISOString() };
}

// Retention job (daily cron).
export function purgeExpired(db) {
  const ts = now();
  const n = r => Number(r.changes);
  return {
    preference_events: n(db.prepare('DELETE FROM preference_events WHERE purge_after IS NOT NULL AND purge_after <= ?').run(ts)),
    login_codes: n(db.prepare('DELETE FROM login_codes WHERE expires_at <= ? OR used_at IS NOT NULL').run(ts)),
    sessions: n(db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(ts)),
  };
}

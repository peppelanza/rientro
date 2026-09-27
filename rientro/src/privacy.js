import { config, LEGAL_VERSIONS } from './config.js';
import { now, subjectRef, tx } from './db.js';
import { deleteFilesOf } from './files.js';
import { getCommunicationPreferences, getJobPreferences, preferenceHistory } from './preferences.js';
import { getOwnProfile } from './profiles.js';
import { HttpError, only } from './validate.js';

export function exportData(db, user) {
  const last = db.prepare('SELECT created_at FROM data_exports WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id);
  const cooldownMs = config.exportCooldownHours * 3600_000;
  if (last && Date.now() - Date.parse(last.created_at) < cooldownMs) {
    throw new HttpError(429, 'export_cooldown', `Puoi richiedere un archivio ogni ${config.exportCooldownHours} ore.`);
  }
  db.prepare('INSERT INTO data_exports (user_id, created_at) VALUES (?, ?)').run(user.id, now());

  const connections = db.prepare(
    `SELECT CASE WHEN requester_id = ? THEN 'sent' ELSE 'received' END AS direction,
            CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS other_user_id,
            status, created_at, updated_at
     FROM connections WHERE requester_id = ? OR addressee_id = ?`,
  ).all(user.id, user.id, user.id, user.id);

  return {
    generated_at: now(),
    format_version: 1,
    account: { id: user.id, email: user.email, role: user.role, status: user.status, created_at: user.created_at },
    profile: getOwnProfile(db, user.id),
    job_seeking: getJobPreferences(db, user.id),
    communication_preferences: getCommunicationPreferences(db, user.id),
    preference_history: preferenceHistory(db, user.id),
    legal_acknowledgements: db.prepare(
      'SELECT doc, version, created_at FROM legal_acknowledgements WHERE user_id = ? ORDER BY id',
    ).all(user.id),
    connections,
    files: db.prepare(
      'SELECT id, kind, mime_type, size_bytes, created_at FROM files WHERE owner_id = ?',
    ).all(user.id).map(f => ({ ...f, download_url: `/api/files/${f.id}` })),
    active_sessions: db.prepare('SELECT created_at, expires_at, user_agent FROM sessions WHERE user_id = ?').all(user.id),
    current_legal_versions: LEGAL_VERSIONS,
  };
}

export function deleteAccount(db, user, body) {
  only(body, ['confirm', 'reason']);
  if (body.confirm !== 'ELIMINA') throw new HttpError(400, 'confirm_required', 'Scrivi ELIMINA per confermare.');
  const purgeAfter = new Date();
  purgeAfter.setMonth(purgeAfter.getMonth() + config.ledgerRetentionMonthsAfterDeletion);
  const removeFromDisk = deleteFilesOf(db, user.id);

  tx(db, () => {
    // Keep pseudonymous proof of past choices until purge_after; drop the identity now.
    db.prepare('UPDATE preference_events SET user_id = NULL, purge_after = ? WHERE user_id = ?')
      .run(purgeAfter.toISOString(), user.id);
    db.prepare('UPDATE admin_audit_log SET target_user_id = NULL WHERE target_user_id = ?').run(user.id);
    db.prepare('DELETE FROM login_tokens WHERE email = ?').run(user.email);
    // Cascades: profiles, job_preferences, communication_preferences, sessions,
    // connections, files, legal_acknowledgements. data_exports.user_id → NULL.
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  });
  removeFromDisk();
  return { deleted: true, ledger_subject_ref: subjectRef(user.id).slice(0, 12), ledger_purge_after: purgeAfter.toISOString() };
}

// Retention job: run daily (cron). Removes expired ledger rows and stale auth artefacts.
export function purgeExpired(db) {
  const ts = now();
  return {
    preference_events: Number(db.prepare('DELETE FROM preference_events WHERE purge_after IS NOT NULL AND purge_after <= ?').run(ts).changes),
    login_tokens: Number(db.prepare('DELETE FROM login_tokens WHERE expires_at <= ? OR used_at IS NOT NULL').run(ts).changes),
    sessions: Number(db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(ts).changes),
  };
}

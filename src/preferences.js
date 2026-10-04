import { LEGAL_VERSIONS } from './config.js';
import { now, subjectRef, tx } from './db.js';
import { HttpError, bool, list, oneOf, only } from './validate.js';

export const WORK_ARRANGEMENTS = ['on_site', 'hybrid', 'remote', 'any'];
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'any'];
export const AVAILABILITY = ['now', 'within_3_months', 'within_6_months', 'within_12_months', 'later'];

const JOB_DETAIL_FIELDS = [
  'roles', 'skills', 'sectors', 'preferred_locations',
  'work_arrangement', 'employment_type', 'availability',
];

const EMPTY_DETAILS = {
  roles: '[]', skills: '[]', sectors: '[]', preferred_locations: '[]',
  work_arrangement: null, employment_type: null, availability: null,
};

function recordEvent(db, { userId, preference, value, source, noticeVersion = null }) {
  db.prepare(
    `INSERT INTO preference_events
       (user_id, subject_ref, preference, value, source, notice_version, privacy_policy_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, subjectRef(userId), preference, value ? 1 : 0, source, noticeVersion, LEGAL_VERSIONS.privacy, now());
}

export function getJobPreferences(db, userId) {
  const row = db.prepare('SELECT * FROM job_preferences WHERE user_id = ?').get(userId);
  if (!row) {
    return {
      looking_for_italian_job: false, selected_at: null, deselected_at: null, updated_at: null,
      roles: [], skills: [], sectors: [], preferred_locations: [],
      work_arrangement: null, employment_type: null, availability: null,
    };
  }
  return {
    looking_for_italian_job: row.looking_for_italian_job === 1,
    selected_at: row.selected_at,
    deselected_at: row.deselected_at,
    updated_at: row.updated_at,
    roles: JSON.parse(row.roles),
    skills: JSON.parse(row.skills),
    sectors: JSON.parse(row.sectors),
    preferred_locations: JSON.parse(row.preferred_locations),
    work_arrangement: row.work_arrangement,
    employment_type: row.employment_type,
    availability: row.availability,
  };
}

// The one and only writer of looking_for_italian_job. Only an explicit boolean from the user
// changes it; no other profile field is ever used to infer it.
export function setJobSeeking(db, userId, body, source) {
  only(body, ['looking_for_italian_job']);
  const value = bool(body.looking_for_italian_job, 'looking_for_italian_job');
  const current = getJobPreferences(db, userId);
  if (current.looking_for_italian_job === value) return current;

  const ts = now();
  tx(db, () => {
    db.prepare(
      `INSERT INTO job_preferences (user_id, looking_for_italian_job, selected_at, deselected_at,
         notice_version, privacy_policy_version, updated_at)
       VALUES ($user_id, $v, $sel, $desel, $notice, $privacy, $ts)
       ON CONFLICT(user_id) DO UPDATE SET
         looking_for_italian_job = $v,
         selected_at   = CASE WHEN $v = 1 THEN $ts ELSE NULL END,
         deselected_at = CASE WHEN $v = 0 THEN $ts ELSE deselected_at END,
         notice_version = $notice, privacy_policy_version = $privacy, updated_at = $ts`,
    ).run({
      $user_id: userId, $v: value ? 1 : 0,
      $sel: value ? ts : null, $desel: value ? null : ts,
      $notice: LEGAL_VERSIONS.job_seeking_notice, $privacy: LEGAL_VERSIONS.privacy, $ts: ts,
    });
    if (!value) {
      // Data minimisation: the details only exist to serve the job-seeking purpose.
      db.prepare(
        `UPDATE job_preferences SET roles = '[]', skills = '[]', sectors = '[]', preferred_locations = '[]',
           work_arrangement = NULL, employment_type = NULL, availability = NULL WHERE user_id = ?`,
      ).run(userId);
    }
    recordEvent(db, {
      userId, preference: 'job_seeking', value, source,
      noticeVersion: LEGAL_VERSIONS.job_seeking_notice,
    });
  });
  return getJobPreferences(db, userId);
}

export function updateJobDetails(db, userId, body) {
  only(body, JOB_DETAIL_FIELDS);
  const current = getJobPreferences(db, userId);
  if (!current.looking_for_italian_job) {
    throw new HttpError(409, 'job_seeking_off',
      'Attiva prima “Sto anche cercando lavoro in Italia per un’azienda italiana”.');
  }
  const next = {
    roles: list(body.roles, 'Ruoli', { maxItems: 8 }),
    skills: list(body.skills, 'Competenze', { maxItems: 20, maxLen: 50 }),
    sectors: list(body.sectors, 'Settori', { maxItems: 5 }),
    preferred_locations: list(body.preferred_locations, 'Comuni', { maxItems: 10 }),
    work_arrangement: oneOf(body.work_arrangement, WORK_ARRANGEMENTS, 'Modalità di lavoro'),
    employment_type: oneOf(body.employment_type, EMPLOYMENT_TYPES, 'Tipo di impiego'),
    availability: oneOf(body.availability, AVAILABILITY, 'Disponibilità'),
  };
  const sets = [];
  const params = { $user_id: userId, $ts: now() };
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue;
    sets.push(`${key} = $${key}`);
    params[`$${key}`] = Array.isArray(value) ? JSON.stringify(value) : value;
  }
  if (sets.length) {
    db.prepare(`UPDATE job_preferences SET ${sets.join(', ')}, updated_at = $ts WHERE user_id = $user_id`).run(params);
  }
  return getJobPreferences(db, userId);
}

// --- Separate, independent optional choices -------------------------------------------

const COMMUNICATION_PREFS = ['marketing_email'];

// Only email notifications are a choice: in the app they always arrive (the old notify_*_app
// columns are no longer read or written)
const NOTIFY_FIELDS = ['notify_requests_email', 'notify_messages_email', 'notify_status_email', 'notify_groups_email'];
const NOTIFY_DEFAULTS = { notify_requests_email: 1, notify_messages_email: 1, notify_status_email: 1, notify_groups_email: 1 };

export function getCommunicationPreferences(db, userId) {
  const row = db.prepare('SELECT * FROM communication_preferences WHERE user_id = ?').get(userId);
  return {
    marketing_email: row?.marketing_email === 1,
    ...Object.fromEntries(NOTIFY_FIELDS.map(f => [f, (row ? row[f] : NOTIFY_DEFAULTS[f]) === 1])),
    updated_at: row?.updated_at ?? null,
  };
}

// Notification settings (design 38a) are service settings, not consents: no ledger entry.
export function updateNotificationSettings(db, userId, body) {
  only(body, NOTIFY_FIELDS);
  const current = getCommunicationPreferences(db, userId);
  const next = Object.fromEntries(NOTIFY_FIELDS.map(f => [f, (body[f] === undefined ? current[f] : bool(body[f], f)) ? 1 : 0]));
  db.prepare(
    `INSERT INTO communication_preferences (user_id, marketing_email, ${NOTIFY_FIELDS.join(', ')}, updated_at)
     VALUES ($user_id, $marketing, ${NOTIFY_FIELDS.map(f => `$${f}`).join(', ')}, $ts)
     ON CONFLICT(user_id) DO UPDATE SET ${NOTIFY_FIELDS.map(f => `${f} = excluded.${f}`).join(', ')}, updated_at = excluded.updated_at`,
  ).run({ $user_id: userId, $marketing: current.marketing_email ? 1 : 0, ...Object.fromEntries(NOTIFY_FIELDS.map(f => [`$${f}`, next[f]])), $ts: now() });
  return getCommunicationPreferences(db, userId);
}

export function setCommunicationPreference(db, userId, body, source) {
  only(body, ['preference', 'value']);
  const preference = oneOf(body.preference, COMMUNICATION_PREFS, 'preference', { nullable: false });
  const value = bool(body.value, 'value');
  const current = getCommunicationPreferences(db, userId);
  if (current[preference] === value) return current;
  tx(db, () => {
    db.prepare(
      `INSERT INTO communication_preferences (user_id, ${preference}, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET ${preference} = excluded.${preference}, updated_at = excluded.updated_at`,
    ).run(userId, value ? 1 : 0, now());
    recordEvent(db, { userId, preference, value, source });
  });
  return getCommunicationPreferences(db, userId);
}

export function preferenceHistory(db, userId) {
  return db.prepare(
    `SELECT preference, value, source, notice_version, privacy_policy_version, created_at
     FROM preference_events WHERE user_id = ? ORDER BY id DESC`,
  ).all(userId).map(r => ({ ...r, value: r.value === 1 }));
}

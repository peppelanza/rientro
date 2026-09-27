import { now } from './db.js';
import { getJobPreferences } from './preferences.js';
import { HttpError, handle, httpsUrl, list, oneOf, only, text } from './validate.js';

const AGE_BANDS = ['25-29', '30-34', '35-39', '40-44', '45-50+'];
const INTENTS = ['has_idea', 'seeking_idea'];
const EXPERIENCE = ['0-3', '4-7', '8-12', '13+'];

const EDITABLE = {
  first_name: v => text(v, 'Nome', { max: 60 }),
  last_name: v => text(v, 'Cognome', { max: 60 }),
  age_band: v => oneOf(v, AGE_BANDS, 'Fascia d’età'),
  lives_in_country: v => text(v, 'Paese', { max: 60 }),
  lives_in_city: v => text(v, 'Città', { max: 80 }),
  desired_comuni: v => list(v, 'Comuni', { maxItems: 10 }),
  primary_intent: v => oneOf(v, INTENTS, 'Intento'),
  background_area: v => text(v, 'Background', { max: 60 }),
  current_role: v => text(v, 'Ruolo attuale', { max: 80 }),
  years_experience: v => oneOf(v, EXPERIENCE, 'Anni di esperienza'),
  bio: v => text(v, 'Su di me', { max: 600 }),
  linkedin_url: v => httpsUrl(v, 'LinkedIn'),
  website_url: v => httpsUrl(v, 'Sito'),
  instagram_handle: v => handle(v, 'Instagram'),
  x_handle: v => handle(v, 'X'),
  calendar_url: v => httpsUrl(v, 'Link calendario'),
};

const row = (db, userId) => db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);

export function getOwnProfile(db, userId) {
  const p = row(db, userId);
  if (!p) return { desired_comuni: [] };
  const { user_id, ...rest } = p;
  return { ...rest, desired_comuni: JSON.parse(p.desired_comuni), photo_url: photoUrl(p) };
}

// looking_for_italian_job is intentionally NOT editable here: `only` rejects it.
export function updateProfile(db, userId, body) {
  only(body, Object.keys(EDITABLE));
  const values = {};
  for (const [key, parse] of Object.entries(EDITABLE)) {
    const v = parse(body[key]);
    if (v !== undefined) values[key] = key === 'desired_comuni' ? JSON.stringify(v) : v;
  }
  db.prepare('INSERT OR IGNORE INTO profiles (user_id, updated_at) VALUES (?, ?)').run(userId, now());
  const keys = Object.keys(values);
  if (keys.length) {
    const params = { $user_id: userId, $ts: now() };
    for (const k of keys) params[`$${k}`] = values[k];
    db.prepare(`UPDATE profiles SET ${keys.map(k => `${k} = $${k}`).join(', ')}, updated_at = $ts WHERE user_id = $user_id`)
      .run(params);
  }
  return getOwnProfile(db, userId);
}

const photoUrl = p => (p.photo_file_id ? `/api/files/${p.photo_file_id}` : null);

export function isConnected(db, a, b) {
  return !!db.prepare(
    `SELECT 1 FROM connections WHERE status = 'accepted'
     AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`,
  ).get(a, b, b, a);
}

// Allowlisted member-facing view. Never includes: email, account status, job-seeking details,
// preference timestamps, or connections-only links unless the viewer is connected.
export function publicProfile(db, viewer, targetId) {
  const target = db.prepare('SELECT id, status FROM users WHERE id = ?').get(targetId);
  const isSelf = viewer.id === targetId;
  if (!target || (!isSelf && target.status !== 'approved')) throw new HttpError(404, 'not_found');
  const p = row(db, targetId) || {};
  const connected = isSelf || isConnected(db, viewer.id, targetId);
  return {
    id: targetId,
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    age_band: p.age_band ?? null,
    lives_in_country: p.lives_in_country ?? null,
    lives_in_city: p.lives_in_city ?? null,
    desired_comuni: p.desired_comuni ? JSON.parse(p.desired_comuni) : [],
    primary_intent: p.primary_intent ?? null,
    background_area: p.background_area ?? null,
    current_role: p.current_role ?? null,
    years_experience: p.years_experience ?? null,
    bio: p.bio ?? null,
    photo_url: photoUrl(p),
    // Only the badge, as promised by the notice next to the checkbox. Details stay private.
    is_looking_for_italian_job: getJobPreferences(db, targetId).looking_for_italian_job,
    links: {
      linkedin_url: p.linkedin_url ?? null,
      website_url: p.website_url ?? null,
      ...(connected
        ? { instagram_handle: p.instagram_handle ?? null, x_handle: p.x_handle ?? null, calendar_url: p.calendar_url ?? null }
        : { locked: true }),
    },
    is_connected: connected && !isSelf,
  };
}

export function listProfiles(db, viewer) {
  if (viewer.status !== 'approved' && viewer.role !== 'admin') {
    throw new HttpError(403, 'not_approved', 'Potrai scoprire altre persone quando il tuo profilo sarà approvato.');
  }
  const ids = db.prepare(
    `SELECT u.id FROM users u WHERE u.status = 'approved' AND u.id != ? ORDER BY u.created_at DESC LIMIT 50`,
  ).all(viewer.id);
  return ids.map(({ id }) => publicProfile(db, viewer, id));
}

export function submitForReview(db, userId) {
  const p = row(db, userId);
  if (!p?.first_name || !p?.primary_intent) {
    throw new HttpError(409, 'incomplete', 'Completa nome e obiettivo prima di inviare.');
  }
  db.prepare(`UPDATE users SET status = 'in_review', updated_at = ? WHERE id = ? AND status = 'onboarding'`)
    .run(now(), userId);
}

// --- Connections -----------------------------------------------------------------------

export function requestConnection(db, viewer, targetId) {
  if (viewer.id === targetId) throw new HttpError(400, 'self');
  publicProfile(db, viewer, targetId); // 404s unless the target is visible
  if (viewer.status !== 'approved') throw new HttpError(403, 'not_approved');
  const ts = now();
  db.prepare(
    `INSERT INTO connections (requester_id, addressee_id, status, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?) ON CONFLICT DO NOTHING`,
  ).run(viewer.id, targetId, ts, ts);
}

export function respondConnection(db, viewer, requesterId, accept) {
  const res = db.prepare(
    `UPDATE connections SET status = ?, updated_at = ?
     WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'`,
  ).run(accept ? 'accepted' : 'declined', now(), requesterId, viewer.id);
  if (res.changes === 0) throw new HttpError(404, 'not_found');
}

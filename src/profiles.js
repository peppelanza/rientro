import { AGE_BANDS, AREAS, IDEA_STAGES, SECTORS, SEEKING_LOCATION, SOURCES, START, TIME, YEARS, label } from './catalog.js';
import { newId, now, tx } from './db.js';
import { getJobPreferences } from './preferences.js';
import { HttpError, bad, handle, httpsUrl, list, oneOf, only, text } from './validate.js';

const values = pairs => pairs.map(p => p[0]);
const bool = (v, f) => { if (v === undefined) return undefined; if (v === true || v === false) return v ? 1 : 0; throw bad('invalid_field', `${f} non valido`); };
const subset = (v, allowed, f, max) => {
  const l = list(v, f, { maxItems: max });
  if (l === undefined) return undefined;
  for (const x of l) if (!allowed.includes(x)) throw bad('invalid_field', `${f}: “${x}” non valido`);
  return l;
};

const EDITABLE = {
  lives_in: v => oneOf(v, ['italy', 'abroad'], 'Dove vivi'),
  lives_in_country: v => text(v, 'Paese', { max: 60 }),
  lives_in_city: v => text(v, 'Città', { max: 80 }),
  desired_comuni: v => list(v, 'Comuni', { maxItems: 10, maxLen: 80 }),
  desired_unknown: v => bool(v, 'Non lo so ancora'),
  primary_intent: v => oneOf(v, ['has_idea', 'seeking_idea'], 'Obiettivo'),
  idea_title: v => text(v, 'In una frase', { max: 140 }),
  idea_description: v => text(v, 'Descrizione', { max: 1000 }),
  idea_stage: v => oneOf(v, values(IDEA_STAGES), 'A che punto sei'),
  first_name: v => text(v, 'Nome', { max: 60 }),
  last_name: v => text(v, 'Cognome', { max: 60 }),
  age_band: v => oneOf(v, values(AGE_BANDS), 'Fascia d’età'),
  bio: v => text(v, 'Su di me', { max: 600 }),
  background_area: v => oneOf(v, AREAS, 'Background'),
  current_role: v => text(v, 'Ruolo attuale', { max: 80 }),
  current_company: v => text(v, 'Azienda', { max: 80 }),
  years_experience: v => oneOf(v, values(YEARS), 'Anni di esperienza'),
  achievement: v => text(v, 'Risultato', { max: 400 }),
  video_connections_only: v => bool(v, 'Video'),
  sectors: v => subset(v, SECTORS, 'Settori', 5),
  seeking_backgrounds: v => subset(v, AREAS, 'Chi stai cercando', 2),
  seeking_description: v => text(v, 'Descrivi la persona che cerchi', { max: 400 }),
  seeking_location: v => oneOf(v, values(SEEKING_LOCATION), 'Dove dovrebbe vivere'),
  time_commitment: v => oneOf(v, values(TIME), 'Tempo'),
  start_when: v => oneOf(v, values(START), 'Quando potresti iniziare'),
  misses_italy: v => text(v, 'Cosa ti manca dell’Italia', { max: 200 }),
  linkedin_url: v => httpsUrl(v, 'LinkedIn'),
  website_url: v => httpsUrl(v, 'Sito'),
  instagram_handle: v => handle(v, 'Instagram'),
  x_handle: v => handle(v, 'X'),
  calendar_url: v => httpsUrl(v, 'Link calendario'),
  source: v => oneOf(v, SOURCES, 'Come hai conosciuto Rientro'),
  visible: v => bool(v, 'Visibilità'),
  onboarding_step: v => text(v, 'step', { max: 20 }),
};

const JSON_FIELDS = new Set(['desired_comuni', 'sectors', 'seeking_backgrounds']);
// Design 37a: "Le modifiche a foto, nome e idea vengono riviste prima di essere pubblicate."
export const REVIEWED_FIELDS = ['first_name', 'last_name', 'idea_title', 'idea_description', 'photo_file_id'];

export const fileUrl = id => (id ? `/api/files/${id}` : null);

export function rawProfile(db, userId) {
  const p = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!p) return null;
  for (const f of JSON_FIELDS) p[f] = JSON.parse(p[f]);
  p.pending_changes = JSON.parse(p.pending_changes);
  return p;
}

const education = (db, userId) => db.prepare('SELECT id, school, degree, years FROM education WHERE user_id = ? ORDER BY position, rowid').all(userId);
const experiences = (db, userId) => db.prepare(
  'SELECT id, company, role, city, start_month, end_month, current FROM experiences WHERE user_id = ? ORDER BY current DESC, start_month DESC, position',
).all(userId).map(e => ({ ...e, current: e.current === 1 }));

export function getOwnProfile(db, userId) {
  const p = rawProfile(db, userId);
  if (!p) return null;
  const { user_id, ...rest } = p;
  const pending = p.pending_changes;
  return {
    ...rest,
    desired_unknown: p.desired_unknown === 1,
    video_connections_only: p.video_connections_only === 1,
    visible: p.visible === 1,
    photo_url: fileUrl(pending.photo_file_id ?? p.photo_file_id),
    live_photo_url: fileUrl(p.photo_file_id),
    video_url: fileUrl(p.video_file_id),
    education: education(db, userId),
    experiences: experiences(db, userId),
  };
}

// Own view with pending edits applied (what the member sees in the editor and preview).
export function effectiveProfile(db, userId) {
  const p = getOwnProfile(db, userId);
  return p && { ...p, ...Object.fromEntries(Object.entries(p.pending_changes).filter(([k]) => k !== 'photo_file_id')) };
}

export function updateProfile(db, user, body) {
  only(body, Object.keys(EDITABLE));
  const current = rawProfile(db, user.id);
  const live = {};
  const pending = { ...current.pending_changes };
  for (const [key, parse] of Object.entries(EDITABLE)) {
    const v = parse(body[key]);
    if (v === undefined) continue;
    if (user.status === 'approved' && REVIEWED_FIELDS.includes(key)) {
      if (v === current[key]) delete pending[key]; else pending[key] = v;
      continue;
    }
    live[key] = JSON_FIELDS.has(key) ? JSON.stringify(v) : v;
  }
  const next = { ...current, ...live };
  if (body.lives_in === 'italy') live.lives_in_country = 'Italia';
  else if (next.lives_in === 'abroad' && next.lives_in_country?.trim().toLowerCase() === 'italia') {
    throw bad('invalid_field', 'Se vivi in Italia, scegli «Vivo già in Italia».');
  }
  if (live.seeking_backgrounds && next.background_area && JSON.parse(live.seeking_backgrounds).includes(next.background_area)) {
    throw bad('invalid_field', 'Cerca competenze diverse dal tuo background.');
  }
  live.pending_changes = JSON.stringify(pending);
  const keys = Object.keys(live);
  const params = { $user_id: user.id, $ts: now() };
  for (const k of keys) params[`$${k}`] = live[k];
  db.prepare(`UPDATE profiles SET ${keys.map(k => `${k} = $${k}`).join(', ')}, updated_at = $ts WHERE user_id = $user_id`).run(params);
  return effectiveProfile(db, user.id);
}

export function applyPendingChanges(db, userId) {
  const p = rawProfile(db, userId);
  const entries = Object.entries(p.pending_changes);
  if (!entries.length) return;
  const params = { $user_id: userId, $ts: now() };
  for (const [k, v] of entries) params[`$${k}`] = v;
  db.prepare(`UPDATE profiles SET ${entries.map(([k]) => `${k} = $${k}`).join(', ')}, pending_changes = '{}', updated_at = $ts WHERE user_id = $user_id`).run(params);
}

// --- Education & experience ------------------------------------------------------------

export function saveEducation(db, userId, body, id = null) {
  only(body, ['school', 'degree', 'years']);
  const school = text(body.school, 'Istituto', { max: 120, nullable: false });
  const degree = text(body.degree, 'Titolo', { max: 160 }) ?? null;
  const years = text(body.years, 'Anni', { max: 20 }) ?? null;
  if (id) {
    const r = db.prepare('UPDATE education SET school = ?, degree = ?, years = ? WHERE id = ? AND user_id = ?').run(school, degree, years, id, userId);
    if (!r.changes) throw new HttpError(404, 'not_found');
  } else {
    const n = db.prepare('SELECT COUNT(*) AS n FROM education WHERE user_id = ?').get(userId).n;
    if (n >= 10) throw bad('too_many', 'Massimo 10 voci di formazione.');
    id = newId();
    db.prepare('INSERT INTO education (id, user_id, school, degree, years, position) VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, school, degree, years, n);
  }
  return education(db, userId);
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export function saveExperience(db, userId, body, id = null) {
  only(body, ['company', 'role', 'city', 'start_month', 'end_month', 'current']);
  const company = text(body.company, 'Azienda', { max: 120, nullable: false });
  const role = text(body.role, 'Ruolo', { max: 120 }) ?? null;
  const city = text(body.city, 'Città', { max: 80 }) ?? null;
  const start = text(body.start_month, 'Inizio', { max: 7 }) ?? null;
  const end = body.current ? null : (text(body.end_month, 'Fine', { max: 7 }) ?? null);
  for (const m of [start, end]) if (m && !MONTH_RE.test(m)) throw bad('invalid_field', 'Usa il formato AAAA-MM');
  const current = body.current === true ? 1 : 0;
  if (id) {
    const r = db.prepare('UPDATE experiences SET company = ?, role = ?, city = ?, start_month = ?, end_month = ?, current = ? WHERE id = ? AND user_id = ?')
      .run(company, role, city, start, end, current, id, userId);
    if (!r.changes) throw new HttpError(404, 'not_found');
  } else {
    const n = db.prepare('SELECT COUNT(*) AS n FROM experiences WHERE user_id = ?').get(userId).n;
    if (n >= 15) throw bad('too_many', 'Massimo 15 esperienze.');
    id = newId();
    db.prepare('INSERT INTO experiences (id, user_id, company, role, city, start_month, end_month, current, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, company, role, city, start, end, current, n);
  }
  return experiences(db, userId);
}

export function deleteRow(db, table, userId, id) {
  if (!['education', 'experiences'].includes(table)) throw new Error('bad table');
  const r = db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(id, userId);
  if (!r.changes) throw new HttpError(404, 'not_found');
  return table === 'education' ? education(db, userId) : experiences(db, userId);
}

// --- Submission --------------------------------------------------------------------------

export function missingForSubmit(p) {
  const missing = [];
  if (!p.lives_in || !p.lives_in_city) missing.push('Dove vivi');
  if (!p.desired_comuni.length && !p.desired_unknown) missing.push('Dove vorresti vivere');
  if (!p.primary_intent) missing.push('Obiettivo');
  if (!p.photo_url) missing.push('Foto');
  if (!p.first_name || !p.last_name) missing.push('Nome e cognome');
  if (!p.background_area) missing.push('Background');
  if (!p.seeking_backgrounds.length) missing.push('Chi stai cercando');
  if (!p.time_commitment) missing.push('Tempo');
  return missing;
}

export function submitForReview(db, user) {
  const p = effectiveProfile(db, user.id);
  const missing = missingForSubmit(p);
  if (missing.length) throw new HttpError(409, 'incomplete', `Completa: ${missing.join(', ')}.`);
  if (!['onboarding', 'changes_requested'].includes(user.status)) return;
  tx(db, () => {
    db.prepare(`UPDATE users SET status = 'in_review', updated_at = ? WHERE id = ?`).run(now(), user.id);
    db.prepare('UPDATE profiles SET submitted_at = ?, review_note = NULL WHERE user_id = ?').run(now(), user.id);
  });
}

// --- Relationships -----------------------------------------------------------------------

export function isBlocked(db, a, b) {
  return !!db.prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').get(a, b, b, a);
}

export function connectionBetween(db, a, b) {
  return db.prepare(
    `SELECT * FROM connections WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
       AND status IN ('pending', 'accepted') ORDER BY created_at DESC LIMIT 1`,
  ).get(a, b, b, a) ?? null;
}

export function connectionState(db, viewerId, targetId) {
  const c = connectionBetween(db, viewerId, targetId);
  if (!c) return { status: 'none' };
  if (c.status === 'accepted') return { status: 'connected', id: c.id, since: c.responded_at };
  return { status: c.requester_id === viewerId ? 'pending_sent' : 'pending_received', id: c.id, note: c.requester_id === viewerId ? null : c.note };
}

// "Cerca Prodotto, il tuo background" (design Person Card / 29a)
export function complement(viewerP, p) {
  if (!viewerP || !p) return null;
  if (viewerP.background_area && p.seeking_backgrounds.includes(viewerP.background_area)) return `Cerca ${viewerP.background_area}, il tuo background`;
  if (p.background_area && viewerP.seeking_backgrounds.includes(p.background_area)) {
    return `Tu cerchi ${p.background_area}, ${p.first_name} è ${p.current_role || p.background_area}`;
  }
  const shared = p.sectors.filter(s => viewerP.sectors.includes(s));
  if (shared.length >= 2) return `Ha scelto ${shared[0]} e ${shared[1]}, come te`;
  return null;
}

const places = p => (p.desired_comuni.length ? p.desired_comuni.join(', ') : p.desired_unknown ? 'Non lo sa ancora' : '—');

function visibleTarget(db, viewer, targetId) {
  const u = db.prepare('SELECT id, status FROM users WHERE id = ?').get(targetId);
  const self = viewer.id === targetId;
  const p = u && rawProfile(db, targetId);
  const ok = u && p && (self || viewer.role === 'admin' || (u.status === 'approved' && p.visible === 1));
  if (!ok || (!self && isBlocked(db, viewer.id, targetId))) throw new HttpError(404, 'not_found', 'Profilo non disponibile.');
  return { u, p, self };
}

// Allowlisted member-facing profile. Never includes email, account status, job-seeking
// details, consent timestamps, or connections-only links for non-connections.
export function publicProfile(db, viewer, targetId) {
  const { p, self } = visibleTarget(db, viewer, targetId);
  const conn = self ? { status: 'self' } : connectionState(db, viewer.id, targetId);
  const connected = self || conn.status === 'connected';
  const viewerP = self ? null : rawProfile(db, viewer.id);
  return {
    id: targetId,
    first_name: p.first_name, last_name: p.last_name,
    age_band: label(AGE_BANDS, p.age_band),
    lives_in_city: p.lives_in_city, lives_in_country: p.lives_in_country,
    desired_comuni: p.desired_comuni, desired_unknown: p.desired_unknown === 1, places: places(p),
    primary_intent: p.primary_intent,
    idea: p.idea_title ? { title: p.idea_title, description: p.idea_description, stage: label(IDEA_STAGES, p.idea_stage) } : null,
    background_area: p.background_area, current_role: p.current_role, current_company: p.current_company,
    years_experience: label(YEARS, p.years_experience),
    bio: p.bio, achievement: p.achievement, misses_italy: p.misses_italy,
    sectors: p.sectors,
    seeking: { backgrounds: p.seeking_backgrounds, description: p.seeking_description, location: label(SEEKING_LOCATION, p.seeking_location) },
    time: { commitment: label(TIME, p.time_commitment), start: label(START, p.start_when) },
    education: education(db, targetId),
    experiences: experiences(db, targetId),
    photo_url: fileUrl(p.photo_file_id),
    video_url: p.video_connections_only && !connected ? null : fileUrl(p.video_file_id),
    video_locked: !!(p.video_file_id && p.video_connections_only && !connected),
    is_looking_for_italian_job: getJobPreferences(db, targetId).looking_for_italian_job,
    links: {
      linkedin_url: p.linkedin_url, website_url: p.website_url,
      ...(connected ? { instagram_handle: p.instagram_handle, x_handle: p.x_handle, calendar_url: p.calendar_url } : { locked: true }),
    },
    connection: conn,
    complement: complement(viewerP, p),
    viewer_background: viewerP?.background_area ?? null,
  };
}

// Compact card for lists (UI Person Card shape: name, age, role, from, to, idea, seeks, tags, time, comp, job)
export function card(db, viewer, p, viewerP) {
  return {
    id: p.user_id,
    name: [p.first_name, p.last_name].filter(Boolean).join(' '),
    first_name: p.first_name,
    age: label(AGE_BANDS, p.age_band) ?? '',
    role: [p.current_role, p.current_company].filter(Boolean).join(' · '),
    from: p.lives_in_city ?? '',
    to: p.desired_comuni.slice(0, 2).join(', ') || (p.desired_unknown ? 'Non lo sa ancora' : ''),
    idea: p.primary_intent === 'has_idea',
    idea_title: p.idea_title,
    seeks: p.seeking_backgrounds.join(', '),
    tags: p.sectors.slice(0, 3).join(' · '),
    time: label(TIME, p.time_commitment) ?? '',
    comp: complement(viewerP, p),
    job: getJobPreferences(db, p.user_id).looking_for_italian_job,
    photo_url: fileUrl(p.photo_file_id),
    connection: connectionState(db, viewer.id, p.user_id),
  };
}

// --- Discover (26a) ----------------------------------------------------------------------

const FACETS = {
  lives: (p, v) => !v || p.lives_in === v,
  intent: (p, v) => !v.length || v.includes(p.primary_intent),
  backgrounds: (p, v) => !v.length || v.includes(p.background_area),
  sectors: (p, v) => !v.length || v.some(s => p.sectors.includes(s)),
  desired: (p, v, f) => !v.length || v.some(c => p.desired_comuni.includes(c)) || (f.include_unknown && p.desired_unknown === 1),
  time: (p, v) => !v || p.time_commitment === v,
  age: (p, v) => !v.length || v.includes(p.age_band),
  job: (p, v, f, db) => !v || getJobPreferences(db, p.user_id).looking_for_italian_job,
  q: (p, v) => !v || [p.first_name, p.last_name, p.current_role, p.current_company, p.lives_in_city, p.idea_title, ...p.sectors, ...p.desired_comuni]
    .filter(Boolean).join(' ').toLowerCase().includes(v),
};

export function parseDiscoverQuery(q) {
  const arr = k => (q.get(k) ? q.get(k).split(',').map(s => s.trim()).filter(Boolean).slice(0, 20) : []);
  return {
    lives: ['italy', 'abroad'].includes(q.get('lives')) ? q.get('lives') : '',
    intent: arr('intent').filter(x => ['has_idea', 'seeking_idea'].includes(x)),
    backgrounds: arr('backgrounds').filter(x => AREAS.includes(x)),
    sectors: arr('sectors').filter(x => SECTORS.includes(x)),
    desired: arr('desired'),
    include_unknown: q.get('include_unknown') === '1',
    time: ['full_time', 'part_time'].includes(q.get('time')) ? q.get('time') : '',
    age: arr('age').filter(x => values(AGE_BANDS).includes(x)),
    job: q.get('job') === '1',
    q: (q.get('q') || '').trim().toLowerCase().slice(0, 80),
  };
}

export function discover(db, viewer, filters) {
  const rows = db.prepare(
    `SELECT p.* FROM profiles p JOIN users u ON u.id = p.user_id
     WHERE u.status = 'approved' AND p.visible = 1 AND u.id != ?
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))
     ORDER BY p.approved_at DESC`,
  ).all(viewer.id, viewer.id, viewer.id).map(p => {
    for (const f of JSON_FIELDS) p[f] = JSON.parse(p[f]);
    return p;
  });
  const passes = (p, except) => Object.entries(FACETS).every(([k, fn]) => k === except || fn(p, filters[k], filters, db));
  const results = rows.filter(p => passes(p));
  const count = (facet, test) => rows.filter(p => passes(p, facet) && test(p)).length;
  const viewerP = rawProfile(db, viewer.id);
  return {
    total: results.length,
    people: results.slice(0, 60).map(p => card(db, viewer, p, viewerP)),
    counts: {
      intent: { has_idea: count('intent', p => p.primary_intent === 'has_idea'), seeking_idea: count('intent', p => p.primary_intent === 'seeking_idea') },
      backgrounds: Object.fromEntries(AREAS.map(a => [a, count('backgrounds', p => p.background_area === a)])),
      desired: Object.fromEntries(filters.desired.map(c => [c, count('desired', p => p.desired_comuni.includes(c))])),
    },
  };
}

// For the "N persone" hint in the comune picker (27a)
export function comuneCounts(db) {
  const counts = {};
  for (const { desired_comuni } of db.prepare(
    `SELECT p.desired_comuni FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.status = 'approved' AND p.visible = 1`,
  ).all()) for (const c of JSON.parse(desired_comuni)) counts[c] = (counts[c] || 0) + 1;
  return counts;
}

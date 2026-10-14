import { AREA_OTHER, AREA_OTHER_MAX, AREAS, SEEK_MAX, seeksAny, seeksLabel, areaKey, ageBandFor, COMUNI, IDEA_STAGES, label, orList, REGIONS, SECTORS, SEEKING_LOCATION, SOURCES, YEARS } from './catalog.js';
import { newId, now, tx } from './db.js';
import { cardFields } from '../public/app/card-fields.js';
import { paginate } from './paging.js';
import { hit, terms, wordsOf } from './search.js';
import { HttpError, bad, handle, httpsUrl, linkedinUrl, list, oneOf, only, text } from './validate.js';

// A: has an idea, B: looking for one with others, C: networking only (no idea step)
const INTENTS = ['has_idea', 'seeking_idea', 'networking'];

const values = pairs => pairs.map(p => p[0]);
const bool = (v, f) => { if (v === undefined) return undefined; if (v === true || v === false) return v ? 1 : 0; throw bad('invalid_field', `${f} non valido`); };
const subset = (v, allowed, f, max) => {
  const l = list(v, f, { maxItems: max });
  if (l === undefined) return undefined;
  for (const x of l) if (!allowed.includes(x)) throw bad('invalid_field', `${f}: “${x}” non valido`);
  return l;
};

// When the member came back to Italy. They pick a span relative to today ("3–12 mesi fa"); we
// store it as a month range (arrived_after..arrived_before, 'YYYY-MM') so the span shown later
// follows the calendar: "0–3 mesi fa" picked in March reads "3–12 mesi fa" by the summer.
export const ARRIVED_WHEN = [['0_3m', '0–3 mesi fa', 0, 3], ['3_12m', '3–12 mesi fa', 3, 12], ['1_2y', '1–2 anni fa', 12, 24], ['2y_plus', 'Più di 2 anni fa', 24, null]];
const monthIndex = ym => { const [y, m] = ym.split('-').map(Number); return y * 12 + m - 1; };
const monthText = i => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const thisMonth = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };

export function arrivedRange(when, now = thisMonth()) {
  const w = ARRIVED_WHEN.find(x => x[0] === when);
  return { arrived_after: w[3] === null ? null : monthText(now - w[3]), arrived_before: monthText(now - w[2]) };
}

// The span that fits the stored range today, or null
// Who lives abroad: when they'd move, kept as answered
export const MOVE_WHEN = [['0_3m', '0–3 mesi'], ['4_12m', '4–12 mesi'], ['unknown', 'Non lo so ancora']];
export const moveWhen = p => p.move_when ?? null;
// "tra 0–3 mesi", "non lo sa ancora" (only who lives abroad)
export const moveLabel = p => (p.lives_in !== 'abroad' || !p.move_when ? null : p.move_when === 'unknown' ? 'non lo sa ancora' : `tra ${MOVE_WHEN.find(x => x[0] === p.move_when)?.[1]}`);

// As answered: "0–3 mesi fa" stays so (it doesn't age by itself); older answers without the choice
// are read from their range
export function arrivedWhen(p, now = thisMonth()) {
  if (p.arrived_choice) return p.arrived_choice;
  if (!p.arrived_before) return null;
  if (!p.arrived_after) return '2y_plus';
  const ago = now - (monthIndex(p.arrived_after) + monthIndex(p.arrived_before)) / 2;
  return (ARRIVED_WHEN.find(x => x[3] !== null && ago < x[3]) ?? ARRIVED_WHEN.at(-1))[0];
}

// "Da Londra, Regno Unito · 3–12 mesi fa", or null
export function arrivedText(p) {
  const where = [p.arrived_from_city, p.arrived_from_country].filter(Boolean).join(', ');
  const when = ARRIVED_WHEN.find(x => x[0] === arrivedWhen(p))?.[1].toLowerCase();
  return where ? [`Da ${where}`, when].filter(Boolean).join(' · ') : null;
}

// Already back in Italy: where they live is where they wanted to be, so
// "Dove vorresti vivere" isn't asked and follows the city they live in (updateProfile, db.js)
export const isBack = p => p.lives_in === 'italy';
// The member's own city: where they live once back, else where they'd like to move (lib.js myPlace)
export const myPlace = p => (p.lives_in === 'italy' ? p.lives_in_city || null : p.desired_unknown ? null : orList(p.desired_comuni || []) || null);

const EDITABLE = {
  lives_in: v => oneOf(v, ['italy', 'abroad'], 'Dove vivi'),
  lives_in_country: v => text(v, 'Paese', { max: 60 }),
  lives_in_city: v => text(v, 'Città', { max: 80 }),
  arrived_from_country: v => text(v, 'Paese di provenienza', { max: 60 }),
  arrived_from_city: v => text(v, 'Città di provenienza', { max: 80 }),
  arrived_when: v => oneOf(v, ARRIVED_WHEN.map(x => x[0]), 'Quando è stato il rientro'),
  move_when: v => oneOf(v, MOVE_WHEN.map(x => x[0]), 'Quando vorresti trasferirti'),
  desired_comuni: v => list(v, 'Comuni', { maxItems: 10, maxLen: 80 }),
  desired_unknown: v => bool(v, 'Non lo so ancora'),
  primary_intent: v => oneOf(v, INTENTS, 'Obiettivo'),
  idea_title: v => text(v, 'Titolo dell’idea', { max: 140 }),
  idea_description: v => text(v, 'Descrivi la tua idea', { max: 1000 }),
  idea_stage: v => oneOf(v, values(IDEA_STAGES), 'A che punto sei'),
  first_name: v => text(v, 'Nome', { max: 60 }),
  last_name: v => text(v, 'Cognome', { max: 60 }),
  birth_year: v => {
    if (v === undefined || v === null || v === '') return v === '' ? null : v;
    const y = new Date().getFullYear();
    if (!Number.isInteger(v) || v > y - 18 || v < y - 100) throw bad('invalid_field', 'Indica un anno di nascita valido: su Rientro si entra da maggiorenni.');
    return v;
  },
  bio: v => text(v, 'Su di me', { max: 600 }),
  background_area: v => (AREAS.includes(v) ? v : text(v, 'Background', { max: AREA_OTHER_MAX })),
  current_role: v => text(v, 'Ruolo attuale', { max: 80 }),
  current_company: v => text(v, 'Azienda', { max: 80 }),
  years_experience: v => oneOf(v, values(YEARS), 'Anni di esperienza'),
  achievement: v => text(v, 'Risultato', { max: 400 }),
  sectors: v => subset(v, SECTORS, 'Settori', 5),
  seeking_backgrounds: v => {
    const l = subset(v, AREAS, 'Chi stai cercando', AREAS.length);
    if (l && l.length > SEEK_MAX && !seeksAny(l)) throw bad('invalid_field', `Chi stai cercando: fino a ${SEEK_MAX}, oppure Indifferente`);
    return l;
  },
  seeking_description: v => text(v, 'Descrivi la persona che cerchi', { max: 400 }),
  seeking_location: v => oneOf(v, values(SEEKING_LOCATION), 'Dove dovrebbe vivere'),
  misses_italy: v => text(v, 'Cosa ti manca di casa', { max: 200 }),
  linkedin_url: v => linkedinUrl(v, 'LinkedIn'),
  website_url: v => httpsUrl(v, 'Sito'),
  instagram_handle: v => handle(v, 'Instagram'),
  x_handle: v => handle(v, 'X'),
  calendar_url: v => httpsUrl(v, 'Link calendario'),
  source: v => oneOf(v, SOURCES, 'Come hai conosciuto Rientro'),
  onboarding_step: v => text(v, 'step', { max: 20 }),
  // Who came through an invite link: ask the inviter to connect once the profile is online (invites.js)
  invite_connect: v => (v === null ? null : bool(v, 'Connessione')),
  invite_note: v => text(v, 'Nota', { max: 300 }),
};

const JSON_FIELDS = new Set(['desired_comuni', 'sectors', 'seeking_backgrounds']);

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
  const { user_id, pending_changes, ...rest } = p;
  return {
    ...rest,
    desired_unknown: p.desired_unknown === 1,
    arrived_when: arrivedWhen(p),
    move_when: moveWhen(p),
    invite_connect: p.invite_connect === null ? null : p.invite_connect === 1,
    visible: p.visible === 1,
    photo_url: fileUrl(p.photo_file_id),
    video_url: fileUrl(p.video_file_id),
    education: education(db, userId),
    experiences: experiences(db, userId),
  };
}

// No review: what the member saves is what the others see. (Kept as a name: used all over.)
export const effectiveProfile = getOwnProfile;

export function updateProfile(db, user, body) {
  only(body, Object.keys(EDITABLE));
  const current = rawProfile(db, user.id);
  const live = {};
  for (const [key, parse] of Object.entries(EDITABLE)) {
    const v = parse(body[key]);
    if (v === undefined) continue;
    live[key] = JSON_FIELDS.has(key) ? JSON.stringify(v) : v;
  }
  const next = { ...current, ...live };
  // arrived_when is a span relative to today: stored as a month range, and moved only when the
  // member picks a different span (re-saving the same answer keeps the original dates)
  if ('arrived_when' in live) {
    const when = live.arrived_when;
    delete live.arrived_when;
    if (when === null) Object.assign(live, { arrived_after: null, arrived_before: null, arrived_choice: null });
    else if (when !== arrivedWhen(current)) Object.assign(live, arrivedRange(when), { arrived_choice: when });
  }
  // The birth year stays private: others see the age band, kept in step here and every day after
  if ('birth_year' in live) {
    if (live.birth_year === null && user.status !== 'onboarding') throw bad('invalid_field', 'Indica il tuo anno di nascita.');
    live.age_band = ageBandFor(live.birth_year);
  }
  // "Vivo fuori" includes the North, and the city before coming back may be Italian too
  if (body.lives_in === 'italy') live.lives_in_country = 'Italia';
  const after = { ...current, ...live };
  if (isBack(after) && after.lives_in_city) Object.assign(live, { desired_comuni: JSON.stringify([after.lives_in_city]), desired_unknown: 0 });
  const keys = Object.keys(live);
  if (!keys.length) return effectiveProfile(db, user.id);
  const params = { $user_id: user.id, $ts: now() };
  for (const k of keys) params[`$${k}`] = live[k];
  db.prepare(`UPDATE profiles SET ${keys.map(k => `${k} = $${k}`).join(', ')}, updated_at = $ts WHERE user_id = $user_id`).run(params);
  return effectiveProfile(db, user.id);
}

// Before there was no review, edits by members already online waited here: apply them (db.js, once)
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
  // aaaa-mm (typed as mm/aaaa in the browser)
  const month = (v, f) => { const t = text(v, f, { max: 7 }) ?? null; if (t && !/^\d{4}-(0[1-9]|1[0-2])$/.test(t)) throw bad('invalid_field', `${f}: scrivi la data come mm/aaaa`); return t; };
  const start = month(body.start_month, 'Inizio');
  const end = body.current ? null : month(body.end_month, 'Fine');
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
  syncCurrentJob(db, userId);
  return experiences(db, userId);
}

// The role shown on cards and profiles ("Product Manager · Zalando") is the job marked "Lavoro ancora
// qui" in Esperienze (onboarding asks it there), kept in current_role / current_company
export function syncCurrentJob(db, userId) {
  const job = db.prepare('SELECT role, company FROM experiences WHERE user_id = ? AND current = 1 ORDER BY start_month DESC, position LIMIT 1').get(userId);
  db.prepare('UPDATE profiles SET current_role = ?, current_company = ? WHERE user_id = ?').run(job?.role || null, job?.company || null, userId);
}

export function deleteRow(db, table, userId, id) {
  if (!['education', 'experiences'].includes(table)) throw new Error('bad table');
  const r = db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(id, userId);
  if (!r.changes) throw new HttpError(404, 'not_found');
  if (table === 'experiences') syncCurrentJob(db, userId);
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
  if (!p.birth_year) missing.push('Anno di nascita');
  if (!p.background_area) missing.push('Background');
  if (!p.seeking_backgrounds.length) missing.push('Chi stai cercando');
  return missing;
}

// End of onboarding: the profile goes online straight away (no review; moderation acts afterwards:
// photo checks, reports, suspension). Status "approved" means "published".
export function publishProfile(db, user) {
  const p = effectiveProfile(db, user.id);
  const missing = missingForSubmit(p);
  if (missing.length) throw new HttpError(409, 'incomplete', `Completa: ${missing.join(', ')}.`);
  if (user.status !== 'onboarding') return;
  const ts = now();
  tx(db, () => {
    db.prepare(`UPDATE users SET status = 'approved', updated_at = ? WHERE id = ?`).run(ts, user.id);
    db.prepare('UPDATE profiles SET submitted_at = ?, approved_at = ? WHERE user_id = ?').run(ts, ts, user.id);
  });
}

// --- Relationships -----------------------------------------------------------------------

// Also true when either account is waiting to be deleted: for the other members it is as if it
// were already gone (profile, requests, connections, chats), until it is restored or erased.
export function isBlocked(db, a, b) {
  return !!db.prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').get(a, b, b, a)
    || !!db.prepare('SELECT 1 FROM users WHERE id IN (?, ?) AND deletion_requested_at IS NOT NULL').get(a, b);
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
  return { status: c.requester_id === viewerId ? 'pending_sent' : 'pending_received', id: c.id, note: c.requester_id === viewerId ? null : c.note, created_at: c.created_at };
}

// "Cerca Prodotto, il tuo background" (design Person Card / 29a)
// Affinity: how well two members fit, as a score (Scopri's "Più affini" order) and the strongest
// reason in words (the purple box on cards and profiles). Each signal adds its weight:
//   both look for each other's background  60  "Vi cercate a vicenda: …"
//   they look for your background           35  "Cerca …, il tuo background"
//   you look for theirs                     30  "Tu cerchi …: è il background di Luca"
//   the same city (to live in, or theirs)   25  "Anche Luca vuole vivere a Palermo"
//   one has an idea, the other looks for one 15 "Ha già un'idea: …" / "Cerca un'idea da costruire insieme"
//   each sector in common (up to 3)          6  "Ha scelto … e …, come te" (from two)
//   a complete profile (photo, video, about) up to 8, no words
// "Indifferente" in Chi stai cercando takes no part in the background signals.
// affinityFor(viewerP) prepares the viewer's side once, then scores any number of members.
// noIdea: the profile page, where the idea has its own box: its reason isn't repeated (the next one shows)
export function affinityFor(viewerP, { noIdea = false } = {}) {
  if (!viewerP) return () => ({ score: 0, reason: null });
  const vBg = viewerP.background_area;
  const vSeek = seeksAny(viewerP.seeking_backgrounds) ? new Set() : new Set(viewerP.seeking_backgrounds);
  const vPlaces = new Set(viewerP.lives_in === 'italy' ? [viewerP.lives_in_city].filter(Boolean) : viewerP.desired_comuni);
  const vSectors = new Set(viewerP.sectors);
  return p => {
    let score = 0;
    const reasons = []; // [weight, words]
    const add = (w, words) => { score += w; if (words) reasons.push([w, words]); };
    const theySeekYou = !!vBg && !seeksAny(p.seeking_backgrounds) && p.seeking_backgrounds.includes(vBg);
    const youSeekThem = !!p.background_area && vSeek.has(p.background_area);
    if (theySeekYou && youSeekThem) add(60, `Vi cercate a vicenda: ${p.first_name} cerca ${vBg}, tu cerchi ${p.background_area}`);
    else if (theySeekYou) add(35, `Cerca ${vBg}, il tuo background`);
    else if (youSeekThem) add(30, `Tu cerchi ${p.background_area}: è il background di ${p.first_name}`);
    const theirPlaces = p.lives_in === 'italy' ? [p.lives_in_city].filter(Boolean) : p.desired_comuni;
    const city = theirPlaces.find(c => vPlaces.has(c));
    if (city) add(25, p.lives_in === 'italy' ? `${p.first_name} vive già a ${city}` : `Anche ${p.first_name} vuole vivere a ${city}`);
    if (viewerP.primary_intent === 'seeking_idea' && p.primary_intent === 'has_idea') add(15, noIdea ? null : p.idea_title ? `Ha già un'idea: ${p.idea_title}` : "Ha già un'idea e cerca con chi costruirla");
    else if (viewerP.primary_intent === 'has_idea' && p.primary_intent === 'seeking_idea') add(15, "Cerca un'idea da costruire insieme");
    const shared = p.sectors.filter(x => vSectors.has(x));
    if (shared.length) add(6 * Math.min(shared.length, 3), shared.length >= 2 ? `Ha scelto ${shared[0]} e ${shared[1]}, come te` : null);
    add((p.photo_file_id ? 3 : 0) + (p.video_file_id ? 3 : 0) + (p.bio ? 2 : 0));
    reasons.sort((a, b) => b[0] - a[0]);
    return { score, reason: reasons[0]?.[1] ?? null };
  };
}
export const complement = (viewerP, p) => affinityFor(viewerP)(p).reason;

const places = p => (p.desired_comuni.length ? orList(p.desired_comuni) : p.desired_unknown ? 'Non lo sa ancora' : '—');

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
// asMember: your own profile exactly as another member (not connected with you) sees it, for the
// "Anteprima" (connections-only links and video stay locked, no connection, no match hint)
export function publicProfile(db, viewer, targetId, { asMember = false } = {}) {
  const { p, self } = visibleTarget(db, viewer, targetId);
  const preview = self && asMember;
  const conn = preview ? { status: 'none' } : self ? { status: 'self' } : connectionState(db, viewer.id, targetId);
  const connected = !preview && (self || conn.status === 'connected');
  const viewerP = self ? null : rawProfile(db, viewer.id);
  return {
    id: targetId,
    first_name: p.first_name, last_name: p.last_name,
    // the age is never shown, to anyone (not even you or the admins): only kept, from the birth year
    lives_in_city: p.lives_in_city, lives_in_country: p.lives_in_country,
    arrived: p.lives_in === 'italy' ? arrivedText(p) : null,
    move: moveLabel(p), // "0–3 mesi": when they'd move (only who lives abroad)
    desired_comuni: p.desired_comuni, desired_unknown: p.desired_unknown === 1, places: places(p), back: isBack(p),
    primary_intent: p.primary_intent,
    idea: p.primary_intent === 'has_idea' && p.idea_title ? { title: p.idea_title, description: p.idea_description, stage: label(IDEA_STAGES, p.idea_stage) } : null,
    background_area: p.background_area, current_role: p.current_role, current_company: p.current_company,
    // as on the Scopri card (card-fields.js): "Product Manager da Zalando", back from "Londra"
    job: cardFields(p, YEARS).job, back_from: cardFields(p, YEARS).back_from,
    years_experience: label(YEARS, p.years_experience),
    bio: p.bio, achievement: p.achievement, misses_italy: p.misses_italy,
    sectors: p.sectors,
    // "a Palermo": the member's own city, when they look only there
    seeking: { backgrounds: p.seeking_backgrounds, label: seeksLabel(p.seeking_backgrounds), any: seeksAny(p.seeking_backgrounds), description: p.seeking_description, location: p.seeking_location === 'same_city' && myPlace(p) ? `a ${myPlace(p)}` : null },
    education: education(db, targetId),
    experiences: experiences(db, targetId),
    photo_url: fileUrl(p.photo_file_id),
    video_url: fileUrl(p.video_file_id), // every member sees it
    // "Dove trovarti": all of it only for connections
    links: connected
      ? { linkedin_url: p.linkedin_url, website_url: p.website_url, instagram_handle: p.instagram_handle, x_handle: p.x_handle, calendar_url: p.calendar_url }
      : { locked: true },
    // your own preview: your links, to see which ones your connections get
    ...(self ? { own_links: { linkedin_url: p.linkedin_url, website_url: p.website_url, instagram_handle: p.instagram_handle, x_handle: p.x_handle, calendar_url: p.calendar_url } } : {}),
    connection: conn,
    complement: affinityFor(viewerP, { noIdea: true })(p).reason,
    viewer_background: viewerP?.background_area ?? null,
  };
}

// Compact card for lists (UI Person Card shape: name, age, role, from, to, idea, seeks, tags, time, comp)
// filters (Scopri): what the search filtered by shows on the card too: the background, the
// sectors and the places chosen come first (cards show three)
export function card(db, viewer, p, viewerP, filters = null) {
  const first = (list, wanted) => [...list.filter(wanted), ...list.filter(x => !wanted(x))];
  const sectors = filters?.sectors?.length ? first(p.sectors, s => filters.sectors.includes(s)) : p.sectors;
  const places = filters?.desired?.length ? first(p.desired_comuni, c => filters.desired.some(pl => wantsPlace({ desired_comuni: [c] }, pl))) : p.desired_comuni;
  return {
    id: p.user_id,
    ...cardFields(p, YEARS, { places, sectors }), // the same in Il tuo profilo's preview
    role: [p.current_role, p.current_company].filter(Boolean).join(' · '),
    seeks: seeksLabel(p.seeking_backgrounds),
    // filtering by goal: what they want to build
    idea_line: filters?.intent?.includes('has_idea') && p.primary_intent === 'has_idea' && p.idea_title ? p.idea_title : null,
    move: filters?.move?.length ? moveLabel(p) : null,
    comp: complement(viewerP, p),
    photo_url: fileUrl(p.photo_file_id),
    connection: connectionState(db, viewer.id, p.user_id),
  };
}

// --- Discover (26a) ----------------------------------------------------------------------

// "Dove vuole vivere" takes comuni and whole regions, written "Sicilia (regione)" (Molise is also a
// comune): a region matches anyone who chose at least one comune in it
const REGION_SUFFIX = ' (regione)';
const regionsOf = new Map();
for (const [name, , region] of COMUNI) regionsOf.set(name, (regionsOf.get(name) || new Set()).add(region));
const regionOf = place => (place.endsWith(REGION_SUFFIX) && REGIONS.includes(place.slice(0, -REGION_SUFFIX.length)) ? place.slice(0, -REGION_SUFFIX.length) : null);
function wantsPlace(p, place) {
  const region = regionOf(place);
  return region ? p.desired_comuni.some(c => regionsOf.get(c)?.has(region)) : p.desired_comuni.includes(place);
}

const FACETS = {
  lives: (p, v) => !v || p.lives_in === v,
  intent: (p, v) => !v.length || v.includes(p.primary_intent),
  backgrounds: (p, v) => !v.length || v.includes(areaKey(p.background_area)),
  sectors: (p, v) => !v.length || v.some(s => p.sectors.includes(s)),
  // "Trasferimento": who lives abroad by their answer, or "Già rientrato/a" (back = lives in Italy)
  move: (p, v) => !v.length || (p.lives_in === 'italy' ? v.includes('back') : v.includes(moveWhen(p))),
  desired: (p, v, f) => !v.length || v.some(place => wantsPlace(p, place)) || (f.include_unknown && p.desired_unknown === 1),
  q: (p, v, f) => !v || !!searchHit(p, f.terms, f.fuzzy),
};

// Search (the top bar's, Scopri's: src/search.js): every word typed somewhere in what the profile
// shows. The parts in order of weight; a word counts where it's first found, and the result says
// where if that's outside what a result row already shows (name, role, cities: highlighted there):
// "Cita “x” in esperienza".
const SEARCH_PARTS = [
  ['', 10, p => [p.first_name, p.last_name]],
  ['', 6, p => [p.current_role, p.current_company]],
  ['', 5, p => [p.lives_in_city, p.lives_in_country, ...p.desired_comuni]],
  [p => (p.primary_intent === 'has_idea' ? 'cosa vuole costruire' : 'cosa vorrebbe costruire'), 4, p => [p.idea_title, p.idea_description]],
  ['esperienza', 3, p => (p.exp || []).flatMap(e => [e.company, e.role, e.city])],
  ['interessi', 3, p => p.sectors],
  ['presentazione', 2, p => [p.bio]],
  ['formazione', 2, p => (p.edu || []).flatMap(e => [e.school, e.degree])],
  ['background', 2, p => [p.background_area]],
  ['un risultato di cui va fiero/a', 1, p => [p.achievement]],
  ['chi cerca', 1, p => [p.seeking_description, ...p.seeking_backgrounds]],
  ['“Cosa mi manca di casa”', 1, p => [p.misses_italy]],
];
// { found, score, where, word } or null when no word is there; found: how many of the words are;
// where/word: the first one found outside what a result row shows, and where
const searchParts = new WeakMap();
export function searchHit(p, ts, fuzzy = false) {
  // split once per member: index rows keep them until the index is rebuilt
  let parts = searchParts.get(p);
  if (!parts) { parts = SEARCH_PARTS.map(([where, weight, texts]) => [where, weight, wordsOf(texts(p).filter(Boolean).join(' '))]); searchParts.set(p, parts); }
  let found = 0, score = 0, where = '', word = '';
  for (const t of ts) {
    const part = parts.find(([, , words]) => hit(t, words, fuzzy));
    if (!part) continue;
    found++;
    score += part[1];
    if (part[0] && !where) { where = typeof part[0] === 'function' ? part[0](p) : part[0]; word = t; }
  }
  return found ? { found, score, where, word } : null;
}

export function parseDiscoverQuery(q) {
  // Lists are joined by "|": backgrounds and sectors have commas in them ("Business, finanza e
  // diritto"). Older addresses joined by ",": read that way when a part isn't a value as it is.
  const arr = (k, known = x => !x.includes(',')) => {
    const raw = q.get(k);
    if (!raw) return [];
    let list = raw.split('|').map(s => s.trim()).filter(Boolean);
    if (!raw.includes('|') && !known(raw.trim())) list = raw.split(/,(?! )/).map(s => s.trim()).filter(Boolean);
    return list.slice(0, 20);
  };
  return {
    lives: ['italy', 'abroad'].includes(q.get('lives')) ? q.get('lives') : '',
    intent: arr('intent').filter(x => INTENTS.includes(x)),
    backgrounds: arr('backgrounds', x => AREAS.includes(x)).filter(x => AREAS.includes(x) || x === AREA_OTHER),
    sectors: arr('sectors', x => SECTORS.includes(x)).filter(x => SECTORS.includes(x)),
    move: arr('move').filter(x => x === 'back' || MOVE_WHEN.some(m => m[0] === x)),
    desired: arr('desired'),
    include_unknown: q.get('include_unknown') === '1',
    q: (q.get('q') || '').trim().toLowerCase().slice(0, 80),
    // "Più affini" (default) or "Più recenti", over all the results, then 24 per page
    sort: q.get('sort') === 'recent' ? 'recent' : 'match',
    page: Math.max(1, Math.floor(Number(q.get('page')) || 1)),
  };
}
const DISCOVER_PER_PAGE = 24;

// --- Scopri's index --------------------------------------------------------------------------
// The members Scopri can show, kept in memory with what the search needs (their experiences and
// education; the words, split once, see searchHit). Built once; after that only the members who
// changed are read again: triggers in schema.sql note them in discover_dirty (their profile, status,
// experiences, education). Thousands of members cost a few reads per change, not a full read per
// request.
const INDEX_SQL = `SELECT p.* FROM profiles p JOIN users u ON u.id = p.user_id
  WHERE u.status = 'approved' AND p.visible = 1 AND u.deletion_requested_at IS NULL`;
let index = { db: null, rows: [], pos: new Map(), comuni: null };
const byNewest = (a, b) => (a.approved_at < b.approved_at ? 1 : a.approved_at > b.approved_at ? -1 : 0);
function indexRow(p, exp, edu) {
  for (const f of JSON_FIELDS) p[f] = JSON.parse(p[f]);
  p.exp = exp;
  p.edu = edu;
  return Object.freeze(p); // shared by every request: never changed in place
}
function rebuildIndex(db) {
  const byUser = sql => Map.groupBy(db.prepare(sql).all(), r => r.user_id);
  const exp = byUser('SELECT user_id, company, role, city FROM experiences');
  const edu = byUser('SELECT user_id, school, degree FROM education');
  const rows = db.prepare(INDEX_SQL).all().map(p => indexRow(p, exp.get(p.user_id), edu.get(p.user_id))).sort(byNewest);
  index = { db, rows, pos: new Map(rows.map((p, i) => [p.user_id, i])), comuni: null };
  db.prepare('DELETE FROM discover_dirty').run();
}
function discoverIndex(db) {
  if (index.db !== db) { rebuildIndex(db); return index; }
  const dirty = db.prepare('SELECT id, user_id FROM discover_dirty ORDER BY id').all();
  if (!dirty.length) return index;
  const ids = [...new Set(dirty.map(d => d.user_id))];
  if (ids.length > 500) { rebuildIndex(db); return index; } // a big batch (an import): read it all
  let reshape = false;
  for (const id of ids) {
    const fresh = db.prepare(`${INDEX_SQL} AND p.user_id = ?`).get(id);
    const at = index.pos.get(id);
    if (!fresh) { if (at !== undefined) { index.rows[at] = null; reshape = true; } continue; }
    const row = indexRow(fresh,
      db.prepare('SELECT user_id, company, role, city FROM experiences WHERE user_id = ?').all(id),
      db.prepare('SELECT user_id, school, degree FROM education WHERE user_id = ?').all(id));
    if (at !== undefined && index.rows[at]?.approved_at === row.approved_at) index.rows[at] = row; // same place
    else { if (at !== undefined) index.rows[at] = null; index.rows.push(row); reshape = true; }
  }
  if (reshape) {
    index.rows = index.rows.filter(Boolean).sort(byNewest);
    index.pos = new Map(index.rows.map((p, i) => [p.user_id, i]));
  }
  index.comuni = null;
  db.prepare('DELETE FROM discover_dirty WHERE id <= ?').run(dirty.at(-1).id);
  return index;
}

export function discover(db, viewer, filters) {
  // Everyone but you and whoever you blocked or blocked you (one read)
  const blocked = new Set(db.prepare('SELECT blocked_id AS id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id FROM blocks WHERE blocked_id = ?')
    .all(viewer.id, viewer.id).map(r => r.id));
  const rows = discoverIndex(db).rows.filter(p => p.user_id !== viewer.id && !blocked.has(p.user_id));
  filters = { ...filters, terms: terms(filters.q || ''), fuzzy: false };
  const keys = Object.keys(FACETS);
  // One pass over the members: who passes every filter (the results) and, for each filter, who
  // passes all the others (what its counts are made of)
  const scan = fuzzy => {
    filters.fuzzy = fuzzy;
    const results = [];
    const near = Object.fromEntries(keys.map(k => [k, []]));
    for (const p of rows) {
      let failed = null, fails = 0;
      for (const k of keys) if (!FACETS[k](p, filters[k], filters, db)) { failed = k; if (++fails > 1) break; }
      if (!fails) results.push(p);
      else if (fails === 1) near[failed].push(p);
    }
    return { results, near };
  };
  let { results, near } = scan(false);
  let fuzzy = false;
  // a search that finds nothing exactly tries once more forgiving a typo
  if (!results.length && filters.terms.length) { ({ results, near } = scan(true)); fuzzy = true; }
  const viewerP = rawProfile(db, viewer.id);
  const hits = filters.q ? new Map(results.map(p => [p, searchHit(p, filters.terms, filters.fuzzy)])) : null;
  if (hits) {
    // the best matches first: more of the words, then where they are (a name above a word in the
    // experience), then the newest
    results = [...results].sort((a, b) => hits.get(b).found - hits.get(a).found || hits.get(b).score - hits.get(a).score);
  } else if (filters.sort === 'match') {
    // The best fits first (affinityFor); the newest first among equals (the sort is stable)
    const fit = affinityFor(viewerP);
    results = results.map(p => [p, fit(p).score]).sort((a, b) => b[1] - a[1]).map(([p]) => p);
  }
  // A filter's counts: the results plus who misses only that filter, tallied in one go per filter
  const tally = (facet, keyOf, values) => {
    const out = Object.fromEntries(values.map(v => [v, 0]));
    for (const list of [results, near[facet]]) for (const p of list) { const k = keyOf(p); if (k in out) out[k]++; }
    return out;
  };
  const count = (facet, test) => results.filter(test).length + near[facet].filter(test).length;
  const pg = paginate(results, { page: filters.page ?? 1, perPage: DISCOVER_PER_PAGE },
    p => ({ ...card(db, viewer, p, viewerP, filters), ...(hits ? { match_in: hits.get(p).where, match_word: hits.get(p).word } : {}) }));
  return {
    total: pg.total, page: pg.page, pages: pg.pages, per_page: pg.per_page,
    people: pg.items, fuzzy, // only similar to what was searched (src/search.js)
    counts: {
      intent: tally('intent', p => p.primary_intent, INTENTS),
      move: tally('move', p => (p.lives_in === 'italy' ? 'back' : p.lives_in === 'abroad' ? moveWhen(p) : null), [...MOVE_WHEN.map(([m]) => m), 'back']),
      backgrounds: tally('backgrounds', p => areaKey(p.background_area), [...AREAS, AREA_OTHER]),
      desired: Object.fromEntries(filters.desired.map(c => [c, count('desired', p => wantsPlace(p, c))])),
    },
  };
}

// For the "N persone" hint in the comune picker (27a): per comune, and per region (each person once)
export function comuneCounts(db) {
  const ix = discoverIndex(db);
  if (ix.comuni) return ix.comuni;
  const counts = {};
  for (const { desired_comuni: comuni } of ix.rows) {
    for (const c of comuni) counts[c] = (counts[c] || 0) + 1;
    for (const r of new Set(comuni.flatMap(c => [...(regionsOf.get(c) || [])]))) counts[r + REGION_SUFFIX] = (counts[r + REGION_SUFFIX] || 0) + 1;
  }
  ix.comuni = counts;
  return counts;
}

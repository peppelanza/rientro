// Internal moderation and analytics (design 44–50). Every read or write of a user's personal
// data is written to admin_audit_log. Rientro Talent (B2B) is not built: there is no
// company-facing access; the CSV export is admin-only and audited row-count by row-count.
import { AGE_BANDS, SOURCES, START, TIME, label } from './catalog.js';
import { now, subjectRef, tx } from './db.js';
import { cleanupReplacedPhoto } from './files.js';
import { getJobPreferences, preferenceHistory } from './preferences.js';
import { applyPendingChanges, effectiveProfile, rawProfile } from './profiles.js';
import { notify } from './social.js';
import { HttpError, bad, list, oneOf, only, text } from './validate.js';

export function audit(db, adminId, action, targetUserId = null, details = {}) {
  db.prepare(
    `INSERT INTO admin_audit_log (admin_id, action, target_user_id, target_ref, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(adminId, action, targetUserId, targetUserId ? subjectRef(targetUserId) : null, JSON.stringify(details), now());
}

const INTENT = { has_idea: 'Ha già un\'idea', seeking_idea: 'Cerca un\'idea' };
const STATUS_LABEL = { onboarding: 'Bozza', in_review: 'In revisione', changes_requested: 'Modifiche', approved: 'Approvato', rejected: 'Rifiutato', suspended: 'Sospeso' };
const DAY = 86400_000;
const since = days => new Date(Date.now() - days * DAY).toISOString();
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const fmt = n => n.toLocaleString('it-IT');
const hoursAgo = iso => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3600_000)) : 0);
const name = p => [p?.first_name, p?.last_name].filter(Boolean).join(' ');

function allProfiles(db, where = '1 = 1', params = []) {
  return db.prepare(`SELECT u.id, u.email, u.status, u.created_at, u.last_seen_at, p.* FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE ${where}`)
    .all(...params).map(r => ({ ...r, desired_comuni: JSON.parse(r.desired_comuni || '[]'), sectors: JSON.parse(r.sectors || '[]'), seeking_backgrounds: JSON.parse(r.seeking_backgrounds || '[]'), pending_changes: JSON.parse(r.pending_changes || '{}') }));
}

const topCounts = (items, n) => {
  const m = new Map();
  for (const x of items) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
};

// --- Dashboard (44a) ----------------------------------------------------------------------

export function dashboard(db, admin, query) {
  const days = { '7': 7, '30': 30, '90': 90, all: 3650 }[query.get('period') || '30'] ?? 30;
  const from = since(days);
  const prev = since(days * 2);
  const users = allProfiles(db, "u.role = 'member'");
  const count = (sql, ...p) => db.prepare(sql).get(...p).n;
  const newUsers = users.filter(u => u.created_at >= from).length;
  const prevUsers = users.filter(u => u.created_at >= prev && u.created_at < from).length;
  const inReview = users.filter(u => u.status === 'in_review');
  const submitted = users.filter(u => u.submitted_at).length;
  const approved = users.filter(u => u.status === 'approved').length;
  const accepted = count("SELECT COUNT(*) AS n FROM connections WHERE status = 'accepted'");
  const acceptedPeriod = count("SELECT COUNT(*) AS n FROM connections WHERE status = 'accepted' AND responded_at >= ?", from);
  const messages = count('SELECT COUNT(*) AS n FROM messages');
  const msgPeriod = count('SELECT COUNT(*) AS n FROM messages WHERE created_at >= ?', from);
  const msgPrev = count('SELECT COUNT(*) AS n FROM messages WHERE created_at >= ? AND created_at < ?', prev, from);
  const jobSeekers = users.filter(u => getJobPreferences(db, u.id).looking_for_italian_job).length;
  const requests = count('SELECT COUNT(*) AS n FROM connections');
  const withMessage = count(`SELECT COUNT(*) AS n FROM connections c WHERE c.status = 'accepted' AND EXISTS (
    SELECT 1 FROM messages m WHERE (m.sender_id = c.requester_id AND m.recipient_id = c.addressee_id) OR (m.sender_id = c.addressee_id AND m.recipient_id = c.requester_id))`);
  const avgWait = inReview.length ? Math.round(inReview.reduce((s, u) => s + hoursAgo(u.submitted_at), 0) / inReview.length) : 0;
  const delta = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : `+${a}`);

  const chartDays = Math.min(days, 30);
  const signups = Array.from({ length: chartDays }, (_, i) => {
    const d0 = new Date(Date.now() - (chartDays - 1 - i) * DAY).toISOString().slice(0, 10);
    return { day: d0, signups: users.filter(u => u.created_at.slice(0, 10) === d0).length, approved: users.filter(u => (u.approved_at || '').slice(0, 10) === d0).length };
  });
  const approvedUsers = users.filter(u => u.status === 'approved');
  audit(db, admin.id, 'dashboard.view', null, { period: days });
  return {
    kpis: [
      { label: 'Utenti', value: fmt(users.length), delta: `+${fmt(newUsers)}` },
      { label: 'Nuove iscrizioni', value: fmt(newUsers), delta: delta(newUsers, prevUsers) },
      { label: 'In attesa', value: fmt(inReview.length), delta: `media ${avgWait} h`, tone: 'neutral' },
      { label: 'Profili approvati', value: fmt(approved), delta: `${pct(approved, submitted)}%` },
      { label: 'Connessioni', value: fmt(accepted), delta: `+${fmt(acceptedPeriod)}` },
      { label: 'Messaggi', value: fmt(messages), delta: delta(msgPeriod, msgPrev) },
      { label: 'Cercano lavoro', value: fmt(jobSeekers), delta: `${pct(jobSeekers, users.length)}%`, tone: 'neutral' },
    ],
    signups,
    funnel: [
      { l: 'Richieste inviate', v: fmt(requests), w: 100 },
      { l: 'Accettate', v: `${fmt(accepted)} · ${pct(accepted, requests)}%`, w: pct(accepted, requests) },
      { l: 'Con almeno un messaggio', v: `${fmt(withMessage)} · ${pct(withMessage, requests)}%`, w: pct(withMessage, requests) },
      { l: 'Tasso di approvazione', v: `${pct(approved, submitted)}%`, w: pct(approved, submitted) },
    ],
    cities: topCounts(approvedUsers.flatMap(u => u.desired_comuni), 6),
    sectors: topCounts(approvedUsers.flatMap(u => u.sectors), 6),
    intent: { has_idea: pct(approvedUsers.filter(u => u.primary_intent === 'has_idea').length, approvedUsers.length), seeking_idea: pct(approvedUsers.filter(u => u.primary_intent === 'seeking_idea').length, approvedUsers.length) },
    job: { pct: pct(jobSeekers, users.length), count: jobSeekers, total: users.length },
  };
}

// --- Users (45a) --------------------------------------------------------------------------

export function listUsers(db, admin, query) {
  const status = oneOf(query.get('status') || undefined, Object.keys(STATUS_LABEL), 'status');
  const intent = oneOf(query.get('intent') || undefined, Object.keys(INTENT), 'intent');
  const job = query.get('job');
  const place = (query.get('place') || '').trim();
  const source = query.get('source') || '';
  const q = (query.get('q') || '').trim().toLowerCase();
  const page = Math.max(1, Number(query.get('page')) || 1);
  let rows = allProfiles(db, "u.role = 'member'").sort((a, b) => b.created_at.localeCompare(a.created_at));
  rows = rows.filter(u => (!status || u.status === status) && (!intent || u.primary_intent === intent)
    && (!place || u.desired_comuni.includes(place)) && (!source || u.source === source)
    && (!q || [u.first_name, u.last_name, u.email, u.lives_in_city].filter(Boolean).join(' ').toLowerCase().includes(q)));
  if (job === '1' || job === '0') rows = rows.filter(u => getJobPreferences(db, u.id).looking_for_italian_job === (job === '1'));
  const perPage = 10;
  const slice = rows.slice((page - 1) * perPage, page * perPage);
  audit(db, admin.id, 'users.list', null, { status: status ?? 'all', intent: intent ?? 'all', job: job ?? 'all', place: place || 'all', page, count: slice.length });
  return {
    total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / perPage)),
    users: slice.map(u => ({
      id: u.id, name: name(u) || '—', email: u.email, photo_url: u.photo_file_id ? `/api/files/${u.photo_file_id}` : null,
      from: u.lives_in_city || '—', to: u.desired_comuni.slice(0, 2).join(', ') || (u.desired_unknown ? 'Non lo sa' : '—'),
      intent: INTENT[u.primary_intent] ?? '—', job: getJobPreferences(db, u.id).looking_for_italian_job ? 'Sì' : 'No',
      status: u.status, status_label: STATUS_LABEL[u.status], joined: u.created_at,
    })),
  };
}

export function getUser(db, admin, userId) {
  const user = db.prepare('SELECT id, email, role, status, created_at, last_seen_at FROM users WHERE id = ?').get(userId);
  if (!user) throw new HttpError(404, 'not_found');
  audit(db, admin.id, 'user.view', userId);
  const p = effectiveProfile(db, userId);
  const live = rawProfile(db, userId);
  const count = (sql, ...a) => db.prepare(sql).get(...a).n;
  return {
    user: { ...user, status_label: STATUS_LABEL[user.status] },
    profile: p,
    has_pending_changes: Object.keys(live.pending_changes).length > 0,
    pending_keys: Object.keys(live.pending_changes),
    job_seeking: getJobPreferences(db, userId),
    preference_history: preferenceHistory(db, userId),
    stats: {
      sent: count('SELECT COUNT(*) AS n FROM connections WHERE requester_id = ?', userId),
      received: count('SELECT COUNT(*) AS n FROM connections WHERE addressee_id = ?', userId),
      connections: count("SELECT COUNT(*) AS n FROM connections WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)", userId, userId),
      last_seen_at: user.last_seen_at,
    },
    notes: db.prepare(
      `SELECT n.id, n.body, n.created_at, a.email AS admin_email FROM admin_notes n LEFT JOIN users a ON a.id = n.admin_id WHERE n.user_id = ? ORDER BY n.id DESC`,
    ).all(userId),
    reviews: db.prepare(
      `SELECT r.action, r.note, r.created_at, a.email AS admin_email FROM review_events r LEFT JOIN users a ON a.id = r.admin_id WHERE r.user_id = ? ORDER BY r.id DESC`,
    ).all(userId),
    reports: db.prepare('SELECT id, reason, details, status, created_at FROM reports WHERE reported_id = ? ORDER BY created_at DESC').all(userId),
    labels: {
      age: label(AGE_BANDS, p.age_band), time: label(TIME, p.time_commitment), start: label(START, p.start_when), intent: INTENT[p.primary_intent] ?? null,
    },
  };
}

export function addNote(db, admin, userId, body) {
  only(body, ['body']);
  const note = text(body.body, 'Nota', { max: 1000, nullable: false });
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) throw new HttpError(404, 'not_found');
  db.prepare('INSERT INTO admin_notes (user_id, admin_id, body, created_at) VALUES (?, ?, ?, ?)').run(userId, admin.id, note, now());
  audit(db, admin.id, 'user.note', userId);
  return getUser(db, admin, userId).notes;
}

// Approve / request changes / reject / suspend (46a, 47a)
export function review(db, admin, userId, body) {
  only(body, ['action', 'note']);
  const action = oneOf(body.action, ['approve', 'request_changes', 'reject', 'suspend', 'unsuspend'], 'action', { nullable: false });
  const note = text(body.note, 'Nota', { max: 1000 }) ?? null;
  if ((action === 'request_changes' || action === 'reject') && !note) throw bad('note_required', 'Scrivi una nota per l’utente.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || user.role === 'admin') throw new HttpError(404, 'not_found');
  const live = rawProfile(db, userId);
  const hasPending = Object.keys(live.pending_changes).length > 0;
  tx(db, () => {
    const setStatus = s => db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(s, now(), userId);
    if (action === 'approve') {
      const oldPhoto = live.photo_file_id;
      applyPendingChanges(db, userId);
      const newPhoto = rawProfile(db, userId).photo_file_id;
      if (user.status !== 'approved') {
        setStatus('approved');
        db.prepare('UPDATE profiles SET approved_at = ?, review_note = NULL WHERE user_id = ?').run(now(), userId);
      }
      cleanupReplacedPhoto(db, oldPhoto, newPhoto);
      notify(db, userId, 'profile_approved', null, { changes_only: user.status === 'approved' });
    } else if (action === 'request_changes') {
      if (user.status === 'approved' && hasPending) {
        db.prepare("UPDATE profiles SET pending_changes = '{}', review_note = ? WHERE user_id = ?").run(note, userId);
      } else {
        setStatus('changes_requested');
        db.prepare('UPDATE profiles SET review_note = ? WHERE user_id = ?').run(note, userId);
      }
      notify(db, userId, 'profile_changes_requested', null, { note });
    } else if (action === 'reject') {
      setStatus('rejected');
      db.prepare('UPDATE profiles SET review_note = ? WHERE user_id = ?').run(note, userId);
      notify(db, userId, 'profile_rejected', null, { note });
    } else if (action === 'suspend') {
      setStatus('suspended');
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    } else if (action === 'unsuspend') {
      if (user.status !== 'suspended') throw bad('not_suspended');
      setStatus(live.approved_at ? 'approved' : 'in_review');
    }
    db.prepare('INSERT INTO review_events (user_id, admin_id, action, note, created_at) VALUES (?, ?, ?, ?, ?)').run(userId, admin.id, action, note, now());
  });
  audit(db, admin.id, `user.${action}`, userId, { from: user.status, pending: hasPending });
  return { status: db.prepare('SELECT status FROM users WHERE id = ?').get(userId).status };
}

// --- Approvals queue (47a) ----------------------------------------------------------------

export function approvals(db, admin) {
  const rows = allProfiles(db, "u.role = 'member' AND (u.status = 'in_review' OR (u.status = 'approved' AND p.pending_changes != '{}'))")
    .sort((a, b) => (a.submitted_at || a.updated_at).localeCompare(b.submitted_at || b.updated_at));
  const waits = rows.map(u => hoursAgo(u.status === 'in_review' ? u.submitted_at : u.updated_at));
  audit(db, admin.id, 'approvals.list', null, { count: rows.length });
  return {
    avg_wait_h: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0,
    sla_h: 24,
    queue: rows.map((u, i) => ({
      id: u.id, name: name(u) || u.email, wait_h: waits[i], kind: u.status === 'in_review' ? 'new' : 'changes',
      meta: `${u.background_area?.split(' /')[0] ?? '—'} · ${u.lives_in_city ?? '—'} → ${u.desired_comuni[0] ?? '—'}`,
      photo_url: u.photo_file_id ? `/api/files/${u.photo_file_id}` : null,
    })),
  };
}

// Automatic checks shown on the review card (47a)
export function reviewChecks(p) {
  const bio = (p.bio || '').length;
  return [
    p.photo_url ? { t: '✓ Foto', d: 'Caricata · verifica il volto', tone: 'ok' } : { t: '! Foto', d: 'Mancante', tone: 'warn' },
    p.linkedin_url ? { t: '✓ LinkedIn', d: 'Indicato', tone: 'ok' } : { t: '— LinkedIn', d: 'Non indicato', tone: 'none' },
    bio >= 150 ? { t: '✓ Su di me', d: `${bio} caratteri`, tone: 'ok' } : { t: '! Su di me', d: `Solo ${bio} caratteri`, tone: 'warn' },
    p.video_url ? { t: '✓ Video', d: 'Caricato', tone: 'ok' } : { t: '— Video', d: 'Non caricato', tone: 'none' },
  ];
}

// --- Reports (48a) ------------------------------------------------------------------------

const REASON = { fake_profile: 'Profilo falso', harassment: 'Messaggi molesti', spam: 'Spam', other: 'Altro' };

export function listReports(db, admin, query) {
  const status = query.get('status') === 'closed' ? 'closed' : 'open';
  const rows = db.prepare(
    `SELECT r.*, pr.first_name AS rf, pr.last_name AS rl, pd.first_name AS df, pd.last_name AS dl
     FROM reports r LEFT JOIN profiles pr ON pr.user_id = r.reporter_id LEFT JOIN profiles pd ON pd.user_id = r.reported_id
     WHERE ${status === 'open' ? "r.status = 'open'" : "r.status != 'open'"} ORDER BY r.created_at ${status === 'open' ? 'ASC' : 'DESC'} LIMIT 200`,
  ).all();
  const counts = db.prepare("SELECT SUM(status = 'open') AS open, SUM(status != 'open') AS closed FROM reports").get();
  // How many distinct people reported the same account (design: "3 utenti")
  const reporters = id => db.prepare("SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE reported_id = ? AND status = 'open'").get(id).n;
  audit(db, admin.id, 'reports.list', null, { status, count: rows.length });
  return {
    counts: { open: counts.open ?? 0, closed: counts.closed ?? 0 },
    reports: rows.map(r => {
      const n = reporters(r.reported_id);
      return {
        id: r.id, reported_id: r.reported_id, reporter_id: r.reporter_id,
        who: [r.df, r.dl].filter(Boolean).join(' ') || 'Account eliminato',
        by: n > 1 ? `${n} utenti` : [r.rf, r.rl].filter(Boolean).join(' ') || 'Utente',
        reason: r.reason, reason_label: REASON[r.reason], details: r.details, age_h: hoursAgo(r.created_at),
        status: r.status, resolution: r.resolution,
      };
    }),
  };
}

export function resolveReport(db, admin, id, body) {
  only(body, ['action', 'note']);
  const action = oneOf(body.action, ['dismiss', 'suspend', 'request_changes'], 'action', { nullable: false });
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!r || r.status !== 'open') throw new HttpError(404, 'not_found');
  if (action === 'suspend') review(db, admin, r.reported_id, { action: 'suspend', note: body.note });
  if (action === 'request_changes') review(db, admin, r.reported_id, { action: 'request_changes', note: body.note || 'Aggiorna il profilo seguendo le regole della community.' });
  db.prepare("UPDATE reports SET status = ?, resolution = ?, resolved_at = ?, resolved_by = ? WHERE reported_id = ? AND status = 'open'")
    .run(action === 'dismiss' ? 'dismissed' : 'resolved', action, now(), admin.id, r.reported_id);
  audit(db, admin.id, `report.${action}`, r.reported_id, { report_id: id });
  return { ok: true };
}

// "Vedi chat" (48a): only the conversation between reporter and reported, audited.
export function reportChat(db, admin, id) {
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!r || !r.reporter_id) throw new HttpError(404, 'not_found');
  audit(db, admin.id, 'report.view_chat', r.reported_id, { report_id: id });
  return db.prepare(
    `SELECT sender_id, body, created_at FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?) ORDER BY id DESC LIMIT 100`,
  ).all(r.reporter_id, r.reported_id, r.reported_id, r.reporter_id).reverse()
    .map(m => ({ from: m.sender_id === r.reported_id ? 'reported' : 'reporter', body: m.body, created_at: m.created_at }));
}

// --- Analytics (49a) ----------------------------------------------------------------------

export function analytics(db, admin, query) {
  const days = { '30': 30, '90': 90, '365': 365 }[query.get('period') || '90'] ?? 90;
  const from = since(days);
  const users = allProfiles(db, "u.role = 'member'");
  const approved = users.filter(u => u.status === 'approved');
  const count = (sql, ...p) => db.prepare(sql).get(...p).n;
  const requests = count('SELECT COUNT(*) AS n FROM connections WHERE created_at >= ?', from);
  const decided = count("SELECT COUNT(*) AS n FROM connections WHERE created_at >= ? AND status IN ('accepted', 'declined', 'expired')", from);
  const accepted = count("SELECT COUNT(*) AS n FROM connections WHERE created_at >= ? AND status = 'accepted'", from);
  const active = count('SELECT COUNT(*) AS n FROM users WHERE last_seen_at >= ?', from) || 1;
  const abroad = pct(users.filter(u => u.lives_in === 'abroad').length, users.filter(u => u.lives_in).length);
  const weeks = Array.from({ length: 13 }, (_, i) => {
    const a = since((13 - i) * 7);
    const b = since((12 - i) * 7);
    return {
      requests: count('SELECT COUNT(*) AS n FROM connections WHERE created_at >= ? AND created_at < ?', a, b),
      accepted: count("SELECT COUNT(*) AS n FROM connections WHERE created_at >= ? AND created_at < ? AND status = 'accepted'", a, b),
    };
  });
  const share = (arr, pred) => pct(arr.filter(pred).length, arr.length);
  audit(db, admin.id, 'analytics.view', null, { period: days });
  return {
    total: users.length, new_in_period: users.filter(u => u.created_at >= from).length,
    requests_per_active: (requests / active / Math.max(1, days / 30)).toFixed(1).replace('.', ','),
    acceptance: pct(accepted, decided),
    abroad, italy: 100 - abroad,
    sign_in_methods: [{ l: 'Email', v: 100 }], // LinkedIn and Google are not connected yet
    sources: SOURCES.map(s => ({ l: s, v: share(users.filter(u => u.source), u => u.source === s) })),
    top_comuni: topCounts(approved.flatMap(u => u.desired_comuni), 7).map(([n, v]) => ({ n, v })),
    distinct_comuni: new Set(approved.flatMap(u => u.desired_comuni)).size,
    unknown_pct: share(approved, u => u.desired_unknown === 1),
    composition: {
      idea: share(approved, u => u.primary_intent === 'has_idea'),
      full_time: share(approved, u => u.time_commitment === 'full_time'),
      part_time: share(approved, u => u.time_commitment === 'part_time'),
      job: share(users, u => getJobPreferences(db, u.id).looking_for_italian_job),
    },
    backgrounds: topCounts(approved.map(u => u.background_area).filter(Boolean), 5).map(([l, n]) => ({ l, v: pct(n, approved.length) })),
    weeks,
  };
}

// --- CSV export (50a) ---------------------------------------------------------------------

export const EXPORT_COLUMNS = {
  users: {
    'Nome e cognome': u => name(u), Email: u => u.email, 'Vive a': u => [u.lives_in_city, u.lives_in_country].filter(Boolean).join(', '),
    'Vuole vivere a': u => u.desired_comuni.join('; '), Intento: u => INTENT[u.primary_intent] ?? '', Background: u => u.background_area ?? '',
    Settori: u => u.sectors.join('; '), Tempo: u => label(TIME, u.time_commitment) ?? '', Fonte: u => u.source ?? '', Stato: u => STATUS_LABEL[u.status],
  },
  connections: { Da: r => r.from_name, A: r => r.to_name, Stato: r => r.status, Creata: r => r.created_at, Risposta: r => r.responded_at ?? '' },
  reports: { Segnalato: r => r.reported_name, Motivo: r => REASON[r.reason], Stato: r => r.status, Aperta: r => r.created_at },
};

const csvCell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(db, admin, body) {
  only(body, ['dataset', 'status', 'job', 'columns']);
  const dataset = oneOf(body.dataset, ['users', 'connections', 'reports'], 'dataset', { nullable: false });
  const all = Object.keys(EXPORT_COLUMNS[dataset]);
  const columns = list(body.columns, 'columns', { maxItems: all.length }) ?? all;
  for (const c of columns) if (!all.includes(c)) throw bad('invalid_field', `Colonna non valida: ${c}`);
  let rows;
  if (dataset === 'users') {
    const status = oneOf(body.status || undefined, Object.keys(STATUS_LABEL), 'status');
    rows = allProfiles(db, "u.role = 'member'").filter(u => !status || u.status === status);
    if (body.job === true) rows = rows.filter(u => getJobPreferences(db, u.id).looking_for_italian_job);
  } else if (dataset === 'connections') {
    rows = db.prepare(`SELECT c.*, pa.first_name || ' ' || pa.last_name AS from_name, pb.first_name || ' ' || pb.last_name AS to_name
      FROM connections c LEFT JOIN profiles pa ON pa.user_id = c.requester_id LEFT JOIN profiles pb ON pb.user_id = c.addressee_id`).all();
  } else {
    rows = db.prepare(`SELECT r.*, p.first_name || ' ' || p.last_name AS reported_name FROM reports r LEFT JOIN profiles p ON p.user_id = r.reported_id`).all();
  }
  const cols = columns.map(c => [c, EXPORT_COLUMNS[dataset][c]]);
  const csv = [cols.map(([c]) => csvCell(c)).join(','), ...rows.map(r => cols.map(([, f]) => csvCell(f(r))).join(','))].join('\r\n');
  audit(db, admin.id, 'export.csv', null, { dataset, rows: rows.length, columns, status: body.status ?? null, job_filter: body.job === true });
  return { filename: `${dataset}_${now().slice(0, 10)}.csv`, csv: `﻿${csv}`, rows: rows.length };
}

export function recentExports(db) {
  return db.prepare(
    `SELECT l.details, l.created_at, a.email AS admin_email FROM admin_audit_log l LEFT JOIN users a ON a.id = l.admin_id
     WHERE l.action = 'export.csv' ORDER BY l.id DESC LIMIT 5`,
  ).all().map(r => ({ ...JSON.parse(r.details), created_at: r.created_at, admin_email: r.admin_email }));
}

export function sidebarCounts(db) {
  return {
    users: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'member'").get().n,
    approvals: db.prepare(`SELECT COUNT(*) AS n FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE u.status = 'in_review' OR (u.status = 'approved' AND p.pending_changes != '{}')`).get().n,
    reports: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").get().n,
  };
}

export function auditLog(db, admin) {
  const rows = db.prepare(
    `SELECT l.id, l.action, l.target_user_id, substr(l.target_ref, 1, 12) AS target_ref, l.details, l.created_at, a.email AS admin_email
     FROM admin_audit_log l LEFT JOIN users a ON a.id = l.admin_id ORDER BY l.id DESC LIMIT 300`,
  ).all();
  audit(db, admin.id, 'audit.view');
  return rows.map(r => ({ ...r, details: JSON.parse(r.details) }));
}

export function processingRegister(db) {
  return db.prepare('SELECT * FROM processing_register ORDER BY purpose').all();
}

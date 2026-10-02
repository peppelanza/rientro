import { config, isLaunched } from './config.js';
import { newId, now, tx } from './db.js';
import { card, connectionBetween, isBlocked, rawProfile } from './profiles.js';
import { REPORT_REASONS } from './catalog.js';
import { matches, pageParams, paginate } from './paging.js';
import { HttpError, bad, bool, oneOf, only, text } from './validate.js';

// Discovery and connecting open on launch day (design 01 pre-lancio); admins can preview them before.
export function requireLaunched(user) {
  if (!isLaunched() && user.role !== 'admin' && !user.impersonated_by) {
    throw new HttpError(403, 'not_launched', 'Scoprire persone e connettersi sarà possibile dal 1° gennaio 2027.');
  }
}

function requireApproved(user) {
  if (user.status !== 'approved') {
    throw new HttpError(403, 'not_approved', 'Completa il profilo per connetterti con le altre persone.');
  }
}

const nameOf = (db, id) => {
  const p = db.prepare('SELECT first_name, last_name FROM profiles WHERE user_id = ?').get(id);
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ');
};

// --- Notifications ------------------------------------------------------------------------

export function notify(db, userId, kind, actorId = null, data = {}) {
  // Collapse bursts of messages from the same person into one unread notification.
  if (kind === 'message') {
    const existing = db.prepare("SELECT id FROM notifications WHERE user_id = ? AND kind = 'message' AND actor_id = ? AND read_at IS NULL").get(userId, actorId);
    if (existing) {
      db.prepare('UPDATE notifications SET data = ?, created_at = ? WHERE id = ?').run(JSON.stringify(data), now(), existing.id);
      return;
    }
  }
  db.prepare('INSERT INTO notifications (user_id, kind, actor_id, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, kind, actorId, JSON.stringify(data), now());
  // TODO: email channel (notify_*_email) once a transactional email provider is configured.
}

// Newest first, 20 per page (the bell asks for ?per_page=5)
export function listNotifications(db, user, query = new URLSearchParams()) {
  const perPage = Math.min(50, Math.max(1, Math.floor(Number(query.get('per_page')) || 20)));
  const total = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?').get(user.id).n;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(query.get('page')) || 1)));
  const items = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?').all(user.id, perPage, (page - 1) * perPage).map(n => {
    const actor = n.actor_id ? rawProfile(db, n.actor_id) : null;
    return {
      id: n.id, kind: n.kind, created_at: n.created_at, read: !!n.read_at, data: JSON.parse(n.data),
      actor: actor && { id: n.actor_id, name: nameOf(db, n.actor_id), first_name: actor.first_name, photo_url: actor.photo_file_id ? `/api/files/${actor.photo_file_id}` : null },
    };
  });
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(user.id).n;
  return { items, total, page, pages, per_page: perPage, unread };
}

export function markNotificationsRead(db, user) {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now(), user.id);
}

export function badgeCounts(db, user) {
  return {
    received: db.prepare("SELECT COUNT(*) AS n FROM connections WHERE addressee_id = ? AND status = 'pending'").get(user.id).n,
    unread_messages: db.prepare('SELECT COUNT(DISTINCT sender_id) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL').get(user.id).n,
    notifications: db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(user.id).n,
  };
}

// --- Connections (30a, 31a–33a) -----------------------------------------------------------

export function requestConnection(db, viewer, body) {
  only(body, ['to', 'note']);
  requireLaunched(viewer);
  requireApproved(viewer);
  const to = text(body.to, 'to', { max: 64, nullable: false });
  const note = text(body.note, 'Nota', { max: 300 }) ?? null;
  if (to === viewer.id) throw bad('self');
  const target = db.prepare("SELECT id FROM users WHERE id = ? AND status = 'approved' AND deletion_requested_at IS NULL").get(to);
  if (!target || isBlocked(db, viewer.id, to)) throw new HttpError(404, 'not_found', 'Profilo non disponibile.');
  const existing = connectionBetween(db, viewer.id, to);
  if (existing) throw new HttpError(409, 'already', existing.status === 'accepted' ? 'Siete già connessi.' : 'C’è già una richiesta in sospeso.');
  const id = newId();
  db.prepare("INSERT INTO connections (id, requester_id, addressee_id, status, note, created_at) VALUES (?, ?, ?, 'pending', ?, ?)")
    .run(id, viewer.id, to, note, now());
  notify(db, to, 'connection_request', viewer.id, { connection_id: id });
  return { id, status: 'pending_sent' };
}

export function respondConnection(db, viewer, id, action) {
  const c = db.prepare('SELECT * FROM connections WHERE id = ?').get(id);
  if (!c || c.status !== 'pending') throw new HttpError(404, 'not_found', 'Richiesta non più disponibile.');
  if (action === 'withdraw') {
    if (c.requester_id !== viewer.id) throw new HttpError(404, 'not_found');
    db.prepare("UPDATE connections SET status = 'withdrawn', responded_at = ? WHERE id = ?").run(now(), id);
    db.prepare("DELETE FROM notifications WHERE kind = 'connection_request' AND user_id = ? AND actor_id = ?").run(c.addressee_id, viewer.id);
    return { status: 'none' };
  }
  if (c.addressee_id !== viewer.id) throw new HttpError(404, 'not_found');
  if (action === 'accept') {
    db.prepare("UPDATE connections SET status = 'accepted', responded_at = ? WHERE id = ?").run(now(), id);
    notify(db, c.requester_id, 'connection_accepted', viewer.id, { connection_id: id });
    return { status: 'connected', other_id: c.requester_id };
  }
  // Declining is silent (design 31a: "Se rifiuti, Marco non riceve alcuna notifica.")
  db.prepare("UPDATE connections SET status = 'declined', responded_at = ? WHERE id = ?").run(now(), id);
  return { status: 'none' };
}

function allConnections(db, viewer) {
  const viewerP = rawProfile(db, viewer.id);
  const toCard = (otherId, extra) => {
    const p = rawProfile(db, otherId);
    return { ...card(db, viewer, p, viewerP), ...extra };
  };
  const rows = db.prepare(
    `SELECT * FROM connections WHERE (requester_id = ? OR addressee_id = ?) AND status IN ('pending', 'accepted') ORDER BY COALESCE(responded_at, created_at) DESC`,
  ).all(viewer.id, viewer.id).filter(c => !isBlocked(db, c.requester_id, c.addressee_id));
  return {
    connected: rows.filter(c => c.status === 'accepted').map(c => toCard(c.requester_id === viewer.id ? c.addressee_id : c.requester_id, { connection_id: c.id, since: c.responded_at })),
    received: rows.filter(c => c.status === 'pending' && c.addressee_id === viewer.id).map(c => toCard(c.requester_id, { connection_id: c.id, note: c.note, created_at: c.created_at })),
    sent: rows.filter(c => c.status === 'pending' && c.requester_id === viewer.id).map(c => toCard(c.addressee_id, { connection_id: c.id, created_at: c.created_at })),
  };
}

// One tab at a time (?tab=connected|received|sent), searchable (?q= name, role, cities), 20 per page;
// the counts of all three tabs come along
export function listConnections(db, viewer, query = new URLSearchParams()) {
  const all = allConnections(db, viewer);
  const tab = ['received', 'sent'].includes(query.get('tab')) ? query.get('tab') : 'connected';
  const pp = pageParams(query, 20);
  const rows = all[tab].filter(c => matches(pp.q, c.name, c.role, c.from, c.to));
  return {
    tab, counts: { connected: all.connected.length, received: all.received.length, sent: all.sent.length },
    ...paginate(rows, pp),
  };
}

export function getRequest(db, viewer, id) {
  const c = db.prepare('SELECT * FROM connections WHERE id = ? AND addressee_id = ?').get(id, viewer.id);
  if (!c || isBlocked(db, c.requester_id, viewer.id)) throw new HttpError(404, 'not_found');
  return { id: c.id, status: c.status, note: c.note, created_at: c.created_at, from_id: c.requester_id };
}

// --- Messages (35a) -----------------------------------------------------------------------

function requireConnected(db, a, b) {
  const c = connectionBetween(db, a, b);
  if (!c || c.status !== 'accepted' || isBlocked(db, a, b)) throw new HttpError(403, 'not_connected', 'Potete scrivervi solo dopo che la connessione è stata accettata.');
  return c;
}

// Conversations, latest first; searchable by name (?q=), 30 per page
export function listThreads(db, viewer, query = new URLSearchParams()) {
  const { connected } = allConnections(db, viewer);
  const pp = pageParams(query, 30);
  const threads = connected.filter(c => matches(pp.q, c.name)).map(c => {
    const last = db.prepare(
      'SELECT * FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?) ORDER BY id DESC LIMIT 1',
    ).get(viewer.id, c.id, c.id, viewer.id);
    const unread = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL').get(c.id, viewer.id).n;
    return {
      id: c.id, name: c.name, role: c.role, photo_url: c.photo_url,
      last: last ? `${last.sender_id === viewer.id ? 'Tu: ' : ''}${last.body}` : 'Nuova connessione: scrivi per primo',
      time: last?.created_at ?? c.since, unread: unread > 0,
    };
  }).sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  return paginate(threads, pp);
}

// Opening a chat: the latest 50 messages, and older ones 50 at a time (?before=<id>);
// polling for new ones: everything after the last one shown (?after=<id>)
const THREAD_PAGE = 50;
export function getThread(db, viewer, otherId, { after = 0, before = 0 } = {}) {
  const c = requireConnected(db, viewer.id, otherId);
  db.prepare('UPDATE messages SET read_at = ? WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL').run(now(), otherId, viewer.id);
  db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND kind = 'message' AND actor_id = ? AND read_at IS NULL").run(now(), viewer.id, otherId);
  const pair = '((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))';
  const args = [viewer.id, otherId, otherId, viewer.id];
  const rows = after
    ? db.prepare(`SELECT id, sender_id, body, created_at, read_at FROM messages WHERE ${pair} AND id > ? ORDER BY id LIMIT 500`).all(...args, after)
    : db.prepare(`SELECT id, sender_id, body, created_at, read_at FROM messages WHERE ${pair} ${before ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`)
      .all(...args, ...(before ? [before] : []), THREAD_PAGE).reverse();
  const messages = rows.map(m => ({ ...m, mine: m.sender_id === viewer.id }));
  const hasOlder = !after && rows.length > 0 && !!db.prepare(`SELECT 1 FROM messages WHERE ${pair} AND id < ? LIMIT 1`).get(...args, rows[0].id);
  return { connection: { id: c.id, since: c.responded_at, note: c.note, note_from_me: c.requester_id === viewer.id }, messages, has_older: hasOlder };
}

export function sendMessage(db, viewer, otherId, body) {
  only(body, ['body']);
  const msg = text(body.body, 'Messaggio', { max: 4000, nullable: false });
  requireConnected(db, viewer.id, otherId);
  const r = db.prepare('INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)').run(viewer.id, otherId, msg, now());
  notify(db, otherId, 'message', viewer.id, { preview: msg.slice(0, 80) });
  return { id: Number(r.lastInsertRowid), sender_id: viewer.id, body: msg, created_at: now(), mine: true };
}

// --- Blocks & reports (42a, 43a) ----------------------------------------------------------

export function block(db, viewer, targetId) {
  if (targetId === viewer.id) throw bad('self');
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(targetId)) throw new HttpError(404, 'not_found');
  tx(db, () => {
    db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(viewer.id, targetId, now());
    // "La connessione e la chat vengono chiuse." Blocked person gets no notification.
    db.prepare(
      `UPDATE connections SET status = 'withdrawn', responded_at = ?
       WHERE status IN ('pending', 'accepted') AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`,
    ).run(now(), viewer.id, targetId, targetId, viewer.id);
  });
}

export function unblock(db, viewer, targetId) {
  db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(viewer.id, targetId);
}

// Searchable by name (?q=), 20 per page
export function listBlocked(db, viewer, query = new URLSearchParams()) {
  const pp = pageParams(query, 20);
  const rows = db.prepare('SELECT blocked_id, created_at FROM blocks WHERE blocker_id = ? ORDER BY created_at DESC').all(viewer.id)
    .map(b => ({ id: b.blocked_id, name: nameOf(db, b.blocked_id) || 'Utente', since: b.created_at }))
    .filter(b => matches(pp.q, b.name));
  return paginate(rows, pp);
}

export function report(db, viewer, body) {
  only(body, ['user_id', 'reason', 'details', 'block']);
  const targetId = text(body.user_id, 'user_id', { max: 64, nullable: false });
  const reason = oneOf(body.reason, REPORT_REASONS.map(r => r[0]), 'Motivo', { nullable: false });
  const details = text(body.details, 'Dettagli', { max: 1000 }) ?? null;
  const alsoBlock = body.block === undefined ? false : bool(body.block, 'block');
  if (targetId === viewer.id || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(targetId)) throw new HttpError(404, 'not_found');
  const id = newId();
  db.prepare('INSERT INTO reports (id, reporter_id, reported_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, viewer.id, targetId, reason, details, now());
  if (alsoBlock) block(db, viewer, targetId);
  return { id };
}

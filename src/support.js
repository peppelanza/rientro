// Supporto: a member writes to the Rientro team (the account menu → Supporto), one ticket per
// question, as many as they like, each a chat with its code (#R-0007). The team answers from the
// admin panel (Supporto), and closes or reopens it; a member writing in a closed ticket reopens it.
// The team hears of a new ticket or message in its notifications, the member of an answer in theirs.
import { audit } from './admin.js';
import { now, tx } from './db.js';
import { pageParams, paginate } from './paging.js';
import { nameOf, notify } from './social.js';
import { HttpError, bad, oneOf, only, text } from './validate.js';

const MAX_OPEN = 10; // open tickets per member at once
export const ticketCode = id => `R-${String(id).padStart(4, '0')}`;

const ticketOr404 = (db, id, userId = null) => {
  const t = db.prepare(`SELECT * FROM support_tickets WHERE id = ? ${userId ? 'AND user_id = ?' : ''}`).get(Number(id), ...(userId ? [userId] : []));
  if (!t) throw new HttpError(404, 'not_found', 'Ticket non trovato.');
  return t;
};

const lastOf = (db, ticketId) => db.prepare('SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY id DESC LIMIT 1').get(ticketId);

// As a member or the team sees it in a list: unread when the other side wrote after you last opened it
function summary(db, t, side) {
  const last = lastOf(db, t.id);
  const readAt = side === 'team' ? t.admin_read_at : t.user_read_at;
  const fromOther = last && (side === 'team' ? !last.from_team : !!last.from_team);
  return {
    id: t.id, code: ticketCode(t.id), subject: t.subject, status: t.status, created_at: t.created_at, updated_at: t.updated_at,
    last: last ? `${last.from_team ? (side === 'team' ? 'Tu: ' : 'Team Rientro: ') : side === 'team' ? '' : 'Tu: '}${last.body}` : '',
    unread: !!fromOther && (!readAt || readAt < last.created_at),
    // the team's lists: who, and whether it waits for an answer
    ...(side === 'team' ? { user: { id: t.user_id, name: nameOf(db, t.user_id) || '', email: db.prepare('SELECT email FROM users WHERE id = ?').get(t.user_id)?.email }, waiting: t.status === 'open' && !!last && !last.from_team } : {}),
  };
}

function thread(db, t, side) {
  const messages = db.prepare('SELECT id, from_team, body, created_at FROM support_messages WHERE ticket_id = ? ORDER BY id').all(t.id)
    .map(m => ({ id: m.id, from_team: !!m.from_team, mine: side === 'team' ? !!m.from_team : !m.from_team, body: m.body, created_at: m.created_at }));
  return { ...summary(db, t, side), messages };
}

const teamIds = db => db.prepare("SELECT id FROM users WHERE role = 'admin' AND deletion_requested_at IS NULL").all().map(r => r.id);

// --- The member ---------------------------------------------------------------------------

export function myTickets(db, user) {
  return { tickets: db.prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC').all(user.id).map(t => summary(db, t, 'member')) };
}

export function openTicket(db, user, body) {
  only(body, ['subject', 'body']);
  const subject = text(body.subject, 'Oggetto', { max: 120, nullable: false });
  const msg = text(body.body, 'Messaggio', { max: 4000, nullable: false });
  const open = db.prepare("SELECT COUNT(*) AS n FROM support_tickets WHERE user_id = ? AND status = 'open'").get(user.id).n;
  if (open >= MAX_OPEN) throw bad('subject', `Hai già ${MAX_OPEN} ticket aperti: scrivi in uno di quelli.`);
  const id = tx(db, () => {
    const at = now();
    const r = db.prepare('INSERT INTO support_tickets (user_id, subject, created_at, updated_at, user_read_at) VALUES (?, ?, ?, ?, ?)').run(user.id, subject, at, at, at);
    const tid = Number(r.lastInsertRowid);
    db.prepare('INSERT INTO support_messages (ticket_id, author_id, from_team, body, created_at) VALUES (?, ?, 0, ?, ?)').run(tid, user.id, msg, at);
    return tid;
  });
  for (const a of teamIds(db)) if (a !== user.id) notify(db, a, 'support_new', user.id, { ticket_id: id, code: ticketCode(id), subject });
  return thread(db, ticketOr404(db, id), 'member');
}

export function getMyTicket(db, user, id) {
  const t = ticketOr404(db, id, user.id);
  db.prepare('UPDATE support_tickets SET user_read_at = ? WHERE id = ?').run(now(), t.id);
  db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND kind = 'support_reply' AND json_extract(data, '$.ticket_id') = ? AND read_at IS NULL").run(now(), user.id, t.id);
  return thread(db, t, 'member');
}

// Writing in a closed ticket reopens it
export function writeMine(db, user, id, body) {
  only(body, ['body']);
  const t = ticketOr404(db, id, user.id);
  const msg = text(body.body, 'Messaggio', { max: 4000, nullable: false });
  const at = now();
  db.prepare('INSERT INTO support_messages (ticket_id, author_id, from_team, body, created_at) VALUES (?, ?, 0, ?, ?)').run(t.id, user.id, msg, at);
  db.prepare("UPDATE support_tickets SET status = 'open', updated_at = ?, user_read_at = ? WHERE id = ?").run(at, at, t.id);
  // the team: one unread notification per ticket, the latest
  for (const a of teamIds(db)) {
    if (a === user.id) continue;
    db.prepare("DELETE FROM notifications WHERE user_id = ? AND kind IN ('support_new', 'support_message') AND json_extract(data, '$.ticket_id') = ? AND read_at IS NULL").run(a, t.id);
    notify(db, a, 'support_message', user.id, { ticket_id: t.id, code: ticketCode(t.id), subject: t.subject });
  }
  return thread(db, ticketOr404(db, t.id), 'member');
}

// --- The team (admin panel) ----------------------------------------------------------------

// ?status=open|closed (open first: those waiting for an answer on top), ?q= code, subject, person
export function teamTickets(db, query = new URLSearchParams()) {
  const status = query.get('status') === 'closed' ? 'closed' : 'open';
  const pp = pageParams(query, 30);
  const rows = db.prepare('SELECT * FROM support_tickets WHERE status = ? ORDER BY updated_at DESC').all(status).map(t => summary(db, t, 'team'))
    .filter(t => !pp.q || [t.code, t.subject, t.user.name, t.user.email].join(' ').toLowerCase().includes(pp.q))
    .sort((a, b) => Number(b.waiting) - Number(a.waiting));
  const counts = Object.fromEntries(['open', 'closed'].map(s => [s, db.prepare('SELECT COUNT(*) AS n FROM support_tickets WHERE status = ?').get(s).n]));
  return { ...paginate(rows, pp), status, counts };
}

export function teamTicket(db, admin, id) {
  const t = ticketOr404(db, id);
  db.prepare('UPDATE support_tickets SET admin_read_at = ? WHERE id = ?').run(now(), t.id);
  db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND kind IN ('support_new', 'support_message') AND json_extract(data, '$.ticket_id') = ? AND read_at IS NULL").run(now(), admin.id, t.id);
  audit(db, admin.id, 'support.view', t.user_id, { ticket: ticketCode(t.id) });
  return thread(db, t, 'team');
}

export function teamWrite(db, admin, id, body) {
  only(body, ['body']);
  const t = ticketOr404(db, id);
  const msg = text(body.body, 'Risposta', { max: 4000, nullable: false });
  const at = now();
  db.prepare('INSERT INTO support_messages (ticket_id, author_id, from_team, body, created_at) VALUES (?, ?, 1, ?, ?)').run(t.id, admin.id, msg, at);
  db.prepare('UPDATE support_tickets SET updated_at = ?, admin_read_at = ? WHERE id = ?').run(at, at, t.id);
  db.prepare("DELETE FROM notifications WHERE user_id = ? AND kind = 'support_reply' AND json_extract(data, '$.ticket_id') = ? AND read_at IS NULL").run(t.user_id, t.id);
  notify(db, t.user_id, 'support_reply', null, { ticket_id: t.id, code: ticketCode(t.id), subject: t.subject });
  audit(db, admin.id, 'support.reply', t.user_id, { ticket: ticketCode(t.id) });
  return thread(db, ticketOr404(db, t.id), 'team');
}

export function teamStatus(db, admin, id, body) {
  only(body, ['status']);
  const t = ticketOr404(db, id);
  const status = oneOf(body.status, ['open', 'closed'], 'status', { nullable: false });
  db.prepare('UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), t.id);
  audit(db, admin.id, status === 'closed' ? 'support.close' : 'support.reopen', t.user_id, { ticket: ticketCode(t.id) });
  return thread(db, ticketOr404(db, t.id), 'team');
}

// The admin sidebar: open tickets whose last word is the member's
export const waitingCount = db => db.prepare(
  `SELECT COUNT(*) AS n FROM support_tickets t WHERE t.status = 'open'
   AND (SELECT from_team FROM support_messages WHERE ticket_id = t.id ORDER BY id DESC LIMIT 1) = 0`,
).get().n;

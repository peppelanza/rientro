// Invite links: every member with a profile online has their own, rientro.it/?gius2839 (the first four
// letters of the first name and four random digits). Whoever signs up through it is remembered as
// invited by them (users.invited_by) and, in onboarding, can ask them to connect even before launch: the request goes out as the profile goes online, and waits in
// the inviter's Ricevute marked as coming from their link (connections.via_invite).
import crypto from 'node:crypto';
import { config, isLaunched } from './config.js';
import { newId, now } from './db.js';
import { connectionBetween, fileUrl, isBlocked } from './profiles.js';
import { notify } from './social.js';

export const INVITE_COOKIE = 'rientro_invite';
export const INVITE_COOKIE_DAYS = 30;
export const CODE = /^[a-z]{1,4}[0-9]{4}$/;

export const inviteUrl = code => `${config.baseUrl}/?${code}`;
// "Giuseppe" → "gius", "Nicolò" → "nico", no name → "rien"
const letters = name => (name || '').normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase().slice(0, 4) || 'rien';

// The member's code, made the first time it's asked for
export function inviteCode(db, userId) {
  const have = db.prepare('SELECT invite_code FROM users WHERE id = ?').get(userId)?.invite_code;
  if (have) return have;
  const start = letters(db.prepare('SELECT first_name FROM profiles WHERE user_id = ?').get(userId)?.first_name);
  for (;;) {
    const code = start + String(crypto.randomInt(10000)).padStart(4, '0');
    if (db.prepare('SELECT 1 FROM users WHERE invite_code = ?').get(code)) continue;
    db.prepare('UPDATE users SET invite_code = ? WHERE id = ? AND invite_code IS NULL').run(code, userId);
    return db.prepare('SELECT invite_code FROM users WHERE id = ?').get(userId).invite_code;
  }
}

// Who a code belongs to: only a member whose profile is online
function inviterIdFor(db, code) {
  if (!CODE.test(code || '')) return null;
  return db.prepare("SELECT id FROM users WHERE invite_code = ? AND status = 'approved' AND deletion_requested_at IS NULL").get(code)?.id ?? null;
}

const person = (db, id) => {
  const p = db.prepare('SELECT first_name, last_name, photo_file_id, current_role FROM profiles WHERE user_id = ?').get(id);
  return p && { id, first_name: p.first_name, last_name: p.last_name, name: [p.first_name, p.last_name].filter(Boolean).join(' '), photo_url: fileUrl(p.photo_file_id), role: p.current_role };
};

// For the sign-in page: "Giuseppe ti ha invitato su Rientro", with their photo (served to whoever
// holds the link, /api/public/invite-photo)
export const inviterForCode = (db, code) => {
  const id = inviterIdFor(db, code);
  const p = id && person(db, id);
  return p && { first_name: p.first_name, last_name: p.last_name, name: p.name, photo_url: p.photo_url ? '/api/public/invite-photo' : null };
};
export const inviterPhotoId = (db, code) => {
  const id = inviterIdFor(db, code);
  return id ? db.prepare('SELECT photo_file_id FROM profiles WHERE user_id = ?').get(id)?.photo_file_id ?? null : null;
};

// A new account opened with an invite cookie: remembered once, never yourself
export function recordInvite(db, userId, code) {
  const by = inviterIdFor(db, code);
  if (!by || by === userId) return;
  db.prepare('UPDATE users SET invited_by = ? WHERE id = ? AND invited_by IS NULL').run(by, userId);
}

// For /api/me: your link (once your profile is online) and who invited you (while they're around)
export function inviteInfo(db, user) {
  const row = db.prepare('SELECT invited_by FROM users WHERE id = ?').get(user.id);
  const by = row?.invited_by && !isBlocked(db, user.id, row.invited_by)
    && db.prepare("SELECT 1 FROM users WHERE id = ? AND status = 'approved'").get(row.invited_by) ? person(db, row.invited_by) : null;
  // their photo through /api/me/inviter-photo: /api/files is for members, and you may still be in onboarding
  return { url: user.status === 'approved' ? inviteUrl(inviteCode(db, user.id)) : null, invited_by: by && { ...by, photo_url: by.photo_url ? '/api/me/inviter-photo' : null } };
}

// The photo of who invited you (inviteInfo), while they'd show there
export function myInviterPhotoId(db, user) {
  const by = inviteInfo(db, user).invited_by;
  return by ? db.prepare('SELECT photo_file_id FROM profiles WHERE user_id = ?').get(by.id)?.photo_file_id ?? null : null;
}

// The profile went online: the request chosen in onboarding goes to the inviter
export function connectInviter(db, user) {
  const row = db.prepare('SELECT u.invited_by, p.invite_connect, p.invite_note FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = ?').get(user.id);
  if (!row?.invited_by || row.invite_connect !== 1) return null;
  const to = row.invited_by;
  if (isBlocked(db, user.id, to) || connectionBetween(db, user.id, to)) return null;
  if (!db.prepare("SELECT 1 FROM users WHERE id = ? AND status = 'approved'").get(to)) return null;
  const id = newId();
  db.prepare("INSERT INTO connections (id, requester_id, addressee_id, status, note, created_at, via_invite) VALUES (?, ?, ?, 'pending', ?, ?, 1)")
    .run(id, user.id, to, row.invite_note || null, now());
  // Before launch there's nowhere to answer it: no bell, no email; it waits in Ricevute for launch day
  if (isLaunched()) notify(db, to, 'connection_request', user.id, { connection_id: id });
  return id;
}

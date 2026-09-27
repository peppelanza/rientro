import crypto from 'node:crypto';
import { config, LEGAL_VERSIONS } from './config.js';
import { newId, now, sha256, tx } from './db.js';
import { HttpError, bad, bool, only } from './validate.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const token = () => crypto.randomBytes(32).toString('base64url');
const inMinutes = m => new Date(Date.now() + m * 60_000).toISOString();

// Passwordless login: a single-use link valid for 15 minutes. Only the hash is stored.
export function requestLogin(db, body) {
  only(body, ['email']);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw bad('invalid_email', 'Indirizzo email non valido');
  const raw = token();
  db.prepare('INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)')
    .run(sha256(raw), email, inMinutes(config.loginTokenTtlMinutes));
  return { email, token: raw };
}

export function consumeLogin(db, rawToken, userAgent) {
  if (typeof rawToken !== 'string' || rawToken.length < 20) throw bad('invalid_token');
  return tx(db, () => {
    const row = db.prepare('SELECT * FROM login_tokens WHERE token_hash = ?').get(sha256(rawToken));
    if (!row || row.used_at || row.expires_at < now()) {
      throw new HttpError(401, 'invalid_token', 'Il link non è valido o è scaduto. Richiedine un altro.');
    }
    db.prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ?').run(now(), row.token_hash);

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(row.email);
    if (!user) {
      const ts = now();
      const role = config.adminEmails.includes(row.email) ? 'admin' : 'member';
      user = { id: newId(), email: row.email, role, status: 'onboarding', created_at: ts, updated_at: ts };
      db.prepare('INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(user.id, user.email, user.role, user.status, ts, ts);
    }
    const sessionToken = token();
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)')
      .run(sha256(sessionToken), user.id, now(), inMinutes(config.sessionTtlDays * 24 * 60), (userAgent || '').slice(0, 200));
    return { sessionToken, user };
  });
}

export function userForSession(db, rawToken) {
  if (!rawToken) return null;
  return db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).get(sha256(rawToken), now()) ?? null;
}

export function logout(db, rawToken) {
  if (rawToken) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(rawToken));
}

export function logoutEverywhere(db, userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// Terms (contract) and the privacy notice (information, not consent) must be acknowledged
// in their current versions before a profile can be built.
export function legalStatus(db, userId) {
  const acked = new Set(
    db.prepare('SELECT doc || \'@\' || version AS k FROM legal_acknowledgements WHERE user_id = ?').all(userId).map(r => r.k),
  );
  const needs = ['terms', 'privacy'].filter(doc => !acked.has(`${doc}@${LEGAL_VERSIONS[doc]}`));
  return { needs, versions: { terms: LEGAL_VERSIONS.terms, privacy: LEGAL_VERSIONS.privacy } };
}

export function acknowledgeLegal(db, userId, body) {
  only(body, ['accept_terms', 'read_privacy']);
  if (!bool(body.accept_terms, 'accept_terms') || !bool(body.read_privacy, 'read_privacy')) {
    throw bad('legal_required', 'Per usare Rientro servono i Termini e la presa visione dell’informativa.');
  }
  const ins = db.prepare('INSERT INTO legal_acknowledgements (user_id, doc, version, created_at) VALUES (?, ?, ?, ?)');
  for (const doc of legalStatus(db, userId).needs) ins.run(userId, doc, LEGAL_VERSIONS[doc], now());
  return legalStatus(db, userId);
}

export function requireLegal(db, userId) {
  if (legalStatus(db, userId).needs.length) {
    throw new HttpError(409, 'legal_required', 'Accetta prima i Termini aggiornati.');
  }
}

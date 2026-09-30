import crypto from 'node:crypto';
import { config, LEGAL_VERSIONS } from './config.js';
import { newId, now, sha256, subjectRef, tx } from './db.js';
import { HttpError, bad, only } from './validate.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const inMinutes = m => new Date(Date.now() + m * 60_000).toISOString();
const token = () => crypto.randomBytes(32).toString('base64url');
const codeHash = (email, code) => crypto.createHmac('sha256', config.pseudonymSecret).update(`${email}:${code}`).digest('hex');

export function normaliseEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw bad('invalid_email', 'Indirizzo email non valido');
  return email;
}

// Design 5a: "Ti mandiamo un codice di 6 cifre. Niente password da ricordare."
// The optional marketing checkbox on the same screen travels with the code and is only
// applied once the address is verified.
export function requestCode(db, body) {
  only(body, ['email', 'marketing_opt_in']);
  const email = normaliseEmail(body.email);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare('UPDATE login_codes SET used_at = ? WHERE email = ? AND used_at IS NULL').run(now(), email);
  db.prepare(
    'INSERT INTO login_codes (email, code_hash, expires_at, marketing_opt_in, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(email, codeHash(email, code), inMinutes(config.loginCodeTtlMinutes), body.marketing_opt_in === true ? 1 : 0, now());
  return { email, code };
}

export function verifyCode(db, body, userAgent) {
  only(body, ['email', 'code']);
  const email = normaliseEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
  const invalid = new HttpError(401, 'invalid_code', 'Codice non valido. Controlla l’ultima email ricevuta.');
  // Checked outside the transaction so a failed attempt is counted, not rolled back.
  const row = db.prepare('SELECT * FROM login_codes WHERE email = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1').get(email);
  if (!row || row.expires_at < now()) throw new HttpError(401, 'code_expired', 'Il codice è scaduto. Richiedine uno nuovo.');
  if (row.attempts >= config.loginCodeMaxAttempts) throw new HttpError(429, 'too_many_attempts', 'Troppi tentativi. Richiedi un nuovo codice.');
  const ok = /^\d{6}$/.test(code) && crypto.timingSafeEqual(Buffer.from(codeHash(email, code)), Buffer.from(row.code_hash));
  if (!ok) {
    db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    throw invalid;
  }
  return tx(db, () => {
    const claimed = db.prepare('UPDATE login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now(), row.id);
    if (!claimed.changes) throw invalid;

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const isNew = !user;
    if (isNew) {
      const ts = now();
      const role = config.adminEmails.includes(email) ? 'admin' : 'member';
      user = { id: newId(), email, role, status: 'onboarding', created_at: ts };
      db.prepare('INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(user.id, email, role, 'onboarding', ts, ts);
      db.prepare('INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)').run(user.id, ts);
      // Design 2a: "Continuando accetti i Termini e confermi di aver letto la Privacy Policy."
      acknowledge(db, user.id);
    }
    if (row.marketing_opt_in) {
      db.prepare(
        `INSERT INTO communication_preferences (user_id, marketing_email, updated_at) VALUES (?, 1, ?)
         ON CONFLICT(user_id) DO UPDATE SET marketing_email = 1, updated_at = excluded.updated_at`,
      ).run(user.id, now());
      db.prepare(
        `INSERT INTO preference_events (user_id, subject_ref, preference, value, source, privacy_policy_version, created_at)
         VALUES (?, ?, 'marketing_email', 1, 'signup', ?, ?)`,
      ).run(user.id, subjectRef(user.id), LEGAL_VERSIONS.privacy, now());
    }
    const sessionToken = token();
    db.prepare(
      'INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(sha256(sessionToken), user.id, now(), now(), inMinutes(config.sessionTtlDays * 1440), (userAgent || '').slice(0, 200));
    return { sessionToken, user, isNew };
  });
}

export function userForSession(db, rawToken) {
  if (!rawToken) return null;
  const hash = sha256(rawToken);
  const user = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).get(hash, now());
  if (user) {
    const ts = now();
    db.prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?').run(ts, hash);
    db.prepare('UPDATE users SET last_seen_at = ?, inactivity_notice_at = NULL WHERE id = ?').run(ts, user.id);
  }
  return user ?? null;
}

export function listSessions(db, userId, rawToken) {
  const current = rawToken ? sha256(rawToken) : null;
  return db.prepare('SELECT token_hash, created_at, last_used_at, user_agent FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_used_at DESC')
    .all(userId, now())
    .map(s => ({ device: describeAgent(s.user_agent), last_used_at: s.last_used_at, created_at: s.created_at, current: s.token_hash === current }));
}

function describeAgent(ua = '') {
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return browser ? `${device} · ${browser}` : device;
}

export function logout(db, rawToken) {
  if (rawToken) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(rawToken));
}

export function logoutEverywhere(db, userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// Terms (contract) and the privacy notice (information) — acknowledged, not "consented".
function acknowledge(db, userId) {
  const ins = db.prepare('INSERT INTO legal_acknowledgements (user_id, doc, version, created_at) VALUES (?, ?, ?, ?)');
  for (const doc of legalStatus(db, userId).needs) ins.run(userId, doc, LEGAL_VERSIONS[doc], now());
}

export function legalStatus(db, userId) {
  const acked = new Set(
    db.prepare("SELECT doc || '@' || version AS k FROM legal_acknowledgements WHERE user_id = ?").all(userId).map(r => r.k),
  );
  const needs = ['terms', 'privacy'].filter(doc => !acked.has(`${doc}@${LEGAL_VERSIONS[doc]}`));
  return { needs, versions: { terms: LEGAL_VERSIONS.terms, privacy: LEGAL_VERSIONS.privacy } };
}

// Re-acknowledgement after a legal text changes (shown as a blocking dialog in the app).
export function acknowledgeLegal(db, userId, body) {
  only(body, ['accept']);
  if (body.accept !== true) throw bad('legal_required', 'Per continuare servono i Termini aggiornati.');
  acknowledge(db, userId);
  return legalStatus(db, userId);
}

export function requireLegal(db, userId) {
  if (legalStatus(db, userId).needs.length) throw new HttpError(409, 'legal_required', 'Accetta prima i Termini aggiornati.');
}

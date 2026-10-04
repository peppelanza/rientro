// Terms or Privacy updated (a new version in config.js LEGAL_VERSIONS): every member is told by email,
// once. Nothing waits for them: it's a notice, not a confirmation. A run every minute (server.js)
// sends a batch; each email is recorded, so nobody gets it twice and a restart carries on.
//   - The first time a document is seen its version is the starting point: no email for it.
//   - Who signed up after the update has accepted the new version already: no email.
//   - Both documents updated: one email about both.
import { LEGAL_VERSIONS } from './config.js';
import { now } from './db.js';
import { canSendEmail, legalUpdateEmail, sendEmail } from './mail.js';

const DOCS = ['terms', 'privacy'];
const BATCH = 40; // emails per run

export async function sendLegalNotices(db, { send = sendEmail, enabled = canSendEmail, batch = BATCH } = {}) {
  for (const doc of DOCS) {
    const version = LEGAL_VERSIONS[doc];
    if (db.prepare('SELECT 1 FROM legal_notices WHERE doc = ? AND version = ?').get(doc, version)) continue;
    const first = !db.prepare('SELECT 1 FROM legal_notices WHERE doc = ?').get(doc);
    db.prepare('INSERT INTO legal_notices (doc, version, started_at, baseline) VALUES (?, ?, ?, ?)').run(doc, version, now(), first ? 1 : 0);
  }
  if (!enabled()) return { sent: 0 };
  const due = DOCS.map(doc => db.prepare('SELECT * FROM legal_notices WHERE doc = ? AND version = ? AND baseline = 0').get(doc, LEGAL_VERSIONS[doc])).filter(Boolean);
  if (!due.length) return { sent: 0 };
  // members from before the update who haven't had this email yet, a batch at a time
  const users = new Map();
  for (const n of due) {
    const rows = db.prepare(
      `SELECT u.id, u.email FROM users u WHERE u.status IN ('approved', 'onboarding') AND u.deletion_requested_at IS NULL AND u.created_at < ?
       AND NOT EXISTS (SELECT 1 FROM legal_notice_sends s WHERE s.user_id = u.id AND s.doc = ? AND s.version = ?) LIMIT ?`,
    ).all(n.started_at, n.doc, n.version, batch);
    for (const u of rows) users.set(u.id, { ...u, docs: [...(users.get(u.id)?.docs ?? []), n.doc] });
  }
  let sent = 0;
  for (const u of [...users.values()].slice(0, batch)) {
    try {
      await send({ to: u.email, ...legalUpdateEmail({ docs: u.docs, versions: LEGAL_VERSIONS }) });
      sent++;
    } catch (err) {
      console.error('[legal notice]', u.id, err.message);
      continue; // tried again at the next run
    }
    for (const doc of u.docs) db.prepare('INSERT OR IGNORE INTO legal_notice_sends (user_id, doc, version, sent_at) VALUES (?, ?, ?, ?)').run(u.id, doc, LEGAL_VERSIONS[doc], now());
  }
  return { sent };
}

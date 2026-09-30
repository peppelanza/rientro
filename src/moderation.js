// Explicit images (nudity, porn) stopped in the browser by NSFWJS (public/app/nsfw.js): the image
// never becomes a profile photo. It comes here into quarantine for the admin to check, the account
// is suspended at once (the email can't sign in again), and the admin can undo it: the member then
// gets an email that the account is active again.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { audit } from './admin.js';
import { config } from './config.js';
import { newId, now, tx } from './db.js';
import { attachUpload } from './files.js';
import { sendAccountRestoredEmail } from './mail.js';
import { HttpError } from './validate.js';

const dir = () => path.join(config.uploadDir, 'quarantine');
const file = key => path.join(dir(), key);
const CLASSES = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'];

function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// scoresHeader: the browser's NSFWJS probabilities, only kept as numbers between 0 and 1
export function blockUpload(db, user, buf, scoresHeader) {
  let scores = {};
  try { scores = JSON.parse(scoresHeader || '{}'); } catch {}
  scores = Object.fromEntries(CLASSES.map(c => [c, Math.min(1, Math.max(0, Number(scores[c]) || 0))]));
  const mime = sniffImage(buf);
  let key = null;
  if (mime) {
    fs.mkdirSync(dir(), { recursive: true, mode: 0o700 });
    key = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(file(key), buf, { mode: 0o600 });
  }
  tx(db, () => {
    db.prepare('INSERT INTO blocked_uploads (id, user_id, storage_key, mime, scores, prev_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(newId(), user.id, key, mime, JSON.stringify(scores), user.status, now());
    db.prepare("UPDATE users SET status = 'suspended', updated_at = ? WHERE id = ?").run(now(), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  });
}

export function listBlocked(db, admin) {
  const rows = db.prepare(`SELECT b.*, u.email, p.first_name, p.last_name FROM blocked_uploads b
    JOIN users u ON u.id = b.user_id LEFT JOIN profiles p ON p.user_id = b.user_id
    ORDER BY b.resolved_at IS NOT NULL, b.created_at DESC LIMIT 200`).all();
  audit(db, admin.id, 'blocked.list', null, { count: rows.length });
  return rows.map(r => ({
    id: r.id, user_id: r.user_id, email: r.email, name: [r.first_name, r.last_name].filter(Boolean).join(' '),
    scores: JSON.parse(r.scores), created_at: r.created_at, resolved_at: r.resolved_at, resolution: r.resolution,
    image_url: r.storage_key ? `/api/admin/blocked/${r.id}/image` : null,
  }));
}

export function blockedImage(db, admin, id) {
  const r = db.prepare('SELECT * FROM blocked_uploads WHERE id = ?').get(id);
  if (!r?.storage_key || !fs.existsSync(file(r.storage_key))) throw new HttpError(404, 'not_found');
  audit(db, admin.id, 'blocked.view_image', r.user_id);
  return { mime: r.mime, buf: fs.readFileSync(file(r.storage_key)) };
}

// restore: it was a mistake, so the image wasn't explicit: it becomes the profile photo it was meant
// to be (the admin has just looked at it, no further review), the account goes back to how it was
// and the member is told by email. confirm: it stays suspended and the image is deleted now.
export async function resolveBlocked(db, admin, id, action) {
  if (!['restore', 'confirm'].includes(action)) throw new HttpError(400, 'invalid_field', 'Azione non valida.');
  const r = db.prepare('SELECT * FROM blocked_uploads WHERE id = ?').get(id);
  if (!r) throw new HttpError(404, 'not_found');
  if (r.resolved_at) throw new HttpError(409, 'already_resolved', 'Già gestito.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.user_id);
  tx(db, () => {
    db.prepare('UPDATE blocked_uploads SET resolved_at = ?, resolution = ?, resolved_by = ?, storage_key = NULL WHERE id = ?')
      .run(now(), action === 'restore' ? 'restored' : 'confirmed', admin.id, id);
    if (action === 'restore' && user.status === 'suspended') db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(r.prev_status, now(), user.id);
    audit(db, admin.id, action === 'restore' ? 'blocked.restore' : 'blocked.confirm', user.id);
  });
  if (r.storage_key && action === 'restore' && r.mime && fs.existsSync(file(r.storage_key))) {
    const buf = fs.readFileSync(file(r.storage_key));
    const key = crypto.randomBytes(24).toString('hex');
    fs.renameSync(file(r.storage_key), path.join(config.uploadDir, key));
    attachUpload(db, { ...user, status: 'onboarding' }, 'profile_photo', { key, mime: r.mime, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
    db.prepare('UPDATE profiles SET photo_check = NULL WHERE user_id = ?').run(user.id);
  } else if (r.storage_key) fs.rmSync(file(r.storage_key), { force: true });
  if (action === 'restore') await sendAccountRestoredEmail(user.email).catch(err => console.error('[mail] restored', err?.message ?? err));
  return { ok: true };
}

export const openBlockedCount = db => db.prepare('SELECT COUNT(*) AS n FROM blocked_uploads WHERE resolved_at IS NULL').get().n;

// Quarantined images live 30 days at most (retention.js), and go with the account (privacy.js)
export function purgeQuarantine(db, before) {
  const rows = db.prepare('SELECT id, storage_key FROM blocked_uploads WHERE storage_key IS NOT NULL AND created_at < ?').all(before);
  for (const r of rows) {
    fs.rmSync(file(r.storage_key), { force: true });
    db.prepare('UPDATE blocked_uploads SET storage_key = NULL WHERE id = ?').run(r.id);
  }
  return rows.length;
}
export function quarantineFilesOf(db, userId) {
  const keys = db.prepare('SELECT storage_key FROM blocked_uploads WHERE user_id = ? AND storage_key IS NOT NULL').all(userId).map(r => r.storage_key);
  return () => keys.forEach(k => fs.rmSync(file(k), { force: true }));
}

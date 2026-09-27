import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { newId, now, tx } from './db.js';
import { HttpError } from './validate.js';

// Detect type from the bytes, never from the client-supplied header or filename.
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const diskPath = key => path.join(config.uploadDir, key);

export function saveProfilePhoto(db, userId, buf) {
  if (!buf.length) throw new HttpError(400, 'empty_file');
  if (buf.length > config.maxPhotoBytes) throw new HttpError(413, 'too_large', 'La foto supera 5 MB.');
  const mime = sniff(buf);
  if (!mime) throw new HttpError(415, 'unsupported_type', 'Usa una foto JPG, PNG o WebP.');

  fs.mkdirSync(config.uploadDir, { recursive: true, mode: 0o700 });
  const id = newId();
  const key = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(diskPath(key), buf, { mode: 0o600 });

  const old = db.prepare(
    `SELECT f.* FROM profiles p JOIN files f ON f.id = p.photo_file_id WHERE p.user_id = ?`,
  ).get(userId);
  tx(db, () => {
    db.prepare(
      `INSERT INTO files (id, owner_id, kind, storage_key, mime_type, size_bytes, sha256, created_at)
       VALUES (?, ?, 'profile_photo', ?, ?, ?, ?, ?)`,
    ).run(id, userId, key, mime, buf.length, crypto.createHash('sha256').update(buf).digest('hex'), now());
    db.prepare('INSERT OR IGNORE INTO profiles (user_id, updated_at) VALUES (?, ?)').run(userId, now());
    db.prepare('UPDATE profiles SET photo_file_id = ?, updated_at = ? WHERE user_id = ?').run(id, now(), userId);
    if (old) db.prepare('DELETE FROM files WHERE id = ?').run(old.id);
  });
  if (old) fs.rmSync(diskPath(old.storage_key), { force: true });
  return { id, url: `/api/files/${id}` };
}

// Owner and admins always; other members only if both are approved.
export function readFileFor(db, viewer, fileId) {
  const f = db.prepare(
    `SELECT f.*, u.status AS owner_status FROM files f JOIN users u ON u.id = f.owner_id WHERE f.id = ?`,
  ).get(fileId);
  const allowed = f && (f.owner_id === viewer.id || viewer.role === 'admin'
    || (viewer.status === 'approved' && f.owner_status === 'approved'));
  if (!allowed) throw new HttpError(404, 'not_found');
  return { mime: f.mime_type, body: fs.readFileSync(diskPath(f.storage_key)) };
}

export function deleteFilesOf(db, userId) {
  const keys = db.prepare('SELECT storage_key FROM files WHERE owner_id = ?').all(userId).map(r => r.storage_key);
  return () => keys.forEach(k => fs.rmSync(diskPath(k), { force: true }));
}

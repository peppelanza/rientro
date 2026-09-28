import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { newId, now, tx } from './db.js';
import { rawProfile } from './profiles.js';
import { HttpError } from './validate.js';

// Detect type from the bytes, never from client-supplied headers or filenames.
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length > 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return 'video/webm'; // browser recordings (MediaRecorder)
  if (buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp') return buf.toString('ascii', 8, 12) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  return null;
}

const diskPath = key => path.join(config.uploadDir, key);
const LIMITS = { profile_photo: config.maxPhotoBytes, profile_video: config.maxVideoBytes };
const TYPES = { profile_photo: /^image\//, profile_video: /^video\// };

// Streams the request body to disk (videos can be 200 MB), checking size and type as it goes.
export function receiveUpload(req, kind) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(config.uploadDir, { recursive: true, mode: 0o700 });
    const key = crypto.randomBytes(24).toString('hex');
    const file = diskPath(key);
    const out = fs.createWriteStream(file, { mode: 0o600 });
    const hash = crypto.createHash('sha256');
    let size = 0;
    let head = Buffer.alloc(0);
    let failed = false;
    const fail = err => {
      if (failed) return;
      failed = true;
      req.unpipe?.(out);
      out.destroy();
      fs.rmSync(file, { force: true });
      reject(err);
    };
    req.on('data', chunk => {
      size += chunk.length;
      if (size > LIMITS[kind]) {
        fail(new HttpError(413, 'too_large', kind === 'profile_video' ? 'Il video supera i 200 MB. Carica un file più leggero.' : 'La foto supera 5 MB.'));
        req.destroy();
        return;
      }
      if (head.length < 16) head = Buffer.concat([head, chunk]).subarray(0, 16);
      hash.update(chunk);
      out.write(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      out.end(() => {
        const mime = sniff(head);
        if (!size) return fail(new HttpError(400, 'empty_file'));
        if (!mime || !TYPES[kind].test(mime)) {
          return fail(new HttpError(415, 'unsupported_type', kind === 'profile_video' ? 'Formato non supportato. Usa MP4, MOV o WebM.' : 'Usa una foto JPG, PNG o WebP.'));
        }
        resolve({ key, mime, size, sha256: hash.digest('hex') });
      });
    });
    req.on('error', fail);
  });
}

// Profile videos: 10 to 30 seconds, re-encoded to a light H.264/AAC MP4 (short side at most
// 720 px, audio 96 kbps, faststart so playback begins before the download ends). Needs ffmpeg
// and ffprobe (installed in the Docker image); without them the upload is kept as sent.
export const VIDEO_MIN_SECONDS = 10;
export const VIDEO_MAX_SECONDS = 30;
const run = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 180_000, maxBuffer: 1 << 20 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
});
let ffmpegOk;
async function hasFfmpeg() {
  if (ffmpegOk === undefined) ffmpegOk = await run('ffprobe', ['-version']).then(() => true, () => false);
  if (!ffmpegOk) console.warn('ffmpeg/ffprobe not found: videos are stored without conversion or duration check');
  return ffmpegOk;
}

export async function processVideo(upload) {
  if (!(await hasFfmpeg())) return upload;
  const src = diskPath(upload.key);
  const key = crypto.randomBytes(24).toString('hex');
  const out = diskPath(key);
  const drop = () => { fs.rmSync(src, { force: true }); fs.rmSync(out, { force: true }); };
  try {
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-t', String(VIDEO_MAX_SECONDS + 1),
      '-vf', "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)',fps=30",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-profile:v', 'main',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart', '-f', 'mp4', out]);
  } catch {
    drop();
    throw new HttpError(415, 'unsupported_type', 'Non riusciamo a leggere questo video. Prova con un altro file o registralo qui.');
  }
  // Duration measured on the converted file: browser recordings often carry none in their header
  const seconds = Number(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).catch(() => ''));
  if (!(seconds >= VIDEO_MIN_SECONDS - 0.5)) {
    drop();
    throw new HttpError(400, 'video_too_short', `Il video deve durare almeno ${VIDEO_MIN_SECONDS} secondi.`);
  }
  if (seconds > VIDEO_MAX_SECONDS + 0.5) {
    drop();
    throw new HttpError(400, 'video_too_long', `Il video può durare al massimo ${VIDEO_MAX_SECONDS} secondi.`);
  }
  fs.rmSync(src, { force: true });
  fs.chmodSync(out, 0o600);
  const buf = fs.readFileSync(out);
  return { key, mime: 'video/mp4', size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), seconds };
}

const fileRow = (db, id) => (id ? db.prepare('SELECT * FROM files WHERE id = ?').get(id) : null);

function removeFile(db, id) {
  const f = fileRow(db, id);
  if (!f) return;
  db.prepare('DELETE FROM files WHERE id = ?').run(id);
  fs.rmSync(diskPath(f.storage_key), { force: true });
}

// Photo: for approved members the new photo waits in pending_changes until a moderator approves it.
export function attachUpload(db, user, kind, upload) {
  const id = newId();
  const p = rawProfile(db, user.id);
  const column = kind === 'profile_photo' ? 'photo_file_id' : 'video_file_id';
  const reviewed = kind === 'profile_photo' && user.status === 'approved';
  const replaced = reviewed ? p.pending_changes.photo_file_id : p[column];
  tx(db, () => {
    db.prepare('INSERT INTO files (id, owner_id, kind, storage_key, mime_type, size_bytes, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, user.id, kind, upload.key, upload.mime, upload.size, upload.sha256, now());
    if (reviewed) {
      const pending = { ...p.pending_changes, photo_file_id: id };
      db.prepare('UPDATE profiles SET pending_changes = ?, updated_at = ? WHERE user_id = ?').run(JSON.stringify(pending), now(), user.id);
    } else {
      db.prepare(`UPDATE profiles SET ${column} = ?, updated_at = ? WHERE user_id = ?`).run(id, now(), user.id);
    }
  });
  if (replaced && replaced !== id) removeFile(db, replaced);
  return { id, url: `/api/files/${id}`, pending_review: reviewed };
}

export function removeVideo(db, userId) {
  const p = rawProfile(db, userId);
  if (!p.video_file_id) return;
  db.prepare('UPDATE profiles SET video_file_id = NULL, updated_at = ? WHERE user_id = ?').run(now(), userId);
  removeFile(db, p.video_file_id);
}

// Called after moderation applies a pending photo: drop the previous live one.
export function cleanupReplacedPhoto(db, oldId, newId) {
  if (oldId && oldId !== newId) removeFile(db, oldId);
}

// Owner and admins always; approved members see approved members' files, except
// connections-only videos, which need an accepted connection.
export function readFileFor(db, viewer, fileId, canSeeConnectionsOnly) {
  const f = db.prepare(
    `SELECT f.*, u.status AS owner_status, p.video_connections_only, p.visible
     FROM files f JOIN users u ON u.id = f.owner_id LEFT JOIN profiles p ON p.user_id = f.owner_id WHERE f.id = ?`,
  ).get(fileId);
  if (!f) throw new HttpError(404, 'not_found');
  const own = f.owner_id === viewer.id || viewer.role === 'admin';
  const memberVisible = viewer.status === 'approved' && f.owner_status === 'approved' && f.visible === 1
    && !(f.kind === 'profile_video' && f.video_connections_only === 1 && !canSeeConnectionsOnly(f.owner_id));
  if (!own && !memberVisible) throw new HttpError(404, 'not_found');
  return { mime: f.mime_type, size: f.size_bytes, path: diskPath(f.storage_key) };
}

export function deleteFilesOf(db, userId) {
  const keys = db.prepare('SELECT storage_key FROM files WHERE owner_id = ?').all(userId).map(r => r.storage_key);
  return () => keys.forEach(k => fs.rmSync(diskPath(k), { force: true }));
}

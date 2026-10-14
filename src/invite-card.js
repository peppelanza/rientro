// The preview of an invite link (rientro.it/?gius2839) in WhatsApp, iMessage, Telegram, LinkedIn…:
// "Giuseppe Lanzafame ti ha invitato su Rientro", and a 1200×630 picture with their photo in a
// circle, their name and the logo — as the invite badge on the sign-in page. The page itself sends
// people straight on to /accedi (the invite remembered in its cookie, as before).
// The picture is drawn by ffmpeg (already in the Docker image for the videos) with the site's own
// fonts, once per inviter and photo (cached on disk); without ffmpeg, the plain logo picture.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { fileOnDisk } from './files.js';
import { CODE } from './invites.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Who the code belongs to (a member online), with the photo to draw
export function inviterCard(db, code) {
  if (!CODE.test(code || '')) return null;
  const row = db.prepare(`SELECT u.id, p.first_name, p.last_name, p.photo_file_id FROM users u JOIN profiles p ON p.user_id = u.id
    WHERE u.invite_code = ? AND u.status = 'approved' AND u.deletion_requested_at IS NULL`).get(code);
  return row && { ...row, name: [row.first_name, row.last_name].filter(Boolean).join(' ') };
}

// The landing for link previews and people alike: Open Graph tags, then on to /accedi
export function invitePage(db, code) {
  const who = inviterCard(db, code);
  if (!who) return null;
  const title = `${who.first_name || who.name} ti ha invitato su Rientro`; // the first name only
  const description = 'Rientro è la community gratuita di chi torna in Italia o al Sud per costruire qualcosa: fare rete, fondare un’azienda, partire con un progetto. Iscriviti con il suo invito.';
  const url = `${config.baseUrl}/?${code}`;
  const image = `${config.baseUrl}/og/invito/${code}.jpg`;
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Rientro">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=/accedi">
</head><body><p><a href="/accedi">${esc(title)}: continua su Rientro</a></p></body></html>`;
}

const FONTS = path.join(config.publicDir, 'fonts');
const LOGO = path.join(config.publicDir, 'press', 'brand', 'rientro-logo.png');
const FALLBACK = path.join(config.publicDir, 'press', 'brand', 'rientro-logo.jpg');
const cacheDir = () => path.join(config.uploadDir, 'og-cache');

const run = (args, timeout = 20_000) => new Promise((resolve, reject) => {
  execFile('ffmpeg', args, { timeout, maxBuffer: 1 << 20 }, err => (err ? reject(err) : resolve()));
});

// The picture's path on disk: drawn once per code, photo and name, then reused
export async function inviteImage(db, code) {
  const who = inviterCard(db, code);
  if (!who) return null;
  const key = crypto.createHash('sha256').update(`${code}|${who.photo_file_id}|${who.name}|v2`).digest('hex').slice(0, 24);
  const out = path.join(cacheDir(), `${key}.jpg`);
  if (fs.existsSync(out)) return out;
  fs.mkdirSync(cacheDir(), { recursive: true, mode: 0o700 });
  // the texts go through files (no escaping of names for ffmpeg's filter syntax)
  const tmp = fs.mkdtempSync(path.join(cacheDir(), 'tmp-'));
  try {
    const first = who.first_name || who.name;
    const name = first.length > 26 ? `${first.slice(0, 25)}…` : first;
    const write = (f, t) => { const p = path.join(tmp, f); fs.writeFileSync(p, t); return p.replace(/[\\:']/g, m => `\\${m}`); };
    const tName = write('name.txt', name), tLine = write('line.txt', 'ti ha invitato su Rientro'), tEyebrow = write('eyebrow.txt', 'INVITO PERSONALE');
    const font = f => path.join(FONTS, f).replace(/[\\:']/g, m => `\\${m}`);
    const photo = who.photo_file_id ? fileOnDisk(db, who.photo_file_id).path : null;
    const D = 380; // the photo's circle
    const inputs = ['-f', 'lavfi', '-i', 'color=c=0xE9E6F5:s=1200x630', '-i', LOGO];
    let graph = '[1:v]scale=230:-1[logo];';
    let base = '[0:v]';
    if (photo && fs.existsSync(photo)) {
      inputs.push('-i', photo);
      graph += `[2:v]scale=${D}:${D}:force_original_aspect_ratio=increase,crop=${D}:${D},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${D / 2},Y-${D / 2}),${D / 2}),255,0)'[face];`
        + `color=c=white:s=${D + 24}x${D + 24},format=rgba,geq=r=255:g=255:b=255:a='if(lte(hypot(X-${(D + 24) / 2},Y-${(D + 24) / 2}),${(D + 24) / 2}),255,0)'[ring];`
        + `${base}[ring]overlay=88:${(630 - D - 24) / 2}[b1];[b1][face]overlay=100:${(630 - D) / 2}[b2];`;
      base = '[b2]';
    }
    const x = photo ? 560 : 100;
    graph += `${base}[logo]overlay=${x}:470[b3];`
      + `[b3]drawtext=fontfile='${font('geist-latin-600-normal.woff2')}':textfile='${tEyebrow}':fontcolor=0x6C4DF5:fontsize=24:x=${x}:y=150,`
      + `drawtext=fontfile='${font('unbounded-latin-600-normal.woff2')}':textfile='${tName}':fontcolor=0x1A1726:fontsize=${name.length > 18 ? 40 : 52}:x=${x}:y=205,`
      + `drawtext=fontfile='${font('geist-latin-500-normal.woff2')}':textfile='${tLine}':fontcolor=0x4A4560:fontsize=34:x=${x}:y=300[out]`;
    const part = path.join(tmp, 'card.jpg');
    await run(['-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]', '-frames:v', '1', '-q:v', '3', '-y', part]);
    fs.renameSync(part, out);
    return out;
  } catch (err) {
    console.error('[invite card]', err?.message?.split('\n')[0] ?? err);
    return FALLBACK;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

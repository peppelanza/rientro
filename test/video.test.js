import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
// helpers first: it points UPLOAD_DIR at a temp folder before the app's config is read
import { startApp } from './helpers.js';
import { sweepVideoConversions, videosConverted } from '../src/files.js';

// Needs ffmpeg (installed in the Docker image); skipped where it is missing.
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rientro-video-'));
const make = (name, seconds, args) => {
  const file = path.join(dir, name);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine',
    '-t', String(seconds), ...args, '-shortest', file]);
  return fs.readFileSync(file);
};

// Encoded up front: ffmpeg runs synchronously and would stall the in-process server mid-test
const mp4 = ['-c:v', 'libx264', '-b:v', '12M', '-c:a', 'aac'];
const clips = {};
let t;
before(async () => {
  if (hasFfmpeg) {
    clips.short = make('short.mp4', 8, mp4);
    clips.long = make('long.mp4', 65, ['-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '1M', '-c:a', 'aac']);
    clips.ok = make('ok.mp4', 20, mp4);
    // A browser recording: WebM with no duration in its header
    clips.rec = make('rec.webm', 18, ['-c:v', 'libvpx', '-deadline', 'realtime', '-b:v', '2M', '-c:a', 'libopus', '-live', '1']);
  }
  t = await startApp();
});
after(() => t.close());

const pause = ms => new Promise(r => setTimeout(r, ms));

test('profile videos last 15 to 60 seconds and become a light MP4 only once confirmed', { skip: !hasFfmpeg && 'ffmpeg not installed' }, async () => {
  const u = await t.login('video@x.it');

  const short = await u.raw('POST', '/api/me/video', clips.short);
  assert.equal(short.status, 400);
  assert.equal(short.body.error, 'video_too_short');
  const long = await u.raw('POST', '/api/me/video', clips.long);
  assert.equal(long.status, 400);
  assert.equal(long.body.error, 'video_too_long');

  // Served as sent, and left alone until the member confirms the take
  const ok = await u.raw('POST', '/api/me/video', clips.ok);
  assert.equal(ok.status, 200);
  await pause(300);
  await videosConverted();
  assert.equal((await u.get(ok.body.url)).body.byteLength, clips.ok.length);
  await u.post('/api/me/video/confirm');
  await videosConverted();
  const file = await u.get(ok.body.url);
  assert.equal(file.headers.get('content-type'), 'video/mp4');
  assert.ok(file.body.byteLength < clips.ok.length / 2, `converted ${file.body.byteLength} vs original ${clips.ok.length}`);

  // A browser recording (WebM, no duration in its header) replaces it: the old file is gone
  const rec = await u.raw('POST', '/api/me/video', clips.rec);
  assert.equal(rec.status, 200);
  assert.equal((await u.get(ok.body.url)).status, 404);
  assert.equal((await u.get(rec.body.url)).headers.get('content-type'), 'video/webm');

  // Confirmed, then replaced while ffmpeg is on it: the conversion stops and leaves nothing behind
  await u.post('/api/me/video/confirm');
  await pause(200);
  const again = await u.raw('POST', '/api/me/video', clips.ok);
  assert.equal(again.status, 200);
  await videosConverted();
  assert.equal((await u.get(rec.body.url)).status, 404);
  assert.equal((await u.get(again.body.url)).body.byteLength, clips.ok.length);
  const stored = t.app.db.prepare("SELECT storage_key FROM files WHERE kind = 'profile_video'").all();
  assert.equal(stored.length, 1);
  assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length, 1, 'only the current video is on disk');

  // Never confirmed (tab closed): the periodic sweep converts it once it is old enough
  sweepVideoConversions(t.app.db, 60_000);
  await videosConverted();
  assert.equal((await u.get(again.body.url)).body.byteLength, clips.ok.length);
  sweepVideoConversions(t.app.db, 0);
  await videosConverted();
  assert.ok((await u.get(again.body.url)).body.byteLength < clips.ok.length / 2);
});

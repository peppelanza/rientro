import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';

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
    clips.short = make('short.mp4', 5, mp4);
    clips.long = make('long.mp4', 40, mp4);
    clips.ok = make('ok.mp4', 15, mp4);
    clips.rec = make('rec.webm', 12, ['-c:v', 'libvpx', '-b:v', '2M', '-c:a', 'libopus']);
  }
  t = await startApp();
});
after(() => t.close());

test('profile videos must last 10 to 30 seconds and are converted to a light MP4', { skip: !hasFfmpeg && 'ffmpeg not installed' }, async () => {
  const u = await t.login('video@x.it');

  const short = await u.raw('POST', '/api/me/video', clips.short);
  assert.equal(short.status, 400);
  assert.equal(short.body.error, 'video_too_short');
  const long = await u.raw('POST', '/api/me/video', clips.long);
  assert.equal(long.status, 400);
  assert.equal(long.body.error, 'video_too_long');

  const ok = await u.raw('POST', '/api/me/video', clips.ok);
  assert.equal(ok.status, 200);
  const file = await u.get(ok.body.url);
  assert.equal(file.headers.get('content-type'), 'video/mp4');
  assert.ok(file.body.byteLength < clips.ok.length / 2, `converted ${file.body.byteLength} vs original ${clips.ok.length}`);

  // A browser recording (WebM, VP8/Opus) is accepted and stored as MP4
  const rec = await u.raw('POST', '/api/me/video', clips.rec);
  assert.equal(rec.status, 200);
  assert.equal((await u.get(rec.body.url)).headers.get('content-type'), 'video/mp4');
});

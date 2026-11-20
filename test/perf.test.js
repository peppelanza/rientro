import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { startApp } from './helpers.js';

const { openDb } = await import('../src/db.js');
const { routeLabel } = await import('../src/perf.js');

test('one-off migrations run once per database: recorded, then skipped', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rientro-once-')), 'db.sqlite');
  let db = openDb(file);
  const done = db.prepare('SELECT name FROM migrations').all().map(r => r.name);
  for (const name of ['idea-stages', 'no-review', 'settle-duplicate-connections', 'collapse-message-notifications']) assert.ok(done.includes(name), name);
  // a value the one-off "In Italia → Indifferente" would change, written after it ran: left alone
  const ts = new Date().toISOString();
  db.prepare("INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES ('a', 'a@x.it', 'member', 'approved', ?, ?)").run(ts, ts);
  db.prepare("INSERT INTO profiles (user_id, seeking_location, updated_at) VALUES ('a', 'italy', ?)").run(ts);
  db.close();
  db = openDb(file);
  assert.equal(db.prepare("SELECT seeking_location FROM profiles WHERE user_id = 'a'").get().seeking_location, 'italy');
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
  db.close();
});

test('slow-request labels carry the route, not the ids', () => {
  assert.equal(routeLabel('/persone/8c1f2b3a-1234-4abc-9def-0123456789ab'), '/persone/:id');
  assert.equal(routeLabel('/supporto/42'), '/supporto/:id');
  assert.equal(routeLabel('/scopri'), '/scopri');
  assert.equal(routeLabel('/rientro-dei-cervelli'), '/rientro-dei-cervelli');
});

// Raw HTTP: fetch would undo the compression before we see it
const getRaw = (base, p, headers = {}) => new Promise((resolve, reject) => {
  http.get(base + p, { headers }, res => {
    const chunks = [];
    res.on('data', c => chunks.push(c)).on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  }).on('error', reject);
});

test('static files are streamed: text compressed on the way, pictures with their length', async () => {
  const t = await startApp();
  try {
    const css = fs.readFileSync('public/app/app.css');
    const gz = await getRaw(t.base, '/app/app.css', { 'accept-encoding': 'gzip' });
    assert.equal(gz.status, 200);
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.equal(gz.headers['cache-control'], 'no-store');
    assert.ok(zlib.gunzipSync(gz.body).equals(css));
    const plain = await getRaw(t.base, '/app/app.css');
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal(Number(plain.headers['content-length']), css.length);
    assert.ok(plain.body.equals(css));
    const png = fs.readFileSync('public/favicon-48.png');
    const img = await getRaw(t.base, '/favicon-48.png', { 'accept-encoding': 'gzip' });
    assert.equal(img.headers['content-type'], 'image/png');
    assert.equal(img.headers['content-encoding'], undefined);
    assert.equal(Number(img.headers['content-length']), png.length);
    assert.ok(img.body.equals(png));
  } finally { t.close(); }
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { startApp } from './helpers.js';
import { addProfileColumns } from '../src/db.js';
import { arrivedWhen } from '../src/profiles.js';

let t;
before(async () => { t = await startApp(); });
after(() => t.close());

test('onboarding: submit requires the essentials, then goes to review', async () => {
  const u = await t.login('fresh@x.it');
  const r = await u.post('/api/me/submit');
  assert.equal(r.status, 409);
  assert.match(r.body.message, /Foto/);
  const m = await t.member('complete@x.it');
  const s = await m.post('/api/me/submit');
  assert.equal(s.body.user.status, 'in_review');
});

test('who lives in Italy says where from and when; "ho sempre vissuto in Italia" overrides it', async () => {
  const a = await t.approved('arrivo@x.it', { lives_in: 'italy', lives_in_city: 'Bari' });
  let r = await a.patch('/api/me/profile', { arrived_from_country: 'Regno Unito', arrived_from_city: 'Londra', arrived_when: '3_12m' });
  assert.equal(r.status, 200);
  assert.equal(r.body.arrived_when, '3_12m');
  const viewer = await t.approved('guarda@x.it');
  assert.equal((await viewer.get(`/api/profiles/${a.id}`)).body.arrived, 'Da Londra, Regno Unito · 3–12 mesi fa');

  // Stored as dates: the span moves with time, and re-saving the same answer keeps them
  const { arrived_after, arrived_before } = t.app.db.prepare('SELECT arrived_after, arrived_before FROM profiles WHERE user_id = ?').get(a.id);
  r = await a.patch('/api/me/profile', { arrived_when: '3_12m' });
  assert.deepEqual([r.body.arrived_after, r.body.arrived_before], [arrived_after, arrived_before]);
  const now = new Date(); const later = now.getFullYear() * 12 + now.getMonth() + 9;
  assert.equal(arrivedWhen({ arrived_after, arrived_before }, later), '1_2y');
  r = await a.patch('/api/me/profile', { arrived_when: '2y_plus' });
  assert.equal(r.body.arrived_after, null);
  assert.equal(r.body.arrived_when, '2y_plus');

  assert.equal((await a.patch('/api/me/profile', { arrived_when: 'ieri' })).status, 400);
  assert.equal((await a.patch('/api/me/profile', { arrived_from_country: 'Italia' })).status, 400);

  r = await a.patch('/api/me/profile', { always_in_italy: true });
  assert.equal(r.body.always_in_italy, true);
  assert.equal(r.body.arrived_from_city, null);
  assert.equal(r.body.arrived_when, null);
  assert.equal((await viewer.get(`/api/profiles/${a.id}`)).body.arrived, 'Ha sempre vissuto in Italia');
});

test('the first arrival columns are migrated to the date range', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY); CREATE TABLE profiles (user_id TEXT PRIMARY KEY, arrived_from_country TEXT, arrived_from_city TEXT, arrived_period TEXT, in_italy_long_time INTEGER NOT NULL DEFAULT 0);
    INSERT INTO profiles VALUES ('a', 'Germania', 'Berlino', '2025-H2', 0), ('b', NULL, NULL, NULL, 1);`);
  addProfileColumns(db);
  const rows = db.prepare('SELECT * FROM profiles ORDER BY user_id').all();
  assert.equal(rows[0].arrived_after, '2025-07');
  assert.equal(rows[0].arrived_before, '2025-12');
  assert.equal(rows[1].arrived_after, null);
  assert.ok(rows[1].arrived_before);
  assert.ok(!('arrived_period' in rows[0]) && !('in_italy_long_time' in rows[0]));
});

test('education and experience CRUD', async () => {
  const u = await t.member('cv@x.it');
  let e = (await u.post('/api/me/education', { school: 'Politecnico di Milano', degree: 'Ingegneria gestionale', years: '2010 – 2013' })).body;
  assert.equal(e.length, 1);
  e = (await u.patch(`/api/me/education/${e[0].id}`, { school: 'PoliMi', degree: 'MSc', years: '2013' })).body;
  assert.equal(e[0].school, 'PoliMi');
  const x = (await u.post('/api/me/experiences', { company: 'Spotify', role: 'PM', start_month: '2019-03', current: true })).body;
  assert.equal(x[0].current, true);
  assert.equal((await u.post('/api/me/experiences', { company: 'X', start_month: '03/2019' })).status, 400);
  assert.equal((await u.del(`/api/me/education/${e[0].id}`)).body.length, 0);
});

test('connection request with note → accept → chat; decline is silent', async () => {
  const a = await t.approved('giulia@x.it', { background_area: 'Marketing / Growth', seeking_backgrounds: ['Prodotto'] });
  const b = await t.approved('marco@x.it', { background_area: 'Prodotto' });
  const card = (await b.get('/api/profiles')).body.people.find(p => p.id === a.id);
  assert.equal(card.comp, 'Cerca Prodotto, il tuo background');

  const req = await b.post('/api/connections', { to: a.id, note: 'Ciao Giulia!' });
  assert.equal((await b.post('/api/connections', { to: a.id })).status, 409);
  assert.equal((await b.post(`/api/threads/${a.id}`, { body: 'hi' })).status, 403);
  const inbox = (await a.get('/api/connections')).body;
  assert.equal(inbox.received[0].note, 'Ciao Giulia!');
  assert.ok((await a.get('/api/notifications')).body.some(n => n.kind === 'connection_request'));
  await a.post(`/api/connections/${req.body.id}/accept`);
  assert.ok((await b.get('/api/notifications')).body.some(n => n.kind === 'connection_accepted'));
  await b.post(`/api/threads/${a.id}`, { body: 'Ti va una call giovedì?' });
  assert.equal((await a.get('/api/me')).body.counts.unread_messages, 1);
  const thread = (await a.get(`/api/threads/${b.id}`)).body;
  assert.equal(thread.messages[0].body, 'Ti va una call giovedì?');
  assert.equal((await a.get('/api/me')).body.counts.unread_messages, 0);

  const c = await t.approved('carla@x.it');
  const r2 = await c.post('/api/connections', { to: a.id });
  await a.post(`/api/connections/${r2.body.id}/decline`);
  assert.ok(!(await c.get('/api/notifications')).body.some(n => n.kind !== 'profile_approved'));
});

test('blocking hides both ways and closes the connection', async () => {
  const a = await t.approved('blocker@x.it');
  const b = await t.approved('blocked@x.it');
  await t.connect(a, b);
  await a.post(`/api/blocks/${b.id}`);
  assert.equal((await b.get(`/api/profiles/${a.id}`)).status, 404);
  assert.equal((await a.get(`/api/profiles/${b.id}`)).status, 404);
  assert.ok(!(await b.get('/api/profiles')).body.people.some(p => p.id === a.id));
  assert.equal((await b.post(`/api/threads/${a.id}`, { body: 'hey' })).status, 403);
  assert.equal((await a.get('/api/me/blocks')).body[0].id, b.id);
});

test('reports reach moderation; resolving can suspend; suspended users are locked out', async () => {
  const a = await t.approved('reporter@x.it');
  const b = await t.approved('spammer@x.it');
  await a.post('/api/reports', { user_id: b.id, reason: 'spam', details: 'Vende consulenze', block: true });
  const admin = await t.asAdmin();
  const list = (await admin.get('/api/admin/reports')).body;
  const rep = list.reports.find(r => r.reported_id === b.id);
  assert.equal(rep.reason_label, 'Spam');
  await admin.post(`/api/admin/reports/${rep.id}`, { action: 'suspend' });
  assert.equal((await b.get('/api/me')).status, 401); // sessions revoked
  const h = { 'content-type': 'application/json', 'x-requested-with': 'rientro' };
  await fetch(`${t.base}/api/auth/request-code`, { method: 'POST', headers: h, body: JSON.stringify({ email: 'spammer@x.it' }) });
  const login = await fetch(`${t.base}/api/auth/verify-code`, { method: 'POST', headers: h, body: JSON.stringify({ email: 'spammer@x.it', code: t.codes.get('spammer@x.it') }) });
  assert.equal(login.status, 403);
});

test('request changes sends the note to the member', async () => {
  const u = await t.member('fixme@x.it');
  await u.post('/api/me/submit');
  const admin = await t.asAdmin();
  await admin.post(`/api/admin/users/${u.id}/review`, { action: 'request_changes', note: 'Aggiungi una foto in cui si veda il volto.' });
  const me = (await u.get('/api/me')).body;
  assert.equal(me.user.status, 'changes_requested');
  assert.equal(me.profile.review_note, 'Aggiungi una foto in cui si veda il volto.');
  assert.equal((await u.post('/api/me/submit')).body.user.status, 'in_review');
});

test('dashboard and analytics compute without errors', async () => {
  const admin = await t.asAdmin();
  const d = await admin.get('/api/admin/dashboard?period=30');
  assert.equal(d.status, 200);
  assert.equal(d.body.kpis.length, 6);
  // The signup chart ends today, so members who joined today are counted
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(d.body.signups.at(-1).day, today);
  assert.ok(d.body.signups.at(-1).signups > 0);
  const a = await admin.get('/api/admin/analytics?period=90');
  assert.equal(a.status, 200);
  assert.equal(a.body.weeks.length, 13);
});

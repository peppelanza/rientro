import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';

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

test('who lives in Italy says where from and when; "da più di 2 anni" overrides it', async () => {
  const a = await t.approved('arrivo@x.it', { lives_in: 'italy', lives_in_city: 'Bari' });
  const half = `${new Date().getFullYear() - 1}-H2`;
  let r = await a.patch('/api/me/profile', { arrived_from_country: 'Regno Unito', arrived_from_city: 'Londra', arrived_period: half });
  assert.equal(r.status, 200);
  assert.equal(r.body.arrived_period, half);
  const viewer = await t.approved('guarda@x.it');
  const seen = (await viewer.get(`/api/profiles/${a.id}`)).body;
  assert.equal(seen.arrived, `Da Londra, Regno Unito · tra luglio e dicembre ${new Date().getFullYear() - 1}`);

  assert.equal((await a.patch('/api/me/profile', { arrived_period: '2019-H1' })).status, 400); // over two years back
  assert.equal((await a.patch('/api/me/profile', { arrived_period: 'ieri' })).status, 400);
  assert.equal((await a.patch('/api/me/profile', { arrived_from_country: 'Italia' })).status, 400);

  r = await a.patch('/api/me/profile', { in_italy_long_time: true });
  assert.equal(r.body.in_italy_long_time, true);
  assert.equal(r.body.arrived_from_city, null);
  assert.equal(r.body.arrived_period, null);
  assert.equal((await viewer.get(`/api/profiles/${a.id}`)).body.arrived, 'In Italia da più di 2 anni');
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

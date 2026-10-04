import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { makeClient, startApp } from './helpers.js';
import { addProfileColumns } from '../src/db.js';
import { arrivedWhen } from '../src/profiles.js';

let t;
before(async () => { t = await startApp(); });
after(() => t.close());

test('onboarding: submit requires the essentials, then the profile is online', async () => {
  const u = await t.login('fresh@x.it');
  const r = await u.post('/api/me/submit');
  assert.equal(r.status, 409);
  assert.match(r.body.message, /Foto/);
  const m = await t.member('complete@x.it');
  const s = await m.post('/api/me/submit');
  assert.equal(s.body.user.status, 'approved');
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
  // Coming back from elsewhere in Italy is fine
  assert.equal((await a.patch('/api/me/profile', { arrived_from_country: 'Italia', arrived_from_city: 'Torino' })).status, 200);

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
  const inbox = (await a.get('/api/connections?tab=received')).body;
  assert.equal(inbox.items[0].note, 'Ciao Giulia!');
  assert.ok((await a.get('/api/notifications')).body.items.some(n => n.kind === 'connection_request'));
  await a.post(`/api/connections/${req.body.id}/accept`);
  assert.ok((await a.get('/api/notifications')).body.items.find(n => n.kind === 'connection_request').read, 'answered: its notification is read');
  assert.ok((await b.get('/api/notifications')).body.items.some(n => n.kind === 'connection_accepted'));
  await b.post(`/api/threads/${a.id}`, { body: 'Ti va una call giovedì?' });
  assert.equal((await a.get('/api/me')).body.counts.unread_messages, 1);
  const thread = (await a.get(`/api/threads/${b.id}`)).body;
  assert.equal(thread.messages[0].body, 'Ti va una call giovedì?');
  assert.ok((await a.get('/api/notifications')).body.items.filter(n => n.kind === 'message').every(n => n.read), 'chat opened: its notification is read');
  assert.equal((await a.get('/api/me')).body.counts.unread_messages, 0);

  const c = await t.approved('carla@x.it');
  const r2 = await c.post('/api/connections', { to: a.id });
  await a.post(`/api/connections/${r2.body.id}/decline`);
  assert.ok(!(await c.get('/api/notifications')).body.items.some(n => n.kind !== 'profile_approved'));
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
  assert.equal((await a.get('/api/me/blocks')).body.items[0].id, b.id);
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

test('moderation is only suspend / give back; old review states are migrated', async () => {
  const u = await t.approved('modera@x.it');
  const admin = await t.asAdmin();
  for (const action of ['approve', 'request_changes', 'reject']) {
    assert.equal((await admin.post(`/api/admin/users/${u.id}/review`, { action, note: 'x' })).status, 400, action);
  }
  assert.equal((await admin.post(`/api/admin/users/${u.id}/review`, { action: 'suspend' })).status, 200);
  assert.equal((await admin.post(`/api/admin/users/${u.id}/review`, { action: 'unsuspend' })).status, 200);
  assert.equal(t.app.db.prepare('SELECT status FROM users WHERE id = ?').get(u.id).status, 'approved');
  // Database from before: waiting / changes requested → online, edits applied; rejected → suspended
  const { openDb } = await import('../src/db.js');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rientro-mig-')), 'db.sqlite');
  let db = openDb(file);
  const ts = new Date().toISOString();
  for (const [id, status, pending] of [['a', 'in_review', '{}'], ['b', 'changes_requested', '{}'], ['c', 'rejected', '{}'], ['d', 'approved', JSON.stringify({ first_name: 'Nuovo' })]]) {
    db.prepare('INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, `${id}@x.it`, 'member', status, ts, ts);
    db.prepare('INSERT INTO profiles (user_id, first_name, pending_changes, updated_at) VALUES (?, ?, ?, ?)').run(id, 'Vecchio', pending, ts);
  }
  db.close();
  db = openDb(file);
  const st = Object.fromEntries(db.prepare('SELECT id, status FROM users').all().map(r => [r.id, r.status]));
  assert.deepEqual(st, { a: 'approved', b: 'approved', c: 'suspended', d: 'approved' });
  assert.equal(db.prepare("SELECT first_name FROM profiles WHERE user_id = 'd'").get().first_name, 'Nuovo');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE pending_changes != '{}'").get().n, 0);
  db.close();
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

test('admin "Accedi come": acts as the member, banner flag, exit gives the admin session back, audited', async () => {
  const t = await startApp();
  try {
    const admin = await t.asAdmin();
    const marco = await t.approved('marco@example.com');
    const giulia = await t.approved('giulia@example.com');
    const req = await marco.post('/api/connections', { to: giulia.id });

    assert.equal((await marco.post(`/api/admin/users/${giulia.id}/impersonate`)).status, 403);
    const start = await admin.post(`/api/admin/users/${giulia.id}/impersonate`);
    assert.equal(start.status, 200);
    const cookies = start.headers.getSetCookie().map(c => c.split(';')[0]);
    const as = makeClient(t.base, cookies.join('; '));
    const me = await as.get('/api/me');
    assert.equal(me.body.user.id, giulia.id);
    assert.equal(me.body.impersonated, true);
    assert.equal((await giulia.get('/api/me')).body.impersonated, false);
    assert.equal((await as.post(`/api/connections/${req.body.id}/accept`)).status, 200);
    assert.equal((await as.get('/api/admin/users')).status, 403);
    assert.equal((await as.post('/api/me/legal', { accept: true })).status, 403);
    // Not among Giulia's own devices, and not her activity
    assert.ok((await giulia.get('/api/me/sessions')).body.every(s => s.current));

    const stop = await as.post('/api/auth/impersonation/stop');
    assert.equal(stop.status, 200);
    assert.match(stop.body.go, new RegExp(`/admin/utenti/${giulia.id}$`));
    const back = makeClient(t.base, stop.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => !c.endsWith('=')).join('; '));
    assert.equal((await back.get('/api/me')).body.user.id, admin.id);
    assert.equal((await as.get('/api/me')).status, 401);
    const log = (await admin.get('/api/admin/audit')).body.items.map(l => l.action);
    assert.ok(log.includes('user.impersonate') && log.includes('user.impersonate_end'));
  } finally { t.close(); }
});

test('paging and search: discover sorts all results before paging, connections and blocks are searchable', async () => {
  const t = await startApp();
  try {
    const me = await t.approved('lettore@example.com', { background_area: 'Prodotto' });
    const others = [];
    for (let i = 0; i < 26; i++) others.push(await t.approved(`p${i}@example.com`, { first_name: `Persona${i}`, background_area: 'Design', sectors: ['Turismo'], seeking_backgrounds: i === 0 ? ['Prodotto'] : ['Marketing / Growth'] }));
    // Page 1 of "Più affini": the only complementary profile (the oldest one) comes first
    const p1 = (await me.get('/api/profiles?sort=match')).body;
    assert.equal(p1.total, 26);
    assert.equal(p1.pages, 2);
    assert.equal(p1.people.length, 24);
    assert.equal(p1.people[0].id, others[0].id);
    const r1 = (await me.get('/api/profiles?sort=recent')).body;
    const r2 = (await me.get('/api/profiles?sort=recent&page=2')).body;
    assert.equal(r2.people.length, 2);
    assert.equal(new Set([...r1.people, ...r2.people].map(p => p.id)).size, 26, 'every person once across the pages');

    for (const o of others.slice(0, 3)) await t.connect(me, o);
    const all = (await me.get('/api/connections')).body;
    assert.deepEqual([all.counts.connected, all.total, all.tab], [3, 3, 'connected']);
    const found = (await me.get('/api/connections?q=persona1')).body;
    assert.deepEqual(found.items.map(c => c.id), [others[1].id]);
    assert.equal((await me.get('/api/threads?q=persona2')).body.total, 0, 'a connection nobody wrote in is not a conversation');
    await me.post(`/api/threads/${others[2].id}`, { body: 'Ciao!' });
    assert.equal((await me.get('/api/threads?q=persona2')).body.items[0].id, others[2].id);
    assert.equal((await me.get('/api/threads')).body.total, 1, 'only conversations with messages');

    await me.post(`/api/blocks/${others[5].id}`);
    assert.equal((await me.get('/api/me/blocks?q=persona5')).body.total, 1);
    assert.equal((await me.get('/api/me/blocks?q=nessuno')).body.total, 0);
  } finally { t.close(); }
});

test('profile visibility: only an admin hides and shows a profile; in-app notifications always arrive', async () => {
  const t = await startApp();
  try {
    const admin = await t.asAdmin();
    const a = await t.approved('vis-a@example.com');
    const b = await t.approved('vis-b@example.com');
    assert.equal((await a.patch('/api/me/profile', { visible: false })).status, 400);
    assert.equal((await admin.post(`/api/admin/users/${a.id}/review`, { action: 'hide' })).status, 200);
    assert.equal((await b.get(`/api/profiles/${a.id}`)).status, 404);
    assert.ok(!(await b.get('/api/profiles')).body.people.some(p => p.id === a.id));
    assert.equal((await admin.post(`/api/admin/users/${a.id}/review`, { action: 'show' })).status, 200);
    assert.equal((await b.get(`/api/profiles/${a.id}`)).status, 200);
    // The app channel is no longer a setting
    assert.equal((await b.patch('/api/me/notifications', { notify_requests_app: false })).status, 400);
    await a.post('/api/connections', { to: b.id });
    assert.ok((await b.get('/api/notifications')).body.items.some(n => n.kind === 'connection_request'));
  } finally { t.close(); }
});

test('email digests: only after 15 minutes unread, grouped, once, as the settings say; welcome on sign-up', async () => {
  const welcomes = [];
  const t = await startApp({ sendWelcome: email => welcomes.push(email) });
  const { sendNotificationDigests } = await import('../src/email-digest.js');
  const sent = [];
  const send = mail => { sent.push(mail); };
  const later = min => Date.now() + min * 60_000;
  try {
    const a = await t.approved('dig-a@example.com', { first_name: 'Anna' });
    const b = await t.approved('dig-b@example.com', { first_name: 'Bruno' });
    const c = await t.approved('dig-c@example.com', { first_name: 'Carla' });
    assert.deepEqual(welcomes, ['dig-a@example.com', 'dig-b@example.com', 'dig-c@example.com']);
    await t.login('dig-a@example.com');
    assert.equal(welcomes.length, 3, 'only once, when the account is created');

    // A request: nothing before 15 minutes, then one email, then never again
    await a.post('/api/connections', { to: b.id, note: 'Ciao Bruno!' });
    await sendNotificationDigests(t.app.db, { send, at: later(10) });
    assert.equal(sent.length, 0);
    await sendNotificationDigests(t.app.db, { send, at: later(16) });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'dig-b@example.com');
    assert.match(sent[0].subject, /Anna .* vuole entrare in contatto con te/);
    assert.match(sent[0].html, /Ciao Bruno!/);
    await sendNotificationDigests(t.app.db, { send, at: later(40) });
    assert.equal(sent.length, 1, 'emailed once');

    // Messages from two people: one email for both; a chat read in the app is left out
    await t.connect(c, b);
    const req = (await b.get('/api/connections?tab=received')).body.items[0];
    await b.post(`/api/connections/${req.connection_id}/accept`);
    await a.post(`/api/threads/${b.id}`, { body: 'Primo' });
    await a.post(`/api/threads/${b.id}`, { body: 'Secondo' });
    await c.post(`/api/threads/${b.id}`, { body: 'Ciao da Carla' });
    sent.length = 0;
    await sendNotificationDigests(t.app.db, { send, at: later(16) });
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /3 nuovi messaggi da 2 persone/);
    assert.match(sent[0].html, /Secondo/);

    await a.post(`/api/threads/${b.id}`, { body: 'Terzo' });
    await b.get(`/api/threads/${a.id}`); // read in the app
    sent.length = 0;
    await sendNotificationDigests(t.app.db, { send, at: later(32) });
    assert.equal(sent.length, 0);

    // Message emails switched off in Impostazioni → Notifiche
    assert.equal((await b.patch('/api/me/notifications', { notify_messages_email: false })).status, 200);
    await c.post(`/api/threads/${b.id}`, { body: 'Ci sei?' });
    await sendNotificationDigests(t.app.db, { send, at: later(48) });
    assert.equal(sent.length, 0);
  } finally { t.close(); }
});

test('emails are branded and escape what members write', async () => {
  const { digestEmail, loginCodeEmail, welcomeEmail } = await import('../src/mail.js');
  const otp = loginCodeEmail('123456');
  assert.match(otp.html, /Rientro<span[^>]*>\.<\/span>/);
  assert.match(otp.html, /123456/);
  assert.match(welcomeEmail({ launched: false }).subject, /apriamo il 1° gennaio 2027/);
  assert.match(welcomeEmail({ launched: true }).html, /Scopri chi torna/);
  const d = digestEmail({ requests: [{ name: '<b>X</b>', note: '<script>' }], messages: [] });
  assert.ok(!d.html.includes('<script>') && d.html.includes('&lt;script&gt;'));
});

test('profile preview (?anteprima) is exactly what a member who is not connected sees', async () => {
  const t = await startApp();
  try {
    const me = await t.approved('prev-me@example.com', { instagram_handle: 'mia.ig', calendar_url: 'https://cal.com/me' });
    const other = await t.approved('prev-other@example.com');
    const preview = (await me.get(`/api/profiles/${me.id}?anteprima=1`)).body;
    const seen = (await other.get(`/api/profiles/${me.id}`)).body;
    // Only what depends on who is looking may differ
    for (const k of ['complement', 'viewer_background']) { delete preview[k]; delete seen[k]; }
    assert.deepEqual(preview, seen);
    assert.equal(preview.links.instagram_handle, undefined);
    assert.equal(preview.connection.status, 'none');
    // Without ?anteprima the owner still gets everything (the editor uses it)
    assert.equal((await me.get(`/api/profiles/${me.id}`)).body.links.instagram_handle, '@mia.ig');
  } finally { t.close(); }
});

test('one link per pair: duplicates are settled at start, lists show a person once, asking back accepts', async () => {
  const t = await startApp();
  try {
    const a = await t.approved('dup-a@example.com');
    const b = await t.approved('dup-b@example.com');
    const c = await t.approved('dup-c@example.com');
    const d = await t.approved('dup-d@example.com');
    const db = t.app.db;
    const ins = db.prepare("INSERT INTO connections (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, ?, ?)");
    const status = id => db.prepare('SELECT status FROM connections WHERE id = ?').get(id).status;
    // a–b connected, plus open requests both ways (as found in production)
    ins.run('ab-acc', a.id, b.id, 'accepted', '2026-10-01T10:00:00Z');
    ins.run('ab-p1', b.id, a.id, 'pending', '2026-10-01T09:00:00Z');
    ins.run('ab-p2', a.id, b.id, 'pending', '2026-10-01T11:00:00Z');
    // a–d asked each other
    ins.run('ad-1', a.id, d.id, 'pending', '2026-10-01T09:00:00Z');
    ins.run('ad-2', d.id, a.id, 'pending', '2026-10-01T12:00:00Z');
    const before = (await a.get('/api/connections')).body.counts;
    assert.deepEqual(before, { connected: 1, received: 1, sent: 0 }, 'each person once: b connected, d received');

    const { settleDuplicateConnections } = await import('../src/db.js');
    settleDuplicateConnections(db);
    assert.deepEqual(['ab-acc', 'ab-p1', 'ab-p2'].map(status), ['accepted', 'withdrawn', 'withdrawn']);
    assert.deepEqual(['ad-1', 'ad-2'].map(status), ['accepted', 'withdrawn']);
    assert.deepEqual((await a.get('/api/connections')).body.counts, { connected: 2, received: 0, sent: 0 });

    // Asking back someone who asked you: accepted, not a second request
    await c.post('/api/connections', { to: a.id });
    const back = await a.post('/api/connections', { to: c.id });
    assert.equal(back.status, 200);
    assert.equal(back.body.status, 'connected');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM connections WHERE status = 'pending' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))").get(a.id, c.id, c.id, a.id).n, 0);
  } finally { t.close(); }
});

test('reactions: one emoji per person on the other person\'s messages, removable, sent to an open chat', async () => {
  const t = await startApp();
  try {
    const a = await t.approved('re-a@example.com');
    const b = await t.approved('re-b@example.com');
    await t.connect(a, b);
    const m1 = (await a.post(`/api/threads/${b.id}`, { body: 'Ciao! 😊' })).body;
    const open = (await a.get(`/api/threads/${b.id}`)).body;
    const react = (who, other, id, emoji) => who.raw('PUT', `/api/threads/${other}/messages/${id}/reaction`, Buffer.from(JSON.stringify({ emoji })), { 'content-type': 'application/json' });

    assert.equal((await react(a, b.id, m1.id, '❤️')).status, 404, 'not on your own message');
    assert.equal((await react(b, a.id, m1.id, 'ciao')).status, 400);
    assert.equal((await react(b, a.id, m1.id, '❤️❤️')).status, 400, 'one emoji');
    const r = await react(b, a.id, m1.id, '❤️');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.reactions, [{ emoji: '❤️', mine: true }]);
    assert.deepEqual((await react(b, a.id, m1.id, '👍🏽')).body.reactions, [{ emoji: '👍🏽', mine: true }], 'replaces');

    // The sender's open chat learns about it by polling
    const poll = (await a.get(`/api/threads/${b.id}?after=${m1.id}&since=${encodeURIComponent(open.at)}`)).body;
    assert.deepEqual(poll.reactions_changed, [{ id: m1.id, reactions: [{ emoji: '👍🏽', mine: false }] }]);
    assert.deepEqual((await a.get(`/api/threads/${b.id}`)).body.messages[0].reactions, [{ emoji: '👍🏽', mine: false }]);

    assert.deepEqual((await react(b, a.id, m1.id, null)).body.reactions, []);
    const poll2 = (await a.get(`/api/threads/${b.id}?after=${m1.id}&since=${encodeURIComponent(poll.at)}`)).body;
    assert.deepEqual(poll2.reactions_changed, [{ id: m1.id, reactions: [] }], 'removal reaches the open chat too');
  } finally { t.close(); }
});

test('replies quote a message of the same chat, like WhatsApp', async () => {
  const t = await startApp();
  try {
    const a = await t.approved('rp-a@example.com');
    const b = await t.approved('rp-b@example.com');
    const c = await t.approved('rp-c@example.com');
    await t.connect(a, b);
    await t.connect(a, c);
    const m1 = (await a.post(`/api/threads/${b.id}`, { body: 'Ci vediamo a Palermo?' })).body;
    const other = (await a.post(`/api/threads/${c.id}`, { body: 'Altra chat' })).body;

    const r = await b.post(`/api/threads/${a.id}`, { body: 'Sì, a maggio', reply_to: m1.id });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.reply, { id: m1.id, mine: false, body: 'Ci vediamo a Palermo?' });
    assert.equal((await b.post(`/api/threads/${a.id}`, { body: 'x', reply_to: other.id })).status, 404, 'not a message of another chat');

    const seen = (await a.get(`/api/threads/${b.id}`)).body.messages;
    assert.equal(seen[0].reply, null);
    assert.deepEqual(seen[1].reply, { id: m1.id, mine: true, body: 'Ci vediamo a Palermo?' }, 'the quote says who wrote it, for each side');
  } finally { t.close(); }
});

test('message notifications: one per person in a row, latest time, no preview of the text', async () => {
  const t = await startApp();
  try {
    const a = await t.approved('nm-a@example.com');
    const b = await t.approved('nm-b@example.com');
    const c = await t.approved('nm-c@example.com');
    await t.connect(a, b);
    await t.connect(c, b);
    const list = async () => (await b.get('/api/notifications')).body.items.filter(n => n.kind === 'message');
    await a.post(`/api/threads/${b.id}`, { body: 'uno' });
    await a.post(`/api/threads/${b.id}`, { body: 'due' });
    assert.equal((await list()).length, 1);
    await b.post('/api/notifications/read', {});
    await a.post(`/api/threads/${b.id}`, { body: 'tre' });
    let items = await list();
    assert.equal(items.length, 1, 'still one when the previous was already read');
    assert.equal(items[0].read, false);
    assert.equal(items[0].data.preview, undefined);
    await c.post(`/api/threads/${b.id}`, { body: 'altro' });
    await a.post(`/api/threads/${b.id}`, { body: 'quattro' });
    items = await list();
    assert.deepEqual(items.map(n => n.actor.id), [a.id, c.id], 'newest on top, one each');
  } finally { t.close(); }
});

test('discover: a region in "Dove vuole vivere" finds anyone who chose a comune there', async () => {
  const t = await startApp();
  try {
    const me = await t.approved('rg-me@example.com');
    const cat = await t.approved('rg-cat@example.com', { desired_comuni: ['Catania'] });
    const mol = await t.approved('rg-mol@example.com', { desired_comuni: ['Campobasso'] });
    await t.approved('rg-mi@example.com', { desired_comuni: ['Milano'] });
    const ids = async q => (await me.get(`/api/profiles?${q}`)).body.people.map(p => p.id).sort();
    assert.deepEqual(await ids(`desired=${encodeURIComponent('Sicilia (regione)')}`), [cat.id]);
    assert.deepEqual(await ids(`desired=${encodeURIComponent('Molise (regione)')}`), [mol.id], 'the region, not the comune called Molise');
    assert.deepEqual(await ids(`desired=${encodeURIComponent('Sicilia (regione),Campobasso')}`), [cat.id, mol.id].sort());
    const counts = (await me.get('/api/comuni/counts')).body;
    assert.equal(counts['Sicilia (regione)'], 1);
  } finally { t.close(); }
});

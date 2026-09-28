import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PNG, startApp } from './helpers.js';

let t;
before(async () => { t = await startApp(); });
after(() => t.close());

test('sign-in codes: wrong code rejected, attempts capped, code single-use', async () => {
  const h = { 'content-type': 'application/json', 'x-requested-with': 'rientro' };
  const post = (p, b) => fetch(t.base + p, { method: 'POST', headers: h, body: JSON.stringify(b) });
  await post('/api/auth/request-code', { email: 'codes@x.it' });
  const good = t.codes.get('codes@x.it');
  const wrong = good === '000000' ? '111111' : '000000';
  assert.equal((await post('/api/auth/verify-code', { email: 'codes@x.it', code: wrong })).status, 401);
  assert.equal((await post('/api/auth/verify-code', { email: 'codes@x.it', code: good })).status, 200);
  assert.equal((await post('/api/auth/verify-code', { email: 'codes@x.it', code: good })).status, 401);
  await post('/api/auth/request-code', { email: 'codes@x.it' });
  for (let i = 0; i < 5; i++) await post('/api/auth/verify-code', { email: 'codes@x.it', code: wrong });
  assert.equal((await post('/api/auth/verify-code', { email: 'codes@x.it', code: t.codes.get('codes@x.it') })).status, 429);
});

test('public profile never exposes email, job details or connections-only links', async () => {
  const a = await t.approved('anna@x.it', { instagram_handle: '@anna', calendar_url: 'https://cal.com/anna', linkedin_url: 'linkedin.com/in/anna' });
  await a.put('/api/me/job-seeking', { looking_for_italian_job: true });
  await a.patch('/api/me/job-preferences', { roles: ['Chief Tech Officer'], availability: 'now' });
  const b = await t.approved('bruno@x.it');
  const seen = (await b.get(`/api/profiles/${a.id}`)).body;
  const json = JSON.stringify(seen);
  for (const leak of ['anna@x.it', '@anna', 'cal.com', 'Chief Tech Officer', 'availability', 'selected_at', 'email', 'approved_at', 'pending_changes']) {
    assert.ok(!json.includes(leak), `leaked ${leak}`);
  }
  assert.equal(seen.status, undefined);
  assert.equal(seen.links.locked, true);
  assert.equal(seen.is_looking_for_italian_job, undefined); // job seeking is no longer shown to others
  await t.connect(b, a);
  const after = (await b.get(`/api/profiles/${a.id}`)).body;
  assert.equal(after.links.instagram_handle, '@anna');
  assert.equal(after.connection.status, 'connected');
});

test('unapproved profiles are hidden and cannot browse', async () => {
  const hidden = await t.member('hidden@x.it');
  const viewer = await t.approved('viewer@x.it');
  assert.equal((await viewer.get(`/api/profiles/${hidden.id}`)).status, 404);
  assert.equal((await hidden.get('/api/profiles')).status, 403);
});

test('photo/name edits by approved members wait for review', async () => {
  const u = await t.approved('edits@x.it', { first_name: 'Primo' });
  const v = await t.approved('watcher@x.it');
  await u.patch('/api/me/profile', { first_name: 'Secondo', bio: 'y'.repeat(170) });
  assert.equal((await v.get(`/api/profiles/${u.id}`)).body.first_name, 'Primo');
  assert.equal((await v.get(`/api/profiles/${u.id}`)).body.bio, 'y'.repeat(170)); // non-reviewed field is live
  assert.equal((await u.get('/api/me')).body.profile.first_name, 'Secondo');
  const a = await t.asAdmin();
  assert.ok((await a.get('/api/admin/approvals')).body.queue.some(q => q.id === u.id && q.kind === 'changes'));
  await a.post(`/api/admin/users/${u.id}/review`, { action: 'approve' });
  assert.equal((await v.get(`/api/profiles/${u.id}`)).body.first_name, 'Secondo');
});

test('admin endpoints require the admin role and every access is audited', async () => {
  const m = await t.member('member@x.it');
  for (const p of ['/api/admin/users', `/api/admin/users/${m.id}`, '/api/admin/audit', '/api/admin/dashboard']) {
    assert.equal((await m.get(p)).status, 403, p);
  }
  assert.equal((await fetch(`${t.base}/api/admin/users`)).status, 401);
  const a = await t.asAdmin();
  await a.get(`/api/admin/users/${m.id}`);
  const log = (await a.get('/api/admin/audit')).body;
  assert.ok(log.find(e => e.action === 'user.view' && e.target_user_id === m.id));
});

test('CSV export is admin-only, audited, and guards against formula injection', async () => {
  await t.approved('csv@x.it', { first_name: '=HYPERLINK("x")' });
  const a = await t.asAdmin();
  const r = await a.post('/api/admin/exports', { dataset: 'users', status: 'approved', columns: ['Nome e cognome', 'Email'] });
  assert.equal(r.status, 200);
  assert.ok(r.body.includes("'=HYPERLINK"));
  const log = (await a.get('/api/admin/audit')).body;
  assert.ok(log.find(e => e.action === 'export.csv' && e.details.dataset === 'users'));
  const m = await t.member('nocsv@x.it');
  assert.equal((await m.post('/api/admin/exports', { dataset: 'users' })).status, 403);
});

test('audit log and ledger are append-only at the database level', () => {
  const { db } = t.app;
  assert.throws(() => db.prepare('DELETE FROM admin_audit_log').run(), /append-only/);
  assert.throws(() => db.prepare("UPDATE admin_audit_log SET action = 'x'").run(), /append-only/);
  assert.throws(() => db.prepare('UPDATE preference_events SET value = 1 - value').run(), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM preference_events').run(), /purge/);
});

test('uploads are sniffed by content and served only to authorised viewers', async () => {
  const u = await t.approved('photo@x.it');
  assert.equal((await u.raw('POST', '/api/me/photo', Buffer.from('<svg onload=alert(1)>'))).status, 415);
  assert.equal((await u.raw('POST', '/api/me/video', PNG)).status, 415);
  const p = (await u.get(`/api/profiles/${u.id}`)).body.photo_url;
  assert.equal((await u.get(p)).status, 200);
  assert.equal((await fetch(t.base + p)).status, 401);
  const pending = await t.member('pending@x.it');
  assert.equal((await pending.get(p)).status, 404);
});

test('export contains the user’s data; second export within 24h is refused', async () => {
  const u = await t.member('export@x.it');
  await u.put('/api/me/job-seeking', { looking_for_italian_job: true });
  const r = await u.get('/api/me/export');
  assert.equal(r.status, 200);
  assert.equal(r.body.account.email, 'export@x.it');
  assert.equal(r.body.job_seeking.looking_for_italian_job, true);
  assert.ok(Array.isArray(r.body.messages));
  assert.equal((await u.get('/api/me/export')).status, 429);
});

test('account deletion removes personal data and pseudonymises the ledger', async () => {
  const u = await t.approved('bye@x.it');
  const friend = await t.approved('friend@x.it');
  await t.connect(u, friend);
  await u.post(`/api/threads/${friend.id}`, { body: 'ciao' });
  await u.put('/api/me/job-seeking', { looking_for_italian_job: true });
  assert.equal((await u.del('/api/me', { confirm: 'no' })).status, 400);
  assert.equal((await u.del('/api/me', { confirm: 'ELIMINA', reason: 'Ho trovato un co-founder' })).status, 200);
  const { db } = t.app;
  for (const [table, col] of [['users', 'id'], ['profiles', 'user_id'], ['job_preferences', 'user_id'], ['sessions', 'user_id'], ['files', 'owner_id'], ['messages', 'sender_id'], ['connections', 'requester_id']]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ?`).get(u.id).n, 0, table);
  }
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM preference_events WHERE user_id IS NULL AND purge_after IS NOT NULL').get().n >= 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM deletion_feedback').get().n, 1);
  assert.equal((await u.get('/api/me')).status, 401);
});

test('state-changing requests without the CSRF header are rejected', async () => {
  const u = await t.member('csrf@x.it');
  const res = await fetch(`${t.base}/api/me/job-seeking`, {
    method: 'PUT', headers: { cookie: u.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ looking_for_italian_job: true }),
  });
  assert.equal(res.status, 403);
});

test('territory stats are aggregates with small counts suppressed', async () => {
  for (let i = 0; i < 5; i++) await t.approved(`bo${i}@x.it`, { desired_comuni: ['Bologna'] });
  const r = await (await fetch(`${t.base}/api/public/territory/Bologna`)).json();
  assert.ok(r.count >= 5);
  const small = await (await fetch(`${t.base}/api/public/territory/Matera`)).json();
  assert.equal(small.count, null);
  assert.ok(!JSON.stringify(r).includes('@x.it'));
});

test('territory pages answer to their slug in any case', async () => {
  const get = async p => { const r = await fetch(`${t.base}/api/public/territory/${encodeURIComponent(p)}`); return r.ok ? (await r.json()) : r.status; };
  for (const p of ['napoli', 'Napoli', 'NAPOLI']) assert.equal((await get(p)).name, 'Napoli');
  assert.equal((await get('valle-d-aosta')).name, "Valle d'Aosta");
  assert.equal((await get("Valle d'Aosta")).slug, 'valle-d-aosta');
  assert.equal((await get('emilia-romagna')).kind, 'region');
  assert.equal((await get('molise')).kind, 'region'); // also a comune: the region wins
  assert.equal((await get('reggio-di-calabria')).name, 'Reggio di Calabria');
  assert.equal(await get('atlantide'), 404);
  assert.equal((await get('aosta')).prep, 'ad');
  assert.equal((await get('napoli')).prep, 'a');
  assert.equal((await get('lazio')).prep, 'nel');
  assert.equal((await get('marche')).prep, 'nelle');
  assert.equal((await get('toscana')).prep, 'in');
  assert.equal((await get('roma')).regionPrep, 'nel');
  // Listed cities: every regional capital and every comune over 100,000 inhabitants
  const { cities } = await get('napoli');
  for (const c of ['Aosta', 'Campobasso', "L'Aquila", 'Potenza', 'Cagliari', 'Trento', 'Verona', 'Salerno', 'Bergamo']) assert.ok(cities.includes(c), c);
});

test('login requests are rate limited', async () => {
  const s = await startApp({ loginLimits: { ip: 3, email: 3 } });
  const statuses = [];
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${s.base}/api/auth/request-code`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'rientro' }, body: JSON.stringify({ email: `r${i}@x.it` }) });
    statuses.push(r.status);
  }
  s.close();
  assert.deepEqual(statuses, [200, 200, 200, 429]);
});

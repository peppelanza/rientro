import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';

let t;
before(async () => { t = await startApp(); });
after(() => t.close());

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a90000000049454e44ae426082', 'hex');

async function approved(email, profile) {
  const u = await t.member(email, profile);
  const admin = await t.member('admin@rientro.test');
  await admin.post(`/api/admin/users/${u.id}/status`, { status: 'approved' });
  await admin.post(`/api/admin/users/${admin.id}/status`, { status: 'approved' });
  return u;
}

test('public profile never exposes email, job details or connections-only links', async () => {
  const a = await approved('a@x.it', { instagram_handle: '@anna', calendar_url: 'https://cal.com/anna', linkedin_url: 'linkedin.com/in/anna' });
  await a.put('/api/me/job-seeking', { looking_for_italian_job: true });
  await a.patch('/api/me/job-preferences', { roles: ['CTO'], availability: 'now' });
  const b = await approved('b@x.it');

  const seen = (await b.get(`/api/profiles/${a.id}`)).body;
  const json = JSON.stringify(seen);
  for (const leak of ['a@x.it', '@anna', 'cal.com', 'CTO', 'availability', 'selected_at', 'birth', 'dob', 'email']) {
    assert.ok(!json.includes(leak), `public profile leaked ${leak}`);
  }
  assert.equal(seen.links.locked, true);
  assert.equal(seen.is_looking_for_italian_job, true);
  assert.ok(seen.links.linkedin_url);

  // After the connection is accepted, connections-only links unlock.
  await b.post(`/api/connections/${a.id}`);
  await a.post(`/api/connections/${b.id}/accept`);
  const after = (await b.get(`/api/profiles/${a.id}`)).body;
  assert.equal(after.links.instagram_handle, '@anna');
  assert.ok(!JSON.stringify(after).includes('a@x.it'));
});

test('unapproved profiles are not visible and cannot browse', async () => {
  const hidden = await t.member('hidden@x.it');
  const viewer = await approved('viewer@x.it');
  assert.equal((await viewer.get(`/api/profiles/${hidden.id}`)).status, 404);
  assert.equal((await hidden.get('/api/profiles')).status, 403);
});

test('admin endpoints require the admin role and every access is audited', async () => {
  const m = await t.member('member@x.it');
  for (const p of ['/api/admin/users', `/api/admin/users/${m.id}`, '/api/admin/audit']) {
    assert.equal((await m.get(p)).status, 403, p);
  }
  const anon = await fetch(`${t.base}/api/admin/users`);
  assert.equal(anon.status, 401);

  const admin = await t.member('admin@rientro.test');
  await admin.get(`/api/admin/users/${m.id}`);
  const log = (await admin.get('/api/admin/audit')).body;
  const view = log.find(e => e.action === 'user.view' && e.target_user_id === m.id);
  assert.ok(view, 'user.view must be logged');
  assert.equal(view.admin_email, 'admin@rientro.test');
});

test('audit log is append-only at the database level', () => {
  const { db } = t.app;
  assert.throws(() => db.prepare('DELETE FROM admin_audit_log').run(), /append-only/);
  assert.throws(() => db.prepare("UPDATE admin_audit_log SET action = 'x'").run(), /append-only/);
  assert.throws(() => db.prepare("UPDATE preference_events SET value = 1 - value").run(), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM preference_events').run(), /purge/);
});

test('photo upload is sniffed by content and served only to authorised viewers', async () => {
  const u = await approved('photo@x.it');
  const fake = await u.raw('POST', '/api/me/photo', Buffer.from('<svg onload=alert(1)>'), { 'content-type': 'image/png' });
  assert.equal(fake.status, 415);
  const ok = await u.raw('POST', '/api/me/photo', PNG, { 'content-type': 'application/octet-stream' });
  assert.equal(ok.status, 200);

  assert.equal((await u.get(ok.body.url)).status, 200);
  assert.equal((await fetch(t.base + ok.body.url)).status, 401);
  const pending = await t.member('pending@x.it');
  assert.equal((await pending.get(ok.body.url)).status, 404);
});

test('export contains the user’s data and history; second export within 24h is refused', async () => {
  const u = await t.member('export@x.it');
  await u.put('/api/me/job-seeking', { looking_for_italian_job: true });
  const r = await u.get('/api/me/export');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment/);
  assert.equal(r.body.account.email, 'export@x.it');
  assert.equal(r.body.job_seeking.looking_for_italian_job, true);
  assert.equal(r.body.preference_history[0].preference, 'job_seeking');
  assert.ok(r.body.legal_acknowledgements.length >= 2);
  assert.equal((await u.get('/api/me/export')).status, 429);
});

test('account deletion removes personal data and pseudonymises the ledger', async () => {
  const u = await t.member('bye@x.it', { bio: 'ciao' });
  await u.put('/api/me/job-seeking', { looking_for_italian_job: true });
  await u.raw('POST', '/api/me/photo', PNG);
  const admin = await t.member('admin@rientro.test');
  await admin.get(`/api/admin/users/${u.id}`);

  assert.equal((await u.del('/api/me', { confirm: 'no' })).status, 400);
  const r = await u.del('/api/me', { confirm: 'ELIMINA' });
  assert.equal(r.status, 200);

  const { db } = t.app;
  for (const table of ['users', 'profiles', 'job_preferences', 'sessions', 'files']) {
    const col = table === 'users' ? 'id' : table === 'files' ? 'owner_id' : 'user_id';
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ?`).get(u.id).n, 0, table);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM preference_events WHERE user_id = ?').get(u.id).n, 0);
  const kept = db.prepare('SELECT * FROM preference_events WHERE user_id IS NULL AND purge_after IS NOT NULL').all();
  assert.ok(kept.length >= 1, 'pseudonymous proof is kept until purge_after');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_audit_log WHERE target_user_id = ?').get(u.id).n, 0);
  assert.equal((await u.get('/api/me')).status, 401);
});

test('state-changing requests without the CSRF header are rejected', async () => {
  const u = await t.member('csrf@x.it');
  const res = await fetch(`${t.base}/api/me/job-seeking`, {
    method: 'PUT', headers: { cookie: u.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ looking_for_italian_job: true }),
  });
  assert.equal(res.status, 403);
});

test('security headers are set', async () => {
  const res = await fetch(`${t.base}/api/legal`);
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const body = await res.json();
  assert.equal(body.review_status, 'draft_pending_legal_review');
  assert.ok(body.processing_register.find(p => p.purpose === 'job_seeking_signal'));
});

test('login requests are rate limited', async () => {
  const { createApp } = await import('../src/server.js');
  const { openDb } = await import('../src/db.js');
  const app = createApp({ db: openDb(':memory:'), sendLoginLink: async () => {}, loginLimits: { ip: 3, email: 3 } });
  await new Promise(r => app.server.listen(0, r));
  const url = `http://127.0.0.1:${app.server.address().port}/api/auth/request-link`;
  const statuses = [];
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'rientro' }, body: JSON.stringify({ email: `r${i}@x.it` }) });
    statuses.push(r.status);
  }
  app.server.close();
  assert.deepEqual(statuses, [200, 200, 200, 429]);
});

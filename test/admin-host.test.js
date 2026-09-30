// The admin panel lives only on its own host: a plain 404 for everyone else, gone from the main site.
// Admins are members in the portal like everyone else.
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, test } from 'node:test';
import { startApp } from './helpers.js';

const { config } = await import('../src/config.js');
const t = await startApp();
config.adminHost = 'admin.rientro.test';
after(() => { config.adminHost = ''; t.close(); });

// fetch can't set Host, so a plain request
const get = (p, { host = '127.0.0.1', cookie = '' } = {}) => new Promise((resolve, reject) => {
  const { port } = new URL(t.base);
  http.get({ port, path: p, headers: { host, cookie, 'x-requested-with': 'rientro' } }, res => {
    let body = ''; res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }));
  }).on('error', reject);
});
const admin = { host: 'admin.rientro.test' };

test('admin host: plain 404 unless signed in as admin', async () => {
  const m = await t.login('socio@x.it');
  for (const p of ['/', '/admin', '/admin/utenti', '/api/admin/users', '/app/main.js', '/accedi']) {
    for (const cookie of ['', m.cookie]) {
      const r = await get(p, { ...admin, cookie });
      assert.equal(r.status, 404, `${p} ${cookie ? 'member' : 'anonymous'}`);
      assert.equal(r.body, '404 Not Found');
    }
  }
  const a = await t.asAdmin();
  assert.equal((await get('/', { ...admin, cookie: a.cookie })).location, '/admin');
  assert.equal((await get('/admin', { ...admin, cookie: a.cookie })).status, 200);
  assert.equal((await get('/api/admin/users', { ...admin, cookie: a.cookie })).status, 200);
  assert.equal((await get('/app/main.js', { ...admin, cookie: a.cookie })).status, 200);
  // Member pages belong to the main site
  assert.equal((await get('/profilo', { ...admin, cookie: a.cookie })).location, `${config.baseUrl}/profilo`);
});

test('main site: no admin panel, not even for the admin', async () => {
  const a = await t.asAdmin();
  assert.equal((await get('/admin', { cookie: a.cookie })).status, 404);
  assert.equal((await get('/admin/utenti', { cookie: a.cookie })).status, 404);
  assert.equal((await get('/api/admin/users', { cookie: a.cookie })).status, 404);
  assert.equal((await get('/profilo', { cookie: a.cookie })).status, 200);
  const me = (await a.get('/api/me')).body;
  assert.equal(me.admin_url, 'http://admin.rientro.test/admin');
  assert.equal((await t.login('altro@x.it').then(m => m.get('/api/me'))).body.admin_url, undefined);
});

test('the admin is a member: onboarding, review, approval of their own profile', async () => {
  config.adminHost = '';
  try {
    const a = await t.asAdmin();
    const me = (await a.get('/api/me')).body;
    assert.equal(me.user.status, 'onboarding');
    assert.equal((await a.get('/api/profiles')).status, 403); // not approved yet
    await a.patch('/api/me/profile', { lives_in: 'abroad', lives_in_country: 'Svezia', lives_in_city: 'Stoccolma', desired_comuni: ['Catania'], primary_intent: 'has_idea', first_name: 'Admin', last_name: 'Rientro', age_band: '35-39', bio: 'x'.repeat(160), background_area: 'Prodotto', current_role: 'Founder', seeking_backgrounds: ['Tech / Engineering'], sectors: ['AI'], time_commitment: 'full_time', start_when: '6_months' });
    const { PNG } = await import('./helpers.js');
    await a.raw('POST', '/api/me/photo', PNG);
    assert.equal((await a.post('/api/me/submit')).status, 200);
    assert.ok((await a.get('/api/admin/approvals')).body.queue.some(q => q.id === a.id));
    assert.equal((await a.post(`/api/admin/users/${a.id}/review`, { action: 'suspend' })).status, 400);
    assert.equal((await a.post(`/api/admin/users/${a.id}/review`, { action: 'approve' })).status, 200);
    assert.equal((await a.get('/api/me')).body.user.status, 'approved');
    assert.equal((await a.get('/api/profiles')).status, 200);
  } finally { config.adminHost = 'admin.rientro.test'; }
});

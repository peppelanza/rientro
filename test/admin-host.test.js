// The admin panel lives only on its own host: a 404 page for everyone else, gone from the main site.
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

test('admin host: a 404 page unless signed in as admin', async () => {
  const m = await t.login('socio@x.it');
  for (const p of ['/', '/admin', '/admin/utenti', '/api/admin/users', '/app/main.js', '/accedi']) {
    for (const cookie of ['', m.cookie]) {
      const r = await get(p, { ...admin, cookie });
      assert.equal(r.status, 404, `${p} ${cookie ? 'member' : 'anonymous'}`);
      assert.match(r.body, /Questa pagina <em>non esiste<\/em>/);
      assert.match(r.body, /la pagina è stata spostata/);
      assert.doesNotMatch(r.body, /admin|comune/i);
      assert.match(r.body, new RegExp(`href="${config.baseUrl}/"`));
    }
  }
  // The 404 page's styles load there too
  assert.equal((await get('/app/app.css', admin)).status, 200);
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

test('the admin is a member: onboarding, then online like everyone', async () => {
  config.adminHost = '';
  try {
    const a = await t.asAdmin();
    const me = (await a.get('/api/me')).body;
    assert.equal(me.user.status, 'onboarding');
    assert.equal((await a.get('/api/profiles')).status, 403); // profile not sent yet
    await a.patch('/api/me/profile', { lives_in: 'abroad', lives_in_country: 'Svezia', lives_in_city: 'Stoccolma', desired_comuni: ['Catania'], primary_intent: 'has_idea', first_name: 'Admin', last_name: 'Rientro', birth_year: 1988, bio: 'x'.repeat(160), background_area: 'Prodotto', current_role: 'Founder', seeking_backgrounds: ['Tech / Engineering'], sectors: ['AI'], time_commitment: 'full_time', start_when: '6_months' });
    const { PNG } = await import('./helpers.js');
    await a.raw('POST', '/api/me/photo', PNG);
    assert.equal((await a.post('/api/me/submit')).status, 200);
    assert.equal((await a.get('/api/me')).body.user.status, 'approved'); // online, no review
    assert.equal((await a.get('/api/admin/approvals')).status, 404);
    assert.equal((await a.post(`/api/admin/users/${a.id}/review`, { action: 'suspend' })).status, 400); // not yourself
    assert.equal((await a.post(`/api/admin/users/${a.id}/review`, { action: 'approve' })).status, 400); // gone
    assert.equal((await a.get('/api/profiles')).status, 200);
  } finally { config.adminHost = 'admin.rientro.test'; }
});

test('photos that fail the browser check never block: they wait in "Foto da controllare"', async () => {
  config.adminHost = '';
  try {
    const { PNG } = await import('./helpers.js');
    const a = await t.asAdmin();
    const m = await t.login('senzavolto@x.it');
    assert.equal((await m.raw('POST', '/api/me/photo', PNG, { 'x-photo-check': 'no_face' })).status, 200);
    const list = (await a.get('/api/admin/photo-checks')).body;
    const row = list.find(r => r.id === m.id);
    assert.equal(row.reason, 'Nessun volto riconosciuto');
    assert.ok(row.photo_url);
    assert.equal((await a.get('/api/admin/sidebar')).body.photos >= 1, true);
    // Members can't see or clear the list
    assert.equal((await m.get('/api/admin/photo-checks')).status, 403);
    assert.equal((await a.post(`/api/admin/photo-checks/${m.id}/ok`)).status, 200);
    assert.ok(!(await a.get('/api/admin/photo-checks')).body.some(r => r.id === m.id));
    // A new photo that passes clears any flag; unknown values are ignored
    await m.raw('POST', '/api/me/photo', PNG, { 'x-photo-check': 'boh' });
    assert.ok(!(await a.get('/api/admin/photo-checks')).body.some(r => r.id === m.id));
  } finally { config.adminHost = 'admin.rientro.test'; }
});

test('an explicit image suspends the account at once; the admin can undo it', async () => {
  config.adminHost = '';
  try {
    const { PNG } = await import('./helpers.js');
    const a = await t.asAdmin();
    const m = await t.member('esplicito@x.it');
    const r = await m.raw('POST', '/api/me/photo-blocked', PNG, { 'x-nsfw-scores': JSON.stringify({ Porn: 0.93, Hentai: 0.02, Sexy: 0.04, Neutral: 0.01, Drawing: 0, Evil: 5 }) });
    assert.equal(r.status, 200);
    // Signed out and suspended: the same email can't get back in
    assert.equal((await m.get('/api/me')).status, 401);
    assert.equal(t.app.db.prepare('SELECT status FROM users WHERE id = ?').get(m.id).status, 'suspended');
    const h = { 'content-type': 'application/json', 'x-requested-with': 'rientro' };
    await fetch(`${t.base}/api/auth/request-code`, { method: 'POST', headers: h, body: JSON.stringify({ email: 'esplicito@x.it' }) });
    const again = await fetch(`${t.base}/api/auth/verify-code`, { method: 'POST', headers: h, body: JSON.stringify({ email: 'esplicito@x.it', code: t.codes.get('esplicito@x.it') }) });
    assert.equal(again.status, 403);
    // Admin: listed with the image, never public
    const row = (await a.get('/api/admin/blocked')).body.find(x => x.user_id === m.id);
    assert.equal(row.scores.Porn, 0.93);
    assert.equal(row.scores.Evil, undefined);
    assert.equal((await a.get(row.image_url)).status, 200);
    assert.equal((await a.get('/api/admin/sidebar')).body.blocked >= 1, true);
    // It was a mistake: back to how it was, and the image becomes the profile photo
    const before = t.app.db.prepare('SELECT photo_file_id FROM profiles WHERE user_id = ?').get(m.id).photo_file_id;
    assert.equal((await a.post(`/api/admin/blocked/${row.id}`, { action: 'restore' })).status, 200);
    assert.equal(t.app.db.prepare('SELECT status FROM users WHERE id = ?').get(m.id).status, 'onboarding');
    const after = t.app.db.prepare('SELECT photo_file_id FROM profiles WHERE user_id = ?').get(m.id).photo_file_id;
    assert.ok(after && after !== before);
    assert.equal((await a.get(`/api/files/${after}`)).status, 200);
    assert.equal((await a.get(row.image_url)).status, 404); // out of quarantine
    assert.equal((await a.post(`/api/admin/blocked/${row.id}`, { action: 'confirm' })).status, 409);
  } finally { config.adminHost = 'admin.rientro.test'; }
});

test('in production any other subdomain gets the same 404 page as the admin host', async () => {
  const was = config.production;
  config.production = true;
  try {
    const main = new URL(config.baseUrl).host;
    const other = await get('/', { host: 'fjdisjsfio.rientro.test' });
    const adminNo = await get('/', admin);
    assert.equal(other.status, 404);
    assert.equal(other.body, adminNo.body);
    assert.equal((await get('/app/app.css', { host: 'qualcosa.rientro.test' })).status, 200);
    assert.equal((await get('/', { host: main })).status, 200);
  } finally { config.production = was; }
});

test('test people: created and removed by the admin, online, never emailed, not in public numbers', async () => {
  config.adminHost = '';
  try {
    const a = await t.asAdmin();
    const m = await t.member('normale@x.it');
    assert.equal((await m.post('/api/admin/demo')).status, 403);
    const r = await a.post('/api/admin/demo');
    assert.equal(r.body.created, 10);
    assert.equal((await a.post('/api/admin/demo')).body.created, 0); // once only
    const viewer = await t.approved('curioso@x.it');
    const people = (await viewer.get('/api/profiles')).body.people;
    assert.ok(people.filter(p => ['Giulia', 'Marco', 'Sara'].includes(p.first_name)).length === 3);
    const giulia = people.find(p => p.first_name === 'Giulia');
    assert.equal((await viewer.get(giulia.photo_url)).status, 200);
    // Palermo: 2 test people want it, but public counts ignore them
    const terr = (await (await fetch(`${t.base}/api/public/territory/Palermo`)).json());
    assert.equal(terr.count, null);
    const { sendEmail } = await import('../src/mail.js');
    await sendEmail({ to: 'giulia.ferrara@prova.rientro.invalid', subject: 'x', text: 'x', html: 'x' }); // no network, no error
    assert.equal((await a.del('/api/admin/demo')).body.removed, 10);
    assert.equal((await a.get('/api/admin/demo')).body.total, 0);
  } finally { config.adminHost = 'admin.rientro.test'; }
});

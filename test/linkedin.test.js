// Sign In with LinkedIn: state check, verified email only, same account as email sign-in.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { PNG, startApp } from './helpers.js';

const { config } = await import('../src/config.js');
config.linkedinClientId = 'client-id';
config.linkedinClientSecret = 'client-secret';

// A fake LinkedIn: the code decides who comes back
const people = {
  'code-anna': { email: 'Anna@Esempio.it', email_verified: true, given_name: 'Anna', family_name: 'Verdi' },
  'code-foto': { email: 'foto@esempio.it', email_verified: true, given_name: 'Foto', family_name: 'Grafa', picture: 'https://media.licdn.com/dms/image/foto.jpg' },
  'code-unverified': { email: 'nove@esempio.it', email_verified: false, given_name: 'Nove', family_name: 'Rificata' },
};
const calls = [];
async function linkedinFetch(url, opts = {}) {
  calls.push(String(url));
  if (String(url).includes('/oauth/v2/accessToken')) {
    const code = new URLSearchParams(opts.body).get('code');
    if (!people[code]) return new Response('{"error":"invalid_grant"}', { status: 400 });
    return Response.json({ access_token: `tok-${code}` });
  }
  if (String(url).includes('/v2/userinfo')) {
    const code = opts.headers.authorization.replace('Bearer tok-', '');
    return Response.json({ sub: code, ...people[code] });
  }
  if (String(url) === 'https://media.licdn.com/dms/image/foto.jpg') return new Response(PNG, { headers: { 'content-type': 'image/png' } });
  throw new Error('unexpected ' + url);
}

const t = await startApp({ linkedinFetch });
after(() => { config.linkedinClientId = ''; config.linkedinClientSecret = ''; t.close(); });
const get = (p, cookie) => fetch(`${t.base}${p}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const cookieOf = (res, name) => res.headers.getSetCookie().find(c => c.startsWith(`${name}=`))?.split(';')[0];

async function start(next) {
  const r = await get(`/api/auth/linkedin/start${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  assert.equal(r.status, 302);
  const to = new URL(r.headers.get('location'));
  return { to, state: to.searchParams.get('state'), cookie: cookieOf(r, 'rientro_li_state') };
}

test('start sends the browser to LinkedIn with the right parameters', async () => {
  const { to, state, cookie } = await start();
  assert.equal(to.origin + to.pathname, 'https://www.linkedin.com/oauth/v2/authorization');
  assert.equal(to.searchParams.get('client_id'), 'client-id');
  assert.equal(to.searchParams.get('scope'), 'openid profile email');
  assert.match(to.search, /scope=openid%20profile%20email/, 'scopes separated by %20, as LinkedIn expects');
  assert.match(to.searchParams.get('redirect_uri'), /\/api\/auth\/linkedin\/callback$/);
  assert.ok(state && cookie);
});

test('callback signs in, creates the account with the LinkedIn name, and goes to onboarding', async () => {
  const { state, cookie } = await start();
  const r = await get(`/api/auth/linkedin/callback?code=code-anna&state=${state}`, cookie);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/onboarding');
  const session = r.headers.getSetCookie().find(c => /^rientro_session=[^;]+/.test(c) && !c.startsWith('rientro_session=;'));
  assert.ok(session);
  const me = await (await fetch(`${t.base}/api/me`, { headers: { cookie: session.split(';')[0] } })).json();
  assert.equal(me.user.email, 'anna@esempio.it');
  assert.equal(me.profile.first_name, 'Anna');
  assert.equal(me.profile.last_name, 'Verdi');
});

test('the same email via code or LinkedIn is the same account, and a filled-in name is kept', async () => {
  const viaCode = await t.login('anna@esempio.it');
  await viaCode.patch('/api/me/profile', { first_name: 'Annina' });
  const { state, cookie } = await start();
  await get(`/api/auth/linkedin/callback?code=code-anna&state=${state}`, cookie);
  const rows = t.app.db.prepare("SELECT id FROM users WHERE email = 'anna@esempio.it'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, viaCode.id);
  assert.equal(t.app.db.prepare('SELECT first_name FROM profiles WHERE user_id = ?').get(viaCode.id).first_name, 'Annina');
});

test('wrong or missing state, cancelled consent, unverified email and bad codes are refused', async () => {
  const { state, cookie } = await start();
  const loc = async r => (await r).headers.get('location');
  assert.equal(await loc(get(`/api/auth/linkedin/callback?code=code-anna&state=altro`, cookie)), '/accedi?errore=linkedin_scaduto');
  assert.equal(await loc(get(`/api/auth/linkedin/callback?code=code-anna&state=${state}`)), '/accedi?errore=linkedin_scaduto');
  assert.equal(await loc(get('/api/auth/linkedin/callback?error=user_cancelled_login', cookie)), '/accedi?errore=linkedin_annullato');
  const s2 = await start();
  assert.equal(await loc(get(`/api/auth/linkedin/callback?code=code-unverified&state=${s2.state}`, s2.cookie)), '/accedi?errore=linkedin_email');
  assert.equal(t.app.db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'nove@esempio.it'").get().n, 0);
  const s3 = await start();
  assert.equal(await loc(get(`/api/auth/linkedin/callback?code=code-falso&state=${s3.state}`, s3.cookie)), '/accedi?errore=linkedin_errore');
});

test('next is honoured only for paths on this site', async () => {
  const a = await start('/profilo');
  assert.equal((await get(`/api/auth/linkedin/callback?code=code-anna&state=${a.state}`, a.cookie)).headers.get('location'), '/profilo');
  const b = await start('//evil.example');
  assert.notEqual((await get(`/api/auth/linkedin/callback?code=code-anna&state=${b.state}`, b.cookie)).headers.get('location'), '//evil.example');
});

test('without credentials the button explains it is not active yet', async () => {
  const id = config.linkedinClientId;
  config.linkedinClientId = '';
  try {
    assert.equal((await get('/api/auth/linkedin/start')).headers.get('location'), '/accedi?errore=linkedin_non_attivo');
    assert.equal((await (await get('/api/public/launch')).json()).linkedin, false);
  } finally { config.linkedinClientId = id; }
});

test('the LinkedIn photo is offered once, through our server, for the browser face check', async () => {
  const { state, cookie } = await start();
  const r = await get(`/api/auth/linkedin/callback?code=code-foto&state=${state}`, cookie);
  const session = r.headers.getSetCookie().find(c => /^rientro_session=[^;]+/.test(c) && !c.startsWith('rientro_session=;')).split(';')[0];
  const h = { cookie: session, 'x-requested-with': 'rientro' };
  const photo = await fetch(`${t.base}/api/me/suggested-photo`, { headers: h });
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${t.base}/api/me/suggested-photo`, { method: 'DELETE', headers: h })).status, 200);
  assert.equal((await fetch(`${t.base}/api/me/suggested-photo`, { headers: h })).status, 404);
  // Only from the providers' image hosts
  t.app.db.prepare("UPDATE profiles SET suggested_photo_url = 'https://evil.example/x.jpg' WHERE suggested_photo_url IS NULL").run();
  assert.equal((await fetch(`${t.base}/api/me/suggested-photo`, { headers: h })).status, 404);
});

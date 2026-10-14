import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { makeClient, startApp } from './helpers.js';
import { config } from '../src/config.js';

let t;
const welcomes = [];
before(async () => { t = await startApp({ sendWelcome: (email, opts) => welcomes.push({ email, ...opts }) }); });
after(() => t.close());

// Signs up with the invite cookie the link left behind
async function loginWith(code, email) {
  const h = { 'content-type': 'application/json', 'x-requested-with': 'rientro', cookie: `rientro_invite=${code}` };
  await fetch(`${t.base}/api/auth/request-code`, { method: 'POST', headers: h, body: JSON.stringify({ email }) });
  const res = await fetch(`${t.base}/api/auth/verify-code`, { method: 'POST', headers: h, body: JSON.stringify({ email, code: t.codes.get(email) }) });
  const c = makeClient(t.base, res.headers.get('set-cookie').split(';')[0]);
  return { ...c, id: (await c.get('/api/me')).body.user.id };
}

test('invite link: gius2839-style code, the link remembers it, the invitee asks to connect in onboarding, the request waits marked as from the link', async () => {
  const giuseppe = await t.approved('giuseppe@x.it', { first_name: 'Giuseppe' });
  const url = (await giuseppe.get('/api/me')).body.invite.url;
  const code = url.split('?')[1];
  assert.match(code, /^gius[0-9]{4}$/);
  assert.equal((await giuseppe.get('/api/me')).body.invite.url, url, 'always the same link');

  // Opening the link: remembered in a cookie, a page with its own preview, then on to /accedi
  const open = await fetch(`${t.base}/?${code}`, { redirect: 'manual' });
  assert.equal(open.status, 200);
  assert.match(await open.clone().text(), /url=\/accedi/);
  assert.match(open.headers.get('set-cookie'), new RegExp(`rientro_invite=${code}`));
  assert.equal((await (await fetch(`${t.base}/api/public/invite`, { headers: { cookie: `rientro_invite=${code}` } })).json()).inviter.first_name, 'Giuseppe');

  // Sign-up with it: no welcome email yet, it comes with the profile online
  const anna = await loginWith(code, 'anna@x.it');
  assert.equal(welcomes.filter(w => w.email === 'anna@x.it').length, 0);
  const me = (await anna.get('/api/me')).body;
  assert.equal(me.invite.invited_by.first_name, 'Giuseppe');
  assert.equal(me.invite.url, null, 'a link once the profile is online');

  // Onboarding step: yes, with a note; the request leaves when the profile goes online, before launch
  const { COMPLETE_PROFILE, PNG } = await import('./helpers.js');
  assert.equal((await anna.patch('/api/me/profile', { ...COMPLETE_PROFILE, first_name: 'Anna', invite_connect: true, invite_note: 'Ciao Giuseppe!' })).status, 200);
  await anna.raw('POST', '/api/me/photo', PNG);
  config.forceLaunched = false; // before launch (the tests run as launched)
  try { assert.equal((await anna.post('/api/me/submit')).status, 200); } finally { config.forceLaunched = true; }
  const w = welcomes.find(x => x.email === 'anna@x.it');
  assert.equal(w.firstName, 'Anna');
  assert.match(w.inviteUrl, /\?anna[0-9]{4}$/);
  const c = t.app.db.prepare('SELECT * FROM connections WHERE requester_id = ? AND addressee_id = ?').get(anna.id, giuseppe.id);
  assert.equal(c.status, 'pending');
  assert.equal(c.via_invite, 1);
  assert.equal(c.note, 'Ciao Giuseppe!');
  // Before launch: no bell and no email for it, it waits for launch day
  assert.equal(t.app.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'connection_request'").get(giuseppe.id).n, 0);
  const received = (await giuseppe.get('/api/connections?tab=received')).body.items;
  assert.equal(received.find(r => r.connection_id === c.id).via_invite, true);

  // A code that isn't anyone's, or someone saying no: nothing
  const bea = await loginWith('zzzz0000', 'bea@x.it');
  assert.equal((await bea.get('/api/me')).body.invite.invited_by, null);
});

test('an invite link has its own preview: "<first name> ti ha invitato su Rientro", the picture, then /accedi', async () => {
  const t = await startApp();
  try {
    const a = await t.approved('anteprima-invito@x.it', { first_name: 'Rosalia', last_name: 'Cognomelungo' });
    const url = (await a.get('/api/me')).body.invite.url;
    const code = url.split('?')[1];
    const r = await fetch(`${t.base}/?${code}`, { redirect: 'manual' });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('set-cookie'), new RegExp(`rientro_invite=${code}`));
    const html = await r.text();
    assert.match(html, /<meta property="og:title" content="Rosalia ti ha invitato su Rientro">/);
    assert.ok(!html.includes('Cognomelungo'), 'the first name only');
    assert.match(html, new RegExp(`og:image" content="[^"]*/og/invito/${code}\\.jpg"`));
    assert.match(html, /http-equiv="refresh" content="0;url=\/accedi"/);
    const img = await fetch(`${t.base}/og/invito/${code}.jpg`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    // nobody behind the code: straight to /accedi, no picture
    assert.equal((await fetch(`${t.base}/?zzzz0000`, { redirect: 'manual' })).status, 302);
    assert.equal((await fetch(`${t.base}/og/invito/zzzz0000.jpg`)).status, 404);
  } finally { t.close(); }
});

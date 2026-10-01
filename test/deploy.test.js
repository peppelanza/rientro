// Hosting behaviour: health check, preview password gate, sign-in code visibility.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { startApp } from './helpers.js';

const { config } = await import('../src/config.js');
const t = await startApp();
after(() => { config.previewPassword = ''; config.production = false; t.close(); });
const basic = pass => `Basic ${Buffer.from(`x:${pass}`).toString('base64')}`;

test('preview password guards sign-in, members and admin; public pages stay open', async () => {
  config.previewPassword = 'segreto';
  try {
    assert.equal((await fetch(`${t.base}/healthz`)).status, 200);
    // Public pages, their files and read-only public data: no password
    for (const p of ['/', '/rientro-dei-cervelli', '/territori/napoli', '/legal/privacy', '/app/main.js', '/data/paesi.json', '/api/public/launch', '/api/public/territory/napoli', '/api/catalog', '/api/session']) {
      assert.equal((await fetch(`${t.base}${p}`, { redirect: 'manual' })).status, 200, p);
    }
    // Sign-in (the code is shown on the page without email), member area, admin, other APIs
    for (const p of ['/accedi', '/onboarding', '/profilo', '/admin', '/api/me']) {
      const denied = await fetch(`${t.base}${p}`, { redirect: 'manual' });
      assert.equal(denied.status, 401, p);
      assert.match(denied.headers.get('www-authenticate'), /^Basic /);
    }
    const code = await fetch(`${t.base}/api/auth/request-code`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'rientro' }, body: JSON.stringify({ email: 'a@x.it' }) });
    assert.equal(code.status, 401);
    assert.equal((await fetch(`${t.base}/accedi`, { headers: { authorization: basic('sbagliata') } })).status, 401);
    assert.equal((await fetch(`${t.base}/accedi`, { headers: { authorization: basic('segreto') } })).status, 200);
  } finally { config.previewPassword = ''; }
});

test('in production the code is shown only behind the preview password', async () => {
  const ask = async headers => (await fetch(`${t.base}/api/auth/request-code`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'rientro', ...headers }, body: JSON.stringify({ email: `p${Date.now()}${Math.random()}@x.it` }),
  })).json();
  config.production = true;
  try {
    assert.equal((await ask()).dev_code, undefined);
    config.previewPassword = 'segreto';
    assert.match((await ask({ authorization: basic('segreto') })).dev_code, /^\d{6}$/);
  } finally { config.production = false; config.previewPassword = ''; }
});

test('sign-in page accepts only real comuni in ?citta=; unknown addresses are an HTML 404', async () => {
  const get = p => fetch(`${t.base}${p}`, { redirect: 'manual' });
  assert.equal((await get('/accedi?citta=Torino')).status, 200);
  assert.equal((await get(`/accedi?citta=${encodeURIComponent("Sant'Agata de' Goti")}`)).status, 200);
  assert.equal((await get('/accedi?citta=')).status, 200);
  const lower = await get('/accedi?citta=torino&next=%2Fprofilo');
  assert.equal(lower.status, 302);
  assert.equal(lower.headers.get('location'), '/accedi?citta=Torino&next=%2Fprofilo');
  for (const p of ['/accedi?citta=cacca', '/accedi?citta=Torin', '/pagina-che-non-esiste']) {
    const r = await get(p);
    assert.equal(r.status, 404, p);
    assert.match(r.headers.get('content-type'), /text\/html/);
    const html = await r.text();
    assert.match(html, /Questa pagina/);
    // The comune explanation only where a city was asked for
    assert.equal(/comune italiano/.test(html), p.includes('citta='), p);
  }
  assert.equal((await get('/api/non-esiste')).headers.get('content-type').includes('json'), true);
});

test('updated Terms/Privacy: onboarding is never interrupted; approved members are asked first', async () => {
  const stale = id => t.app.db.prepare("UPDATE legal_acknowledgements SET version = 'old' WHERE user_id = ?").run(id);
  // Still onboarding: fills in and sends the profile; the update is asked afterwards
  const o = await t.member('onboarding-legal@x.it');
  stale(o.id);
  assert.equal((await o.patch('/api/me/profile', { bio: 'Ciao' })).status, 200);
  assert.equal((await o.post('/api/me/submit')).status, 200);
  assert.equal((await o.get('/api/me')).body.legal.needs.length, 2);
  // Approved member: profile changes wait for the confirmation
  const a = await t.approved('approvato-legal@x.it');
  stale(a.id);
  assert.equal((await a.get('/api/me')).body.legal.needs.length, 2);
  assert.equal((await a.patch('/api/me/profile', { bio: 'Ciao' })).status, 409);
  await a.post('/api/me/legal', { accept: true });
  assert.equal((await a.patch('/api/me/profile', { bio: 'Ciao' })).status, 200);
});

test('face check library: self-hosted, WebAssembly allowed by the CSP, cached for good', async () => {
  const r = await fetch(`${t.base}/vendor/mediapipe-1.0.1/wasm/vision_wasm_internal.wasm`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/wasm');
  assert.match(r.headers.get('cache-control'), /immutable/);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self' 'wasm-unsafe-eval'/);
  assert.equal((await fetch(`${t.base}/vendor/mediapipe-1.0.1/blaze_face_short_range.tflite`)).status, 200);
  // iPhone photos: HEIC decoder (worker from a blob: URL)
  assert.match(r.headers.get('content-security-policy'), /worker-src 'self' blob:/);
  assert.equal((await fetch(`${t.base}/vendor/heic-to-1.5.2/heic-to.js`)).status, 200);
});

test('sign-up email checks: throwaway domains, domains without mail, bot check', async () => {
  const { checkEmailDomain, receivesMail } = await import('../src/email-check.js');
  await assert.rejects(checkEmailDomain('a@mailinator.com'), /temporanei/);
  await assert.rejects(checkEmailDomain('a@inbox.10minutemail.com'), /temporanei/);
  const resolver = mx => ({ resolveMx: async () => mx, resolve4: async () => { throw Object.assign(new Error(), { code: 'ENOTFOUND' }); } });
  const nope = { resolveMx: async () => { throw Object.assign(new Error(), { code: 'ENOTFOUND' }); }, resolve4: async () => { throw Object.assign(new Error(), { code: 'ENOTFOUND' }); } };
  assert.equal(await receivesMail('gmail.test', resolver([{ exchange: 'mx.gmail.test', priority: 5 }])), true);
  assert.equal(await receivesMail('nomail.test', resolver([{ exchange: '.', priority: 0 }])), false); // null MX
  assert.equal(await receivesMail('nonesiste.test', nope), false);
  const broken = { resolveMx: async () => { throw Object.assign(new Error(), { code: 'ESERVFAIL' }); } };
  assert.equal(await receivesMail('dnsrotto.test', broken), null); // DNS trouble: let it through
  await assert.rejects(checkEmailDomain('a@nonesiste.test', nope), /non può ricevere email/);
  await checkEmailDomain('a@dnsrotto.test', broken);

  // Turnstile: on only with both keys; the token is verified with Cloudflare
  const { verifyTurnstile } = await import('../src/turnstile.js');
  await verifyTurnstile(undefined, '1.2.3.4'); // off
  Object.assign(config, { turnstileSiteKey: 'site', turnstileSecret: 'secret' });
  try {
    const cf = ok => async (url, opts) => { assert.match(String(url), /siteverify$/); assert.match(opts.body, /secret=secret/); return Response.json({ success: ok }); };
    await assert.rejects(verifyTurnstile(undefined, '1.2.3.4', cf(true)), /robot/);
    await assert.rejects(verifyTurnstile('tok', '1.2.3.4', cf(false)), /robot/);
    await verifyTurnstile('tok', '1.2.3.4', cf(true));
    assert.equal((await (await fetch(`${t.base}/api/public/launch`)).json()).turnstile, 'site');
    const code = await fetch(`${t.base}/api/auth/request-code`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'rientro' }, body: JSON.stringify({ email: 'bot@x.it' }) });
    assert.equal(code.status, 400);
  } finally { Object.assign(config, { turnstileSiteKey: '', turnstileSecret: '' }); }
});

test('visit statistics: Cloudflare beacon on member and public pages only, numbers read back for the admin', async () => {
  const { traffic } = await import('../src/web-analytics.js');
  // Off: no script, admin shows "not connected"
  assert.doesNotMatch(await (await fetch(`${t.base}/`)).text(), /cloudflareinsights/);
  assert.equal((await traffic(30)).enabled, false);
  Object.assign(config, { cfAnalyticsToken: 'beacon-token', cfAccountId: 'acc', cfApiToken: 'api' });
  try {
    const home = await fetch(`${t.base}/`);
    assert.match(await home.text(), /static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='\{"token":"beacon-token","spa":true\}'/);
    const csp = home.headers.get('content-security-policy');
    assert.match(csp, /script-src [^;]*https:\/\/static\.cloudflareinsights\.com/);
    assert.match(csp, /connect-src 'self' https:\/\/cloudflareinsights\.com/);
    assert.match(csp, /style-src 'self'/);
    // Not in the admin panel
    const a = await t.asAdmin();
    assert.doesNotMatch(await (await fetch(`${t.base}/admin`, { headers: { cookie: a.cookie } })).text(), /cloudflareinsights/);
    // Reading the numbers back (GraphQL), with the site tag looked up from the beacon token
    const row = (d, count, visits) => ({ count, sum: { visits }, dimensions: d });
    const cf = async (url, opts) => {
      if (String(url).includes('/rum/site_info/list')) return Response.json({ result: [{ site_tag: 'tag-1', site_token: 'beacon-token' }] });
      const body = JSON.parse(opts.body);
      assert.equal(body.variables.filter.AND[1].siteTag, 'tag-1');
      return Response.json({ data: { viewer: { accounts: [{
        total: [row({}, 120, 50)], days: [row({ date: '2026-09-30' }, 70, 30), row({ date: '2026-10-01' }, 50, 20)],
        pages: [row({ requestPath: '/' }, 80)], referrers: [row({ refererHost: 'www.linkedin.com' }, 30), row({ refererHost: '' }, 20)],
        countries: [row({ countryName: 'IT' }, 90)], devices: [row({ deviceType: 'mobile' }, 70), row({ deviceType: 'desktop' }, 50)],
      }] } } });
    };
    const d = await traffic(7, cf);
    assert.equal(d.visits, 50);
    assert.equal(d.pageviews, 120);
    assert.deepEqual(d.days.map(x => x.visits), [30, 20]);
    assert.deepEqual(d.referrers.map(x => x.l), ['www.linkedin.com', '(diretto)']);
    const err = await traffic(14, async () => Response.json({ errors: [{ message: 'not authorized' }] }));
    assert.match(err.error, /not authorized/);
  } finally { Object.assign(config, { cfAnalyticsToken: '', cfAccountId: '', cfApiToken: '' }); }
});

test('visit statistics over 24 hours come by the hour', async () => {
  const { traffic } = await import('../src/web-analytics.js');
  Object.assign(config, { cfAnalyticsToken: 't', cfAccountId: 'a', cfApiToken: 'k', cfAnalyticsSiteTag: 'tag' });
  try {
    let q;
    const d = await traffic(1, async (url, opts) => {
      const body = JSON.parse(opts.body).query;
      if (body.includes('refererPath')) return Response.json({ data: { viewer: { accounts: [{ paths: [] }] } } });
      q = body;
      const r = { count: 3, sum: { visits: 2 }, dimensions: { datetimeHour: '2026-10-01T20:00:00Z' } };
      return Response.json({ data: { viewer: { accounts: [{ total: [r], days: [r], pages: [], referrers: [], countries: [], devices: [] }] } } });
    });
    assert.match(q, /orderBy: \[datetimeHour_ASC\]/);
    assert.equal(d.hourly, true);
    assert.equal(d.days[0].date, '2026-10-01T20:00:00Z');
  } finally { Object.assign(config, { cfAnalyticsToken: '', cfAccountId: '', cfApiToken: '', cfAnalyticsSiteTag: '' }); }
});

test('visit statistics: the exact page people came from, without our own pages', async () => {
  const { traffic } = await import('../src/web-analytics.js');
  Object.assign(config, { cfAnalyticsToken: 't', cfAccountId: 'a', cfApiToken: 'k', cfAnalyticsSiteTag: 'tag' });
  try {
    const host = new URL(config.baseUrl).hostname;
    const d = await traffic(30, async (url, opts) => {
      const { query } = JSON.parse(opts.body);
      if (query.includes('refererPath')) {
        return Response.json({ data: { viewer: { accounts: [{ paths: [
          { count: 9, dimensions: { refererHost: 'www.linkedin.com', refererPath: '/posts/rientro-123' } },
          { count: 7, dimensions: { refererHost: host, refererPath: '/territori/milano' } },
          { count: 5, dimensions: { refererHost: 'www.google.com', refererPath: '/' } },
          { count: 4, dimensions: { refererHost: '', refererPath: '' } },
        ] }] } } });
      }
      const r = { count: 1, sum: { visits: 1 }, dimensions: { date: '2026-10-01' } };
      return Response.json({ data: { viewer: { accounts: [{ total: [r], days: [r], pages: [], referrers: [], countries: [], devices: [] }] } } });
    });
    assert.deepEqual(d.referrer_pages, [{ l: 'www.linkedin.com/posts/rientro-123', v: 9 }, { l: 'www.google.com', v: 5 }]);
    // Not available: the rest still works
    const e = await traffic(90, async (url, opts) => {
      if (JSON.parse(opts.body).query.includes('refererPath')) return Response.json({ errors: [{ message: 'unknown field refererPath' }] });
      const r = { count: 1, sum: { visits: 1 }, dimensions: { date: '2026-10-01' } };
      return Response.json({ data: { viewer: { accounts: [{ total: [r], days: [r], pages: [], referrers: [], countries: [], devices: [] }] } } });
    });
    assert.equal(e.referrer_pages, null);
    assert.equal(e.visits, 1);
  } finally { Object.assign(config, { cfAnalyticsToken: '', cfAccountId: '', cfApiToken: '', cfAnalyticsSiteTag: '' }); }
});

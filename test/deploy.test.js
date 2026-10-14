// Hosting behaviour: health check, preview password gate, sign-in code visibility.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { PNG, startApp } from './helpers.js';

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

test('updated Terms/Privacy never block anything: an approved member with old versions keeps editing', async () => {
  const a = await t.approved('approvato-legal@x.it');
  t.app.db.prepare("UPDATE legal_acknowledgements SET version = 'old' WHERE user_id = ?").run(a.id);
  assert.deepEqual((await a.get('/api/me')).body.legal.needs, ['terms', 'privacy'], 'the app is told, to ask in its dialog');
  assert.equal((await a.patch('/api/me/profile', { bio: 'Ciao' })).status, 200);
  const photo = await fetch(`${t.base}/api/me/photo`, { method: 'POST', headers: { cookie: a.cookie, 'x-requested-with': 'rientro', 'content-type': 'image/png' }, body: PNG });
  assert.equal(photo.status, 200, 'a photo uploads too');
  assert.equal((await a.post('/api/me/legal', { accept: true })).status, 200);
  assert.deepEqual((await a.get('/api/me')).body.legal.needs, []);
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

  // Turnstile has its own tests below
});

// --- Turnstile (src/turnstile.js) -----------------------------------------------------------
// Siteverify is never really called: a fake Cloudflare answers as told. Real keys' answers must
// come from rientro.it / www.rientro.it with action "request_code"; Cloudflare's test keys answer a
// marked test response (https://developers.cloudflare.com/turnstile/troubleshooting/testing/).
const REAL = { turnstileSiteKey: '0x4AAAAAAAreal-site', turnstileSecret: '0x4AAAAAAAreal-secret' };
const TEST_KEYS = { turnstileSiteKey: '1x00000000000000000000AA', turnstileSecret: '1x0000000000000000000000000000000AA' };
const OFF = { turnstileSiteKey: '', turnstileSecret: '' };
const answer = body => async (url, opts) => {
  assert.match(String(url), /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify$/);
  assert.match(opts.body, /response=/);
  return typeof body === 'function' ? body(opts) : Response.json(body);
};
const good = { success: true, hostname: 'rientro.it', action: 'request_code', 'error-codes': [] };

test('Turnstile: a token counts only from rientro.it / www.rientro.it with action request_code', async () => {
  const { verifyTurnstile } = await import('../src/turnstile.js');
  await verifyTurnstile(undefined, '1.2.3.4'); // off without keys
  Object.assign(config, REAL);
  try {
    await verifyTurnstile('tok', '1.2.3.4', answer(good));
    await verifyTurnstile('tok', '1.2.3.4', answer({ ...good, hostname: 'www.rientro.it' }));
    await verifyTurnstile('tok', '1.2.3.4', answer({ ...good, hostname: 'WWW.Rientro.it' }));
    for (const hostname of ['admin.rientro.it', 'evil.example', 'rientro.it.evil.example', 'localhost', '', undefined]) {
      await assert.rejects(verifyTurnstile('tok', '1.2.3.4', answer({ ...good, hostname })), e => e.code === 'bot_check', `hostname ${hostname}`);
    }
    for (const action of ['login', 'test', '', undefined]) {
      await assert.rejects(verifyTurnstile('tok', '1.2.3.4', answer({ ...good, action })), e => e.code === 'bot_check', `action ${action}`);
    }
  } finally { Object.assign(config, OFF); }
});

test('Turnstile: missing, empty, too long, invalid, expired and reused tokens are refused', async () => {
  const { verifyTurnstile } = await import('../src/turnstile.js');
  Object.assign(config, REAL);
  let asked = 0;
  const counting = body => async (url, opts) => { asked++; return answer(body)(url, opts); };
  try {
    for (const token of [undefined, null, '', '   ', 42, 'x'.repeat(2049)]) {
      await assert.rejects(verifyTurnstile(token, '1.2.3.4', counting(good)), e => e.code === 'bot_check', `token ${String(token).slice(0, 10)}`);
    }
    assert.equal(asked, 0, 'not even sent to Cloudflare');
    await verifyTurnstile('x'.repeat(2048), '1.2.3.4', counting(good)); // the longest Cloudflare makes
    await assert.rejects(verifyTurnstile('tok', '1.2.3.4', answer({ success: false, 'error-codes': ['invalid-input-response'] })), e => e.code === 'bot_check' && e.status === 400);
    // expired (older than 5 minutes) and reused tokens: the same answer from Cloudflare
    await assert.rejects(verifyTurnstile('tok', '1.2.3.4', answer({ success: false, 'error-codes': ['timeout-or-duplicate'] })), e => e.code === 'bot_check_expired' && /scaduta/.test(e.message));
  } finally { Object.assign(config, OFF); }
});

test('Turnstile: Cloudflare unreachable, slow, failing or unreadable is a temporary error, never a pass', async () => {
  const { verifyTurnstile } = await import('../src/turnstile.js');
  Object.assign(config, REAL);
  const errors = console.error;
  const logged = [];
  const TOK = 'tok-visitor-0042';
  console.error = (...a) => logged.push(a.join(' '));
  try {
    const temporary = e => e.code === 'bot_check_unavailable' && e.status === 503 && /Riprova/.test(e.message);
    await assert.rejects(verifyTurnstile(TOK, '1.2.3.4', async () => { throw new TypeError('fetch failed'); }), temporary, 'network');
    await assert.rejects(verifyTurnstile(TOK, '1.2.3.4', async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }); }), temporary, 'timeout');
    await assert.rejects(verifyTurnstile(TOK, '1.2.3.4', answer(() => new Response('bad gateway', { status: 502 }))), temporary, 'HTTP 502');
    await assert.rejects(verifyTurnstile(TOK, '1.2.3.4', answer(() => new Response('<html>', { status: 200, headers: { 'content-type': 'application/json' } }))), temporary, 'invalid JSON');
    await assert.rejects(verifyTurnstile(TOK, '1.2.3.4', answer({ hello: 'world' })), temporary, 'JSON without success');
    await assert.rejects(verifyTurnstile(TOK, '1.2.3.4', answer({ success: false, 'error-codes': ['internal-error'] })), temporary, 'Cloudflare internal error');
    await assert.rejects(verifyTurnstile(TOK, '1.2.3.4', answer({ success: false, 'error-codes': ['invalid-input-secret'] })), temporary, 'our secret refused');
    // nothing secret in the logs
    assert.ok(logged.length > 0);
    for (const line of logged) { assert.ok(!line.includes(REAL.turnstileSecret)); assert.ok(!line.includes(TOK)); }
  } finally { console.error = errors; Object.assign(config, OFF); }
});

test('Turnstile: the official test keys expect their test answer, never pass in production, never widen the production list', async () => {
  const { verifyTurnstile, PRODUCTION_HOSTNAMES } = await import('../src/turnstile.js');
  Object.assign(config, TEST_KEYS);
  const errors = console.error;
  console.error = () => {};
  try {
    // as Siteverify really answers the test secret (checked 2026-10-14), and as its docs say
    const testing = { metadata: { result_with_testing_key: true } };
    await verifyTurnstile('XXXX.DUMMY.TOKEN.XXXX', '127.0.0.1', answer({ success: true, hostname: 'example.com', 'error-codes': [], ...testing }));
    await verifyTurnstile('XXXX.DUMMY.TOKEN.XXXX', '127.0.0.1', answer({ success: true, hostname: 'localhost', action: 'test', ...testing }));
    await assert.rejects(verifyTurnstile('XXXX.DUMMY.TOKEN.XXXX', '127.0.0.1', answer({ success: true, hostname: 'evil.example', ...testing })), e => e.code === 'bot_check');
    await assert.rejects(verifyTurnstile('XXXX.DUMMY.TOKEN.XXXX', '127.0.0.1', answer({ success: true, hostname: 'example.com' })), e => e.code === 'bot_check', 'not marked as a test answer');
    // the "already spent" test key
    await assert.rejects(verifyTurnstile('XXXX.DUMMY.TOKEN.XXXX', '127.0.0.1', answer({ success: false, 'error-codes': ['timeout-or-duplicate'] })), e => e.code === 'bot_check_expired');
    config.production = true;
    await assert.rejects(verifyTurnstile('XXXX.DUMMY.TOKEN.XXXX', '127.0.0.1', answer({ success: true, hostname: 'example.com', ...testing })), e => e.code === 'bot_check_unavailable');
    assert.deepEqual([...PRODUCTION_HOSTNAMES], ['rientro.it', 'www.rientro.it']);
  } finally { config.production = false; console.error = errors; Object.assign(config, OFF); }
});

test('Turnstile on /api/auth/request-code: no code and no email when the check fails; a new token works after; limits still apply', async () => {
  const sent = [];
  let cf = answer(good);
  const app = await startApp({
    sendLoginCode: async (email, code) => sent.push({ email, code }),
    turnstileFetch: (...a) => cf(...a),
    loginLimits: { ip: 4, email: 2 },
  });
  const ask = (email, token, ip = '9.9.9.9') => fetch(`${app.base}/api/auth/request-code`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'rientro', 'x-forwarded-for': ip },
    body: JSON.stringify({ email, ...(token === undefined ? {} : { turnstile_token: token }) }),
  });
  const codesFor = email => app.app.db.prepare('SELECT COUNT(*) AS n FROM login_codes WHERE email = ?').get(email)?.n ?? 0;
  Object.assign(config, REAL, { trustProxy: true }); // the per-IP limit by X-Forwarded-For, as on Render
  const errors = console.error;
  console.error = () => {};
  try {
    assert.equal((await (await fetch(`${app.base}/api/public/launch`)).json()).turnstile, REAL.turnstileSiteKey, 'only the site key reaches the page');
    assert.ok(!JSON.stringify(await (await fetch(`${app.base}/api/public/launch`)).json()).includes(REAL.turnstileSecret));
    // missing token
    let r = await ask('uno@x.it');
    assert.equal(r.status, 400);
    // Cloudflare down: a temporary error in Italian, nothing created or sent
    cf = async () => { throw new TypeError('fetch failed'); };
    r = await ask('uno@x.it', 'tok-1');
    assert.equal(r.status, 503);
    assert.match((await r.json()).message, /non risponde/);
    // wrong page, reused token
    cf = answer({ ...good, hostname: 'evil.example' });
    assert.equal((await ask('uno@x.it', 'tok-2')).status, 400);
    cf = answer({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    assert.equal((await (await ask('uno@x.it', 'tok-3')).json()).error, 'bot_check_expired');
    assert.equal(sent.length, 0, 'no email when the check fails');
    assert.equal(codesFor('uno@x.it'), 0, 'no code made either');
    // a new token: the code goes out
    cf = answer(good);
    r = await ask('uno@x.it', 'tok-4', '8.8.8.8');
    assert.equal(r.status, 200);
    assert.equal(sent.length, 1);
    assert.equal((await r.json()).dev_code, sent[0].code, 'shown on the page outside production');
    // the per-email limit still holds, Turnstile or not
    assert.equal((await ask('uno@x.it', 'tok-5', '8.8.4.4')).status, 200);
    assert.equal((await ask('uno@x.it', 'tok-6', '8.8.4.5')).status, 429);
    // and the per-IP one
    for (const i of [1, 2, 3, 4]) assert.equal((await ask(`ip${i}@x.it`, `tok-ip-${i}`, '7.7.7.7')).status, 200);
    assert.equal((await ask('ip5@x.it', 'tok-ip-5', '7.7.7.7')).status, 429);
    // no session ever came out of a refused check
    assert.equal(app.app.db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
  } finally { console.error = errors; Object.assign(config, OFF, { trustProxy: false }); app.close(); }
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

test('a file whose upload is gone from disk is a 404, and the server keeps going', async () => {
  const fs = await import('node:fs');
  const { fileOnDisk } = await import('../src/files.js');
  const u = await t.approved('lost-file@x.it');
  const id = (await u.get('/api/me')).body.profile.photo_file_id;
  assert.ok(id, 'a photo to lose');
  fs.rmSync(fileOnDisk(t.app.db, id).path, { force: true });
  assert.equal((await u.raw('GET', `/api/files/${id}`)).status, 404);
  assert.equal((await u.get('/api/me')).status, 200, 'still serving');
});

// --- The visitor's IP (src/client-ip.js) -------------------------------------------------------
test('client IP: the socket without TRUST_PROXY; with it the first X-Forwarded-For entry (rule unchanged, its limit documented)', async () => {
  const { clientIp } = await import('../src/client-ip.js');
  const h = xff => (xff === undefined ? {} : { 'x-forwarded-for': xff });
  // locally: never a header
  assert.equal(clientIp(h('6.6.6.6'), '10.0.0.1'), '10.0.0.1');
  // on Render (TRUST_PROXY=1): the first entry; no header or an empty one, the socket
  assert.equal(clientIp(h('203.0.113.7, 10.1.2.3'), '10.0.0.1', { trustProxy: true }), '203.0.113.7');
  assert.equal(clientIp(h(' 203.0.113.7 '), '10.0.0.1', { trustProxy: true }), '203.0.113.7');
  assert.equal(clientIp(h(''), '10.0.0.1', { trustProxy: true }), '10.0.0.1');
  assert.equal(clientIp(h(undefined), '10.0.0.1', { trustProxy: true }), '10.0.0.1');
  // The known limit, until the chain is verified: a visitor's own X-Forwarded-For comes first if
  // Render only appends (see client-ip.js). It changes the per-IP key, not the per-email limit,
  // the code attempts nor Turnstile.
  assert.equal(clientIp(h('1.1.1.1, 203.0.113.7, 10.1.2.3'), '10.0.0.1', { trustProxy: true }), '1.1.1.1');
  // CF-Connecting-IP / True-Client-IP are never read (on the DNS-only hosts anyone can send them)
  assert.equal(clientIp({ 'cf-connecting-ip': '9.9.9.9', 'true-client-ip': '9.9.9.9' }, '10.0.0.1', { trustProxy: true }), '10.0.0.1');
});

test('client IP: a forged X-Forwarded-For dodges only the per-IP key; the per-email limit still stops the codes', async () => {
  const sent = [];
  const app = await startApp({ sendLoginCode: async e => sent.push(e), loginLimits: { ip: 2, email: 2 } });
  config.trustProxy = true;
  try {
    const ask = ip => fetch(`${app.base}/api/auth/request-code`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'rientro', 'x-forwarded-for': ip }, body: JSON.stringify({ email: 'bersaglio@x.it' }) });
    assert.equal((await ask('1.0.0.1')).status, 200);
    assert.equal((await ask('1.0.0.2')).status, 200);
    assert.equal((await ask('1.0.0.3')).status, 429, 'a new forged IP each time: the email limit holds');
    assert.equal(sent.length, 2);
    // GET /api/me/rete: a member sees their own request's forwarding headers, nothing else
    const m = await t.login('rete@x.it');
    const r = await m.get('/api/me/rete');
    assert.equal(r.status, 200);
    assert.equal(r.body.trust_proxy, true);
    assert.ok('x_forwarded_for' in r.body && 'cf_connecting_ip' in r.body && 'limits_key' in r.body);
    assert.ok(!JSON.stringify(r.body).includes('rientro_session'), 'no cookies');
    assert.equal((await fetch(`${t.base}/api/me/rete`)).status, 401, 'members only');
  } finally { config.trustProxy = false; app.close(); }
});

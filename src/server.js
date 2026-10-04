import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as admin from './admin.js';
import * as moderation from './moderation.js';
import * as demo from './demo.js';
import { checkEmailDomain } from './email-check.js';
import { turnstileEnabled, verifyTurnstile } from './turnstile.js';
import { beaconTag, traffic } from './web-analytics.js';
import * as auth from './auth.js';
import { catalog, COMUNI } from './catalog.js';
import { adminUrl, config, cookieDomain, isLaunched, JOB_SEEKING_NOTICE_TEXT, LEGAL_VERSIONS } from './config.js';
import { openDb, tx } from './db.js';
import { attachUpload, checkVideo, confirmVideo, fileOnDisk, readFileFor, storeGroupImage, receiveUpload, removeVideo, sweepVideoConversions } from './files.js';
import * as prefs from './preferences.js';
import { deleteAccount, exportData } from './privacy.js';
import { canSendEmail, sendDeletionScheduledEmail, sendLoginCodeEmail, sendWelcomeEmail } from './mail.js';
import { sendNotificationDigests } from './email-digest.js';
import { runRetention } from './retention.js';
import { checkLinkedinState, linkedinEnabled, linkedinProfile, startLinkedin, STATE_COOKIE } from './linkedin.js';
import * as profiles from './profiles.js';
import { territory } from './public.js';
import * as social from './social.js';
import * as groups from './groups.js';
import { HttpError } from './validate.js';

// A __Host- cookie can't carry a Domain, so the shared one is __Secure-; the old __Host- cookie is
// still read (sessions opened before the admin host existed) and cleared at sign-in and sign-out.
const SESSION_COOKIE = config.production ? '__Secure-rientro_session' : 'rientro_session';
const LEGACY_SESSION_COOKIE = '__Host-rientro_session';
// While an admin is signed in as another member, their own session waits here to be given back
const ADMIN_RETURN_COOKIE = config.production ? '__Secure-rientro_admin_return' : 'rientro_admin_return';
const JSON_LIMIT = 64 * 1024;

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    // WebAssembly: the photo checks (face.js, nsfw.js); Cloudflare: Turnstile on sign-in, Web Analytics
    "script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
    "style-src 'self'", "font-src 'self'", "img-src 'self' data: blob:", "media-src 'self' blob:",
    "connect-src 'self' https://cloudflareinsights.com", // Cloudflare Web Analytics (web-analytics.js)
    "frame-src https://challenges.cloudflare.com", // Cloudflare Turnstile on sign-in (turnstile.js)
    "worker-src 'self' blob:", // HEIC photos are decoded in a worker (vendor/heic-to)
    "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), microphone=(self), camera=(self)',
  'Cross-Origin-Opener-Policy': 'same-origin',
  ...(config.production ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}),
};

// --- helpers -------------------------------------------------------------------------------

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(c => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

// Behind Render's proxy every connection comes from the proxy; the visitor is the first
// X-Forwarded-For entry. A forged header only dodges the per-IP limit: the per-email limit and
// the per-code attempt limit still apply.
function clientIp(req) {
  if (config.trustProxy) {
    const first = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (first) return first;
  }
  return req.socket.remoteAddress;
}

// Preview gate (HTTP Basic auth, any username). Constant-time compare of the password.
function previewAllowed(req) {
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const pass = Buffer.from(m[1], 'base64').toString('utf8').split(':').slice(1).join(':');
  const a = crypto.createHash('sha256').update(pass).digest();
  const b = crypto.createHash('sha256').update(config.previewPassword).digest();
  return crypto.timingSafeEqual(a, b);
}

// What stays open while the preview password is on: the public pages (not sign-in), their
// static files and the public, read-only APIs. Sign-in, the member area, admin and every
// other API still ask for the password, since without an email provider the sign-in code is
// shown on the page and anyone could otherwise sign in as anyone.
const OPEN_PAGES = [/^\/$/, /^\/prelancio$/, /^\/rientro-dei-cervelli$/, /^\/territori\/[^/]+$/, /^\/legal\/(privacy|termini|cookie)$/];
const OPEN_APIS = [/^\/api\/public\//, /^\/api\/catalog$/, /^\/api\/session$/];
const PAGE_ROUTES = () => [...PUBLIC_PAGES, ...MEMBER_PAGES, ...ADMIN_PAGES];
function openDuringPreview(p) {
  if (p.startsWith('/api/')) return OPEN_APIS.some(re => re.test(p));
  if (OPEN_PAGES.some(re => re.test(p))) return true;
  return !PAGE_ROUTES().some(re => re.test(p)) && !p.startsWith('/design'); // static files
}

// The sign-in code is returned to the page in development, and in a password-protected preview
// when no email provider is configured.
const showCodeOnPage = () => !config.production || (!!config.previewPassword && !config.brevoApiKey);

function cookie(name, value, maxAgeSeconds, { path = '/', httpOnly = true } = {}) {
  return [`${name}=${value}`, `Path=${path}`, ...(httpOnly ? ['HttpOnly'] : []), 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`, ...(config.production ? ['Secure'] : [])].join('; ');
}
const safeNext = n => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : null);
// Admins are members too: the portal treats them like everyone else (the panel is on its own host)
const homeFor = user => (user.status === 'onboarding' ? '/onboarding' : '/scopri');

function sessionCookie(value, maxAgeSeconds) {
  const domain = cookieDomain();
  const main = [`${SESSION_COOKIE}=${value}`, 'Path=/', ...(domain ? [`Domain=${domain}`] : []), 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`, ...(config.production ? ['Secure'] : [])].join('; ');
  return config.production ? [main, `${LEGACY_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`] : [main];
}

// The admin's own session, kept aside during "Accedi come" (same Domain as the session cookie)
function adminReturnCookie(value, maxAgeSeconds) {
  const domain = cookieDomain();
  return [`${ADMIN_RETURN_COOKIE}=${value}`, 'Path=/', ...(domain ? [`Domain=${domain}`] : []), 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`, ...(config.production ? ['Secure'] : [])].join('; ');
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'json_required');
  const buf = await readBody(req, JSON_LIMIT);
  try { return buf.length ? JSON.parse(buf.toString('utf8')) : {}; } catch { throw new HttpError(400, 'invalid_json'); }
}

// Gzip larger text responses when the browser accepts it (the comune list is ~300 KB raw).
function reply(res, status, headers, buf) {
  if (/\bgzip\b/.test(res.req?.headers['accept-encoding'] || '') && buf.length > 1024) {
    res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    res.end(zlib.gzipSync(buf));
  } else {
    res.writeHead(status, headers);
    res.end(buf);
  }
}

function send(res, status, body, headers = {}) {
  reply(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }, Buffer.from(body === undefined ? '' : JSON.stringify(body)));
}

function rateLimiter(max, windowMs) {
  const hits = new Map();
  return key => {
    const t = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < t) { hits.set(key, { n: 1, reset: t + windowMs }); return; }
    if (++h.n > max) throw new HttpError(429, 'rate_limited', 'Troppi tentativi. Riprova tra qualche minuto.');
  };
}

const MIME = { '.wasm': 'application/wasm', '.mjs': 'text/javascript; charset=utf-8', '.tflite': 'application/octet-stream', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };

function serveFile(res, file) {
  // Font files never change (new versions get new names); place lists and images change only with
  // a new build: cache them for a day.
  // Vendored libraries live in a folder named after their version, so they never change either.
  const vendor = file.includes(`${path.sep}vendor${path.sep}`);
  const cache = vendor || (file.includes(`${path.sep}fonts${path.sep}`) && file.endsWith('.woff2')) ? 'public, max-age=31536000, immutable'
    : file.includes(`${path.sep}data${path.sep}`) || file.includes(`${path.sep}img${path.sep}`) ? 'public, max-age=86400'
    // App code and styles: always fetched fresh, so a browser (or proxy) never mixes an old script
    // with a new stylesheet after a deploy
    : /\.(js|css|html)$/.test(file) ? 'no-store' : 'no-cache';
  const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache };
  // The 12 MB WebAssembly file: compressed once, not on every request
  if (vendor && /\bgzip\b/.test(res.req?.headers['accept-encoding'] || '')) {
    if (!gzipped.has(file)) gzipped.set(file, zlib.gzipSync(fs.readFileSync(file)));
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    res.end(gzipped.get(file));
    return;
  }
  reply(res, 200, headers, fs.readFileSync(file));
}
const gzipped = new Map();

// Unknown addresses get a real page with status 404 (not the JSON the API uses)
// Unknown addresses get a real page with status 404 (not the JSON the API uses). city: the text for
// /accedi?citta=<not a comune>. home: where its links go (the main site, when on the admin host).
const NOT_FOUND_TEXT = {
  page: 'L’indirizzo potrebbe essere sbagliato, oppure la pagina è stata spostata.',
  city: 'Il link potrebbe essere sbagliato, oppure la città indicata non è un comune italiano.',
};
// The site's own hosts: www (BASE_URL), the bare domain and the admin host
function knownHost(host) {
  const main = new URL(config.baseUrl).hostname;
  return host === main || host === main.replace(/^www\./, '') || host === config.adminHost;
}

function sendNotFound(res, { kind = 'page', home = '/' } = {}) {
  const html = fs.readFileSync(path.join(config.publicDir, '404.html'), 'utf8')
    .replace('{{text}}', NOT_FOUND_TEXT[kind])
    .replaceAll('href="/"', `href="${home}"`);
  reply(res, 404, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' }, Buffer.from(html));
}

// /accedi?citta=… only for real comuni. Any casing is accepted and redirected to the official
// name (so the page shows "Torino", not "torino"); a name that isn't a comune is a 404.
const COMUNE_BY_FOLDED = new Map(COMUNI.map(c => [c[0].toLocaleLowerCase('it'), c[0]]));
function checkCity(url) {
  if (!url.searchParams.has('citta')) return 'ok';
  const raw = url.searchParams.get('citta').trim();
  if (!raw) return 'ok';
  const name = COMUNE_BY_FOLDED.get(raw.toLocaleLowerCase('it'));
  if (!name) return 'missing';
  if (name === url.searchParams.get('citta')) return 'ok';
  url.searchParams.set('citta', name);
  return `${url.pathname}?${url.searchParams}`;
}

function serveStatic(res, pathname) {
  const file = path.normalize(path.join(config.publicDir, pathname));
  if (!file.startsWith(config.publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  serveFile(res, file);
  return true;
}

// Stream a stored file, with Range support so videos can be scrubbed (Safari requires it).
function streamFile(req, res, f) {
  const headers = { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline', 'Accept-Ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, f.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), f.size - 1) : f.size - 1;
    if (start > end || start >= f.size) { res.writeHead(416, { 'Content-Range': `bytes */${f.size}` }); res.end(); return; }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${f.size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(f.path, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': f.size });
  fs.createReadStream(f.path).pipe(res);
}

// --- pages ---------------------------------------------------------------------------------

const PUBLIC_PAGES = [/^\/$/, /^\/prelancio$/, /^\/gruppi\/[^/]+$/, /^\/rientro-dei-cervelli$/, /^\/territori\/[^/]+$/, /^\/accedi$/, /^\/legal\/(privacy|termini|cookie)$/];
const MEMBER_PAGES = [/^\/onboarding$/, /^\/scopri$/, /^\/cerca$/, /^\/persone\/[^/]+$/, /^\/connessioni(\/[^/]+)?$/, /^\/messaggi(\/[^/]+)?$/,
  /^\/notifiche$/, /^\/profilo$/, /^\/benvenuto$/, /^\/gruppi$/, /^\/impostazioni(\/(account|privacy|dati|notifiche|sicurezza))?$/];
const ADMIN_PAGES = [/^\/admin(\/(utenti(\/[^/]+)?|foto|bloccati|segnalazioni|analytics|esportazioni|registro))?$/];

// --- app -----------------------------------------------------------------------------------

export function createApp({ db = openDb(), sendLoginCode = defaultSendLoginCode, sendWelcome = defaultSendWelcome, loginLimits = { ip: 20, email: 5 }, linkedinFetch = fetch, emailDomainCheck = checkEmailDomain, turnstileFetch = fetch, cfFetch = fetch } = {}) {
  groups.seedGroups(db);
  const limitIp = rateLimiter(loginLimits.ip, 15 * 60_000);
  const limitEmail = rateLimiter(loginLimits.email, 15 * 60_000);
  const limitVerify = rateLimiter(loginLimits.ip, 15 * 60_000);

  const routes = [];
  const route = (method, pattern, handler, opts = {}) =>
    routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler, ...opts });
  const pub = { public: true };
  const adm = { admin: true };

  // ---- auth (2a, 5a, 5b)
  route('POST', '/api/auth/request-code', async ({ req }) => {
    const { turnstile_token: token, ...body } = await readJson(req);
    limitIp(clientIp(req));
    await verifyTurnstile(token, clientIp(req), turnstileFetch);
    // Throwaway addresses and domains that can't receive mail get no code (email-check.js)
    await emailDomainCheck(auth.normaliseEmail(body.email));
    const { email, code } = auth.requestCode(db, body);
    limitEmail(email);
    await sendLoginCode(email, code);
    return { ok: true, ...(showCodeOnPage() ? { dev_code: code } : {}) };
  }, pub);

  route('POST', '/api/auth/verify-code', async ({ req, res }) => {
    const body = await readJson(req);
    limitVerify(`v:${clientIp(req)}`);
    const { sessionToken, user, restored, isNew } = auth.verifyCode(db, body, req.headers['user-agent']);
    if (isNew) sendWelcome(user.email);
    if (user.status === 'suspended') {
      auth.logout(db, sessionToken);
      throw new HttpError(403, 'suspended', 'Questo account è sospeso. Scrivici se pensi sia un errore.');
    }
    const next = homeFor(user);
    send(res, 200, { ok: true, next, restored }, { 'Set-Cookie': sessionCookie(sessionToken, config.sessionTtlDays * 86400) });
  }, { ...pub, raw: true });

  // Sign In with LinkedIn (see linkedin.js). Failures go back to /accedi with ?errore=… explained there.
  const back = (res, errore, extra = []) => { res.writeHead(302, { Location: `/accedi?errore=${errore}`, 'Set-Cookie': [cookie(STATE_COOKIE, '', 0, { path: '/api/auth/linkedin' }), ...extra] }); res.end(); };
  route('GET', '/api/auth/linkedin/start', ({ req, res, url }) => {
    limitIp(clientIp(req));
    if (!linkedinEnabled()) return back(res, 'linkedin_non_attivo');
    const { url: to, cookieValue, maxAge } = startLinkedin(safeNext(url.searchParams.get('next')));
    res.writeHead(302, { Location: to, 'Set-Cookie': cookie(STATE_COOKIE, cookieValue, maxAge, { path: '/api/auth/linkedin' }) });
    res.end();
  }, { ...pub, raw: true });
  route('GET', '/api/auth/linkedin/callback', async ({ req, res, url, cookies }) => {
    limitVerify(`v:${clientIp(req)}`);
    if (url.searchParams.get('error')) return back(res, 'linkedin_annullato'); // e.g. the member pressed "Annulla"
    const state = checkLinkedinState(cookies[STATE_COOKIE], url.searchParams.get('state'));
    const code = url.searchParams.get('code');
    if (!state || !code) return back(res, 'linkedin_scaduto');
    let profile;
    try { profile = await linkedinProfile(code, linkedinFetch); } catch (err) { console.error('[linkedin]', err?.message ?? err); return back(res, 'linkedin_errore'); }
    let email;
    try { email = auth.normaliseEmail(profile.email); } catch { return back(res, 'linkedin_email'); }
    if (!profile.emailVerified) return back(res, 'linkedin_email');
    const { sessionToken, user, restored, isNew } = tx(db, () => {
      const out = auth.startSession(db, email, { userAgent: req.headers['user-agent'] });
      // Fill in the name from LinkedIn only where the profile has none yet
      db.prepare('UPDATE profiles SET first_name = COALESCE(first_name, ?), last_name = COALESCE(last_name, ?) WHERE user_id = ?').run(profile.firstName || null, profile.lastName || null, out.user.id);
      // The LinkedIn photo, offered as the first profile photo if it shows a face (see /api/me/suggested-photo)
      if (profile.picture) db.prepare('UPDATE profiles SET suggested_photo_url = ? WHERE user_id = ? AND photo_file_id IS NULL').run(profile.picture, out.user.id);
      return out;
    });
    if (isNew) sendWelcome(user.email);
    if (user.status === 'suspended') { auth.logout(db, sessionToken); return back(res, 'sospeso'); }
    const set = [cookie(STATE_COOKIE, '', 0, { path: '/api/auth/linkedin' }), ...sessionCookie(sessionToken, config.sessionTtlDays * 86400)];
    if (restored) set.push(cookie('rientro_flash', encodeURIComponent('Bentornato! Il tuo account è stato ripristinato e l’eliminazione annullata.'), 120, { httpOnly: false }));
    res.writeHead(302, { Location: safeNext(state.next) ?? homeFor(user), 'Set-Cookie': set });
    res.end();
  }, { ...pub, raw: true });

  // Leaving "Accedi come": the test person's session goes and the admin gets their own one back
  // (only if it's still valid and belongs to the admin who started it), on the user's admin page
  const stopImpersonation = (res, cookies, impersonatorId) => {
    const target = auth.userForSession(db, cookies[SESSION_COOKIE]);
    auth.logout(db, cookies[SESSION_COOKIE]);
    const back = cookies[ADMIN_RETURN_COOKIE];
    const adminUser = auth.userForSession(db, back);
    const ok = adminUser && adminUser.id === impersonatorId && adminUser.role === 'admin';
    if (ok) admin.audit(db, adminUser.id, 'user.impersonate_end', target?.id ?? null);
    send(res, 200, { ok: true, go: ok ? `${adminUrl()}/utenti/${target?.id ?? ''}`.replace(/\/$/, '') : '/accedi' }, {
      'Set-Cookie': [...sessionCookie(ok ? back : '', ok ? config.sessionTtlDays * 86400 : 0), adminReturnCookie('', 0)],
    });
  };
  route('POST', '/api/auth/impersonation/stop', ({ res, cookies }) => {
    const impersonatorId = auth.impersonatorOf(db, cookies[SESSION_COOKIE]);
    if (!impersonatorId) throw new HttpError(400, 'not_impersonating', 'Non stai usando “Accedi come”.');
    stopImpersonation(res, cookies, impersonatorId);
  }, { raw: true, allowSuspended: true });

  route('POST', '/api/auth/logout', ({ res, cookies }) => {
    const impersonatorId = auth.impersonatorOf(db, cookies[SESSION_COOKIE]);
    if (impersonatorId) return stopImpersonation(res, cookies, impersonatorId);
    auth.logout(db, cookies[SESSION_COOKIE]);
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }, { raw: true, allowSuspended: true });

  route('POST', '/api/auth/logout-all', ({ user, res }) => {
    auth.logoutEverywhere(db, user.id);
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }, { raw: true });

  // ---- public
  route('GET', '/api/catalog', ({ res }) => send(res, 200, catalog, { 'Cache-Control': 'public, max-age=3600' }), { ...pub, raw: true });
  route('GET', '/api/legal', () => ({
    versions: LEGAL_VERSIONS, job_seeking_notice: JOB_SEEKING_NOTICE_TEXT,
    processing_register: admin.processingRegister(db), review_status: 'draft_pending_legal_review',
  }), pub);
  route('GET', '/api/public/launch', () => ({ launched: isLaunched(), launch_at: config.launchAt, linkedin: linkedinEnabled(), turnstile: turnstileEnabled() ? config.turnstileSiteKey : null }), pub);
  route('GET', '/api/public/territory/:name', ({ params }) => {
    const t = territory(db, decodeURIComponent(params.name));
    if (!t) throw new HttpError(404, 'not_found');
    return t;
  }, pub);

  // ---- me
  const me = (user, cookies, imp = !!auth.impersonatorOf(db, cookies[SESSION_COOKIE])) => ({
    user: { id: user.id, email: user.email, role: user.role, status: user.status, created_at: user.created_at },
    legal: auth.legalStatus(db, user.id),
    profile: profiles.effectiveProfile(db, user.id),
    missing: profiles.missingForSubmit(profiles.effectiveProfile(db, user.id)),
    job_seeking: prefs.getJobPreferences(db, user.id),
    communication: prefs.getCommunicationPreferences(db, user.id),
    job_seeking_notice: { text: JOB_SEEKING_NOTICE_TEXT, version: LEGAL_VERSIONS.job_seeking_notice },
    counts: social.badgeCounts(db, user),
    // An admin in "Accedi come" sees the member's whole site, even before launch
    launched: isLaunched() || imp,
    ...(user.role === 'admin' ? { admin_url: adminUrl(), site_url: `${config.baseUrl}/` } : {}),
    impersonated: imp,
  });
  route('GET', '/api/me', ({ user, cookies }) => me(user, cookies));
  // Public pages ask who's signed in without triggering a 401.
  route('GET', '/api/session', ({ cookies }) => {
    const user = auth.userForSession(db, cookies[SESSION_COOKIE]);
    return user && user.status !== 'suspended' ? me(user, cookies) : null;
  }, pub);
  route('POST', '/api/me/legal', async ({ user, req, cookies }) => {
    // Accepting Terms/Privacy is the member's own act, never an admin's in "Accedi come"
    if (auth.impersonatorOf(db, cookies[SESSION_COOKIE])) throw new HttpError(403, 'impersonating', 'Solo l’utente può accettare Termini e Privacy.');
    return auth.acknowledgeLegal(db, user.id, await readJson(req));
  });

  // Updated Terms/Privacy must be acknowledged before changing the profile, except during onboarding:
  // updated documents are asked for once the profile has been sent (the prompt on the member pages).
  const legal = user => { if (user.status !== 'onboarding') auth.requireLegal(db, user.id); };
  route('PATCH', '/api/me/profile', async ({ user, req }) => { legal(user); return profiles.updateProfile(db, user, await readJson(req)); });
  route('POST', '/api/me/education', async ({ user, req }) => { legal(user); return profiles.saveEducation(db, user.id, await readJson(req)); });
  route('PATCH', '/api/me/education/:id', async ({ user, req, params }) => profiles.saveEducation(db, user.id, await readJson(req), params.id));
  route('DELETE', '/api/me/education/:id', ({ user, params }) => profiles.deleteRow(db, 'education', user.id, params.id));
  route('POST', '/api/me/experiences', async ({ user, req }) => { legal(user); return profiles.saveExperience(db, user.id, await readJson(req)); });
  route('PATCH', '/api/me/experiences/:id', async ({ user, req, params }) => profiles.saveExperience(db, user.id, await readJson(req), params.id));
  route('DELETE', '/api/me/experiences/:id', ({ user, params }) => profiles.deleteRow(db, 'experiences', user.id, params.id));
  route('POST', '/api/me/photo', async ({ user, req }) => {
    legal(user);
    const out = attachUpload(db, user, 'profile_photo', await receiveUpload(req, 'profile_photo'));
    // The browser's check (face.js) never blocks: a photo that didn't pass goes to "Foto da controllare"
    const check = ['no_face', 'small_face', 'multiple_faces', 'low_res', 'unchecked'].includes(req.headers['x-photo-check']) ? req.headers['x-photo-check'] : null;
    db.prepare('UPDATE profiles SET suggested_photo_url = NULL, photo_check = ? WHERE user_id = ?').run(check, user.id);
    return out;
  });
  // An image the browser found explicit (nsfw.js): quarantined for the admin, account suspended now
  route('POST', '/api/me/photo-blocked', async ({ user, req, res }) => {
    moderation.blockUpload(db, user, await readBody(req, config.maxPhotoBytes * 2), req.headers['x-nsfw-scores']);
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }, { raw: true });
  // The sign-in provider's photo, passed through so the browser can check it for a face (face.js)
  // and upload it as the profile photo. Only from the providers' image hosts; cleared once tried.
  route('GET', '/api/me/suggested-photo', async ({ user, res }) => {
    const { suggested_photo_url: src } = db.prepare('SELECT suggested_photo_url FROM profiles WHERE user_id = ?').get(user.id) ?? {};
    const host = src && new URL(src).hostname;
    if (!host || !(host === 'media.licdn.com' || host.endsWith('.licdn.com') || host.endsWith('.googleusercontent.com'))) throw new HttpError(404, 'not_found');
    let r;
    try { r = await linkedinFetch(src, { signal: AbortSignal.timeout(10_000), redirect: 'error' }); } catch { throw new HttpError(404, 'not_found'); }
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type.split(';')[0])) throw new HttpError(404, 'not_found');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > config.maxPhotoBytes) throw new HttpError(404, 'not_found');
    res.writeHead(200, { 'Content-Type': type.split(';')[0], 'Cache-Control': 'no-store', 'Content-Length': buf.length });
    res.end(buf);
  }, { raw: true });
  route('DELETE', '/api/me/suggested-photo', ({ user }) => {
    db.prepare('UPDATE profiles SET suggested_photo_url = NULL WHERE user_id = ?').run(user.id);
    return { ok: true };
  });
  route('POST', '/api/me/video', async ({ user, req }) => {
    legal(user);
    return attachUpload(db, user, 'profile_video', await checkVideo(await receiveUpload(req, 'profile_video')));
  });
  // The member keeps this take (Continua, or leaves the profile page): convert it in the background
  route('POST', '/api/me/video/confirm', ({ user }) => { confirmVideo(db, user.id); return { ok: true }; });
  route('DELETE', '/api/me/video', ({ user }) => { removeVideo(db, user.id); return { ok: true }; });
  route('POST', '/api/me/submit', ({ user, cookies }) => { legal(user); profiles.publishProfile(db, user); return me(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id), cookies); });

  route('PUT', '/api/me/job-seeking', async ({ user, req, url }) => {
    legal(user);
    const source = url.searchParams.get('source') === 'onboarding' ? 'onboarding' : 'settings';
    return prefs.setJobSeeking(db, user.id, await readJson(req), source);
  });
  route('PATCH', '/api/me/job-preferences', async ({ user, req }) => { legal(user); return prefs.updateJobDetails(db, user.id, await readJson(req)); });
  route('PUT', '/api/me/communication', async ({ user, req, url }) => {
    const source = url.searchParams.get('source') === 'onboarding' ? 'onboarding' : 'settings';
    return prefs.setCommunicationPreference(db, user.id, await readJson(req), source);
  });
  route('PATCH', '/api/me/notifications', async ({ user, req }) => prefs.updateNotificationSettings(db, user.id, await readJson(req)));
  route('GET', '/api/me/preference-history', ({ user }) => prefs.preferenceHistory(db, user.id));
  route('GET', '/api/me/sessions', ({ user, cookies }) => auth.listSessions(db, user.id, cookies[SESSION_COOKIE]));
  route('GET', '/api/me/blocks', ({ user, url }) => social.listBlocked(db, user, url.searchParams));
  route('GET', '/api/me/export', ({ user, res }) => {
    send(res, 200, exportData(db, user), { 'Content-Disposition': 'attachment; filename="rientro-i-miei-dati.json"' });
  }, { raw: true, allowSuspended: true });
  route('DELETE', '/api/me', async ({ user, req, res }) => {
    const out = deleteAccount(db, user, await readJson(req));
    // The confirmation email (how to change one's mind) must not hold up or undo the request
    if (canSendEmail()) sendDeletionScheduledEmail(user.email, out.erase_on).catch(err => console.error('[email] deletion notice', err?.message ?? err));
    send(res, 200, out, { 'Set-Cookie': sessionCookie('', 0) });
  }, { raw: true, allowSuspended: true });

  // ---- members
  route('GET', '/api/profiles', ({ user, url }) => {
    social.requireLaunched(user);
    if (user.status !== 'approved') throw new HttpError(403, 'not_approved', 'Completa il profilo per scoprire le altre persone.');
    return profiles.discover(db, user, profiles.parseDiscoverQuery(url.searchParams));
  });
  route('GET', '/api/profiles/:id', ({ user, params, url }) => {
    if (user.id !== params.id) {
      social.requireLaunched(user);
      if (user.status !== 'approved') throw new HttpError(403, 'not_approved');
    }
    return profiles.publicProfile(db, user, params.id, { asMember: url.searchParams.has('anteprima') });
  });
  route('GET', '/api/comuni/counts', () => profiles.comuneCounts(db));

  route('GET', '/api/connections', ({ user, url }) => social.listConnections(db, user, url.searchParams));
  route('POST', '/api/connections', async ({ user, req }) => social.requestConnection(db, user, await readJson(req)));
  route('GET', '/api/connections/:id', ({ user, params }) => social.getRequest(db, user, params.id));
  route('POST', '/api/connections/:id/:action', ({ user, params }) => {
    if (!['accept', 'decline', 'withdraw'].includes(params.action)) throw new HttpError(404, 'not_found');
    return social.respondConnection(db, user, params.id, params.action);
  });

  route('GET', '/api/threads', ({ user, url }) => social.listThreads(db, user, url.searchParams));
  route('GET', '/api/threads/:id', ({ user, params, url }) => social.getThread(db, user, params.id, { after: Number(url.searchParams.get('after')) || 0, before: Number(url.searchParams.get('before')) || 0, since: url.searchParams.get('since') || '' }));
  route('PUT', '/api/threads/:id/messages/:msg/reaction', async ({ user, params, req }) => social.setReaction(db, user, params.id, params.msg, await readJson(req)));
  route('POST', '/api/threads/:id', async ({ user, params, req }) => social.sendMessage(db, user, params.id, await readJson(req)));

  route('GET', '/api/public/groups/:id', ({ params, url }) => groups.publicGroup(db, params.id, url.searchParams), pub);
  route('GET', '/api/public/photos/:id', ({ params, req, res }) => {
    if (!groups.publicPhotoAllowed(db, params.id)) throw new HttpError(404, 'not_found');
    streamFile(req, res, fileOnDisk(db, params.id));
  }, { ...pub, raw: true });
  route('GET', '/api/public/group-images/:id', ({ params, req, res }) => {
    if (!groups.publicImageAllowed(db, params.id)) throw new HttpError(404, 'not_found');
    streamFile(req, res, fileOnDisk(db, params.id));
  }, { ...pub, raw: true });
  // A picture for a post, before publishing it (the browser has resized and checked it)
  route('POST', '/api/groups/images', async ({ user, req }) => {
    legal(user);
    groups.requireMemberArea(user);
    return storeGroupImage(db, user, await receiveUpload(req, 'group_image'));
  });
  route('GET', '/api/groups', ({ user }) => groups.listGroups(db, user));
  route('GET', '/api/groups/search', ({ user, url }) => groups.searchGroups(db, user, url.searchParams)); // before :id
  route('GET', '/api/groups/:id', ({ user, params }) => groups.getGroup(db, user, params.id));
  route('POST', '/api/groups/:id/follow', ({ user, params }) => groups.setFollow(db, user, params.id, true));
  route('DELETE', '/api/groups/:id/follow', ({ user, params }) => groups.setFollow(db, user, params.id, false));
  route('GET', '/api/groups/:id/posts', ({ user, params, url }) => groups.listPosts(db, user, params.id, url.searchParams));
  route('POST', '/api/groups/:id/posts', async ({ user, params, req }) => groups.createPost(db, user, params.id, await readJson(req)));
  route('DELETE', '/api/groups/:id/posts/:post', ({ user, params }) => groups.deletePost(db, user, params.id, params.post));
  route('GET', '/api/groups/:id/posts/:post/comments', ({ user, params }) => groups.listComments(db, user, params.id, params.post));
  route('POST', '/api/groups/:id/posts/:post/comments', async ({ user, params, req }) => groups.createComment(db, user, params.id, params.post, await readJson(req)));
  route('DELETE', '/api/groups/:id/posts/:post/comments/:comment', ({ user, params }) => groups.deleteComment(db, user, params.id, params.post, params.comment));

  route('GET', '/api/notifications', ({ user, url }) => social.listNotifications(db, user, url.searchParams));
  route('POST', '/api/notifications/read', ({ user }) => { social.markNotificationsRead(db, user); return { ok: true }; });

  route('POST', '/api/blocks/:id', ({ user, params }) => { social.block(db, user, params.id); return { ok: true }; });
  route('DELETE', '/api/blocks/:id', ({ user, params }) => { social.unblock(db, user, params.id); return { ok: true }; });
  route('POST', '/api/reports', async ({ user, req }) => social.report(db, user, await readJson(req)));

  route('GET', '/api/files/:id', ({ user, params, req, res }) => {
    const f = readFileFor(db, user, params.id, ownerId => profiles.connectionState(db, user.id, ownerId).status === 'connected');
    streamFile(req, res, f);
  }, { raw: true });

  // ---- admin (role checked server-side on every request)
  route('GET', '/api/admin/sidebar', () => admin.sidebarCounts(db), adm);
  route('GET', '/api/admin/dashboard', ({ user, url }) => admin.dashboard(db, user, url.searchParams), adm);
  route('GET', '/api/admin/users', ({ user, url }) => admin.listUsers(db, user, url.searchParams), adm);
  route('GET', '/api/admin/users/:id', ({ user, params }) => {
    const d = admin.getUser(db, user, params.id);
    return { ...d, checks: admin.reviewChecks(d.profile) };
  }, adm);
  // "Accedi come": the admin uses the site as this member (a short session of its own, audited)
  route('POST', '/api/admin/users/:id/impersonate', ({ user, params, req, res, cookies }) => {
    const target = db.prepare('SELECT id, status FROM users WHERE id = ?').get(params.id);
    if (!target) throw new HttpError(404, 'not_found');
    if (target.id === user.id) throw new HttpError(409, 'self', 'Sei già tu.');
    if (target.status === 'suspended') throw new HttpError(409, 'suspended', 'Questo account è sospeso.');
    if (auth.impersonatorOf(db, cookies[SESSION_COOKIE])) throw new HttpError(409, 'already', 'Esci prima dall’altro account.');
    const sessionToken = auth.startImpersonation(db, user.id, target.id, req.headers['user-agent']);
    admin.audit(db, user.id, 'user.impersonate', target.id);
    const ttl = auth.IMPERSONATION_MINUTES * 60;
    send(res, 200, { go: `${config.baseUrl}/scopri` }, {
      'Set-Cookie': [...sessionCookie(sessionToken, ttl), adminReturnCookie(cookies[SESSION_COOKIE], ttl)],
    });
  }, { ...adm, raw: true });
  route('POST', '/api/admin/users/:id/notes', async ({ user, params, req }) => admin.addNote(db, user, params.id, await readJson(req)), adm);
  route('POST', '/api/admin/users/:id/review', async ({ user, params, req }) => admin.review(db, user, params.id, await readJson(req)), adm);
  route('GET', '/api/admin/blocked', ({ user, url }) => moderation.listBlocked(db, user, url.searchParams), adm);
  route('GET', '/api/admin/blocked/:id/image', ({ user, params, res }) => {
    const { mime, buf } = moderation.blockedImage(db, user, params.id);
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'Content-Length': buf.length });
    res.end(buf);
  }, { ...adm, raw: true });
  route('POST', '/api/admin/blocked/:id', async ({ user, params, req }) => moderation.resolveBlocked(db, user, params.id, (await readJson(req)).action), adm);
  route('GET', '/api/admin/demo', () => ({ total: demo.demoCount(db) }), adm);
  route('POST', '/api/admin/demo', ({ user }) => demo.createDemoPeople(db, user), adm);
  route('DELETE', '/api/admin/demo', ({ user }) => demo.removeDemoPeople(db, user), adm);
  route('GET', '/api/admin/photo-checks', ({ user, url }) => admin.photoChecks(db, user, url.searchParams), adm);
  route('POST', '/api/admin/photo-checks/:id/ok', ({ user, params }) => admin.photoCheckOk(db, user, params.id), adm);
  route('GET', '/api/admin/reports', ({ user, url }) => admin.listReports(db, user, url.searchParams), adm);
  route('POST', '/api/admin/reports/:id', async ({ user, params, req }) => admin.resolveReport(db, user, params.id, await readJson(req)), adm);
  route('GET', '/api/admin/reports/:id/chat', ({ user, params }) => admin.reportChat(db, user, params.id), adm);
  route('DELETE', '/api/admin/reports/:id/post', ({ user, params }) => admin.deleteReportedPost(db, user, params.id), adm);
  route('GET', '/api/admin/traffic', ({ url }) => traffic(Math.min(365, Math.max(1, Number(url.searchParams.get('period')) || 30)), cfFetch), adm);
  route('GET', '/api/admin/analytics', ({ user, url }) => admin.analytics(db, user, url.searchParams), adm);
  route('POST', '/api/admin/exports', async ({ user, req, res }) => {
    const out = admin.exportCsv(db, user, await readJson(req));
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${out.filename}"`, 'X-Rows': String(out.rows) });
    res.end(out.csv);
  }, { ...adm, raw: true });
  route('GET', '/api/admin/exports/recent', () => admin.recentExports(db), adm);
  route('GET', '/api/admin/audit', ({ user, url }) => admin.auditLog(db, user, url.searchParams), adm);
  route('GET', '/api/admin/processing', () => admin.processingRegister(db), adm);

  async function handle(req, res) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const url = new URL(req.url, config.baseUrl);
    const cookies = parseCookies(req.headers.cookie);
    cookies[SESSION_COOKIE] ??= cookies[LEGACY_SESSION_COOKIE];
    const p = url.pathname;
    try {
      // Health check for the host (no data, never behind the preview password)
      if (p === '/healthz') { send(res, 200, { ok: true }); return; }
      // Separate admin host: a plain 404 for everyone but a signed-in admin, who finds only the panel
      // (and the files and APIs it needs) there; the member pages send them back to the main site.
      // On the main site the panel doesn't exist.
      // Any other subdomain (with a wildcard *.rientro.it in the DNS) gets the same 404 page as a
      // stranger on the admin host, so the admin host doesn't stand out
      const host = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
      if (config.production && config.adminHost && !knownHost(host)) {
        if (/^\/(fonts\/[\w.-]+|dc\/base\.css|app\/app\.css|favicon\.svg)$/.test(p) && serveStatic(res, p)) return;
        return sendNotFound(res, { home: `${config.baseUrl}/` });
      }
      if (config.adminHost) {
        const onAdminHost = host === config.adminHost;
        const adminPath = ADMIN_PAGES.some(re => re.test(p)) || p.startsWith('/api/admin/');
        if (onAdminHost) {
          const user = auth.userForSession(db, cookies[SESSION_COOKIE]);
          if (user?.role !== 'admin' || user.status === 'suspended') {
            // The 404 page's own styles and fonts (public anyway); everything else is a 404 that
            // says nothing about what's here, with its links going to the main site
            if (/^\/(fonts\/[\w.-]+|dc\/base\.css|app\/app\.css|favicon\.svg)$/.test(p) && serveStatic(res, p)) return;
            return sendNotFound(res, { home: `${config.baseUrl}/` });
          }
          if (p === '/') { res.writeHead(302, { Location: '/admin' }); res.end(); return; }
          if (!adminPath && (PUBLIC_PAGES.some(re => re.test(p)) || MEMBER_PAGES.some(re => re.test(p)))) {
            res.writeHead(302, { Location: config.baseUrl + p + url.search }); res.end(); return;
          }
        } else if (adminPath) {
          if (p.startsWith('/api/')) throw new HttpError(404, 'not_found');
          return sendNotFound(res);
        }
      }
      if (config.previewPassword && !openDuringPreview(p) && !previewAllowed(req)) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Rientro anteprima", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('Anteprima riservata. Chiedi la password al team Rientro.');
        return;
      }
      if (!p.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed');
        const appPage = file => serveFile(res, path.join(config.publicDir, file));
        // The app shell, with Cloudflare's visit counter except in the admin panel (web-analytics.js)
        const shell = ({ track = true } = {}) => {
          const tag = track ? beaconTag() : '';
          if (!tag) return appPage('app.html');
          const html = fs.readFileSync(path.join(config.publicDir, 'app.html'), 'utf8').replace('</body>', `${tag}\n</body>`);
          reply(res, 200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }, Buffer.from(html));
        };
        if (p === '/accedi') {
          const city = checkCity(url);
          if (city === 'missing') return sendNotFound(res, { kind: 'city' });
          if (city !== 'ok') { res.writeHead(302, { Location: city }); res.end(); return; }
        }
        // The old "profilo in revisione" page (links in past notifications and emails)
        if (p === '/stato') { res.writeHead(302, { Location: '/profilo' }); res.end(); return; }
        // Blocked people are listed in Privacy now
        if (p === '/impostazioni/bloccati') { res.writeHead(302, { Location: '/impostazioni/privacy#bloccati' }); res.end(); return; }
        // Search engines: group pages are public and listed here (not linked from the public site)
        if (p === '/robots.txt') return reply(res, 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }, Buffer.from(`User-agent: *\nAllow: /\nSitemap: ${config.baseUrl}/sitemap.xml\n`));
        if (p === '/sitemap.xml') {
          const urls = ['/', ...groups.groupIds(db).map(id => `/gruppi/${id}`)];
          return reply(res, 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
            Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${config.baseUrl}${u}</loc></url>`).join('\n')}\n</urlset>\n`));
        }
        // A group page: its posts written into the HTML, for search engines and the first paint
        const groupMatch = /^\/gruppi\/([^/]+)$/.exec(p);
        if (groupMatch) {
          const page = groups.groupPageHtml(db, decodeURIComponent(groupMatch[1]));
          if (!page) return sendNotFound(res);
          const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
          const html = fs.readFileSync(path.join(config.publicDir, 'app.html'), 'utf8')
            .replace(/<title>[^<]*<\/title>/, `<title>${attr(page.title)}</title>\n<link rel="canonical" href="${config.baseUrl}${p}">`)
            .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(page.description)}">`)
            .replace('<div id="app" aria-live="polite"></div>', `<div id="app" aria-live="polite">${page.body}</div>`)
            .replace('</body>', `${beaconTag()}\n</body>`);
          return reply(res, 200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }, Buffer.from(html));
        }
        if (PUBLIC_PAGES.some(re => re.test(p))) return shell();
        const needsAdmin = ADMIN_PAGES.some(re => re.test(p));
        if (needsAdmin || MEMBER_PAGES.some(re => re.test(p))) {
          const user = auth.userForSession(db, cookies[SESSION_COOKIE]);
          if (!user || (needsAdmin && user.role !== 'admin')) {
            res.writeHead(302, { Location: user ? '/' : `/accedi?next=${encodeURIComponent(p)}` });
            res.end();
            return;
          }
          return shell({ track: !needsAdmin });
        }
        if ((p === '/design' || p.startsWith('/design/')) && !config.production) return appPage('design.html');
        if (p.startsWith('/dc/gen/') && config.production && /\/rientro-/.test(p)) throw new HttpError(404, 'not_found');
        if (!serveStatic(res, p)) return sendNotFound(res);
        return;
      }

      const r = routes.find(x => x.method === req.method && x.re.test(p));
      if (!r) throw new HttpError(404, 'not_found');

      // CSRF: state-changing calls need a custom header, which cross-site requests can't set
      // without a CORS preflight (never granted).
      if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'rientro') throw new HttpError(403, 'csrf', 'Richiesta non valida.');

      const user = r.public ? null : auth.userForSession(db, cookies[SESSION_COOKIE]);
      if (!r.public && !user) throw new HttpError(401, 'unauthenticated', 'Accedi per continuare.');
      if (user?.status === 'suspended' && !r.allowSuspended) throw new HttpError(403, 'suspended', 'Questo account è sospeso.');
      if (r.admin && user.role !== 'admin') throw new HttpError(403, 'forbidden');

      const ctx = { req, res, url, cookies, user, params: Object.fromEntries(Object.entries(p.match(r.re).groups || {}).map(([k, v]) => [k, decodeURIComponent(v)])) };
      const out = await r.handler(ctx);
      if (!r.raw) send(res, 200, out);
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      const status = err instanceof HttpError ? err.status : 500;
      if (res.headersSent) { res.end(); return; }
      send(res, status, { error: err instanceof HttpError ? err.code : 'server_error', message: err instanceof HttpError ? err.message : 'Errore interno' });
    }
  }

  return { db, handle, server: http.createServer(handle) };
}

// Welcome email on sign-up (mail.js): never holds up the sign-in, and only with an email provider
function defaultSendWelcome(email) {
  if (!canSendEmail()) return;
  sendWelcomeEmail(email).catch(err => console.error('[welcome]', err.message));
}

async function defaultSendLoginCode(email, code) {
  if (canSendEmail()) return sendLoginCodeEmail(email, code);
  if (showCodeOnPage()) { if (!config.production) console.log(`\n[dev] Codice di accesso per ${email}: ${code}\n`); return; }
  throw new HttpError(503, 'email_unavailable', 'Non riusciamo a inviare il codice in questo momento. Riprova tra poco.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { db, server } = createApp();
  server.listen(config.port, '0.0.0.0', () => console.log(`Rientro in ascolto su ${config.baseUrl}`));
  // Videos never confirmed: converted once they are half an hour old
  sweepVideoConversions(db);
  setInterval(() => sweepVideoConversions(db), 10 * 60_000).unref();
  // Retention rules of the privacy policy: at start and then once a day
  const retain = () => {
    try { console.log('[retention]', JSON.stringify(runRetention(db))); } catch (err) { console.error('[retention]', err); }
  };
  retain();
  setInterval(retain, 24 * 3600_000).unref();
  // Age bands move up with the birth year
  const ages = () => { try { profiles.refreshAgeBands(db); } catch (err) { console.error('[ages]', err); } };
  ages();
  setInterval(ages, 24 * 3600_000).unref();
  // Email for requests and messages still unread after 15 minutes, grouped (email-digest.js)
  let digesting = false;
  setInterval(async () => {
    if (digesting) return;
    digesting = true;
    try { await sendNotificationDigests(db); } catch (err) { console.error('[digest]', err); } finally { digesting = false; }
  }, 60_000).unref();
}

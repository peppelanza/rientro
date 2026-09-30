import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as admin from './admin.js';
import * as auth from './auth.js';
import { catalog, COMUNI } from './catalog.js';
import { config, isLaunched, JOB_SEEKING_NOTICE_TEXT, LEGAL_VERSIONS } from './config.js';
import { openDb, tx } from './db.js';
import { attachUpload, checkVideo, confirmVideo, readFileFor, receiveUpload, removeVideo, sweepVideoConversions } from './files.js';
import * as prefs from './preferences.js';
import { deleteAccount, exportData } from './privacy.js';
import { canSendEmail, sendDeletionScheduledEmail, sendLoginCodeEmail } from './mail.js';
import { runRetention } from './retention.js';
import { checkLinkedinState, linkedinEnabled, linkedinProfile, startLinkedin, STATE_COOKIE } from './linkedin.js';
import * as profiles from './profiles.js';
import { territory } from './public.js';
import * as social from './social.js';
import { HttpError } from './validate.js';

const SESSION_COOKIE = config.production ? '__Host-rientro_session' : 'rientro_session';
const JSON_LIMIT = 64 * 1024;

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self'",
    "font-src 'self'", "img-src 'self' data: blob:", "media-src 'self' blob:", "connect-src 'self'",
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
const homeFor = user => (user.role === 'admin' ? '/admin' : user.status === 'approved' ? '/scopri' : user.status === 'onboarding' ? '/onboarding' : '/stato');

function sessionCookie(value, maxAgeSeconds) {
  return [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`, ...(config.production ? ['Secure'] : [])].join('; ');
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

const MIME = { '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };

function serveFile(res, file) {
  // Font files never change (new versions get new names); place lists and images change only with
  // a new build: cache them for a day.
  const cache = file.includes(`${path.sep}fonts${path.sep}`) && file.endsWith('.woff2') ? 'public, max-age=31536000, immutable'
    : file.includes(`${path.sep}data${path.sep}`) || file.includes(`${path.sep}img${path.sep}`) ? 'public, max-age=86400'
    // App code and styles: always fetched fresh, so a browser (or proxy) never mixes an old script
    // with a new stylesheet after a deploy
    : /\.(js|css|html)$/.test(file) ? 'no-store' : 'no-cache';
  reply(res, 200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache }, fs.readFileSync(file));
}

// Unknown addresses get a real page with status 404 (not the JSON the API uses)
function sendNotFound(res) {
  reply(res, 404, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' }, fs.readFileSync(path.join(config.publicDir, '404.html')));
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

const PUBLIC_PAGES = [/^\/$/, /^\/prelancio$/, /^\/rientro-dei-cervelli$/, /^\/territori\/[^/]+$/, /^\/accedi$/, /^\/legal\/(privacy|termini|cookie)$/];
const MEMBER_PAGES = [/^\/onboarding$/, /^\/stato$/, /^\/scopri$/, /^\/persone\/[^/]+$/, /^\/connessioni(\/[^/]+)?$/, /^\/messaggi(\/[^/]+)?$/,
  /^\/notifiche$/, /^\/profilo$/, /^\/impostazioni(\/(privacy|dati|bloccati))?$/];
const ADMIN_PAGES = [/^\/admin(\/(utenti(\/[^/]+)?|approvazioni|segnalazioni|analytics|esportazioni|registro))?$/];

// --- app -----------------------------------------------------------------------------------

export function createApp({ db = openDb(), sendLoginCode = defaultSendLoginCode, loginLimits = { ip: 20, email: 5 }, linkedinFetch = fetch } = {}) {
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
    const body = await readJson(req);
    limitIp(clientIp(req));
    const { email, code } = auth.requestCode(db, body);
    limitEmail(email);
    await sendLoginCode(email, code);
    return { ok: true, ...(showCodeOnPage() ? { dev_code: code } : {}) };
  }, pub);

  route('POST', '/api/auth/verify-code', async ({ req, res }) => {
    const body = await readJson(req);
    limitVerify(`v:${clientIp(req)}`);
    const { sessionToken, user, restored } = auth.verifyCode(db, body, req.headers['user-agent']);
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
    const { sessionToken, user, restored } = tx(db, () => {
      const out = auth.startSession(db, email, { userAgent: req.headers['user-agent'] });
      // Fill in the name from LinkedIn only where the profile has none yet
      db.prepare('UPDATE profiles SET first_name = COALESCE(first_name, ?), last_name = COALESCE(last_name, ?) WHERE user_id = ?').run(profile.firstName || null, profile.lastName || null, out.user.id);
      return out;
    });
    if (user.status === 'suspended') { auth.logout(db, sessionToken); return back(res, 'sospeso'); }
    const set = [cookie(STATE_COOKIE, '', 0, { path: '/api/auth/linkedin' }), sessionCookie(sessionToken, config.sessionTtlDays * 86400)];
    if (restored) set.push(cookie('rientro_flash', encodeURIComponent('Bentornato! Il tuo account è stato ripristinato e l’eliminazione annullata.'), 120, { httpOnly: false }));
    res.writeHead(302, { Location: safeNext(state.next) ?? homeFor(user), 'Set-Cookie': set });
    res.end();
  }, { ...pub, raw: true });

  route('POST', '/api/auth/logout', ({ res, cookies }) => {
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
  route('GET', '/api/public/launch', () => ({ launched: isLaunched(), launch_at: config.launchAt, linkedin: linkedinEnabled() }), pub);
  route('GET', '/api/public/territory/:name', ({ params }) => {
    const t = territory(db, decodeURIComponent(params.name));
    if (!t) throw new HttpError(404, 'not_found');
    return t;
  }, pub);

  // ---- me
  const me = user => ({
    user: { id: user.id, email: user.email, role: user.role, status: user.status, created_at: user.created_at },
    legal: auth.legalStatus(db, user.id),
    profile: profiles.effectiveProfile(db, user.id),
    missing: profiles.missingForSubmit(profiles.effectiveProfile(db, user.id)),
    job_seeking: prefs.getJobPreferences(db, user.id),
    communication: prefs.getCommunicationPreferences(db, user.id),
    job_seeking_notice: { text: JOB_SEEKING_NOTICE_TEXT, version: LEGAL_VERSIONS.job_seeking_notice },
    counts: social.badgeCounts(db, user),
    launched: isLaunched(),
  });
  route('GET', '/api/me', ({ user }) => me(user));
  // Public pages ask who's signed in without triggering a 401.
  route('GET', '/api/session', ({ cookies }) => {
    const user = auth.userForSession(db, cookies[SESSION_COOKIE]);
    return user && user.status !== 'suspended' ? me(user) : null;
  }, pub);
  route('POST', '/api/me/legal', async ({ user, req }) => auth.acknowledgeLegal(db, user.id, await readJson(req)));

  // Updated Terms/Privacy must be acknowledged before changing the profile, except during onboarding:
  // there they are confirmed when the profile is sent for review (/api/me/submit below).
  const legal = user => { if (user.status !== 'onboarding') auth.requireLegal(db, user.id); };
  route('PATCH', '/api/me/profile', async ({ user, req }) => { legal(user); return profiles.updateProfile(db, user, await readJson(req)); });
  route('POST', '/api/me/education', async ({ user, req }) => { legal(user); return profiles.saveEducation(db, user.id, await readJson(req)); });
  route('PATCH', '/api/me/education/:id', async ({ user, req, params }) => profiles.saveEducation(db, user.id, await readJson(req), params.id));
  route('DELETE', '/api/me/education/:id', ({ user, params }) => profiles.deleteRow(db, 'education', user.id, params.id));
  route('POST', '/api/me/experiences', async ({ user, req }) => { legal(user); return profiles.saveExperience(db, user.id, await readJson(req)); });
  route('PATCH', '/api/me/experiences/:id', async ({ user, req, params }) => profiles.saveExperience(db, user.id, await readJson(req), params.id));
  route('DELETE', '/api/me/experiences/:id', ({ user, params }) => profiles.deleteRow(db, 'experiences', user.id, params.id));
  route('POST', '/api/me/photo', async ({ user, req }) => { legal(user); return attachUpload(db, user, 'profile_photo', await receiveUpload(req, 'profile_photo')); });
  route('POST', '/api/me/video', async ({ user, req }) => {
    legal(user);
    return attachUpload(db, user, 'profile_video', await checkVideo(await receiveUpload(req, 'profile_video')));
  });
  // The member keeps this take (Continua, or leaves the profile page): convert it in the background
  route('POST', '/api/me/video/confirm', ({ user }) => { confirmVideo(db, user.id); return { ok: true }; });
  route('DELETE', '/api/me/video', ({ user }) => { removeVideo(db, user.id); return { ok: true }; });
  route('POST', '/api/me/submit', ({ user }) => { auth.requireLegal(db, user.id); profiles.submitForReview(db, user); return me(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)); });

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
  route('GET', '/api/me/blocks', ({ user }) => social.listBlocked(db, user));
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
    if (user.status !== 'approved' && user.role !== 'admin') throw new HttpError(403, 'not_approved', 'Potrai scoprire altre persone quando il tuo profilo sarà approvato.');
    return profiles.discover(db, user, profiles.parseDiscoverQuery(url.searchParams));
  });
  route('GET', '/api/profiles/:id', ({ user, params }) => {
    if (user.id !== params.id) {
      social.requireLaunched(user);
      if (user.status !== 'approved' && user.role !== 'admin') throw new HttpError(403, 'not_approved');
    }
    return profiles.publicProfile(db, user, params.id);
  });
  route('GET', '/api/comuni/counts', () => profiles.comuneCounts(db));

  route('GET', '/api/connections', ({ user }) => social.listConnections(db, user));
  route('POST', '/api/connections', async ({ user, req }) => social.requestConnection(db, user, await readJson(req)));
  route('GET', '/api/connections/:id', ({ user, params }) => social.getRequest(db, user, params.id));
  route('POST', '/api/connections/:id/:action', ({ user, params }) => {
    if (!['accept', 'decline', 'withdraw'].includes(params.action)) throw new HttpError(404, 'not_found');
    return social.respondConnection(db, user, params.id, params.action);
  });

  route('GET', '/api/threads', ({ user }) => social.listThreads(db, user));
  route('GET', '/api/threads/:id', ({ user, params, url }) => social.getThread(db, user, params.id, Number(url.searchParams.get('after')) || 0));
  route('POST', '/api/threads/:id', async ({ user, params, req }) => social.sendMessage(db, user, params.id, await readJson(req)));

  route('GET', '/api/notifications', ({ user }) => social.listNotifications(db, user));
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
  route('POST', '/api/admin/users/:id/notes', async ({ user, params, req }) => admin.addNote(db, user, params.id, await readJson(req)), adm);
  route('POST', '/api/admin/users/:id/review', async ({ user, params, req }) => admin.review(db, user, params.id, await readJson(req)), adm);
  route('GET', '/api/admin/approvals', ({ user }) => admin.approvals(db, user), adm);
  route('GET', '/api/admin/reports', ({ user, url }) => admin.listReports(db, user, url.searchParams), adm);
  route('POST', '/api/admin/reports/:id', async ({ user, params, req }) => admin.resolveReport(db, user, params.id, await readJson(req)), adm);
  route('GET', '/api/admin/reports/:id/chat', ({ user, params }) => admin.reportChat(db, user, params.id), adm);
  route('GET', '/api/admin/analytics', ({ user, url }) => admin.analytics(db, user, url.searchParams), adm);
  route('POST', '/api/admin/exports', async ({ user, req, res }) => {
    const out = admin.exportCsv(db, user, await readJson(req));
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${out.filename}"`, 'X-Rows': String(out.rows) });
    res.end(out.csv);
  }, { ...adm, raw: true });
  route('GET', '/api/admin/exports/recent', () => admin.recentExports(db), adm);
  route('GET', '/api/admin/audit', ({ user }) => admin.auditLog(db, user), adm);
  route('GET', '/api/admin/processing', () => admin.processingRegister(db), adm);

  async function handle(req, res) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const url = new URL(req.url, config.baseUrl);
    const cookies = parseCookies(req.headers.cookie);
    const p = url.pathname;
    try {
      // Health check for the host (no data, never behind the preview password)
      if (p === '/healthz') { send(res, 200, { ok: true }); return; }
      if (config.previewPassword && !openDuringPreview(p) && !previewAllowed(req)) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Rientro anteprima", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('Anteprima riservata. Chiedi la password al team Rientro.');
        return;
      }
      if (!p.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed');
        const appPage = file => serveFile(res, path.join(config.publicDir, file));
        if (p === '/accedi') {
          const city = checkCity(url);
          if (city === 'missing') return sendNotFound(res);
          if (city !== 'ok') { res.writeHead(302, { Location: city }); res.end(); return; }
        }
        if (PUBLIC_PAGES.some(re => re.test(p))) return appPage('app.html');
        const needsAdmin = ADMIN_PAGES.some(re => re.test(p));
        if (needsAdmin || MEMBER_PAGES.some(re => re.test(p))) {
          const user = auth.userForSession(db, cookies[SESSION_COOKIE]);
          if (!user || (needsAdmin && user.role !== 'admin')) {
            res.writeHead(302, { Location: user ? '/' : `/accedi?next=${encodeURIComponent(p)}` });
            res.end();
            return;
          }
          return appPage('app.html');
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
}

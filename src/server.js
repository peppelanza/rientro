import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as admin from './admin.js';
import * as auth from './auth.js';
import { config, JOB_SEEKING_NOTICE_TEXT, LEGAL_VERSIONS } from './config.js';
import { openDb } from './db.js';
import { readFileFor, saveProfilePhoto } from './files.js';
import * as prefs from './preferences.js';
import { deleteAccount, exportData } from './privacy.js';
import * as profiles from './profiles.js';
import { HttpError } from './validate.js';

const SESSION_COOKIE = config.production ? '__Host-rientro_session' : 'rientro_session';
const JSON_LIMIT = 64 * 1024;

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' data:", "connect-src 'self'",
    "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  ...(config.production ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}),
};

// --- tiny helpers --------------------------------------------------------------------------

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(c => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

function sessionCookie(value, maxAgeSeconds) {
  return [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`,
    ...(config.production ? ['Secure'] : [])].join('; ');
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

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

// In-memory fixed-window limiter; swap for Redis when running more than one instance.
function rateLimiter(max, windowMs) {
  const hits = new Map();
  return key => {
    const t = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < t) { hits.set(key, { n: 1, reset: t + windowMs }); return; }
    if (++h.n > max) throw new HttpError(429, 'rate_limited', 'Troppi tentativi. Riprova tra qualche minuto.');
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (!path.extname(rel)) rel += '.html';
  const file = path.normalize(path.join(config.publicDir, rel));
  if (!file.startsWith(config.publicDir + path.sep) || !fs.existsSync(file)) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(file));
  return true;
}

// --- app -----------------------------------------------------------------------------------

export function createApp({ db = openDb(), sendLoginLink = defaultSendLoginLink, loginLimits = { ip: 10, email: 5 } } = {}) {
  const limitLoginIp = rateLimiter(loginLimits.ip, 15 * 60_000);
  const limitLoginEmail = rateLimiter(loginLimits.email, 15 * 60_000);

  const routes = [];
  const route = (method, pattern, handler, opts = {}) =>
    routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler, ...opts });

  // ---- auth
  route('POST', '/api/auth/request-link', async ({ req }) => {
    const body = await readJson(req);
    limitLoginIp(req.socket.remoteAddress);
    const { email, token } = auth.requestLogin(db, body);
    limitLoginEmail(email);
    const link = `${config.baseUrl}/auth/callback?token=${token}`;
    await sendLoginLink(email, link);
    // Same answer whether or not the account exists (no user enumeration).
    return { ok: true, ...(config.production ? {} : { dev_link: link }) };
  }, { public: true });

  route('GET', '/auth/callback', ({ req, res, url }) => {
    try {
      const { sessionToken } = auth.consumeLogin(db, url.searchParams.get('token'), req.headers['user-agent']);
      res.writeHead(302, { Location: '/onboarding', 'Set-Cookie': sessionCookie(sessionToken, config.sessionTtlDays * 86400), 'Cache-Control': 'no-store' });
    } catch {
      res.writeHead(302, { Location: '/?link=expired' });
    }
    res.end();
  }, { public: true, raw: true });

  route('POST', '/api/auth/logout', ({ res, cookies }) => {
    auth.logout(db, cookies[SESSION_COOKIE]);
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }, { raw: true });

  route('POST', '/api/auth/logout-all', ({ user, res }) => {
    auth.logoutEverywhere(db, user.id);
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }, { raw: true });

  // ---- legal (public, no personal data)
  route('GET', '/api/legal', () => ({
    versions: LEGAL_VERSIONS,
    job_seeking_notice: JOB_SEEKING_NOTICE_TEXT,
    processing_register: admin.processingRegister(db),
    review_status: 'draft_pending_legal_review',
  }), { public: true });

  // ---- me
  route('GET', '/api/me', ({ user }) => ({
    user: { id: user.id, email: user.email, role: user.role, status: user.status },
    legal: auth.legalStatus(db, user.id),
    profile: profiles.getOwnProfile(db, user.id),
    job_seeking: prefs.getJobPreferences(db, user.id),
    communication: prefs.getCommunicationPreferences(db, user.id),
    job_seeking_notice: { text: JOB_SEEKING_NOTICE_TEXT, version: LEGAL_VERSIONS.job_seeking_notice },
  }));

  route('POST', '/api/me/legal', async ({ user, req }) => auth.acknowledgeLegal(db, user.id, await readJson(req)));

  route('PATCH', '/api/me/profile', async ({ user, req }) => {
    auth.requireLegal(db, user.id);
    return profiles.updateProfile(db, user.id, await readJson(req));
  });

  route('PUT', '/api/me/job-seeking', async ({ user, req, url }) => {
    auth.requireLegal(db, user.id);
    const source = url.searchParams.get('source') === 'onboarding' ? 'onboarding' : 'settings';
    return prefs.setJobSeeking(db, user.id, await readJson(req), source);
  });

  route('PATCH', '/api/me/job-preferences', async ({ user, req }) => {
    auth.requireLegal(db, user.id);
    return prefs.updateJobDetails(db, user.id, await readJson(req));
  });

  route('PUT', '/api/me/communication', async ({ user, req, url }) => {
    const source = url.searchParams.get('source') === 'onboarding' ? 'onboarding' : 'settings';
    return prefs.setCommunicationPreference(db, user.id, await readJson(req), source);
  });

  route('GET', '/api/me/preference-history', ({ user }) => prefs.preferenceHistory(db, user.id));

  route('POST', '/api/me/photo', async ({ user, req }) => {
    auth.requireLegal(db, user.id);
    return saveProfilePhoto(db, user.id, await readBody(req, config.maxPhotoBytes + 1));
  });

  route('POST', '/api/me/submit', ({ user }) => {
    auth.requireLegal(db, user.id);
    profiles.submitForReview(db, user.id);
    return { ok: true };
  });

  route('GET', '/api/me/export', ({ user, res }) => {
    const data = exportData(db, user);
    send(res, 200, data, { 'Content-Disposition': 'attachment; filename="rientro-i-miei-dati.json"' });
  }, { raw: true });

  route('DELETE', '/api/me', async ({ user, req, res }) => {
    const out = deleteAccount(db, user, await readJson(req));
    send(res, 200, out, { 'Set-Cookie': sessionCookie('', 0) });
  }, { raw: true });

  // ---- members
  route('GET', '/api/profiles', ({ user }) => profiles.listProfiles(db, user));
  route('GET', '/api/profiles/:id', ({ user, params }) => profiles.publicProfile(db, user, params.id));
  route('POST', '/api/connections/:id', ({ user, params }) => { profiles.requestConnection(db, user, params.id); return { ok: true }; });
  route('POST', '/api/connections/:id/accept', ({ user, params }) => { profiles.respondConnection(db, user, params.id, true); return { ok: true }; });
  route('POST', '/api/connections/:id/decline', ({ user, params }) => { profiles.respondConnection(db, user, params.id, false); return { ok: true }; });

  route('GET', '/api/files/:id', ({ user, params, res }) => {
    const f = readFileFor(db, user, params.id);
    res.writeHead(200, { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline' });
    res.end(f.body);
  }, { raw: true });

  // ---- admin (role checked server-side on every request)
  route('GET', '/api/admin/users', ({ user, url }) => admin.listUsers(db, user, url.searchParams), { admin: true });
  route('GET', '/api/admin/users/:id', ({ user, params }) => admin.getUser(db, user, params.id), { admin: true });
  route('POST', '/api/admin/users/:id/status', async ({ user, params, req }) =>
    admin.setUserStatus(db, user, params.id, await readJson(req)), { admin: true });
  route('GET', '/api/admin/audit', ({ user }) => admin.auditLog(db, user), { admin: true });

  const PAGES_REQUIRING_LOGIN = ['/onboarding', '/settings', '/admin'];

  async function handle(req, res) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const url = new URL(req.url, config.baseUrl);
    const cookies = parseCookies(req.headers.cookie);
    try {
      const isApi = url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/');
      if (!isApi) {
        if (req.method !== 'GET') throw new HttpError(405, 'method_not_allowed');
        if (PAGES_REQUIRING_LOGIN.includes(url.pathname) && !auth.userForSession(db, cookies[SESSION_COOKIE])) {
          res.writeHead(302, { Location: '/' }); res.end(); return;
        }
        if (!serveStatic(req, res, url.pathname)) throw new HttpError(404, 'not_found');
        return;
      }

      const r = routes.find(x => x.method === req.method && x.re.test(url.pathname));
      if (!r) throw new HttpError(404, 'not_found');

      // CSRF: state-changing API calls must carry a custom header, which a cross-site
      // form or simple request cannot set without a CORS preflight (which we never allow).
      if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'rientro') {
        throw new HttpError(403, 'csrf', 'Richiesta non valida.');
      }

      const user = r.public ? null : auth.userForSession(db, cookies[SESSION_COOKIE]);
      if (!r.public && !user) throw new HttpError(401, 'unauthenticated', 'Accedi per continuare.');
      if (user && ['suspended'].includes(user.status) && !url.pathname.startsWith('/api/me')) {
        throw new HttpError(403, 'suspended');
      }
      if (r.admin && user.role !== 'admin') throw new HttpError(403, 'forbidden');

      const ctx = { req, res, url, cookies, user, params: url.pathname.match(r.re).groups || {} };
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

async function defaultSendLoginLink(email, link) {
  if (config.production) {
    // TODO: wire a transactional email provider (DPA in place, EU region) before launch.
    throw new Error('No email provider configured');
  }
  console.log(`\n[dev] Link di accesso per ${email}:\n  ${link}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server } = createApp();
  server.listen(config.port, () => console.log(`Rientro in ascolto su ${config.baseUrl}`));
}

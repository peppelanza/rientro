import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT || 3000),
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''), // no trailing slash: links add their own
  production: process.env.NODE_ENV === 'production',
  dbPath: process.env.DB_PATH || path.join(root, 'data', 'rientro.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(root, 'data', 'uploads'),
  publicDir: path.join(root, 'public'),
  // Used to pseudonymise subject references in the ledgers. Must be set in production.
  pseudonymSecret: process.env.PSEUDONYM_SECRET || 'dev-only-pseudonym-secret',
  // Sign In with LinkedIn (OpenID Connect). Both set = the LinkedIn button works; the app's redirect
  // URL registered on LinkedIn must be <BASE_URL>/api/auth/linkedin/callback.
  linkedinClientId: process.env.LINKEDIN_CLIENT_ID || '',
  linkedinClientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
  // Cloudflare Turnstile (bot check on sign-in): both set = on. See turnstile.js.
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY || '',
  // Cloudflare Web Analytics (visits, no cookies) and reading them in the admin. See web-analytics.js.
  cfAnalyticsToken: process.env.CF_ANALYTICS_TOKEN || '',
  cfAnalyticsSiteTag: process.env.CF_ANALYTICS_SITE_TAG || '',
  cfAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
  cfApiToken: process.env.CLOUDFLARE_API_TOKEN || '',
  // Comma-separated emails that get the admin role when they first sign in.
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  // The admin panel lives only on its own host (e.g. admin.rientro.it): anyone who isn't a signed-in
  // admin gets a plain 404 there, and /admin on the main site is a 404 too. Empty = /admin on the
  // same host (development, tests). In production it defaults to admin.<domain of BASE_URL>.
  adminHost: (process.env.ADMIN_HOST ?? (process.env.NODE_ENV === 'production'
    ? `admin.${new URL(process.env.BASE_URL || 'http://localhost').hostname.replace(/^www\./, '')}` : '')).toLowerCase(),
  sessionTtlDays: 30,
  loginCodeTtlMinutes: 10,
  loginCodeMaxAttempts: 5,
  maxPhotoBytes: 5 * 1024 * 1024,
  maxVideoBytes: 200 * 1024 * 1024,
  // Discovery and connections open on launch day (design 01 pre-lancio). LAUNCHED=1 opens them early (dev).
  launchAt: process.env.LAUNCH_AT || '2027-01-01T00:00:00+01:00',
  forceLaunched: process.env.LAUNCHED === '1',
  // Territory pages hide any count below this, so small groups can't be singled out.
  publicStatsMinCount: 5,
  connectionRequestTtlDays: 30,
  moderationSlaHours: 24,
  // How long preference/consent proof is kept after account deletion (privacy policy §9).
  ledgerRetentionMonthsAfterDeletion: 36,
  // Retention (privacy policy §9), applied daily by src/retention.js.
  retention: {
    deletionGraceDays: 30,    // a member's own deletion request: recoverable by signing in for this long
    closedReportsMonths: 24,  // resolved/dismissed reports
    adminLogMonths: 24,       // admin access log
    exportLogMonths: 24,      // record of data-export requests, anonymous leaving feedback
  },
  exportCooldownHours: 24,
  // Behind a hosting proxy (Render): read the visitor's IP from X-Forwarded-For for rate limits.
  trustProxy: process.env.TRUST_PROXY === '1',
  // Preview mode: a shared password in front of the whole site. While set, and only if no email
  // provider is configured, the sign-in code is also shown on the page (safe: only testers get in).
  previewPassword: process.env.PREVIEW_PASSWORD || '',
  // Transactional email for sign-in codes (Brevo, EU). Sender must be a verified address.
  brevoApiKey: process.env.BREVO_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || '',
};

// Versions of user-facing texts. Bump when the text changes; the version is stamped
// on every preference_events row so we can prove what the user saw.
// With a separate admin host the session cookie is shared by the whole domain (rientro.it), so the
// admin signs in once on www and is signed in on admin.rientro.it too.
export const cookieDomain = () => (config.adminHost ? config.adminHost.split('.').slice(1).join('.') : '');
export const adminUrl = () => (config.adminHost ? `${new URL(config.baseUrl).protocol}//${config.adminHost}/admin` : '/admin');

export const LEGAL_VERSIONS = {
  privacy: '2026-10-01',
  terms: '2026-09-30',
  cookies: '2026-10-01',
  // The inline explanation shown under "Sto anche cercando lavoro in Italia per un'azienda italiana".
  job_seeking_notice: 'job-notice-v1',
};

export const JOB_SEEKING_NOTICE_TEXT =
  'Sul tuo profilo comparirà “Sta anche cercando lavoro in Italia”. ' +
  'Questa scelta indica che sei interessato a opportunità da aziende italiane. ' +
  'Puoi toglierla quando vuoi da Impostazioni → Privacy.';

export const isLaunched = () => config.forceLaunched || Date.now() >= Date.parse(config.launchAt);

if (config.production && config.pseudonymSecret === 'dev-only-pseudonym-secret') {
  throw new Error('PSEUDONYM_SECRET must be set in production');
}

// Production needs a way to deliver sign-in codes: an email provider, or the preview password.
if (config.production && !config.brevoApiKey && !config.previewPassword) {
  throw new Error('Set BREVO_API_KEY (with MAIL_FROM) or PREVIEW_PASSWORD in production');
}
if (config.brevoApiKey && !config.mailFrom) throw new Error('MAIL_FROM must be set when BREVO_API_KEY is set');

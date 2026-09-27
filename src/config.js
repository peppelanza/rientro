import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  production: process.env.NODE_ENV === 'production',
  dbPath: process.env.DB_PATH || path.join(root, 'data', 'rientro.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(root, 'data', 'uploads'),
  publicDir: path.join(root, 'public'),
  // Used to pseudonymise subject references in the ledgers. Must be set in production.
  pseudonymSecret: process.env.PSEUDONYM_SECRET || 'dev-only-pseudonym-secret',
  // Comma-separated emails that get the admin role when they first sign in.
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
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
  // How long preference/consent proof is kept after account deletion. PLACEHOLDER: confirm with counsel.
  ledgerRetentionMonthsAfterDeletion: 36,
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
export const LEGAL_VERSIONS = {
  privacy: '2026-09-draft-1',
  terms: '2026-09-draft-1',
  cookies: '2026-09-draft-1',
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

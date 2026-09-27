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
  loginTokenTtlMinutes: 15,
  maxPhotoBytes: 5 * 1024 * 1024,
  // How long preference/consent proof is kept after account deletion. PLACEHOLDER: confirm with counsel.
  ledgerRetentionMonthsAfterDeletion: 36,
  exportCooldownHours: 24,
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

if (config.production && config.pseudonymSecret === 'dev-only-pseudonym-secret') {
  throw new Error('PSEUDONYM_SECRET must be set in production');
}

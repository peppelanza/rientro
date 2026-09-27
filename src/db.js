import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config, LEGAL_VERSIONS } from './config.js';
import { PROCESSING_REGISTER } from './processing-register.js';

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');

const SCHEMA_VERSION = 2;

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();
export const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

// Stable pseudonym for a user, used in ledgers that must outlive the account.
export const subjectRef = userId =>
  crypto.createHmac('sha256', config.pseudonymSecret).update(`subject:${userId}`).digest('hex');

export function openDb(file = config.dbPath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  const hasTables = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'users'").get().n > 0;
  if (hasTables && version < SCHEMA_VERSION) {
    throw new Error(`Database ${file} uses schema v${version}; this build needs v${SCHEMA_VERSION}. ` +
      'For a dev database, delete the data/ folder and restart.');
  }
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  seed(db);
  return db;
}

function seed(db) {
  const insertDoc = db.prepare(
    `INSERT OR IGNORE INTO legal_documents (doc, version, published_at, review_status)
     VALUES (?, ?, ?, 'draft_pending_legal_review')`,
  );
  for (const [doc, version] of Object.entries(LEGAL_VERSIONS)) insertDoc.run(doc, version, now());

  const upsert = db.prepare(
    `INSERT INTO processing_register (purpose, description, data_categories, proposed_basis, retention, recipients)
     VALUES ($purpose, $description, $data_categories, $proposed_basis, $retention, $recipients)
     ON CONFLICT(purpose) DO UPDATE SET description = excluded.description,
       data_categories = excluded.data_categories, proposed_basis = excluded.proposed_basis,
       retention = excluded.retention, recipients = excluded.recipients`,
  );
  for (const row of PROCESSING_REGISTER) upsert.run(prefix(row));
}

// node:sqlite named parameters need their sigil in the object keys.
export const prefix = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [`$${k}`, v]));

export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

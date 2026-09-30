import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config, LEGAL_VERSIONS } from './config.js';
import { PROCESSING_REGISTER } from './processing-register.js';
import { OLD_IDEA_STAGES } from './catalog.js';

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
  addProfileColumns(db);
  migrateUserColumns(db);
  migrateIdeaStages(db);
  migrateChecks(db);
  // Before the birth year there was a band to pick; the only such profile (the founder's) gets 1990
  db.exec('UPDATE profiles SET birth_year = 1990 WHERE birth_year IS NULL AND age_band IS NOT NULL');
  seed(db);
  return db;
}

// users: the deletion-request columns, and the inactivity-warning column of a retention rule that
// was dropped before launch
function migrateUserColumns(db) {
  const have = new Set(db.prepare('PRAGMA table_info(users)').all().map(c => c.name));
  if (!have.has('deletion_requested_at')) db.exec('ALTER TABLE users ADD COLUMN deletion_requested_at TEXT');
  if (!have.has('deletion_reason')) db.exec('ALTER TABLE users ADD COLUMN deletion_reason TEXT');
  if (have.has('inactivity_notice_at')) db.exec('ALTER TABLE users DROP COLUMN inactivity_notice_at');
}

// Columns added after launch: CREATE TABLE IF NOT EXISTS won't add them to an existing database
const NEW_PROFILE_COLUMNS = {
  arrived_from_country: 'TEXT', arrived_from_city: 'TEXT', arrived_after: 'TEXT', arrived_before: 'TEXT',
  always_in_italy: 'INTEGER NOT NULL DEFAULT 0', birth_year: 'INTEGER', suggested_photo_url: 'TEXT',
};
export function addProfileColumns(db) {
  const have = new Set(db.prepare('PRAGMA table_info(profiles)').all().map(c => c.name));
  for (const [name, type] of Object.entries(NEW_PROFILE_COLUMNS)) {
    if (!have.has(name)) db.exec(`ALTER TABLE profiles ADD COLUMN ${name} ${type}`);
  }
  // First version of the arrival step: a half year ('2025-H2') and "in Italia da più di 2 anni"
  if (have.has('arrived_period')) {
    db.exec(`UPDATE profiles SET
      arrived_after = substr(arrived_period, 1, 4) || CASE substr(arrived_period, 7, 1) WHEN '1' THEN '-01' ELSE '-07' END,
      arrived_before = substr(arrived_period, 1, 4) || CASE substr(arrived_period, 7, 1) WHEN '1' THEN '-06' ELSE '-12' END
      WHERE arrived_period GLOB '[0-9][0-9][0-9][0-9]-H[12]'`);
    db.exec('ALTER TABLE profiles DROP COLUMN arrived_period');
  }
  if (have.has('in_italy_long_time')) {
    db.exec(`UPDATE profiles SET arrived_after = NULL, arrived_before = strftime('%Y-%m', 'now', '-24 months') WHERE in_italy_long_time = 1`);
    db.exec('ALTER TABLE profiles DROP COLUMN in_italy_long_time');
  }
}

// Idea stages went from five to three; move stored and pending values over (idempotent)
export function migrateIdeaStages(db) {
  for (const [from, to] of Object.entries(OLD_IDEA_STAGES)) {
    db.prepare('UPDATE profiles SET idea_stage = ? WHERE idea_stage = ?').run(to, from);
    db.prepare(`UPDATE profiles SET pending_changes = json_set(pending_changes, '$.idea_stage', ?)
      WHERE json_valid(pending_changes) AND json_extract(pending_changes, '$.idea_stage') = ?`).run(to, from);
  }
}

// CHECK lists widened after launch: the third intent ("networking") and the 18–24 age band. A CHECK
// constraint can't be altered, but widening its list doesn't change how rows are stored, so the
// table definition is edited in place (sqlite.org/lang_altertable.html, "other kinds of table schema changes").
const WIDENED_CHECKS = [
  ["primary_intent IN ('has_idea', 'seeking_idea')", "primary_intent IN ('has_idea', 'seeking_idea', 'networking')"],
  ["age_band IN ('25-29',", "age_band IN ('18-24', '25-29',"],
];
function migrateChecks(db) {
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'profiles'").get();
  const next = WIDENED_CHECKS.reduce((acc, [from, to]) => acc.replace(from, to), sql);
  if (next === sql) return;
  const v = db.prepare('PRAGMA schema_version').get().schema_version;
  db.exec('PRAGMA writable_schema = ON');
  try {
    db.prepare("UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND name = 'profiles'").run(next);
    db.exec(`PRAGMA schema_version = ${v + 1}`);
  } finally { db.exec('PRAGMA writable_schema = OFF'); }
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('profiles: CHECK migration failed');
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
  // Purposes renamed or merged since: drop them so the register matches the code
  const keep = PROCESSING_REGISTER.map(r => r.purpose);
  db.prepare(`DELETE FROM processing_register WHERE purpose NOT IN (${keep.map(() => '?').join(',')})`).run(...keep);
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

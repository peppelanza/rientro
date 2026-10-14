import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config, LEGAL_VERSIONS } from './config.js';
import { PROCESSING_REGISTER } from './processing-register.js';
import { arrivedWhen } from './profiles.js';
import { OLD_AREAS, OLD_IDEA_STAGES, OLD_SECTORS } from './catalog.js';

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
  migrateAreas(db);
  migrateSectors(db);
  roleToExperience(db);
  freezeArrivals(db);
  // "Mostra il video solo alle connessioni" is gone: the video is for every member
  db.exec('UPDATE profiles SET video_connections_only = 0 WHERE video_connections_only = 1');
  // "In Italia" is no longer offered: indifferent
  db.exec("UPDATE profiles SET seeking_location = 'any' WHERE seeking_location = 'italy'");
  migrateChecks(db);
  migrateNoReview(db);
  desiredFollowsHome(db);
  migrateNoRequestExpiry(db);
  settleDuplicateConnections(db);
  collapseMessageNotifications(db);
  // Before the birth year there was a band to pick; the only such profile (the founder's) gets 1990
  db.exec('UPDATE profiles SET birth_year = 1990 WHERE birth_year IS NULL AND age_band IS NOT NULL');
  seed(db);
  return db;
}

// users: the deletion-request columns, the onboarding reminder (onboarding-reminder.js), and the inactivity-warning column of a retention rule that
// was dropped before launch
function migrateUserColumns(db) {
  const have = new Set(db.prepare('PRAGMA table_info(users)').all().map(c => c.name));
  if (!have.has('deletion_requested_at')) db.exec('ALTER TABLE users ADD COLUMN deletion_requested_at TEXT');
  if (!have.has('deletion_reason')) db.exec('ALTER TABLE users ADD COLUMN deletion_reason TEXT');
  if (have.has('inactivity_notice_at')) db.exec('ALTER TABLE users DROP COLUMN inactivity_notice_at');
  if (!have.has('onboarding_reminded_at')) db.exec('ALTER TABLE users ADD COLUMN onboarding_reminded_at TEXT');
  // Invite links (invites.js): each member's own code, and who invited whom
  if (!have.has('invite_code')) db.exec('ALTER TABLE users ADD COLUMN invite_code TEXT; CREATE UNIQUE INDEX IF NOT EXISTS users_invite_code ON users(invite_code);');
  if (!have.has('invited_by')) db.exec('ALTER TABLE users ADD COLUMN invited_by TEXT REFERENCES users(id) ON DELETE SET NULL');
  // Posts and comments in the groups can be edited by their author: when, shown as "modificato"
  for (const t of ['group_posts', 'group_comments']) {
    if (!db.prepare(`PRAGMA table_info(${t})`).all().some(c => c.name === 'edited_at')) db.exec(`ALTER TABLE ${t} ADD COLUMN edited_at TEXT`);
  }
  const connCols = new Set(db.prepare('PRAGMA table_info(connections)').all().map(c => c.name));
  if (!connCols.has('via_invite')) db.exec('ALTER TABLE connections ADD COLUMN via_invite INTEGER NOT NULL DEFAULT 0');
  const notifCols = new Set(db.prepare('PRAGMA table_info(notifications)').all().map(c => c.name));
  // Email digests (email-digest.js): what is already there was seen in the app before emails existed
  if (!notifCols.has('emailed_at')) db.exec("ALTER TABLE notifications ADD COLUMN emailed_at TEXT; UPDATE notifications SET emailed_at = created_at;");
  const sessionCols = new Set(db.prepare('PRAGMA table_info(sessions)').all().map(c => c.name));
  const reportCols = new Set(db.prepare('PRAGMA table_info(reports)').all().map(c => c.name));
  if (!reportCols.has('group_post_id')) db.exec('ALTER TABLE reports ADD COLUMN group_post_id INTEGER');
  if (!sessionCols.has('impersonator_id')) db.exec('ALTER TABLE sessions ADD COLUMN impersonator_id TEXT REFERENCES users(id) ON DELETE CASCADE');
  const commCols = new Set(db.prepare('PRAGMA table_info(communication_preferences)').all().map(c => c.name));
  if (!commCols.has('notify_groups_email')) db.exec('ALTER TABLE communication_preferences ADD COLUMN notify_groups_email INTEGER NOT NULL DEFAULT 1');
  const messageCols = new Set(db.prepare('PRAGMA table_info(messages)').all().map(c => c.name));
  if (!messageCols.has('reply_to_id')) db.exec('ALTER TABLE messages ADD COLUMN reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL');
}

// Consecutive message notifications from the same person become one, the most recent (see notify)
function collapseMessageNotifications(db) {
  const rows = db.prepare('SELECT id, user_id, kind, actor_id FROM notifications ORDER BY user_id, id DESC').all();
  const drop = db.prepare('DELETE FROM notifications WHERE id = ?');
  let prev = null;
  for (const n of rows) {
    if (prev && n.user_id === prev.user_id && n.kind === 'message' && prev.kind === 'message' && n.actor_id === prev.actor_id) drop.run(n.id);
    else prev = n;
  }
}

// Columns added after launch: CREATE TABLE IF NOT EXISTS won't add them to an existing database
const NEW_PROFILE_COLUMNS = {
  arrived_from_country: 'TEXT', arrived_from_city: 'TEXT', arrived_after: 'TEXT', arrived_before: 'TEXT',
  move_when: 'TEXT', arrived_choice: 'TEXT',
  birth_year: 'INTEGER', suggested_photo_url: 'TEXT', photo_check: 'TEXT',
  invite_connect: 'INTEGER', invite_note: 'TEXT', // onboarding: ask the inviter to connect (invites.js)
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
  // "Quanto tempo vuoi dedicare" and "Quando potresti iniziare" are gone
  for (const c of ['time_commitment', 'start_when']) if (have.has(c)) db.exec(`ALTER TABLE profiles DROP COLUMN ${c}`);
  // "Ho sempre vissuto in Italia" is gone: whoever lives in Italy came back from somewhere
  if (have.has('always_in_italy')) db.exec('ALTER TABLE profiles DROP COLUMN always_in_italy');
  if (have.has('in_italy_long_time')) {
    db.exec(`UPDATE profiles SET arrived_after = NULL, arrived_before = strftime('%Y-%m', 'now', '-24 months') WHERE in_italy_long_time = 1`);
    db.exec('ALTER TABLE profiles DROP COLUMN in_italy_long_time');
  }
}

// Who is already back in Italy isn't asked where they'd like to live: it's the city they live in
// (profiles.js isBack; updateProfile keeps it so). Brings earlier answers in line (idempotent)
export function desiredFollowsHome(db) {
  db.exec(`UPDATE profiles SET desired_comuni = json_array(lives_in_city), desired_unknown = 0
    WHERE lives_in = 'italy' AND lives_in_city IS NOT NULL AND desired_comuni IS NOT json_array(lives_in_city)`);
}

// Idea stages went from five to three; move stored and pending values over (idempotent)
export function migrateIdeaStages(db) {
  for (const [from, to] of Object.entries(OLD_IDEA_STAGES)) {
    db.prepare('UPDATE profiles SET idea_stage = ? WHERE idea_stage = ?').run(to, from);
    db.prepare(`UPDATE profiles SET pending_changes = json_set(pending_changes, '$.idea_stage', ?)
      WHERE json_valid(pending_changes) AND json_extract(pending_changes, '$.idea_stage') = ?`).run(to, from);
  }
}

// Background areas went from eight to eleven (plus "Altro"): old names become the new ones, also in
// "Chi stai cercando" (idempotent)
export function migrateAreas(db) {
  const old = Object.keys(OLD_AREAS);
  const rows = db.prepare(`SELECT user_id, background_area, seeking_backgrounds FROM profiles WHERE ${old.map(() => 'background_area = ? OR seeking_backgrounds LIKE ?').join(' OR ')}`)
    .all(...old.flatMap(a => [a, `%"${a}"%`]));
  const save = db.prepare('UPDATE profiles SET background_area = ?, seeking_backgrounds = ? WHERE user_id = ?');
  for (const r of rows) {
    const seeking = [...new Set(JSON.parse(r.seeking_backgrounds || '[]').map(a => OLD_AREAS[a] ?? a))];
    save.run(OLD_AREAS[r.background_area] ?? r.background_area, JSON.stringify(seeking), r.user_id);
  }
}

// "Quando è stato il rientro" no longer ages by itself: answers given before keep what they read now
export function freezeArrivals(db) {
  const rows = db.prepare('SELECT user_id, arrived_after, arrived_before FROM profiles WHERE arrived_choice IS NULL AND arrived_before IS NOT NULL').all();
  const save = db.prepare('UPDATE profiles SET arrived_choice = ? WHERE user_id = ?');
  for (const r of rows) save.run(arrivedWhen({ ...r, arrived_choice: null }), r.user_id);
}

// Ruolo attuale and Azienda were typed in Intestazione; now the current job comes from Esperienze
// ("Lavoro ancora qui"). A role typed before with no current job becomes one (idempotent)
export function roleToExperience(db) {
  const rows = db.prepare(`SELECT user_id, current_role, current_company FROM profiles p
    WHERE (current_role IS NOT NULL OR current_company IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM experiences e WHERE e.user_id = p.user_id AND e.current = 1)`).all();
  for (const r of rows) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM experiences WHERE user_id = ?').get(r.user_id).n;
    db.prepare('INSERT INTO experiences (id, user_id, company, role, current, position) VALUES (?, ?, ?, ?, 1, ?)')
      .run(newId(), r.user_id, r.current_company || '', r.current_role || null, n);
  }
}

// Sectors went from sixteen to twenty: old names become the new ones (idempotent)
export function migrateSectors(db) {
  const old = Object.keys(OLD_SECTORS);
  const rows = db.prepare(`SELECT user_id, sectors FROM profiles WHERE ${old.map(() => 'sectors LIKE ?').join(' OR ')}`).all(...old.map(a => `%"${a}"%`));
  const save = db.prepare('UPDATE profiles SET sectors = ? WHERE user_id = ?');
  for (const r of rows) save.run(JSON.stringify([...new Set(JSON.parse(r.sectors || '[]').map(a => OLD_SECTORS[a] ?? a))]), r.user_id);
}

// CHECK lists widened after launch: the third intent ("networking") and the 18–24 age band. A CHECK
// constraint can't be altered, but widening its list doesn't change how rows are stored, so the
// table definition is edited in place (sqlite.org/lang_altertable.html, "other kinds of table schema changes").
const WIDENED_CHECKS = [
  ["primary_intent IN ('has_idea', 'seeking_idea')", "primary_intent IN ('has_idea', 'seeking_idea', 'networking')"],
  ["age_band IN ('25-29',", "age_band IN ('18-24', '25-29',"],
];
// review_events: the admin can also hide and show a profile
const WIDENED_REVIEW_CHECKS = [["'suspend', 'unsuspend')", "'suspend', 'unsuspend', 'hide', 'show')"]];
// files: pictures in group posts
const WIDENED_FILE_CHECKS = [["'profile_photo', 'profile_video')", "'profile_photo', 'profile_video', 'group_image')"], ["'profile_photo', 'profile_video', 'group_image')", "'profile_photo', 'profile_video', 'group_image', 'support_image')"]];
function migrateChecks(db) {
  widenChecks(db, 'profiles', WIDENED_CHECKS);
  widenChecks(db, 'files', WIDENED_FILE_CHECKS);
  widenChecks(db, 'review_events', WIDENED_REVIEW_CHECKS);
}
function widenChecks(db, table, pairs) {
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  const next = pairs.reduce((acc, [from, to]) => (acc.includes(to) ? acc : acc.replace(from, to)), sql);
  if (next === sql) return;
  const v = db.prepare('PRAGMA schema_version').get().schema_version;
  db.exec('PRAGMA writable_schema = ON');
  try {
    db.prepare("UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND name = ?").run(next, table);
    db.exec(`PRAGMA schema_version = ${v + 1}`);
  } finally { db.exec('PRAGMA writable_schema = OFF'); }
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error(`${table}: CHECK migration failed`);
}

// Profiles used to wait for a review before going online. Without it: whoever had sent theirs is
// online, edits waiting for approval are applied, and a rejected profile stays locked (suspended,
// the admin can give it back). Runs once (nothing left to change afterwards).
function migrateNoReview(db) {
  db.exec("UPDATE profiles SET approved_at = COALESCE(approved_at, submitted_at, updated_at) WHERE user_id IN (SELECT id FROM users WHERE status IN ('in_review', 'changes_requested'))");
  db.exec("UPDATE users SET status = 'approved' WHERE status IN ('in_review', 'changes_requested')");
  db.exec("UPDATE users SET status = 'suspended' WHERE status = 'rejected'");
  db.exec("DELETE FROM notifications WHERE kind IN ('profile_approved', 'profile_changes_requested', 'profile_rejected')");
  const columns = new Set(db.prepare('PRAGMA table_info(profiles)').all().map(c => c.name));
  for (const r of db.prepare("SELECT user_id, pending_changes FROM profiles WHERE pending_changes != '{}'").all()) {
    let pending = {};
    try { pending = JSON.parse(r.pending_changes); } catch {}
    const entries = Object.entries(pending).filter(([k]) => columns.has(k) && k !== 'user_id');
    const old = db.prepare('SELECT photo_file_id FROM profiles WHERE user_id = ?').get(r.user_id).photo_file_id;
    if (entries.length) db.prepare(`UPDATE profiles SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE user_id = ?`).run(...entries.map(([, v]) => v), r.user_id);
    db.prepare("UPDATE profiles SET pending_changes = '{}' WHERE user_id = ?").run(r.user_id);
    // A replaced photo is no longer used: its file record goes
    if (pending.photo_file_id && old && old !== pending.photo_file_id) db.prepare('DELETE FROM files WHERE id = ?').run(old);
  }
}

// Connection requests used to expire after 30 days. They no longer do: an expired request is pending
// again, unless the two people have a newer request (then it goes). Afterwards the status is dropped
// from the CHECK list, edited in place as in migrateChecks (no row uses it any more).
function migrateNoRequestExpiry(db) {
  db.exec(`DELETE FROM connections WHERE status = 'expired' AND EXISTS (SELECT 1 FROM connections n
    WHERE n.id != connections.id AND n.status IN ('pending', 'accepted') AND n.created_at > connections.created_at
      AND ((n.requester_id = connections.requester_id AND n.addressee_id = connections.addressee_id)
        OR (n.requester_id = connections.addressee_id AND n.addressee_id = connections.requester_id)))`);
  db.exec("UPDATE connections SET status = 'pending', responded_at = NULL WHERE status = 'expired'");
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'connections'").get();
  const next = sql.replace("'withdrawn', 'expired')", "'withdrawn')");
  if (next === sql) return;
  const v = db.prepare('PRAGMA schema_version').get().schema_version;
  db.exec('PRAGMA writable_schema = ON');
  try {
    db.prepare("UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND name = 'connections'").run(next);
    db.exec(`PRAGMA schema_version = ${v + 1}`);
  } finally { db.exec('PRAGMA writable_schema = OFF'); }
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('connections: CHECK migration failed');
}

// One open link per pair of people. Where they're connected, other open requests between them are
// closed; where both had asked each other, the older request is accepted and the newer one closed.
// Idempotent: nothing to do once it's clean.
export function settleDuplicateConnections(db) {
  const pair = `((o.requester_id = c.requester_id AND o.addressee_id = c.addressee_id) OR (o.requester_id = c.addressee_id AND o.addressee_id = c.requester_id))`;
  db.exec(`UPDATE connections AS c SET status = 'withdrawn', responded_at = COALESCE(responded_at, created_at)
    WHERE c.status = 'pending' AND EXISTS (SELECT 1 FROM connections o WHERE o.id != c.id AND o.status = 'accepted' AND ${pair})`);
  db.exec(`UPDATE connections AS c SET status = 'accepted', responded_at = (SELECT MAX(o.created_at) FROM connections o WHERE o.id != c.id AND o.status = 'pending' AND ${pair})
    WHERE c.status = 'pending' AND EXISTS (SELECT 1 FROM connections o WHERE o.id != c.id AND o.status = 'pending' AND o.requester_id = c.addressee_id AND o.addressee_id = c.requester_id AND o.created_at > c.created_at)`);
  db.exec(`UPDATE connections AS c SET status = 'withdrawn', responded_at = COALESCE(responded_at, created_at)
    WHERE c.status = 'pending' AND EXISTS (SELECT 1 FROM connections o WHERE o.id != c.id AND o.status = 'accepted' AND ${pair})`);
  // Two open requests the same way round: keep the newest
  db.exec(`UPDATE connections AS c SET status = 'withdrawn', responded_at = COALESCE(responded_at, created_at)
    WHERE c.status = 'pending' AND EXISTS (SELECT 1 FROM connections o WHERE o.id != c.id AND o.status = 'pending'
      AND o.requester_id = c.requester_id AND o.addressee_id = c.addressee_id AND o.created_at > c.created_at)`);
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

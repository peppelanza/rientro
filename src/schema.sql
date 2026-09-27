-- Rientro MVP schema (SQLite).
-- Conventions: timestamps are ISO-8601 UTC strings; booleans are 0/1.
-- Tables marked APPEND-ONLY are protected by triggers below.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Identity & authentication
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  status        TEXT NOT NULL DEFAULT 'onboarding'
                CHECK (status IN ('onboarding', 'in_review', 'approved', 'paused', 'suspended')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- One-time login links (passwordless). Only the SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash    TEXT PRIMARY KEY,
  email         TEXT NOT NULL COLLATE NOCASE,
  expires_at    TEXT NOT NULL,
  used_at       TEXT
);

-- Server-side sessions. Only the SHA-256 of the cookie value is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  user_agent    TEXT
);

-- ---------------------------------------------------------------------------
-- Profile (member-facing). Public serialisation is allowlisted in profiles.js.
-- No date of birth is collected: the design asks for an age band only.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profiles (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name         TEXT,
  last_name          TEXT,
  age_band           TEXT CHECK (age_band IS NULL OR age_band IN ('25-29','30-34','35-39','40-44','45-50+')),
  lives_in_country   TEXT,
  lives_in_city      TEXT,
  desired_comuni     TEXT NOT NULL DEFAULT '[]',   -- JSON array of comune names
  -- Primary intent: exactly two values. Job-seeking is NOT an intent (see job_preferences).
  primary_intent     TEXT CHECK (primary_intent IS NULL OR primary_intent IN ('has_idea', 'seeking_idea')),
  background_area    TEXT,
  current_role       TEXT,
  years_experience   TEXT CHECK (years_experience IS NULL OR years_experience IN ('0-3','4-7','8-12','13+')),
  bio                TEXT,
  photo_file_id      TEXT REFERENCES files(id) ON DELETE SET NULL,
  -- Visible to all members
  linkedin_url       TEXT,
  website_url        TEXT,
  -- Visible only to accepted connections
  instagram_handle   TEXT,
  x_handle           TEXT,
  calendar_url       TEXT,
  updated_at         TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Job-seeking preference + structured opportunity data (future Rientro Talent).
-- looking_for_italian_job is the ONLY signal of interest in Italian employment.
-- It is set exclusively through PUT /api/me/job-seeking; nothing else writes it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS job_preferences (
  user_id                  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  looking_for_italian_job  INTEGER NOT NULL DEFAULT 0 CHECK (looking_for_italian_job IN (0, 1)),
  selected_at              TEXT,          -- when it was last switched ON (null while off)
  deselected_at            TEXT,          -- when it was last switched OFF
  notice_version           TEXT,          -- version of the inline explanation shown next to the checkbox
  privacy_policy_version   TEXT,          -- privacy policy in force when last changed
  -- Structured details, only kept while the flag is on (cleared on deselect: data minimisation)
  roles                    TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  skills                   TEXT NOT NULL DEFAULT '[]',
  sectors                  TEXT NOT NULL DEFAULT '[]',
  preferred_locations      TEXT NOT NULL DEFAULT '[]',   -- JSON array of comune names
  work_arrangement         TEXT CHECK (work_arrangement IS NULL OR work_arrangement IN ('on_site','hybrid','remote','any')),
  employment_type          TEXT CHECK (employment_type IS NULL OR employment_type IN ('full_time','part_time','any')),
  availability             TEXT CHECK (availability IS NULL OR availability IN ('now','within_3_months','within_6_months','within_12_months','later')),
  updated_at               TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Preference / consent ledger. APPEND-ONLY.
-- One row per change of an optional choice: job_seeking, marketing_email. Current state lives on the owning table; this is the audit trail.
-- On account deletion, user_id is nulled and subject_ref (salted hash) remains until
-- purge_after, so proof of a past choice survives without keeping the identity.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS preference_events (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                 TEXT REFERENCES users(id) ON DELETE SET NULL,
  subject_ref             TEXT NOT NULL,
  preference              TEXT NOT NULL CHECK (preference IN ('job_seeking', 'marketing_email')),
  value                   INTEGER NOT NULL CHECK (value IN (0, 1)),
  source                  TEXT NOT NULL,           -- 'onboarding' | 'settings'
  notice_version          TEXT,                    -- copy shown to the user at the moment of the choice
  privacy_policy_version  TEXT NOT NULL,
  created_at              TEXT NOT NULL,
  purge_after             TEXT                     -- set when the subject deletes their account
);
CREATE INDEX IF NOT EXISTS preference_events_user ON preference_events(user_id, preference, created_at);

-- Separate marketing consent. Never bundled with job-seeking.
CREATE TABLE IF NOT EXISTS communication_preferences (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  marketing_email  INTEGER NOT NULL DEFAULT 0 CHECK (marketing_email IN (0, 1)),
  updated_at       TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Legal documents & acknowledgements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS legal_documents (
  doc            TEXT NOT NULL CHECK (doc IN ('privacy', 'terms', 'cookies', 'job_seeking_notice')),
  version        TEXT NOT NULL,
  published_at   TEXT NOT NULL,
  review_status  TEXT NOT NULL CHECK (review_status IN ('draft_pending_legal_review', 'approved')),
  PRIMARY KEY (doc, version)
);

-- Which version of Terms / Privacy notice a user was shown and accepted at signup.
CREATE TABLE IF NOT EXISTS legal_acknowledgements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc          TEXT NOT NULL,
  version      TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

-- Record of processing: purpose ↔ data ↔ proposed legal basis ↔ retention.
-- Seeded from src/processing-register.js; every row is pending professional review.
CREATE TABLE IF NOT EXISTS processing_register (
  purpose          TEXT PRIMARY KEY,
  description      TEXT NOT NULL,
  data_categories  TEXT NOT NULL,
  proposed_basis   TEXT NOT NULL,
  retention        TEXT NOT NULL,
  recipients       TEXT NOT NULL,
  review_status    TEXT NOT NULL DEFAULT 'pending_legal_review'
);

-- ---------------------------------------------------------------------------
-- Connections (gate for connections-only social links)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS connections (
  requester_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (requester_id, addressee_id)
);

-- ---------------------------------------------------------------------------
-- Files: stored outside the web root under random keys, served only via
-- an authorised endpoint. No original filenames are kept.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('profile_photo')),
  storage_key   TEXT NOT NULL UNIQUE,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  sha256        TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Data-subject requests
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS data_exports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Admin audit log. APPEND-ONLY. Every admin read or write of personal data lands here.
-- target_ref is a salted hash so the log survives account deletion without the identity.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id        TEXT NOT NULL,
  action          TEXT NOT NULL,
  target_user_id  TEXT,
  target_ref      TEXT,
  details         TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Append-only guards
-- ---------------------------------------------------------------------------

CREATE TRIGGER IF NOT EXISTS admin_audit_log_no_update
BEFORE UPDATE ON admin_audit_log
WHEN NOT (OLD.target_user_id IS NOT NULL AND NEW.target_user_id IS NULL
          AND NEW.admin_id = OLD.admin_id AND NEW.action = OLD.action
          AND NEW.details = OLD.details AND NEW.created_at = OLD.created_at)
BEGIN SELECT RAISE(ABORT, 'admin_audit_log is append-only'); END;

CREATE TRIGGER IF NOT EXISTS admin_audit_log_no_delete
BEFORE DELETE ON admin_audit_log
BEGIN SELECT RAISE(ABORT, 'admin_audit_log is append-only'); END;

-- preference_events may only be pseudonymised (user_id → NULL, purge_after set) or purged after expiry.
CREATE TRIGGER IF NOT EXISTS preference_events_no_update
BEFORE UPDATE ON preference_events
WHEN NOT (NEW.user_id IS NULL AND NEW.preference = OLD.preference AND NEW.value = OLD.value
          AND NEW.created_at = OLD.created_at AND NEW.subject_ref = OLD.subject_ref)
BEGIN SELECT RAISE(ABORT, 'preference_events is append-only'); END;

CREATE TRIGGER IF NOT EXISTS preference_events_no_early_delete
BEFORE DELETE ON preference_events
WHEN OLD.purge_after IS NULL OR OLD.purge_after > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN SELECT RAISE(ABORT, 'preference_events can only be purged after purge_after'); END;

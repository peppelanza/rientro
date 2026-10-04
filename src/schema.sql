-- Rientro schema (SQLite). Timestamps are ISO-8601 UTC strings; booleans are 0/1.
-- Tables marked APPEND-ONLY are protected by triggers at the bottom.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Identity & authentication
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  -- onboarding → approved (= online as soon as the profile is sent; no review); suspended by moderation.
  -- in_review, changes_requested and rejected are no longer used (db.js migrateNoReview).
  status        TEXT NOT NULL DEFAULT 'onboarding'
                CHECK (status IN ('onboarding', 'in_review', 'changes_requested', 'approved', 'rejected', 'suspended')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  last_seen_at  TEXT,
  -- Own deletion request: the account is hidden at once and erased 30 days later unless the
  -- member signs in again (privacy policy §9). The optional reason is kept until then.
  deletion_requested_at TEXT,
  deletion_reason       TEXT
);

-- 6-digit sign-in codes (design 5a/5b). Only a salted hash of the code is stored.
CREATE TABLE IF NOT EXISTS login_codes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  email            TEXT NOT NULL COLLATE NOCASE,
  code_hash        TEXT NOT NULL,
  expires_at       TEXT NOT NULL,
  attempts         INTEGER NOT NULL DEFAULT 0,
  used_at          TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (marketing_opt_in IN (0, 1)),
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_codes_email ON login_codes(email, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  last_used_at  TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  user_agent    TEXT,
  impersonator_id TEXT REFERENCES users(id) ON DELETE CASCADE  -- admin "accedi come"
);

-- ---------------------------------------------------------------------------
-- Profile (16-step onboarding). Public serialisation is allowlisted in profiles.js.
-- Birth year only (no full date of birth); others see just the age band derived from it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profiles (
  user_id                TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- 1 Luogo
  lives_in               TEXT CHECK (lives_in IS NULL OR lives_in IN ('italy', 'abroad')),
  lives_in_country       TEXT,
  lives_in_city          TEXT,
  -- 1b Arrivo (only for who already lives in Italy): where from and when, or "da più di 2 anni"
  arrived_from_country   TEXT,
  arrived_from_city      TEXT,
  arrived_after          TEXT,              -- month range of the return, 'YYYY-MM'; after is NULL for "more than 2 years ago"
  arrived_before         TEXT,
  always_in_italy        INTEGER NOT NULL DEFAULT 0,
  -- 2 Dove vorresti vivere
  desired_comuni         TEXT NOT NULL DEFAULT '[]',
  desired_unknown        INTEGER NOT NULL DEFAULT 0,
  -- 3 Obiettivo (job-seeking lives in job_preferences, never here)
  primary_intent         TEXT CHECK (primary_intent IS NULL OR primary_intent IN ('has_idea', 'seeking_idea', 'networking')),
  -- 4 Idea (or "what you'd like to build" for seeking_idea)
  idea_title             TEXT,
  idea_description       TEXT,
  idea_stage             TEXT CHECK (idea_stage IS NULL OR idea_stage IN ('idea', 'validation', 'prototype', 'first_customers', 'revenue')),
  -- 5 Presentati
  first_name             TEXT,
  last_name              TEXT,
  birth_year             INTEGER,
  -- Photo of the LinkedIn/Google account, offered as the first profile photo if it shows a face (then cleared)
  suggested_photo_url    TEXT,
  -- Automatic check of the profile photo that didn't pass (face.js): reviewed by the admin after sign-up
  photo_check            TEXT,
  age_band               TEXT CHECK (age_band IS NULL OR age_band IN ('18-24', '25-29', '30-34', '35-39', '40-44', '45-50+')),
  bio                    TEXT,
  photo_file_id          TEXT REFERENCES files(id) ON DELETE SET NULL,
  -- 6 Background
  background_area        TEXT,
  current_role           TEXT,
  current_company        TEXT,
  years_experience       TEXT CHECK (years_experience IS NULL OR years_experience IN ('0-3', '4-7', '8-12', '13+')),
  -- 9 Risultato, 10 Video
  achievement            TEXT,
  video_file_id          TEXT REFERENCES files(id) ON DELETE SET NULL,
  video_connections_only INTEGER NOT NULL DEFAULT 0,
  -- 11 Settori, 12 Chi cerchi, 13 Tempo
  sectors                TEXT NOT NULL DEFAULT '[]',
  seeking_backgrounds    TEXT NOT NULL DEFAULT '[]',
  seeking_description    TEXT,
  seeking_location       TEXT CHECK (seeking_location IS NULL OR seeking_location IN ('any', 'same_city', 'italy')),
  time_commitment        TEXT CHECK (time_commitment IS NULL OR time_commitment IN ('full_time', 'part_time', 'tbd')),
  start_when             TEXT CHECK (start_when IS NULL OR start_when IN ('now', '6_months', '1_year', 'later')),
  -- 14 Cosa ti manca, 15 Link, 16 Fonte
  misses_italy           TEXT,
  linkedin_url           TEXT,
  website_url            TEXT,
  instagram_handle       TEXT,   -- connections only
  x_handle               TEXT,   -- connections only
  calendar_url           TEXT,   -- connections only
  source                 TEXT,
  -- State
  visible                INTEGER NOT NULL DEFAULT 1,       -- 38a "Visibilità profilo"
  onboarding_step        TEXT,
  pending_changes        TEXT NOT NULL DEFAULT '{}',       -- no longer used (there's no review)
  review_note            TEXT,                             -- note sent with "modifiche richieste"
  submitted_at           TEXT,
  approved_at            TEXT,
  updated_at             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS education (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school    TEXT NOT NULL,
  degree    TEXT,
  years     TEXT,
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS experiences (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company      TEXT NOT NULL,
  role         TEXT,
  city         TEXT,
  start_month  TEXT,       -- YYYY-MM
  end_month    TEXT,
  current      INTEGER NOT NULL DEFAULT 0,
  position     INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Job-seeking preference + structured opportunity data (future Rientro Talent).
-- looking_for_italian_job is written only by preferences.setJobSeeking().
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS job_preferences (
  user_id                  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  looking_for_italian_job  INTEGER NOT NULL DEFAULT 0 CHECK (looking_for_italian_job IN (0, 1)),
  selected_at              TEXT,
  deselected_at            TEXT,
  notice_version           TEXT,
  privacy_policy_version   TEXT,
  roles                    TEXT NOT NULL DEFAULT '[]',
  skills                   TEXT NOT NULL DEFAULT '[]',
  sectors                  TEXT NOT NULL DEFAULT '[]',
  preferred_locations      TEXT NOT NULL DEFAULT '[]',
  work_arrangement         TEXT CHECK (work_arrangement IS NULL OR work_arrangement IN ('on_site','hybrid','remote','any')),
  employment_type          TEXT CHECK (employment_type IS NULL OR employment_type IN ('full_time','part_time','any')),
  availability             TEXT CHECK (availability IS NULL OR availability IN ('now','within_3_months','within_6_months','within_12_months','later')),
  updated_at               TEXT NOT NULL
);

-- APPEND-ONLY ledger of optional choices (job-seeking, marketing).
CREATE TABLE IF NOT EXISTS preference_events (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                 TEXT REFERENCES users(id) ON DELETE SET NULL,
  subject_ref             TEXT NOT NULL,
  preference              TEXT NOT NULL CHECK (preference IN ('job_seeking', 'marketing_email')),
  value                   INTEGER NOT NULL CHECK (value IN (0, 1)),
  source                  TEXT NOT NULL,           -- 'signup' | 'onboarding' | 'settings'
  notice_version          TEXT,
  privacy_policy_version  TEXT NOT NULL,
  created_at              TEXT NOT NULL,
  purge_after             TEXT
);
CREATE INDEX IF NOT EXISTS preference_events_user ON preference_events(user_id, preference, created_at);

-- Marketing consent (separate, optional) + notification settings (not consents).
CREATE TABLE IF NOT EXISTS communication_preferences (
  user_id                TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  marketing_email        INTEGER NOT NULL DEFAULT 0 CHECK (marketing_email IN (0, 1)),
  notify_requests_email  INTEGER NOT NULL DEFAULT 1,
  notify_requests_app    INTEGER NOT NULL DEFAULT 1,
  notify_messages_email  INTEGER NOT NULL DEFAULT 1,
  notify_messages_app    INTEGER NOT NULL DEFAULT 1,
  notify_status_email    INTEGER NOT NULL DEFAULT 1,
  notify_status_app      INTEGER NOT NULL DEFAULT 1,
  updated_at             TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Legal
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS legal_documents (
  doc            TEXT NOT NULL CHECK (doc IN ('privacy', 'terms', 'cookies', 'job_seeking_notice')),
  version        TEXT NOT NULL,
  published_at   TEXT NOT NULL,
  review_status  TEXT NOT NULL CHECK (review_status IN ('draft_pending_legal_review', 'approved')),
  PRIMARY KEY (doc, version)
);

CREATE TABLE IF NOT EXISTS legal_acknowledgements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc          TEXT NOT NULL,
  version      TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

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
-- Social: connections, messages, notifications, blocks, reports
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS connections (
  id            TEXT PRIMARY KEY,
  requester_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  note          TEXT,
  created_at    TEXT NOT NULL,
  responded_at  TEXT
);
CREATE INDEX IF NOT EXISTS connections_pair ON connections(requester_id, addressee_id);
CREATE INDEX IF NOT EXISTS connections_addressee ON connections(addressee_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  read_at       TEXT,
  reply_to_id   INTEGER REFERENCES messages(id) ON DELETE SET NULL -- a reply quotes this message (like WhatsApp)
);
CREATE INDEX IF NOT EXISTS messages_pair ON messages(sender_id, recipient_id, id);

-- Reactions to the other person's messages, one per person per message (like WhatsApp). A removed
-- reaction keeps its row with emoji NULL, so an open chat learns about it by polling (updated_at).
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       TEXT,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS message_reactions_updated ON message_reactions(updated_at);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  actor_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  data        TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL,
  read_at     TEXT,
  emailed_at  TEXT   -- when it went out in an email digest (email-digest.js), or was settled without one
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, id);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  reporter_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  reported_id  TEXT REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL CHECK (reason IN ('fake_profile', 'harassment', 'spam', 'other')),
  details      TEXT,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution   TEXT,
  created_at   TEXT NOT NULL,
  resolved_at  TEXT,
  resolved_by  TEXT,
  group_post_id INTEGER  -- a report from a group post's "···" menu: which post (groups.js)
);

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id    TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id    TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('approve', 'request_changes', 'reject', 'suspend', 'unsuspend', 'hide', 'show')),
  note        TEXT,
  created_at  TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Files
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('profile_photo', 'profile_video', 'group_image')),
  storage_key   TEXT NOT NULL UNIQUE,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  sha256        TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Anonymous answers to "Perché te ne vai?" (41b). No user link; month precision only.
CREATE TABLE IF NOT EXISTS deletion_feedback (
  reason      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_exports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL
);

-- APPEND-ONLY. Every admin read or write of personal data lands here.
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

-- Rows can be deleted only once they are past retention (24 months, privacy policy §9).
DROP TRIGGER IF EXISTS admin_audit_log_no_delete;
CREATE TRIGGER IF NOT EXISTS admin_audit_log_no_early_delete
BEFORE DELETE ON admin_audit_log
WHEN OLD.created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 months')
BEGIN SELECT RAISE(ABORT, 'admin_audit_log rows are kept for 24 months'); END;

CREATE TRIGGER IF NOT EXISTS preference_events_no_update
BEFORE UPDATE ON preference_events
WHEN NOT (NEW.user_id IS NULL AND NEW.preference = OLD.preference AND NEW.value = OLD.value
          AND NEW.created_at = OLD.created_at AND NEW.subject_ref = OLD.subject_ref)
BEGIN SELECT RAISE(ABORT, 'preference_events is append-only'); END;

CREATE TRIGGER IF NOT EXISTS preference_events_no_early_delete
BEFORE DELETE ON preference_events
WHEN OLD.purge_after IS NULL OR OLD.purge_after > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN SELECT RAISE(ABORT, 'preference_events can only be purged after purge_after'); END;

-- ---------------------------------------------------------------------------
-- Explicit images stopped in the browser (NSFWJS, public/app/nsfw.js). The image is kept in
-- quarantine only for the admin to check (deleted after 30 days), the account is suspended at once.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocked_uploads (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key   TEXT,                 -- file in UPLOAD_DIR/quarantine, NULL once deleted
  mime          TEXT,
  scores        TEXT NOT NULL,        -- NSFWJS probabilities, JSON
  prev_status   TEXT NOT NULL,        -- account status to restore if it was a mistake
  created_at    TEXT NOT NULL,
  resolved_at   TEXT,
  resolution    TEXT CHECK (resolution IS NULL OR resolution IN ('restored', 'confirmed')),
  resolved_by   TEXT
);
CREATE INDEX IF NOT EXISTS blocked_uploads_open ON blocked_uploads (resolved_at, created_at);

-- Groups (like Facebook groups): Generale and one per region. Seeded by groups.js; anyone with a
-- profile posts and comments, no joining.
CREATE TABLE IF NOT EXISTS groups (
  id          TEXT PRIMARY KEY,               -- slug, used in the address: generale, regione-sicilia
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('general', 'region')),
  description TEXT NOT NULL,
  position    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS group_posts_group ON group_posts(group_id, id);
CREATE TABLE IF NOT EXISTS group_comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL REFERENCES group_posts(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS group_comments_post ON group_comments(post_id, id);
-- Pictures in a post (up to 4), in order; the files themselves are kind 'group_image'
CREATE TABLE IF NOT EXISTS group_post_images (
  post_id   INTEGER NOT NULL REFERENCES group_posts(id) ON DELETE CASCADE,
  file_id   TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  PRIMARY KEY (post_id, file_id)
);

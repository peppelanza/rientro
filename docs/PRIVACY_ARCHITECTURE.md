# Rientro: privacy architecture (MVP)

> **Not legal advice.** This document describes technical design choices. Legal bases, retention
> periods and all user-facing legal text are **proposals pending review by a qualified EU/Italian
> privacy professional**. Every row in the processing register carries `review_status = pending_legal_review`,
> and every legal page carries a "BOZZA · DA RIVEDERE" banner.

## 1. The job-seeking signal

| Rule | How it is enforced |
|---|---|
| Not a third primary intent | `profiles.primary_intent` accepts only `has_idea` / `seeking_idea`. Job-seeking lives in `job_preferences`. |
| One explicit checkbox, no second "discoverable by companies" checkbox | UI: step 9a/10a checkbox + the same toggle in Settings → Privacy. No other control exists. |
| Never inferred | `looking_for_italian_job` is written **only** by `setJobSeeking()` (`PUT /api/me/job-seeking`), which requires a strict boolean. `PATCH /api/me/profile` rejects unknown fields, so the flag can't be sneaked in. Tested in `test/job-seeking.test.js`. |
| Auditable, timestamped, versioned | Current state: `selected_at`, `deselected_at`, `updated_at`, `notice_version`, `privacy_policy_version`. History: one append-only `preference_events` row per change, with `source` (onboarding/settings) and the versions of the texts shown. |
| Deselection recorded | The ledger row has `value = 0`. `deselected_at` is set and the structured details are **deleted** (data minimisation). |
| Separate from marketing | `communication_preferences.marketing_email` has its own endpoint, its own ledger rows and its own UI section. Tested. |
| Details stay private | Other members see only the badge `is_looking_for_italian_job`. Roles, skills, locations and availability are visible only to the user, and to admins (audited). |

### Structured data for a future Rientro Talent

`job_preferences`: `roles[]`, `skills[]`, `sectors[]`, `preferred_locations[]` (comuni), `work_arrangement`
(`on_site|hybrid|remote|any`), `employment_type` (`full_time|part_time|any`), `availability`
(`now|within_3_months|within_6_months|within_12_months|later`). Background comes from `profiles`
(`background_area`, `current_role`, `years_experience`), and "lives abroad" from `profiles.lives_in_country`.

**Not built:** any company/recruiter interface, job-seeker search, or bulk export. Before any B2B access,
the privacy notice, the legal basis for `job_seeking_signal`, and probably `job_seeking_notice` must be reviewed
and re-versioned. Bumping `LEGAL_VERSIONS.job_seeking_notice` then makes it visible which users chose under which text.

## 2. Requirement map

| # | Requirement | Implementation |
|---|---|---|
| 1–3 | Privacy / Terms / Cookie policy | `public/legal/*.html`: summary first (design 43b), placeholders marked. Only a technical session cookie is set, so there's no banner. The cookie policy says so, and the design's 43c banner is kept for when analytics arrive. |
| 4 | Consent where it's the right basis | Only genuinely optional choices are recorded as preferences (job-seeking, newsletter). Terms and the privacy notice are recorded as **acknowledgements** (`legal_acknowledgements`), not consents. |
| 5 | Separate marketing consent | `communication_preferences`, off by default. |
| 6–8 | Job-seeking record, versions, timestamps | See §1. |
| 9 | Withdrawal | Settings toggles, same effort as opting in. |
| 10 | Account deletion | `DELETE /api/me` (type ELIMINA). Cascades profile, job prefs, files (also on disk), sessions, connections. The ledger is pseudonymised (see §3). |
| 11 | Data export | `GET /api/me/export`: JSON with account, profile, job prefs, preferences + history, acknowledgements, connections, files, sessions. One every 24 h. |
| 12 | Minimisation | Age band instead of DOB. Job details are cleared on deselect. No original filenames. The IP is not stored. |
| 13 | Retention | `npm run purge` (daily cron) deletes expired ledger rows, used/expired login tokens and expired sessions. Periods are in `config.js` and the register. |
| 14, 18 | Access control / backend authz | Every API route requires a session unless marked `public`. Admin routes check `role = 'admin'` server-side. Admin role is granted only via the `ADMIN_EMAILS` env var; there's no API to promote users. |
| 15 | Admin audit logs | `admin_audit_log` records list, view and status changes, plus reads of the log itself. Append-only by SQL trigger. `target_ref` is an HMAC pseudonym so the log survives deletion. |
| 16 | Secure auth | Passwordless single-use links (15 min, only the SHA-256 is stored). Server-side sessions (only the hash is stored), `HttpOnly`, `SameSite=Lax`, `Secure` + `__Host-` in production. "Log out everywhere". Rate-limited per IP and per email. |
| 17 | Secure file storage | Type is detected from magic bytes (JPEG/PNG/WebP), 5 MB cap, random storage keys outside the web root, `0600` permissions, served only via `/api/files/:id` to the owner, admins, or approved members. |
| 19–21 | No sensitive data in public API | `publicProfile()` is an allowlist. It never includes email, status, job details or preference timestamps. `instagram_handle`, `x_handle` and `calendar_url` appear only for accepted connections. No DOB is collected. Tested. |
| — | Web hardening | Strict CSP (no inline scripts), `frame-ancestors 'none'`, `nosniff`, `no-referrer`, HSTS in production. CSRF: mutations need `X-Requested-With: rientro`. |

## 3. Deletion and the ledger

On deletion, `preference_events.user_id` is set to NULL and `purge_after = now + 36 months`
(`ledgerRetentionMonthsAfterDeletion`, **to be confirmed**). `subject_ref` (HMAC with `PSEUDONYM_SECRET`)
still lets you answer "did subject X opt in on date Y?" if the person comes back with their identifier.
Triggers block every other update, and block deletes before `purge_after`.

Open question for counsel: whether keeping this pseudonymous proof is justified, and for how long.

## 4. Things to decide before launch

- [ ] Legal basis for `job_seeking_signal` (consent vs contract) and for moderation (legitimate interest with a documented balancing test).
- [ ] Retention periods: ledger after deletion, admin audit log, inactive accounts.
- [ ] Email provider for login links (EU region, DPA). The server refuses to send in production until one is wired up.
- [ ] Self-host fonts instead of Google Fonts (IP transfer).
- [ ] DPIA screening if/when Rientro Talent exposes job-seekers to companies.
- [ ] Final legal texts (replace every `[PLACEHOLDER]`).

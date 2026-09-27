# Rientro MVP: job-seeking flag and privacy by design

A zero-dependency Node 22 app (built-in `node:sqlite`, `node:http`, `node:test`) that implements:

- **§9** the optional checkbox *"Sto anche cercando lavoro in Italia per un'azienda italiana"*, alongside either co-founder intent (design 9a/10a)
- **§10** the conditional step *"Che tipo di opportunità cerchi in Italia?"* with structured fields
- **§40** a data model ready for a future Rientro Talent, with no B2B surface built
- **§41** privacy by design: see [docs/PRIVACY_ARCHITECTURE.md](docs/PRIVACY_ARCHITECTURE.md)

The visual style follows the Claude Design project "Rientro v2" (tokens, option cards, checkbox, segmented, onboarding bar).

## Run

```bash
npm run dev      # http://localhost:3000, admin@rientro.local gets the admin role
npm test         # 17 tests: job-seeking rules, public API leaks, authz, audit, export, deletion
npm run purge    # retention job, schedule daily
```

In development the login link is printed to the console and shown on the page. In production
(`NODE_ENV=production`) you must set `PSEUDONYM_SECRET`, `BASE_URL` and `ADMIN_EMAILS`, and wire an email provider in
`defaultSendLoginLink` (src/server.js).

## Layout

```
src/schema.sql              tables, append-only triggers
src/preferences.js          job-seeking flag (only writer), job details, marketing, ledger
src/profiles.js             allowlisted public profile, connections gate
src/privacy.js              export, deletion, retention purge
src/admin.js                audited admin reads/writes
src/auth.js                 6-digit email code auth, sessions, terms acknowledgement
src/files.js                photo storage
src/processing-register.js  purpose ↔ data ↔ proposed basis ↔ retention (pending legal review)
design/                     Claude Design source files (reference copies, don't edit)
public/dc/runtime.js        dependency-free renderer for the design templates
public/app/main.js          router: URL → pages/<name>.js + pages/<name>.html
public/app/components.js    app variants of the design components (real links, data, inputs)
public/app/pages/           one page per screen; templates copied from the design artboards
```

## API (member)

| Method | Path | Notes |
|---|---|---|
| PUT | `/api/me/job-seeking?source=onboarding\|settings` | `{ "looking_for_italian_job": true\|false }`, strict boolean |
| PATCH | `/api/me/job-preferences` | 409 unless the flag is on |
| PUT | `/api/me/communication` | `{ "preference": "marketing_email", "value": bool }` |
| GET | `/api/me/preference-history` | the user's own ledger |
| GET | `/api/me/export` | JSON download |
| DELETE | `/api/me` | `{ "confirm": "ELIMINA" }` |

All mutations need the `X-Requested-With: rientro` header.

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md): Render, Frankfurt, persistent disk, preview password.

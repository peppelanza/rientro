// Error history for the admin (Admin › Errori): what went wrong, on the server and in the members'
// browsers, kept 30 days. The same error within an hour is one row with a count, so a loop can't
// fill the table.
// - server: everything written with console.error (crashes with their stack, Turnstile, email,
//   sign-in providers, the scheduled jobs), once captureConsole() is on (production start only);
// - sign-in refused: each refusal of /api/auth/* with its reason (robot check, address refused,
//   wrong code…), level "warn", to see whether people get stuck before signing up;
// - browser: uncaught errors, server errors seen by the page, the robot check failing on the
//   sign-in page (POST /api/client-error, public/app/error-report.js).
// No email addresses, codes or tokens in here: only what went wrong and where.
import { config } from './config.js';
import { now } from './db.js';

const KEEP_DAYS = 30;
const MAX_ROWS = 5000;
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

export function logError(db, { source = 'server', level = 'error', kind = null, message, path = null, userId = null, detail = null }) {
  try {
    const ts = now();
    const msg = clip(message, 500) || '(senza messaggio)';
    const since = new Date(Date.now() - 3600_000).toISOString();
    const same = db.prepare(`SELECT id FROM error_log WHERE source = ? AND level = ? AND message = ? AND coalesce(path, '') = coalesce(?, '')
      AND last_at >= ? ORDER BY id DESC LIMIT 1`).get(source, level, msg, clip(path, 200), since);
    if (same) {
      db.prepare('UPDATE error_log SET count = count + 1, last_at = ?, user_id = coalesce(?, user_id) WHERE id = ?').run(ts, userId, same.id);
      return;
    }
    db.prepare(`INSERT INTO error_log (first_at, last_at, count, source, level, kind, message, path, user_id, detail)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`).run(ts, ts, source, level, clip(kind, 60), msg, clip(path, 200), userId, clip(detail, 4000));
    // old rows go, and never more than MAX_ROWS
    if (Math.random() < 0.05) {
      db.prepare('DELETE FROM error_log WHERE last_at < ?').run(new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString());
      db.prepare('DELETE FROM error_log WHERE id <= (SELECT id FROM error_log ORDER BY id DESC LIMIT 1 OFFSET ?)').run(MAX_ROWS);
    }
  } catch { /* the log never breaks what it records */ }
}

// console.error → the log too (still printed for Render's logs). "[turnstile] …" becomes kind "turnstile".
export function captureConsole(db) {
  const original = console.error.bind(console);
  console.error = (...args) => {
    original(...args);
    const err = args.find(a => a instanceof Error);
    const text = args.map(a => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    const kind = /^\[([^\]]{1,40})\]/.exec(text)?.[1] ?? (err ? 'crash' : null);
    logError(db, { source: 'server', kind, message: text, detail: err?.stack?.split('\n').slice(0, 8).join('\n') ?? null });
  };
}

// What a browser sends (public/app/error-report.js): checked and cut to size
export function clientError(db, body, userId) {
  const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
  const kind = ['js', 'promise', 'api', 'network', 'turnstile'].includes(body?.kind) ? body.kind : 'js';
  const message = str(body?.message, 500);
  if (!message) return;
  // Not ours, whatever the page's code (one opened before an update still sends these): an outside
  // script that didn't load (a blocker, Cloudflare's visit counter, Facebook's), or errors from
  // scripts that in-app browsers and extensions add
  const stack = str(body?.stack, 3000) || '';
  if (/^https?:\/\//.test(message) && !message.startsWith(config.baseUrl)) return;
  if (/(iabjs|chrome-extension|moz-extension|safari-(web-)?extension):\/\//.test(`${message}\n${stack}`)) return;
  const detail = [str(body?.stack, 3000), str(body?.ua, 200) && `UA: ${str(body.ua, 200)}`].filter(Boolean).join('\n') || null;
  logError(db, { source: 'browser', level: ['api', 'network'].includes(kind) ? 'warn' : 'error', kind, message, path: str(body?.path, 200), userId, detail });
}

export function listErrors(db, query = new URLSearchParams()) {
  const source = ['server', 'browser'].includes(query.get('source')) ? query.get('source') : null;
  const level = ['error', 'warn'].includes(query.get('level')) ? query.get('level') : null;
  const q = (query.get('q') || '').trim().slice(0, 100).toLowerCase();
  const page = Math.max(1, Number(query.get('page')) || 1);
  const perPage = 50;
  const where = [];
  const args = [];
  if (source) { where.push('source = ?'); args.push(source); }
  if (level) { where.push('level = ?'); args.push(level); }
  if (q) { where.push("(lower(message) LIKE ? OR lower(coalesce(path, '')) LIKE ? OR lower(coalesce(kind, '')) LIKE ?)"); const l = `%${q.replace(/[%_]/g, '')}%`; args.push(l, l, l); }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM error_log ${sql}`).get(...args).n;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(page, pages);
  const items = db.prepare(`SELECT * FROM error_log ${sql} ORDER BY last_at DESC LIMIT ? OFFSET ?`).all(...args, perPage, (p - 1) * perPage);
  const day = new Date(Date.now() - 86400_000).toISOString();
  const last24 = db.prepare('SELECT coalesce(SUM(count), 0) AS n FROM error_log WHERE last_at >= ? AND level = \'error\'').get(day).n;
  return { items, total, page: p, pages, per_page: perPage, last24 };
}

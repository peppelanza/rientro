// Site openings counted by our own server, next to Cloudflare Web Analytics (web-analytics.js), for
// the people Cloudflare's counter misses: its script blocked by an ad blocker, Safari's tracking
// protection, or the page left before it ran. Only aggregate numbers (day, page, where from): no
// cookie, no IP, nothing that tells who visited. Shown in Admin › Analytics (visitsReport).
//
// What counts: a browser opening a page of the site (the HTML, not the files and APIs), as
// Cloudflare counts a pageload. Not counted, to stay comparable and honest:
// - moving between pages inside the site: the app does it without asking the server (Cloudflare
//   counts these as page views), and a page opened from another of ours (a redirect, a reload);
// - bots, link previews (WhatsApp, Facebook, LinkedIn fetching the invite's picture), prefetches;
// - the admin panel and the admins' own visits.
import { now } from './db.js';
import { config } from './config.js';

// (in-app browsers are people, not bots: Facebook's "FBAN", LinkedIn's "LinkedInApp", Instagram's)
const BOT = /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|meta-externalagent|^whatsapp|headless|lighthouse|pagespeed|^curl|^wget|python|go-http|node-fetch|axios|^java\/|okhttp|httpclient|libwww|scrapy|uptime|^render\//i;

// Where a visit comes from: the campaign's own tag, the click ids the networks add, the referring site
const HOSTS = [
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'Facebook'], [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'LinkedIn'], [/(^|\.)(t\.co|x\.com|twitter\.com)$/, 'X'], [/(^|\.)whatsapp\.(com|net)$/, 'WhatsApp'],
  [/(^|\.)t\.me$|(^|\.)telegram\.org$/, 'Telegram'], [/(^|\.)google\.[a-z.]+$/, 'Google'], [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'], [/(^|\.)reddit\.com$/, 'Reddit'], [/(^|\.)youtube\.com$/, 'YouTube'],
  [/(^|\.)(mail\.google\.com|outlook\.(live|office)\.com)$/, 'Email'],
];
export function sourceOf(url, referer, inviteCode) {
  const q = url.searchParams;
  const utm = (q.get('utm_source') || '').trim().toLowerCase();
  if (q.has('fbclid') || /^(fb|facebook)$/.test(utm)) return 'Facebook';
  if (q.has('igshid') || /^(ig|instagram)$/.test(utm)) return 'Instagram';
  if (q.has('gclid')) return 'Google Ads';
  if (q.has('li_fat_id') || utm === 'linkedin') return 'LinkedIn';
  if (inviteCode) return 'Link d’invito';
  if (utm) return utm.slice(0, 30);
  let host = '';
  try { host = new URL(referer).hostname.toLowerCase(); } catch { return 'Diretto'; }
  for (const [re, name] of HOSTS) if (re.test(host)) return name;
  return host.replace(/^www\./, '').slice(0, 60) || 'Diretto';
}

// The page, with the member's own ids folded in ("/persone/…"): what matters is which page, not whose
export function pageOf(path, inviteCode) {
  if (inviteCode) return '/ (link d’invito)';
  return path.replace(/^\/(persone|gruppi|messaggi|connessioni|supporto)\/[^/]+$/, '/$1/…').slice(0, 120) || '/';
}

const ownHost = () => new URL(config.baseUrl).hostname.replace(/^www\./, '');

// Called for every page served (server.js): counts it when it's a real opening of the site
export function countVisit(db, req, url, { inviteCode = null, isAdmin = false } = {}) {
  try {
    if (req.method !== 'GET' || isAdmin) return;
    const h = req.headers;
    const ua = h['user-agent'] || '';
    if (!ua || BOT.test(ua)) return;
    if (h['sec-fetch-dest'] && h['sec-fetch-dest'] !== 'document') return;
    if (/prefetch|prerender/i.test(`${h['sec-purpose'] || ''} ${h.purpose || ''} ${h['x-moz'] || ''}`)) return;
    // from a page of ours (a redirect like the invite page → /accedi, a reload, a link opened again): already counted
    let refHost = '';
    try { refHost = new URL(h.referer || '').hostname.replace(/^www\./, ''); } catch {}
    const here = (h.host || '').split(':')[0].replace(/^www\./, '');
    if (refHost && (refHost === here || refHost === ownHost() || refHost.endsWith(`.${ownHost()}`))) return;
    const day = now().slice(0, 10);
    db.prepare(`INSERT INTO site_visits (day, page, source, n) VALUES (?, ?, ?, 1)
      ON CONFLICT(day, page, source) DO UPDATE SET n = n + 1`).run(day, pageOf(url.pathname, inviteCode), sourceOf(url, h.referer, inviteCode));
  } catch { /* counting never gets in the way of the page */ }
}

// Admin › Analytics: the period's openings, per day, per source, per page
export function visitsReport(db, days) {
  const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const total = db.prepare('SELECT coalesce(SUM(n), 0) AS n FROM site_visits WHERE day >= ?').get(from).n;
  const first = db.prepare('SELECT MIN(day) AS d FROM site_visits').get().d;
  // every day from when counting started (or the period's start), the empty ones too
  const counted = new Map(db.prepare('SELECT day, SUM(n) AS n FROM site_visits WHERE day >= ? GROUP BY day').all(from).map(r => [r.day, r.n]));
  const start = first && first > from ? first : from;
  const perDay = [];
  for (let d = new Date(`${start}T00:00:00Z`); d.toISOString().slice(0, 10) <= now().slice(0, 10); d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    perDay.push({ day, n: counted.get(day) ?? 0 });
  }
  return {
    total, since: first, days: perDay,
    // sign-ups over the same days as the openings (for the conversion)
    signups: db.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND role <> 'admin' AND email NOT LIKE '%.invalid'").get(start).n,
    sources: db.prepare('SELECT source AS l, SUM(n) AS v FROM site_visits WHERE day >= ? GROUP BY source ORDER BY v DESC LIMIT 12').all(from),
    pages: db.prepare('SELECT page AS l, SUM(n) AS v FROM site_visits WHERE day >= ? GROUP BY page ORDER BY v DESC LIMIT 12').all(from),
  };
}

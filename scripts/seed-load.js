// Load test: a throwaway database the size Rientro is planned for (30,000 members, a million
// messages), then the main pages timed against it, and how long the server takes to start and how
// much memory Scopri's index holds.
//
//   npm run load                 build the database (in the system's temp folder) and time the pages
//   npm run load -- --reuse      time again on the database built last time (no rebuild)
//   npm run load -- --dir <dir>  where the database goes (a temp folder by default)
//
// Never point it at the real database: it refuses any folder that already holds a database it
// didn't build itself (the marker file below), and the real data/ folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const dir = path.resolve(opt('--dir') || path.join(os.tmpdir(), 'rientro-load'));
const reuse = args.includes('--reuse');
const MARKER = 'BUILT-BY-SEED-LOAD';
const repoData = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

if (dir === path.resolve(repoData) || dir.startsWith(path.resolve(repoData) + path.sep)) {
  console.error(`seed-load: ${dir} is the app's own data folder; choose another --dir`);
  process.exit(1);
}
const dbFile = path.join(dir, 'load.db');
if (fs.existsSync(dir) && fs.readdirSync(dir).length && !fs.existsSync(path.join(dir, MARKER))) {
  console.error(`seed-load: ${dir} is not empty and wasn't built by this script; choose another --dir`);
  process.exit(1);
}
if (reuse && !fs.existsSync(dbFile)) { console.error(`seed-load: nothing to reuse in ${dir}`); process.exit(1); }

// The app reads these when it loads: set before importing it
process.env.DB_PATH = dbFile;
process.env.UPLOAD_DIR = path.join(dir, 'uploads');
process.env.LAUNCHED = '1';
process.env.NODE_ENV = 'development';
delete process.env.ADMIN_EMAILS;

const { openDb, sha256 } = await import('../src/db.js');
const { AREAS, COMUNI, SECTORS } = await import('../src/catalog.js');

// --- the fake data ---------------------------------------------------------------------------

const MEMBERS = 30_000;
const CONVERSATIONS = 20_000;
const MESSAGES = 1_000_000;
const HEAVY = 0; // member 0: many conversations, notifications, connections (the worst case timed)

// Always the same data (a seeded generator), so runs compare
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const int = n => Math.floor(rnd() * n);
const pick = list => list[int(list.length)];
const some = (list, n) => [...new Set(Array.from({ length: n }, () => pick(list)))];
// many people pick the big cities: weighted towards the first (largest) comuni
const BIG = [...COMUNI].sort((a, b) => b[3] - a[3]).map(c => c[0]);
const city = () => BIG[Math.floor(BIG.length * rnd() ** 4)];
const FIRST = ['Giuseppe', 'Marco', 'Giulia', 'Francesca', 'Luca', 'Chiara', 'Andrea', 'Sara', 'Alessandro', 'Martina', 'Davide', 'Elena', 'Simone', 'Valentina', 'Matteo', 'Federica', 'Antonio', 'Silvia', 'Roberto', 'Alessia', 'Salvatore', 'Ilaria', 'Vincenzo', 'Laura', 'Fabio', 'Anna', 'Paolo', 'Serena', 'Stefano', 'Roberta'];
const LAST = ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Lanza', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini'];
const ABROAD = [['Regno Unito', 'Londra'], ['Germania', 'Berlino'], ['Francia', 'Parigi'], ['Paesi Bassi', 'Amsterdam'], ['Spagna', 'Barcellona'], ['Svizzera', 'Zurigo'], ['Stati Uniti', 'New York'], ['Belgio', 'Bruxelles'], ['Irlanda', 'Dublino'], ['Svezia', 'Stoccolma']];
const COMPANIES = ['Google', 'Amazon', 'Accenture', 'Deloitte', 'Enel', 'Eni', 'Intesa Sanpaolo', 'UniCredit', 'Spotify', 'Booking', 'Zalando', 'Satispay', 'Bending Spoons', 'Leonardo', 'Ferrero', 'Luxottica', 'Pirelli', 'Vodafone', 'McKinsey', 'Startup'];
const ROLES = ['Product Manager', 'Software Engineer', 'Designer', 'Data Scientist', 'Consulente', 'Marketing Manager', 'Avvocato', 'Ricercatrice', 'Architetto', 'Founder', 'Medico', 'Insegnante', 'Commercialista', 'Sales Manager'];
const SCHOOLS = ['Politecnico di Milano', 'Bocconi', 'Sapienza', 'Federico II', 'Università di Bologna', 'Università di Palermo', 'Politecnico di Torino', 'Università di Padova', 'LUISS', 'Università di Bari'];
const WORDS = 'ciao come stai tutto bene grazie sentiamoci domani progetto idea lavoro rientro casa sud palermo milano napoli bari caffè chiamata settimana prossima perfetto ottimo vediamo startup team fondi bando incontro evento ci sono anche io'.split(' ');
const sentence = (n = 4 + int(14)) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
const ISO = ms => new Date(ms).toISOString();
const START = Date.parse('2026-06-01T00:00:00Z');
const SPAN = Date.parse('2026-11-15T00:00:00Z') - START;

function build() {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MARKER), 'seed-load.js\n');
  const db = openDb(dbFile);
  const t0 = Date.now();
  const batch = (fn) => { db.exec('BEGIN'); fn(); db.exec('COMMIT'); };
  const ids = Array.from({ length: MEMBERS }, (_, i) => crypto.createHash('md5').update(`m${i}`).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-').slice(0, 36));
  const status = i => (i < 27_000 || i === HEAVY ? 'approved' : i < 29_500 ? 'onboarding' : i < 29_800 ? 'suspended' : 'approved');

  batch(() => {
    const u = db.prepare('INSERT INTO users (id, email, role, status, created_at, updated_at, last_seen_at, deletion_requested_at, invite_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const p = db.prepare(`INSERT INTO profiles (user_id, lives_in, lives_in_country, lives_in_city, desired_comuni, primary_intent, idea_title, idea_description, idea_stage,
      first_name, last_name, birth_year, bio, background_area, years_experience, sectors, seeking_backgrounds, seeking_description, seeking_location, misses_italy, source,
      move_when, visible, onboarding_step, submitted_at, approved_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const e = db.prepare('INSERT INTO experiences (id, user_id, company, role, city, start_month, end_month, current, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const ed = db.prepare('INSERT INTO education (id, user_id, school, degree, years, position) VALUES (?, ?, ?, ?, ?, ?)');
    const cp = db.prepare('INSERT INTO communication_preferences (user_id, updated_at) VALUES (?, ?)');
    for (let i = 0; i < MEMBERS; i++) {
      const at = ISO(START + int(SPAN));
      const st = status(i);
      u.run(ids[i], `load${i}@example.invalid`, 'member', st, at, at, at, i >= 29_800 ? at : null, `load${i}`);
      const abroad = rnd() < 0.6;
      const [country, abroadCity] = pick(ABROAD);
      const intent = pick(['has_idea', 'seeking_idea', 'networking']);
      const online = st !== 'onboarding';
      p.run(ids[i], abroad ? 'abroad' : 'italy', abroad ? country : 'Italia', abroad ? abroadCity : city(),
        JSON.stringify(some([...Array(3)].map(city), 1 + int(3))), intent,
        intent === 'networking' ? null : sentence(5), intent === 'networking' ? null : sentence(30), intent === 'has_idea' ? pick(['idea', 'prototype', 'revenue']) : null,
        pick(FIRST), pick(LAST), 1970 + int(35), sentence(40), pick(AREAS), pick(['0-3', '4-7', '8-12', '13+']),
        JSON.stringify(some(SECTORS, 1 + int(3))), JSON.stringify(some(AREAS, 1 + int(3))), sentence(12), 'any', sentence(6), 'LinkedIn',
        abroad ? pick(['0_3m', '4_12m', 'unknown']) : null, 1, online ? null : 'presentati', online ? at : null, online ? at : null, at);
      for (let k = 0, n = 1 + int(4); k < n; k++) e.run(crypto.randomUUID(), ids[i], pick(COMPANIES), pick(ROLES), pick(['Londra', 'Milano', 'Berlino', 'Roma']), '2018-01', k ? '2022-01' : null, k ? 0 : 1, k);
      for (let k = 0, n = 1 + int(2); k < n; k++) ed.run(crypto.randomUUID(), ids[i], pick(SCHOOLS), pick(['Laurea', 'Master', 'Dottorato']), '2010–2015', k);
      cp.run(ids[i], at);
    }
  });

  // Connections: about eight each, most accepted; the heavy member has 600
  const pairs = [];
  batch(() => {
    const c = db.prepare('INSERT INTO connections (id, requester_id, addressee_id, status, created_at, responded_at) VALUES (?, ?, ?, ?, ?, ?)');
    const seen = new Set();
    const add = (a, b) => {
      const k = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (a === b || seen.has(k)) return;
      seen.add(k);
      const st = rnd() < 0.85 ? 'accepted' : pick(['pending', 'declined', 'withdrawn']);
      const at = ISO(START + int(SPAN));
      c.run(crypto.randomUUID(), ids[a], ids[b], st, at, st === 'pending' ? null : at);
      if (st === 'accepted') pairs.push([a, b]);
    };
    for (let k = 0; k < 600; k++) rnd() < 0.5 ? add(HEAVY, 1 + int(26_999)) : add(1 + int(26_999), HEAVY);
    for (let k = 0; k < MEMBERS * 4; k++) add(int(27_000), int(27_000));
  });

  // Messages: 20,000 conversations among connected people (the heavy member in 300 of them),
  // a million messages, most read
  const convs = [...pairs.filter(([a, b]) => a === HEAVY || b === HEAVY).slice(0, 300), ...pairs.filter(([a, b]) => a !== HEAVY && b !== HEAVY).slice(0, CONVERSATIONS - 300)];
  db.exec('BEGIN');
  {
    const m = db.prepare('INSERT INTO messages (sender_id, recipient_id, body, created_at, read_at) VALUES (?, ?, ?, ?, ?)');
    // messages spread over time across conversations, as they arrive: conversations interleave
    const weights = convs.map(() => 1 + rnd() ** 3 * 200);
    const sum = weights.reduce((a, b) => a + b, 0);
    const cum = []; weights.reduce((a, w, i) => (cum[i] = a + w), 0);
    for (let k = 0; k < MESSAGES; k++) {
      const x = rnd() * sum;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < x) lo = mid + 1; else hi = mid; }
      const [a, b] = convs[lo];
      const [s, r] = rnd() < 0.5 ? [a, b] : [b, a];
      const at = ISO(START + (k / MESSAGES) * SPAN);
      m.run(ids[s], ids[r], sentence(), at, rnd() < 0.97 || k < MESSAGES * 0.9 ? at : null);
      if (k % 100_000 === 99_999) { db.exec('COMMIT'); db.exec('BEGIN'); }
    }
  }
  db.exec('COMMIT');

  // Notifications: about ten each (the heavy member 2,000), blocks, groups with posts and comments
  batch(() => {
    const n = db.prepare('INSERT INTO notifications (user_id, kind, actor_id, data, created_at, read_at, emailed_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const add = (u) => { const at = ISO(START + int(SPAN)); n.run(ids[u], pick(['message', 'connection_request', 'connection_accepted', 'group_comment']), ids[int(27_000)], '{}', at, rnd() < 0.8 ? at : null, at); };
    for (let k = 0; k < 2000; k++) add(HEAVY);
    for (let k = 0; k < MEMBERS * 10; k++) add(int(MEMBERS));
    const b = db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)');
    for (let k = 0; k < 500; k++) b.run(ids[int(27_000)], ids[int(27_000)], ISO(START));
    b.run(ids[HEAVY], ids[26_999], ISO(START));
  });
  const groupIds = (() => {
    // the groups are created when the app starts (groups.seedGroups): the same list here
    return db.prepare('SELECT id FROM groups').all().map(r => r.id);
  })();
  return { db, ids, groupIds, t0 };
}

async function buildAll() {
  const { createApp } = await import('../src/server.js');
  let { db, ids, groupIds, t0 } = build();
  if (!groupIds.length) { createApp({ db }); groupIds = db.prepare('SELECT id FROM groups').all().map(r => r.id); }
  db.exec('BEGIN');
  {
    const p = db.prepare('INSERT INTO group_posts (group_id, author_id, body, created_at) VALUES (?, ?, ?, ?)');
    const c = db.prepare('INSERT INTO group_comments (post_id, author_id, body, created_at) VALUES (?, ?, ?, ?)');
    const f = db.prepare('INSERT OR IGNORE INTO group_follows (user_id, group_id, created_at) VALUES (?, ?, ?)');
    for (let k = 0; k < 6000; k++) {
      // a third of the posts in Generale
      const g = rnd() < 0.33 ? 'generale' : pick(groupIds);
      const at = ISO(START + (k / 6000) * SPAN);
      const post = Number(p.run(g, ids[int(27_000)], sentence(40), at).lastInsertRowid);
      for (let j = 0, n = int(8); j < n; j++) c.run(post, ids[int(27_000)], sentence(15), at);
    }
    for (let k = 0; k < MEMBERS; k++) f.run(ids[k], 'generale', ISO(START));
  }
  db.exec('COMMIT');
  db.exec('DELETE FROM discover_dirty; DELETE FROM gsearch_dirty;');
  const count = t => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  console.log(`built in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${['users', 'profiles', 'experiences', 'education', 'connections', 'messages', 'notifications', 'group_posts', 'group_comments'].map(t => `${t} ${count(t).toLocaleString('en')}`).join(', ')}`);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  fs.writeFileSync(path.join(dir, 'ids.json'), JSON.stringify({ heavy: ids[HEAVY], typical: ids[123] }));
}

// --- timing ----------------------------------------------------------------------------------

const ms = t => Number(process.hrtime.bigint() - t) / 1e6;
const stats = list => {
  const s = [...list].sort((a, b) => a - b);
  return { median: s[Math.floor(s.length / 2)], p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] };
};

async function bench() {
  const { ids } = { ids: JSON.parse(fs.readFileSync(path.join(dir, 'ids.json'), 'utf8')) };
  // Boot: what a deploy costs (openDb with its migrations, the app), on the full database
  globalThis.gc?.();
  let t = process.hrtime.bigint();
  const { openDb: open } = await import('../src/db.js');
  const db = open(dbFile);
  const openMs = ms(t);
  const { createApp } = await import('../src/server.js');
  t = process.hrtime.bigint();
  const app = createApp({ db, sendLoginCode: async () => {}, emailDomainCheck: async () => {} });
  const appMs = ms(t);
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  // Signed in as the heavy member and a typical one (a session row, as auth.startSession makes)
  const session = userId => {
    const token = crypto.randomBytes(32).toString('base64url');
    const ts = new Date().toISOString();
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sha256(token), userId, ts, ts, new Date(Date.now() + 86400_000).toISOString(), 'load');
    return `rientro_session=${token}`;
  };
  // (not production here: the plain cookie name, server.js SESSION_COOKIE)
  const heavy = session(ids.heavy);
  const typical = session(ids.typical);
  const get = async (cookie, p) => {
    const t0 = process.hrtime.bigint();
    const r = await fetch(base + p, { headers: { cookie } });
    const body = await r.text();
    const took = ms(t0);
    if (r.status !== 200) throw new Error(`${p}: ${r.status} ${body.slice(0, 200)}`);
    return [took, body];
  };
  // each one's longest conversation
  const chatWith = id => db.prepare(`SELECT CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS other, COUNT(*) AS n FROM messages
    WHERE sender_id = ? OR recipient_id = ? GROUP BY other ORDER BY n DESC LIMIT 1`).get(id, id, id)?.other;
  const chats = { pesante: chatWith(ids.heavy), tipico: chatWith(ids.typical) };

  // Scopri's index: built by the first request; the memory it holds after a collection
  globalThis.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const [firstScopri] = await get(heavy, '/api/profiles');
  globalThis.gc?.();
  const indexMb = (process.memoryUsage().heapUsed - heapBefore) / 1048576;

  const cases = [
    ['Scopri', '/api/profiles'],
    ['Scopri, filtri', '/api/profiles?intent=has_idea&backgrounds=Tecnologia%20e%20ingegneria&lives=abroad&desired=Palermo'],
    ['Scopri, ricerca', '/api/profiles?q=giulia%20bocconi'],
    ['Scopri, pagina 40', '/api/profiles?sort=recent&page=40'],
    ['Me + badge', '/api/me'],
    ['Notifiche', '/api/notifications'],
    ['Connessioni', '/api/connections'],
    ['Messaggi (inbox)', '/api/threads'],
    ['Messaggi, ricerca', '/api/threads?q=progetto%20domani'],
    ['Una chat', who => `/api/threads/${chats[who]}`],
    ['Gruppo Generale', '/api/groups/generale/posts'],
    ['Gruppo, un post', null],
  ];
  const postId = db.prepare("SELECT id FROM group_posts WHERE group_id = 'generale' ORDER BY id DESC LIMIT 1").get().id;
  cases.at(-1)[1] = `/api/groups/generale/posts/${postId}/comments`;
  const RUNS = Number(opt('--runs')) || 15;
  const rows = [];
  for (const [label, path_] of cases) {
    for (const [who, cookie] of [['pesante', heavy], ['tipico', typical]]) {
      const p = typeof path_ === 'function' ? path_(who) : path_;
      if (p.endsWith('/undefined')) continue;
      await get(cookie, p); // warm
      const times = [];
      for (let i = 0; i < RUNS; i++) times.push((await get(cookie, p))[0]);
      rows.push({ label, who, ...stats(times) });
    }
  }
  console.log(`\nboot: openDb ${openMs.toFixed(0)} ms, createApp ${appMs.toFixed(0)} ms; first Scopri (builds the index) ${firstScopri.toFixed(0)} ms; index ≈ ${indexMb.toFixed(1)} MB of heap${globalThis.gc ? '' : ' (run with --expose-gc for a precise figure)'}`);
  console.log(`rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB\n`);
  console.log('| Pagina | Membro | mediana ms | p95 ms |\n|---|---|---:|---:|');
  for (const r of rows) console.log(`| ${r.label} | ${r.who} | ${r.median.toFixed(1)} | ${r.p95.toFixed(1)} |`);
  app.server.close();
  db.close();
}

if (!reuse) await buildAll();
await bench();
process.exit(0);

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';
import { pageOf, sourceOf } from '../src/visits.js';

let t;
before(async () => { t = await startApp(); });
after(() => t.close());

const U = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1';
const open = (path, headers = {}) => fetch(`${t.base}${path}`, { redirect: 'manual', headers: { 'user-agent': U, 'sec-fetch-dest': 'document', ...headers } });
const rows = () => t.app.db.prepare('SELECT page, source, n FROM site_visits ORDER BY page, source').all().map(r => ({ ...r }));

test('where from and which page', () => {
  const u = s => new URL(`https://www.rientro.it${s}`);
  assert.equal(sourceOf(u('/?gius2091&fbclid=x'), '', 'gius2091'), 'Facebook');
  assert.equal(sourceOf(u('/?gius2091'), '', 'gius2091'), 'Link d’invito');
  assert.equal(sourceOf(u('/'), 'https://www.linkedin.com/feed/'), 'LinkedIn');
  assert.equal(sourceOf(u('/'), 'https://lnkd.in/abc'), 'LinkedIn');
  assert.equal(sourceOf(u('/'), 'https://www.google.it/'), 'Google');
  assert.equal(sourceOf(u('/?utm_source=newsletter'), ''), 'newsletter');
  assert.equal(sourceOf(u('/'), undefined), 'Diretto');
  assert.equal(pageOf('/persone/67e81337-1f30'), '/persone/…');
  assert.equal(pageOf('/', 'gius2091'), '/ (link d’invito)');
});

test('counted: a page opened from outside, the invite link from Facebook, a member page; not: bots, previews, files, APIs, our own links, admins', async () => {
  const a = await t.approved('visite@x.it');
  await open('/', { referer: 'https://www.linkedin.com/feed/' });
  await open('/', { referer: 'https://www.linkedin.com/feed/' });
  const code = (await a.get('/api/me')).body.invite.url.split('?')[1];
  await open(`/?${code}&fbclid=IwAR123`);
  await open('/accedi', { referer: `${t.base}/` }); // the invite page's redirect: already counted
  await open('/scopri', { cookie: a.cookie }); // a member opening a bookmark
  // not counted
  await open('/', { 'user-agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' });
  await open('/', { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  await open('/', { 'sec-purpose': 'prefetch' });
  await open('/app/main.js', { 'sec-fetch-dest': 'script' });
  await open('/api/public/launch', { 'sec-fetch-dest': 'empty' });
  const admin = await t.asAdmin();
  await open('/', { cookie: admin.cookie });
  assert.deepEqual(rows(), [
    { page: '/', source: 'LinkedIn', n: 2 },
    { page: '/ (link d’invito)', source: 'Facebook', n: 1 },
    { page: '/scopri', source: 'Diretto', n: 1 },
  ]);
  // Admin › Analytics
  const r = (await admin.get('/api/admin/visits?period=30')).body;
  assert.equal(r.total, 4);
  assert.equal(r.compare, null, 'the first day (partial) is left out of the comparisons');
  // a day later: the comparisons start from that midnight, with that day's sign-ups only
  const db = t.app.db;
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  db.prepare('UPDATE site_visits SET day = ?').run(yesterday);
  db.prepare("INSERT INTO site_visits (day, page, source, n) VALUES (?, '/', 'Google', 5)").run(new Date().toISOString().slice(0, 10));
  db.prepare('UPDATE users SET created_at = ?').run(`${yesterday}T10:00:00.000Z`);
  await t.approved('nuova-oggi@x.it');
  const r2 = (await admin.get('/api/admin/visits?period=30')).body;
  assert.equal(r2.compare.from, new Date().toISOString().slice(0, 10));
  assert.equal(r2.compare.openings, 5);
  assert.equal(r2.compare.signups, 1);
  assert.deepEqual(r.sources[0], { l: 'LinkedIn', v: 2 });
  assert.equal((await a.get('/api/admin/visits')).status, 403);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeClient, startApp } from './helpers.js';

test('groups: Generale and the regions, anyone posts and comments, blocks hide, own deletions', async () => {
  const t = await startApp();
  try {
    const a = await t.approved('gr-a@example.com');
    const b = await t.approved('gr-b@example.com');
    const list = (await a.get('/api/groups')).body.groups;
    assert.equal(list[0].id, 'generale');
    assert.equal(list.filter(g => g.kind === 'region').length, 20);
    assert.equal(list.length, 21, 'Generale and the 20 regions');
    assert.ok(list.some(g => g.id === 'regione-sicilia') && list.some(g => g.id === 'regione-valle-d-aosta'));

    const post = (await a.post('/api/groups/generale/posts', { body: 'Ciao a tutti!' })).body;
    assert.equal(post.mine, true);

    assert.equal((await a.get('/api/groups/generale')).body.posts, 1);

    // b reads and comments, no joining
    let feed = (await b.get('/api/groups/generale/posts')).body;
    assert.equal(feed.items.length, 1);
    const c = (await b.post(`/api/groups/generale/posts/${post.id}/comments`, { body: 'Benvenuto' })).body;
    feed = (await a.get('/api/groups/generale/posts')).body;
    assert.equal(feed.items[0].comments_count, 1);
    assert.equal(feed.items[0].comments[0].author.id, b.id);

    // only your own
    assert.equal((await a.del(`/api/groups/generale/posts/${post.id}/comments/${c.id}`)).status, 403);
    assert.equal((await b.del(`/api/groups/generale/posts/${post.id}`)).status, 403);

    // blocking hides the other person's posts and comments
    await b.post(`/api/blocks/${a.id}`, {});
    assert.equal((await b.get('/api/groups/generale/posts')).body.items.length, 0);
    assert.equal((await a.get('/api/groups/generale/posts')).body.items[0].comments_count, 0);

    assert.equal((await a.del(`/api/groups/generale/posts/${post.id}`)).status, 200);
  } finally { t.close(); }
});

test('group pages are public: readable without an account, in the HTML, in the sitemap; author photos only for writers', async () => {
  const t = await startApp();
  try {
    const a = await t.approved('gp-a@example.com');
    const quiet = await t.approved('gp-q@example.com');
    const anon = makeClient(t.base, '');
    await a.post('/api/groups/regione-sicilia/posts', { body: 'Torno a Catania <a> primavera' });

    const r = await anon.get('/api/public/groups/regione-sicilia');
    assert.equal(r.status, 200);
    const post = r.body.posts.items[0];
    assert.ok(post.author.name && post.author.photo_url);
    assert.deepEqual(Object.keys(post.author).sort(), ['name', 'photo_url'], 'only name and photo');
    assert.equal((await anon.get('/api/groups/regione-sicilia/posts')).status, 401, 'the member API still needs an account');
    assert.equal((await anon.post('/api/groups/regione-sicilia/posts', { body: 'x' })).status, 401, 'writing needs an account');

    const page = await anon.get('/gruppi/regione-sicilia');
    assert.equal(page.status, 200);
    assert.match(page.body, /<title>Sicilia · Gruppi · Rientro<\/title>/);
    assert.match(page.body, /Torno a Catania &lt;a&gt; primavera/, 'in the HTML, escaped');
    assert.equal((await anon.get('/gruppi/non-esiste')).status, 404);
    assert.equal((await fetch(`${t.base}/gruppi`, { redirect: 'manual' })).status, 302, 'the list stays for members');

    assert.match(await (await fetch(`${t.base}/sitemap.xml`)).text(), /\/gruppi\/regione-sicilia</);
    assert.match((await anon.get('/robots.txt')).body, /Sitemap: /);

    assert.equal((await anon.get(post.author.photo_url)).status, 200, 'the writer\'s photo is public');
    const quietPhoto = (await quiet.get('/api/me')).body.profile.photo_url.split('/').pop();
    assert.equal((await anon.get(`/api/public/photos/${quietPhoto}`)).status, 404, 'others\' photos are not');
  } finally { t.close(); }
});

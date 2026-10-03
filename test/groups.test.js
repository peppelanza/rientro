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
    // the author hears about it; then b's comments reach a third commenter too, one notification each
    const notes = async who => (await who.get('/api/notifications')).body.items.filter(n => n.kind === 'group_comment');
    let na = await notes(a);
    assert.equal(na.length, 1);
    assert.deepEqual([na[0].actor.id, na[0].data.post_id, na[0].data.own, na[0].data.group_name], [b.id, post.id, true, 'Generale']);
    const z = await t.approved('gr-z@example.com');
    await z.post(`/api/groups/generale/posts/${post.id}/comments`, { body: 'Ciao!' });
    await b.post(`/api/groups/generale/posts/${post.id}/comments`, { body: 'Ancora io' });
    na = await notes(a);
    assert.equal(na.filter(n => n.actor.id === b.id).length, 1, 'b again: one notification, not two');
    const nz = await notes(z);
    assert.deepEqual(nz.map(n => [n.actor.id, n.data.own]), [[b.id, false]], 'a post z follows');
    assert.equal((await notes(b)).filter(n => n.actor.id === b.id).length, 0, 'never about yourself');
    assert.equal(feed.items[0].comments[0].author.id, b.id);

    // only your own
    assert.equal((await a.del(`/api/groups/generale/posts/${post.id}/comments/${c.id}`)).status, 403);
    assert.equal((await b.del(`/api/groups/generale/posts/${post.id}`)).status, 403);

    // blocking hides the other person's posts and comments
    await b.post(`/api/blocks/${a.id}`, {});
    assert.equal((await b.get('/api/groups/generale/posts')).body.items.length, 0);
    assert.equal((await a.get('/api/groups/generale/posts')).body.items[0].comments_count, 1, 'only z\'s comment, not b\'s two');

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

test('reporting a group post reaches the admins with the post; they can delete it (audited); not your own', async () => {
  const t = await startApp();
  try {
    const a = await t.approved('rp-post-a@example.com');
    const b = await t.approved('rp-post-b@example.com');
    const admin = await t.asAdmin();
    const post = (await a.post('/api/groups/generale/posts', { body: 'Compra il mio corso!' })).body;
    assert.equal((await a.post('/api/reports', { user_id: a.id, reason: 'spam', post_id: post.id })).status, 404, 'not your own');
    assert.equal((await b.post('/api/reports', { user_id: a.id, reason: 'spam', post_id: 999999 })).status, 404);
    assert.equal((await b.post('/api/reports', { user_id: a.id, reason: 'spam', post_id: post.id })).status, 200);
    const r = (await admin.get('/api/admin/reports')).body.reports.find(x => x.reported_id === a.id);
    assert.equal(r.post.body, 'Compra il mio corso!');
    assert.equal(r.post.group, 'Generale');
    assert.match(r.post.href, /\/gruppi\/generale#post-/);
    assert.equal((await admin.del(`/api/admin/reports/${r.id}/post`)).status, 200);
    assert.equal((await b.get('/api/groups/generale/posts')).body.items.length, 0);
    assert.deepEqual((await admin.get('/api/admin/reports')).body.reports.find(x => x.id === r.id).post, { deleted: true });
  } finally { t.close(); }
});

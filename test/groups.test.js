import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp } from './helpers.js';

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

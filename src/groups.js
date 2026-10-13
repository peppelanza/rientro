// Groups, a bit like Facebook groups: Generale and one per region. Anyone with a profile reads, posts
// and comments, no joining; people who blocked each other don't see each other's posts. Same launch
// rules as discovery.
import fs from 'node:fs';
import path from 'node:path';
import { REGIONS } from './catalog.js';
import { config } from './config.js';
import { now, tx } from './db.js';
import { removeFile } from './files.js';
import { fileUrl, isBlocked, rawProfile } from './profiles.js';
import { pageParams, paginate } from './paging.js';
import { hit, terms, wordsOf } from './search.js';
import { nameOf, notify, requireLaunched } from './social.js';
import { HttpError, bad, only, text } from './validate.js';

const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function seedGroups(db) {
  const rows = [
    ['generale', 'Generale', 'general', 'Il gruppo di tutta la community: presentazioni, domande, idee.'],
    // Generale first, then the regions in alphabetical order
    ...[...REGIONS].sort((a, b) => a.localeCompare(b, 'it')).map(r => [`regione-${slug(r)}`, r, 'region', `Chi vive in ${r}, ci torna o vorrebbe tornarci.`]),
  ];
  const upsert = db.prepare(`INSERT INTO groups (id, name, kind, description, position) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, description = excluded.description, position = excluded.position`);
  rows.forEach(([id, name, kind, description], i) => upsert.run(id, name, kind, description, i));
  // groups no longer in the list go, with their posts
  db.prepare(`DELETE FROM groups WHERE id NOT IN (${rows.map(() => '?').join(', ')})`).run(...rows.map(r => r[0]));
}

export function requireMemberArea(user) {
  requireLaunched(user);
  if (user.status !== 'approved') throw new HttpError(403, 'not_approved', 'Completa il profilo per entrare nei gruppi.');
}

function groupOr404(db, id) {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  if (!g) throw new HttpError(404, 'not_found', 'Gruppo non trovato.');
  return g;
}

// Authors hidden from the viewer: blocked either way, or leaving Rientro
const HIDDEN = `(SELECT blocked_id FROM blocks WHERE blocker_id = $viewer UNION SELECT blocker_id FROM blocks WHERE blocked_id = $viewer
  UNION SELECT id FROM users WHERE deletion_requested_at IS NOT NULL OR status = 'suspended')`;

function author(db, id) {
  const p = rawProfile(db, id);
  return { id, name: nameOf(db, id) || 'Membro', photo_url: fileUrl(p?.photo_file_id), role: [p?.current_role, p?.current_company].filter(Boolean).join(' · ') };
}

// The cover over the group: a region's is its Territori picture; Generale's its own (when it's there)
function cover(g) {
  const file = g.kind === 'region' ? `img/territori/${g.id.replace(/^regione-/, '')}.webp` : `img/gruppi/${g.id}.webp`;
  return fs.existsSync(path.join(config.publicDir, file)) ? `/${file}` : null;
}

const summary = (db, g) => ({
  id: g.id, name: g.name, kind: g.kind, description: g.description, cover: cover(g),
  posts: db.prepare('SELECT COUNT(*) AS n FROM group_posts WHERE group_id = ?').get(g.id).n,
  last_post_at: db.prepare('SELECT MAX(created_at) AS at FROM group_posts WHERE group_id = ?').get(g.id).at,
});

export function listGroups(db, viewer) {
  requireMemberArea(viewer);
  return { groups: db.prepare('SELECT * FROM groups ORDER BY position').all().map(g => summary(db, g)) };
}

export function getGroup(db, viewer, id) {
  requireMemberArea(viewer);
  return { ...summary(db, groupOr404(db, id)), following: following(db, viewer.id, id) };
}

// The bell on a group: follow it to hear of its new posts (in the app; by email too, with "Gruppi"
// on in the notification settings)
const following = (db, userId, groupId) => !!db.prepare('SELECT 1 FROM group_follows WHERE user_id = ? AND group_id = ?').get(userId, groupId);
export function setFollow(db, viewer, id, on) {
  requireMemberArea(viewer);
  groupOr404(db, id);
  if (on) db.prepare('INSERT OR IGNORE INTO group_follows (user_id, group_id, created_at) VALUES (?, ?, ?)').run(viewer.id, id, now());
  else db.prepare('DELETE FROM group_follows WHERE user_id = ? AND group_id = ?').run(viewer.id, id);
  return { following: on };
}

const COMMENTS_SHOWN = 3; // under each post; the rest on request
export const MAX_IMAGES = 5;

// A post's pictures, in order (public addresses: the posts are public too)
const imagesOf = (db, postId) => db.prepare('SELECT file_id FROM group_post_images WHERE post_id = ? ORDER BY position').all(postId)
  .map(r => `/api/public/group-images/${r.file_id}`);

// Deleting a post takes its pictures with it (the comments go by cascade)
export function removePost(db, postId) {
  const files = db.prepare('SELECT file_id FROM group_post_images WHERE post_id = ?').all(postId).map(r => r.file_id);
  db.prepare('DELETE FROM group_posts WHERE id = ?').run(postId);
  for (const id of files) removeFile(db, id);
}

// A picture of a post is public while its author is visible
export function publicImageAllowed(db, fileId) {
  return !!db.prepare(`SELECT 1 FROM group_post_images i JOIN group_posts p ON p.id = i.post_id
    WHERE i.file_id = ? AND p.${VISIBLE_AUTHOR}`).get(fileId);
}

function postView(db, viewer, p) {
  const comments = db.prepare(`SELECT * FROM group_comments WHERE post_id = $post AND author_id NOT IN ${HIDDEN} ORDER BY id`)
    .all({ $post: p.id, $viewer: viewer.id });
  return {
    id: p.id, body: p.body, images: imagesOf(db, p.id), created_at: p.created_at, author: author(db, p.author_id), mine: p.author_id === viewer.id,
    comments_count: comments.length,
    comments: comments.slice(-COMMENTS_SHOWN).map(c => commentView(db, viewer, c)),
  };
}
const commentView = (db, viewer, c) => ({ id: c.id, body: c.body, created_at: c.created_at, author: author(db, c.author_id), mine: c.author_id === viewer.id });

// Newest first, 20 per page
export function listPosts(db, viewer, id, query = new URLSearchParams()) {
  requireMemberArea(viewer);
  groupOr404(db, id);
  const rows = db.prepare(`SELECT * FROM group_posts WHERE group_id = $group AND author_id NOT IN ${HIDDEN} ORDER BY id DESC`)
    .all({ $group: id, $viewer: viewer.id });
  return paginate(rows, pageParams(query, 20), p => postView(db, viewer, p));
}

// Search in the groups (the search's "Gruppi" tab: src/search.js): posts and comments by what they say,
// across every group (or one: ?group=), newest first, at most 50. A post found by a comment shows that
// comment.
// --- Search index ----------------------------------------------------------------------------
// Posts and comments by word, in memory, like a search engine's index: a sorted vocabulary where
// the words starting with what was typed are found by binary search, each word pointing to the
// posts and comments that have it. Built once; then only what changed is read again (triggers in
// schema.sql note it in gsearch_dirty). Thousands of posts cost a few lookups per search.
let six = { db: null, items: new Map(), vocab: new Map(), sorted: null };
const keyOf = (kind, id) => `${kind}${id}`;
function addItem(item) {
  six.items.set(item.key, item);
  for (const w of item.words) {
    let set = six.vocab.get(w);
    if (!set) { set = new Set(); six.vocab.set(w, set); six.sorted = null; }
    set.add(item.key);
  }
}
function dropItem(key) {
  const item = six.items.get(key);
  if (!item) return;
  six.items.delete(key);
  for (const w of item.words) {
    const set = six.vocab.get(w);
    set?.delete(key);
    if (set && !set.size) { six.vocab.delete(w); six.sorted = null; }
  }
}
const postItem = r => ({ key: keyOf('p', r.id), kind: 'p', id: r.id, post_id: r.id, group_id: r.group_id, author_id: r.author_id, body: r.body, created_at: r.created_at, words: wordsOf(r.body) });
const commentItem = r => ({ key: keyOf('c', r.id), kind: 'c', id: r.id, post_id: r.post_id, author_id: r.author_id, body: r.body, created_at: r.created_at, words: wordsOf(r.body) });
function searchIndex(db) {
  if (six.db !== db) {
    six = { db, items: new Map(), vocab: new Map(), sorted: null };
    for (const r of db.prepare('SELECT * FROM group_posts').all()) addItem(postItem(r));
    for (const r of db.prepare('SELECT * FROM group_comments').all()) addItem(commentItem(r));
    db.prepare('DELETE FROM gsearch_dirty').run();
    return six;
  }
  const dirty = db.prepare('SELECT id, kind, item_id FROM gsearch_dirty ORDER BY id').all();
  if (!dirty.length) return six;
  for (const d of dirty) {
    dropItem(keyOf(d.kind, d.item_id));
    const r = db.prepare(`SELECT * FROM ${d.kind === 'p' ? 'group_posts' : 'group_comments'} WHERE id = ?`).get(d.item_id);
    if (r) addItem(d.kind === 'p' ? postItem(r) : commentItem(r));
  }
  db.prepare('DELETE FROM gsearch_dirty WHERE id <= ?').run(dirty.at(-1).id);
  return six;
}
// The posts and comments having a word that starts with the term (or, forgiving, nearly)
function keysFor(term, fuzzy) {
  six.sorted ??= [...six.vocab.keys()].sort();
  const words = six.sorted;
  const out = new Set();
  if (!fuzzy) {
    let lo = 0, hi = words.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (words[mid] < term) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < words.length && words[i].startsWith(term); i++) for (const k of six.vocab.get(words[i])) out.add(k);
  } else {
    for (const w of words) if (hit(term, [w], true)) for (const k of six.vocab.get(w)) out.add(k);
  }
  return out;
}

export function searchGroups(db, viewer, query = new URLSearchParams()) {
  requireMemberArea(viewer);
  const ts = terms(query.get('q') || '');
  if (!ts.length) return { items: [] };
  // ?group=: only in that one (the "Gruppo" filter)
  const only = query.get('group') && groupOr404(db, query.get('group')).id;
  const hidden = new Set(db.prepare(HIDDEN.slice(1, -1).replaceAll('$viewer', '?')).all(viewer.id, viewer.id).map(r => Object.values(r)[0]));
  const ix = searchIndex(db);
  const names = new Map(db.prepare('SELECT id, name FROM groups').all().map(g => [g.id, g.name]));
  const run = fuzzy => {
    // item -> how many of the words it has
    const n = new Map();
    for (const t of ts) for (const k of keysFor(t, fuzzy)) n.set(k, (n.get(k) || 0) + 1);
    // post id -> [how many of the words, the comment that says it or null (the post itself)]
    const found = new Map();
    for (const [k, c] of n) {
      const item = ix.items.get(k);
      if (!item || hidden.has(item.author_id)) continue;
      const post = item.kind === 'p' ? item : ix.items.get(keyOf('p', item.post_id));
      if (!post || hidden.has(post.author_id) || (only && post.group_id !== only)) continue;
      const best = found.get(post.id);
      if (!best || c > best[0] || (c === best[0] && item.kind === 'p')) found.set(post.id, [c, item.kind === 'c' ? item : null]);
    }
    // more of the words first, the newest within each
    return [...found.entries()].sort((a, b) => b[1][0] - a[1][0] || b[0] - a[0]).slice(0, 50).map(([id, [, c]]) => {
      const p = ix.items.get(keyOf('p', id));
      return {
        group: { id: p.group_id, name: names.get(p.group_id) }, post_id: p.id,
        author: author(db, (c || p).author_id), text: (c || p).body, in_comment: !!c, created_at: (c || p).created_at,
      };
    });
  };
  let items = run(false);
  let fuzzy = false;
  if (!items.length) { items = run(true); fuzzy = true; }
  return { items, fuzzy };
}

export function createPost(db, viewer, id, body) {
  requireMemberArea(viewer);
  groupOr404(db, id);
  only(body, ['body', 'images']);
  // Up to 5 pictures, uploaded beforehand by the author (/api/groups/images) and not used yet
  const images = Array.isArray(body.images) ? body.images.map(String) : [];
  if (images.length > MAX_IMAGES || new Set(images).size !== images.length) throw bad('images', `Al massimo ${MAX_IMAGES} foto.`);
  for (const f of images) {
    const ok = db.prepare("SELECT 1 FROM files WHERE id = ? AND owner_id = ? AND kind = 'group_image' AND id NOT IN (SELECT file_id FROM group_post_images)").get(f, viewer.id);
    if (!ok) throw bad('images', 'Una delle foto non è più disponibile: caricala di nuovo.');
  }
  // With pictures the text can be empty
  const msg = (text(body.body, 'Post', { max: 4000 }) ?? '').trim();
  if (!msg && !images.length) throw bad('body', 'Scrivi qualcosa o aggiungi una foto.');
  const postId = tx(db, () => {
    const r = db.prepare('INSERT INTO group_posts (group_id, author_id, body, created_at) VALUES (?, ?, ?, ?)').run(id, viewer.id, msg, now());
    const pid = Number(r.lastInsertRowid);
    images.forEach((f, i) => db.prepare('INSERT INTO group_post_images (post_id, file_id, position) VALUES (?, ?, ?)').run(pid, f, i));
    return pid;
  });
  notifyPost(db, viewer, id, postId);
  return postView(db, viewer, db.prepare('SELECT * FROM group_posts WHERE id = ?').get(postId));
}

// A new post tells whoever follows the group (not its author, nor people blocked either way). One
// notification per person, group and author: a new post replaces an unread one.
function notifyPost(db, viewer, groupId, postId) {
  const g = db.prepare('SELECT name FROM groups WHERE id = ?').get(groupId);
  const followers = db.prepare('SELECT user_id FROM group_follows WHERE group_id = ? AND user_id != ?').all(groupId, viewer.id).map(r => r.user_id);
  for (const userId of followers) {
    if (isBlocked(db, userId, viewer.id)) continue;
    db.prepare(`DELETE FROM notifications WHERE user_id = ? AND kind = 'group_post' AND actor_id = ? AND read_at IS NULL
      AND json_extract(data, '$.group_id') = ?`).run(userId, viewer.id, groupId);
    notify(db, userId, 'group_post', viewer.id, { group_id: groupId, group_name: g?.name, post_id: postId });
  }
}

function postOr404(db, viewer, groupId, postId) {
  const p = db.prepare(`SELECT * FROM group_posts WHERE id = $id AND group_id = $group AND author_id NOT IN ${HIDDEN}`)
    .get({ $id: Number(postId), $group: groupId, $viewer: viewer.id });
  if (!p) throw new HttpError(404, 'not_found', 'Post non trovato.');
  return p;
}

// One post with all its comments (a post opened from the search)
export function getPost(db, viewer, id, postId) {
  requireMemberArea(viewer);
  const p = postOr404(db, viewer, id, postId);
  return { ...postView(db, viewer, p), ...listComments(db, viewer, id, postId) };
}

export function listComments(db, viewer, id, postId) {
  requireMemberArea(viewer);
  const p = postOr404(db, viewer, id, postId);
  const rows = db.prepare(`SELECT * FROM group_comments WHERE post_id = $post AND author_id NOT IN ${HIDDEN} ORDER BY id`)
    .all({ $post: p.id, $viewer: viewer.id });
  return { comments: rows.map(c => commentView(db, viewer, c)) };
}

export function createComment(db, viewer, id, postId, body) {
  requireMemberArea(viewer);
  const p = postOr404(db, viewer, id, postId);
  only(body, ['body']);
  const msg = text(body.body, 'Commento', { max: 2000, nullable: false });
  const r = db.prepare('INSERT INTO group_comments (post_id, author_id, body, created_at) VALUES (?, ?, ?, ?)').run(p.id, viewer.id, msg, now());
  notifyComment(db, viewer, p);
  return commentView(db, viewer, db.prepare('SELECT * FROM group_comments WHERE id = ?').get(Number(r.lastInsertRowid)));
}

// A comment tells the post's author and whoever commented on it before (not the commenter, nor people
// blocked either way). One notification per person, post and commenter: a new comment replaces an
// unread one, so a burst of comments doesn't flood the bell.
function notifyComment(db, viewer, p) {
  const g = db.prepare('SELECT name FROM groups WHERE id = ?').get(p.group_id);
  const others = db.prepare('SELECT DISTINCT author_id FROM group_comments WHERE post_id = ? AND author_id != ?').all(p.id, p.author_id).map(r => r.author_id);
  for (const userId of new Set([p.author_id, ...others])) {
    if (userId === viewer.id || isBlocked(db, userId, viewer.id)) continue;
    db.prepare(`DELETE FROM notifications WHERE user_id = ? AND kind = 'group_comment' AND actor_id = ? AND read_at IS NULL
      AND json_extract(data, '$.post_id') = ?`).run(userId, viewer.id, p.id);
    notify(db, userId, 'group_comment', viewer.id, { group_id: p.group_id, group_name: g?.name, post_id: p.id, own: userId === p.author_id });
  }
}

// Your own posts and comments; admins any (moderation)
export function deletePost(db, viewer, id, postId) {
  requireMemberArea(viewer);
  const p = postOr404(db, viewer, id, postId);
  if (p.author_id !== viewer.id && viewer.role !== 'admin') throw new HttpError(403, 'forbidden', 'Puoi eliminare solo i tuoi post.');
  removePost(db, p.id);
  return { ok: true };
}

export function deleteComment(db, viewer, id, postId, commentId) {
  requireMemberArea(viewer);
  const p = postOr404(db, viewer, id, postId);
  const c = db.prepare('SELECT * FROM group_comments WHERE id = ? AND post_id = ?').get(Number(commentId), p.id);
  if (!c) throw new HttpError(404, 'not_found', 'Commento non trovato.');
  if (c.author_id !== viewer.id && viewer.role !== 'admin') throw new HttpError(403, 'forbidden', 'Puoi eliminare solo i tuoi commenti.');
  db.prepare('DELETE FROM group_comments WHERE id = ?').run(c.id);
  return { ok: true };
}

// --- Public: group pages are open to anyone and indexed by search engines (no link to them from the
// public site; the sitemap lists them). Next to posts and comments only the author's name and photo;
// the profile itself is for members.

const VISIBLE_AUTHOR = `author_id IN (SELECT u.id FROM users u WHERE u.status = 'approved' AND u.deletion_requested_at IS NULL)`;

function publicAuthor(db, id) {
  const p = rawProfile(db, id);
  return { name: nameOf(db, id) || 'Membro', photo_url: p?.photo_file_id ? `/api/public/photos/${p.photo_file_id}` : null };
}

export function publicGroup(db, id, query = new URLSearchParams()) {
  const g = groupOr404(db, id);
  const rows = db.prepare(`SELECT * FROM group_posts WHERE group_id = ? AND ${VISIBLE_AUTHOR} ORDER BY id DESC`).all(id);
  const posts = paginate(rows, pageParams(query, 20), p => {
    const comments = db.prepare(`SELECT * FROM group_comments WHERE post_id = ? AND ${VISIBLE_AUTHOR} ORDER BY id`).all(p.id)
      .map(c => ({ id: c.id, body: c.body, created_at: c.created_at, author: publicAuthor(db, c.author_id) }));
    return { id: p.id, body: p.body, images: imagesOf(db, p.id), created_at: p.created_at, author: publicAuthor(db, p.author_id), comments_count: comments.length, comments };
  });
  return { group: summary(db, g), posts };
}

// A profile photo is public only while its owner has written something in a group
export function publicPhotoAllowed(db, fileId) {
  return !!db.prepare(
    `SELECT 1 FROM profiles p JOIN users u ON u.id = p.user_id
     WHERE p.photo_file_id = ? AND u.status = 'approved' AND u.deletion_requested_at IS NULL
       AND (EXISTS (SELECT 1 FROM group_posts WHERE author_id = p.user_id) OR EXISTS (SELECT 1 FROM group_comments WHERE author_id = p.user_id))`,
  ).get(fileId);
}

export const groupIds = db => db.prepare('SELECT id FROM groups ORDER BY position').all().map(g => g.id);

// The page's content written into the HTML for search engines and first paint (the app takes over)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function groupPageHtml(db, id) {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  if (!g) return null;
  const { posts } = publicGroup(db, id);
  const first = posts.items[0]?.body;
  const description = `${g.description}${first ? ` ${first.slice(0, 120)}` : ''}`;
  // (styled by class: the site's security policy doesn't allow inline styles)
  const body = `<main class="ssr-group">
<h1>${esc(g.name)} · Gruppi di Rientro</h1><p>${esc(g.description)}</p>
${posts.items.map(p => `<article><p><strong>${esc(p.author.name)}</strong></p><p class="ssr-body">${esc(p.body)}</p>${p.images.map(src => `<img src="${src}" alt="Foto di ${esc(p.author.name)}">`).join('')}${p.comments.map(c => `<p><strong>${esc(c.author.name)}</strong>: ${esc(c.body)}</p>`).join('')}</article>`).join('\n')}
</main>`;
  return { title: `${g.name} · Gruppi · Rientro`, description, body };
}

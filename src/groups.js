// Groups, a bit like Facebook groups: Generale and one per region. Anyone with a profile reads, posts
// and comments, no joining; people who blocked each other don't see each other's posts. Same launch
// rules as discovery.
import { REGIONS } from './catalog.js';
import { now } from './db.js';
import { fileUrl, rawProfile } from './profiles.js';
import { pageParams, paginate } from './paging.js';
import { requireLaunched, nameOf } from './social.js';
import { HttpError, only, text } from './validate.js';

const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function seedGroups(db) {
  const rows = [
    ['generale', 'Generale', 'general', 'Il gruppo di tutta la community: presentazioni, domande, idee.'],
    ...REGIONS.map(r => [`regione-${slug(r)}`, r, 'region', `Chi vive in ${r}, ci torna o vorrebbe tornarci.`]),
  ];
  const upsert = db.prepare(`INSERT INTO groups (id, name, kind, description, position) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, description = excluded.description, position = excluded.position`);
  rows.forEach(([id, name, kind, description], i) => upsert.run(id, name, kind, description, i));
  // groups no longer in the list go, with their posts
  db.prepare(`DELETE FROM groups WHERE id NOT IN (${rows.map(() => '?').join(', ')})`).run(...rows.map(r => r[0]));
}

function requireMemberArea(user) {
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

const summary = (db, g) => ({
  id: g.id, name: g.name, kind: g.kind, description: g.description,
  posts: db.prepare('SELECT COUNT(*) AS n FROM group_posts WHERE group_id = ?').get(g.id).n,
  last_post_at: db.prepare('SELECT MAX(created_at) AS at FROM group_posts WHERE group_id = ?').get(g.id).at,
});

export function listGroups(db, viewer) {
  requireMemberArea(viewer);
  return { groups: db.prepare('SELECT * FROM groups ORDER BY position').all().map(g => summary(db, g)) };
}

export function getGroup(db, viewer, id) {
  requireMemberArea(viewer);
  return summary(db, groupOr404(db, id));
}

const COMMENTS_SHOWN = 3; // under each post; the rest on request

function postView(db, viewer, p) {
  const comments = db.prepare(`SELECT * FROM group_comments WHERE post_id = $post AND author_id NOT IN ${HIDDEN} ORDER BY id`)
    .all({ $post: p.id, $viewer: viewer.id });
  return {
    id: p.id, body: p.body, created_at: p.created_at, author: author(db, p.author_id), mine: p.author_id === viewer.id,
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

export function createPost(db, viewer, id, body) {
  requireMemberArea(viewer);
  groupOr404(db, id);
  only(body, ['body']);
  const msg = text(body.body, 'Post', { max: 4000, nullable: false });
  const r = db.prepare('INSERT INTO group_posts (group_id, author_id, body, created_at) VALUES (?, ?, ?, ?)').run(id, viewer.id, msg, now());
  return postView(db, viewer, db.prepare('SELECT * FROM group_posts WHERE id = ?').get(Number(r.lastInsertRowid)));
}

function postOr404(db, viewer, groupId, postId) {
  const p = db.prepare(`SELECT * FROM group_posts WHERE id = $id AND group_id = $group AND author_id NOT IN ${HIDDEN}`)
    .get({ $id: Number(postId), $group: groupId, $viewer: viewer.id });
  if (!p) throw new HttpError(404, 'not_found', 'Post non trovato.');
  return p;
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
  return commentView(db, viewer, db.prepare('SELECT * FROM group_comments WHERE id = ?').get(Number(r.lastInsertRowid)));
}

// Your own posts and comments; admins any (moderation)
export function deletePost(db, viewer, id, postId) {
  requireMemberArea(viewer);
  const p = postOr404(db, viewer, id, postId);
  if (p.author_id !== viewer.id && viewer.role !== 'admin') throw new HttpError(403, 'forbidden', 'Puoi eliminare solo i tuoi post.');
  db.prepare('DELETE FROM group_posts WHERE id = ?').run(p.id);
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

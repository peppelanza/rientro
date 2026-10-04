// Email notifications, the smart way: nothing is sent while the member is looking. A connection
// request, a message or news from the groups (a post in one followed, a reply) waits DELAY in the app; if it's still unread by then, one email goes out
// with everything unread and not yet emailed (several people, several messages: one email).
// Runs every minute from server.js. Each notification is emailed at most once (emailed_at).
import { canSendEmail, digestEmail, sendEmail } from './mail.js';
import { getCommunicationPreferences } from './preferences.js';
import { nameOf } from './social.js';
import { now } from './db.js';

export const DIGEST_DELAY_MINUTES = 15;
// Older than this and still unread when email comes back (e.g. a provider outage): not worth a mail
const MAX_AGE_HOURS = 24;
const KIND_PREF = {
  connection_request: 'notify_requests_email', message: 'notify_messages_email',
  group_post: 'notify_groups_email', group_comment: 'notify_groups_email', // groups followed; replies to my posts and comments
};
const KINDS = Object.keys(KIND_PREF).map(k => `'${k}'`).join(', ');
const preview = s => (s.length > 140 ? `${s.slice(0, 139)}…` : s);

export async function sendNotificationDigests(db, { send = sendEmail, at = Date.now() } = {}) {
  if (send === sendEmail && !canSendEmail()) return { sent: 0 };
  const due = new Date(at - DIGEST_DELAY_MINUTES * 60_000).toISOString();
  const oldest = new Date(at - MAX_AGE_HOURS * 3600_000).toISOString();
  // People with at least one notification that has waited long enough
  const users = db.prepare(
    `SELECT DISTINCT u.id, u.email FROM notifications n JOIN users u ON u.id = n.user_id
     WHERE n.kind IN (${KINDS}) AND n.read_at IS NULL AND n.emailed_at IS NULL
       AND n.created_at <= ? AND n.created_at >= ? AND u.status != 'suspended' AND u.deletion_requested_at IS NULL`,
  ).all(due, oldest);
  let sent = 0;
  for (const u of users) {
    const prefs = getCommunicationPreferences(db, u.id);
    const pending = db.prepare(
      `SELECT * FROM notifications WHERE user_id = ? AND kind IN (${KINDS})
       AND read_at IS NULL AND emailed_at IS NULL AND created_at >= ? ORDER BY id`,
    ).all(u.id, oldest);
    const wanted = pending.filter(n => prefs[KIND_PREF[n.kind]]);
    const requests = [];
    const messages = [];
    const groups = [];
    for (const n of wanted) {
      if (!n.actor_id) continue;
      if (n.kind === 'connection_request') {
        const c = db.prepare("SELECT note FROM connections WHERE id = ? AND status = 'pending'").get(JSON.parse(n.data).connection_id);
        if (c) requests.push({ name: nameOf(db, n.actor_id) || 'Un membro', note: c.note });
      } else if (n.kind === 'group_post' || n.kind === 'group_comment') {
        // Only while the post (and the comment) are still there
        const d = JSON.parse(n.data);
        const post = db.prepare('SELECT body FROM group_posts WHERE id = ?').get(d.post_id);
        const said = n.kind === 'group_post' ? post?.body
          : db.prepare('SELECT body FROM group_comments WHERE post_id = ? AND author_id = ? ORDER BY id DESC LIMIT 1').get(d.post_id, n.actor_id)?.body;
        if (!post || said === undefined) continue;
        const name = nameOf(db, n.actor_id) || 'Un membro';
        groups.push({
          title: n.kind === 'group_post' ? `${name} ha pubblicato in ${d.group_name}` : `${name} ha commentato ${d.own ? 'il tuo post' : 'un post che segui'} in ${d.group_name}`,
          preview: said ? preview(said) : '', href: `/gruppi/${d.group_id}#post-${d.post_id}`,
        });
      } else {
        // Only what is still unread in the chat itself
        const unread = db.prepare('SELECT body FROM messages WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL ORDER BY id').all(n.actor_id, u.id);
        if (!unread.length) continue;
        const name = nameOf(db, n.actor_id) || 'Un membro';
        const last = unread.at(-1).body;
        messages.push({ id: n.actor_id, name, first: name.split(' ')[0], count: unread.length, preview: preview(last) });
      }
    }
    if (requests.length || messages.length || groups.length) {
      try {
        await send({ to: u.email, ...digestEmail({ requests, messages, groups }) });
        sent++;
      } catch (err) {
        console.error('[digest]', u.id, err.message);
        continue; // tried again at the next run
      }
    }
    // Everything looked at is done: emailed, switched off in the settings, or already read in the chat
    const mark = db.prepare('UPDATE notifications SET emailed_at = ? WHERE id = ?');
    for (const n of pending) mark.run(now(), n.id);
  }
  return { sent };
}

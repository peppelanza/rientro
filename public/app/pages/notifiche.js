// Notifications (design 04 · 36a pannello, 36b mobile). Opening the page marks everything read,
// but items keep their "new" styling until the next visit.
import { api, getMe, go, timeAgo, toast } from '../lib.js';
import { describeNotification as describe, notificationInitials as ini } from '../notifications.js';
import { Page } from './_base.js';

export const title = 'Notifiche';
export const tabbar = true;

export default class extends Page {
  async load() {
    this.state.me = await getMe();
    this.state.items = await api('GET', '/api/notifications');
    if (this.state.items.some(n => !n.read)) {
      await api('POST', '/api/notifications/read');
      this.state.me.counts.notifications = 0;
    }
  }

  accept(n) {
    return this.act(async () => {
      try {
        await api('POST', `/api/connections/${n.data.connection_id}/accept`);
        n.done = true;
        toast(`Ora sei connesso con ${n.actor.first_name}.`, { action: 'Apri chat', onAction: () => go(`/messaggi/${n.actor.id}`) });
      } catch (err) { toast(err.status === 404 ? 'Richiesta non più disponibile.' : err.message, { tone: 'err' }); n.done = true; }
    })();
  }

  renderVals() {
    const s = this.state;
    if (!s.items) return { loading: true, me: s.me || {} };
    const map = n => {
      const d = describe(n);
      return {
        ...d, hasWho: !!d.who, hasText: !!d.text, photo: n.actor?.photo_url, ini: ini(n.actor?.name), isPerson: !!n.actor && !d.icon, isIcon: !!d.icon,
        when: timeAgo(n.created_at), bg: n.read ? 'transparent' : '#EFEBFF', fg: n.read ? '#4A4560' : '#1A1726', unread: !n.read,
        isRequest: n.kind === 'connection_request' && !n.done && !n.read, accept: () => this.accept(n), profile: () => go(`/persone/${n.actor.id}`),
        open: e => { if (e.target.closest('button,[role=button]') || !d.href) return; go(d.href); },
      };
    };
    const fresh = s.items.filter(n => !n.read).map(map);
    const old = s.items.filter(n => n.read).map(map);
    return {
      loading: false, me: s.me, empty: !s.items.length, fresh, old, hasFresh: fresh.length > 0, hasOld: old.length > 0,
    };
  }
}

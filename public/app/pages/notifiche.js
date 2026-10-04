// Notifications (design 04 · 36a pannello, 36b mobile). Opening the page marks everything read,
// but items keep their "new" styling until the next visit.
import { api, getMe, go, timeAgo, toast } from '../lib.js';
import { describeNotification as describe, notificationInitials as ini } from '../notifications.js';
import { Page } from './_base.js';

export const title = 'Notifiche';
export const tabbar = true;

// Loading: the page as it will be (pages/_base.js skeleton())
const FAKE = Array.from({ length: 6 }, (_, i) => ({ id: -i, kind: 'message', read: true, created_at: new Date().toISOString(), data: {}, actor: { id: '', name: 'Nome Cognome' } }));

export default class extends Page {
  async load() {
    this.state.me = await getMe();
    this.__rerender(); // the top bar for real, the list still a skeleton
    this.state.page = Math.max(1, Number(new URLSearchParams(location.search).get('page')) || 1);
    await this.fetch();
  }

  // 20 per page, newest first; opening a page marks everything read
  async fetch() {
    const r = await api('GET', `/api/notifications?page=${this.state.page}`);
    Object.assign(this.state, { list: r, items: r.items, page: r.page });
    if (r.unread) {
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
    if (!s.items) return this.skeleton({ items: FAKE, list: { total: 6, page: 1, pages: 1, per_page: 20 } });
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
      loading: false, me: s.me, empty: !s.list.total, fresh, old, hasFresh: fresh.length > 0, hasOld: old.length > 0,
      page: s.list.page, pages: s.list.pages, total: s.list.total, perPage: s.list.per_page,
      pagerProps: { onPage: n => this.act(async () => {
        s.page = n;
        history.replaceState(null, '', n > 1 ? `/notifiche?page=${n}` : '/notifiche');
        await this.fetch();
        scrollTo({ top: 0, behavior: 'smooth' });
      })() },
    };
  }
}

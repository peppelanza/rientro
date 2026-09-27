// Notifications (design 04 · 36a pannello, 36b mobile). Opening the page marks everything read,
// but items keep their "new" styling until the next visit.
import { api, getMe, go, timeAgo, toast } from '../lib.js';
import { Page } from './_base.js';

export const title = 'Notifiche';
export const tabbar = true;

const ini = n => (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2);

function describe(n) {
  const who = n.actor?.name || 'Un membro';
  switch (n.kind) {
    case 'connection_request': return { who, rest: ' vuole entrare in contatto con te.', href: `/connessioni/${n.data.connection_id}` };
    case 'connection_accepted': return { who, rest: ' ha accettato la tua richiesta.', href: `/messaggi/${n.actor?.id}` };
    case 'message': return { who, rest: n.data.preview ? ` ti ha scritto: “${n.data.preview}”` : ' ti ha scritto.', href: `/messaggi/${n.actor?.id}` };
    case 'profile_approved': return { text: n.data.changes_only ? 'Le modifiche al tuo profilo sono online.' : 'Il tuo profilo è stato approvato ed è online.', icon: '✓', ibg: '#E3F5EC', ifg: '#1F7A4F', href: '/profilo' };
    case 'profile_changes_requested': return { text: n.data.note ? `Ci serve una modifica al profilo: ${n.data.note}` : 'Ci serve una modifica al profilo.', icon: '!', ibg: '#FFF4DC', ifg: '#7A4E00', href: '/stato' };
    case 'profile_rejected': return { text: 'Il tuo profilo non è stato approvato.', icon: '!', ibg: '#FDE8E8', ifg: '#912018', href: '/stato' };
    default: return { text: 'Aggiornamento dal team Rientro.', icon: 'i', ibg: '#EFEBFF', ifg: '#3E2BA8', href: null };
  }
}

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

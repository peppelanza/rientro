// Admin · Supporto (src/support.js): the members' tickets, open ones first (those waiting for an
// answer on top), and a ticket's chat (/admin/supporto/<id>), where the team answers, closes or
// reopens it. Opening, answering, closing are in the access log.
import { api, fmtShort, fmtTime, go, timeAgo, toast } from '../../lib.js';
import { AdminPage, initials } from './_admin.js';

export const title = 'Supporto · Admin';
const POLL_MS = 15000;

export default class extends AdminPage {
  async loadAdmin() {
    const id = this.props.params.id;
    Object.assign(this.state, { tab: 'open', draft: '' });
    if (id) {
      this.state.ticket = await api('GET', `/api/admin/support/${encodeURIComponent(id)}`);
      this.timer = setInterval(() => this.poll(), POLL_MS);
    } else await this.fetch();
  }

  componentWillUnmount() { clearInterval(this.timer); }

  listPath = '/api/admin/support';
  listExtra() { return { status: this.state.tab }; }
  async fetch() { await this.fetchList(); this.state.d = this.state.list; }

  async poll() {
    const t = this.state.ticket;
    if (!t || document.hidden) return;
    const fresh = await api('GET', `/api/admin/support/${t.id}`).catch(() => null);
    if (fresh && fresh.messages.length !== t.messages.length) { this.state.ticket = fresh; this.__rerender(); }
  }

  reply = this.act(async () => {
    const s = this.state;
    if (!s.draft.trim()) return;
    s.ticket = await api('POST', `/api/admin/support/${s.ticket.id}`, { body: s.draft.trim() });
    s.draft = '';
    await this.refreshCounts();
  });

  setStatus(status) {
    return this.act(async () => {
      this.state.ticket = await api('POST', `/api/admin/support/${this.state.ticket.id}/status`, { status });
      toast(status === 'closed' ? 'Ticket chiuso.' : 'Ticket riaperto.');
      await this.refreshCounts();
    })();
  }

  didRender(el) {
    if (this.state.ticket) el.querySelector('.support-end')?.scrollIntoView({ block: 'end' });
  }

  renderVals() {
    const s = this.state;
    const t = s.ticket;
    if (t) {
      return {
        loading: false, side: this.side('supporto'), isTicket: true,
        code: `#${t.code}`, subject: t.subject, user: t.user.name || t.user.email, email: t.user.email, userHref: `/admin/utenti/${t.user.id}`,
        opened: `${fmtShort(t.created_at)} ${fmtTime(t.created_at)}`, closed: t.status === 'closed', open: t.status === 'open',
        messages: t.messages.map(m => ({ from: m.mine ? 'me' : 'them', body: m.body, who: m.from_team ? 'Team Rientro' : (t.user.name || 'Membro'), at: `${fmtShort(m.created_at)} ${fmtTime(m.created_at)}`, align: m.mine ? 'flex-end' : 'flex-start' })),
        draft: s.draft, draftProps: { onInput: v => { s.draft = v; } }, reply: this.reply,
        close: () => this.setStatus('closed'), reopen: () => this.setStatus('open'),
      };
    }
    if (!s.d) return { loading: true, side: this.side('supporto') };
    const { d } = s;
    const tab = (k, l) => ({ l, tone: s.tab === k ? 'selected' : 'default', on: s.tab === k ? 'true' : 'false', fn: () => this.act(async () => { Object.assign(s, { tab: k, page: 1 }); await this.fetch(); })() });
    return {
      loading: false, side: this.side('supporto'), isList: true, ...this.listVals(),
      tOpen: tab('open', `Aperti · ${d.counts.open}`), tClosed: tab('closed', `Chiusi · ${d.counts.closed}`),
      empty: !d.items.length, emptyText: s.q ? `Nessun risultato per “${s.q}”.` : s.tab === 'open' ? 'Nessun ticket aperto.' : 'Nessun ticket chiuso.',
      tickets: d.items.map(x => ({
        code: `#${x.code}`, subject: x.subject, last: x.last, who: x.user.name || x.user.email, ini: initials(x.user.name || x.user.email),
        when: timeAgo(x.updated_at), waiting: x.waiting, unread: x.unread, open: () => go(`/admin/supporto/${x.id}`),
      })),
    };
  }
}

// Connections (design 04 · 32a connessioni, 32b inviate, 33a stato vuoto).
import { api, debounce, fmtShort, getMe, go, qs, timeAgo, toast } from '../lib.js';
import { homeFor, Page } from './_base.js';

export const title = 'Connessioni';
export const tabbar = true;

const ini = n => n.split(' ').map(w => w[0]).join('').slice(0, 2);
const API_TAB = { connessioni: 'connected', ricevute: 'received', inviate: 'sent' };

// Loading: the page as it will be (pages/_base.js skeleton()), one placeholder person in the open tab
const FAKE = i => ({
  id: `sk${i}`, name: 'Nome Cognome', first_name: 'Nome', role: 'Ruolo · Azienda', from: 'Città', to: 'Città', since: new Date().toISOString(),
  created_at: new Date().toISOString(), note: 'Una breve nota per presentarsi.', photo_url: null, age: '30–34',
  seeks: 'Prodotto', tags: 'Settore · Settore', time: 'Full-time', comp: '', intent: 'networking', connection: null,
});
const skeletonState = s => {
  const c = s.me?.counts || {};
  return { data: { counts: { connected: c.connections || 1, received: c.received || 0, sent: 0 }, items: [FAKE(0)], page: 1, pages: 1, total: 1, per_page: 20 } };
};

export default class extends Page {
  async load() {
    const me = await getMe();
    if (me.user.status !== 'approved' || (!me.launched && me.user.role !== 'admin')) return go(homeFor(me));
    this.state.me = me;
    // Requests waiting for an answer come first: with any, /connessioni opens on "Ricevute"
    const asked = qs().get('tab');
    this.state.tab = ['ricevute', 'inviate', 'connessioni'].includes(asked) ? asked : me.counts?.received ? 'ricevute' : 'connessioni';
    this.state.q = '';
    this.state.page = 1;
    this.__rerender(); // the top bar and the tabs for real, the list still a skeleton
    await this.fetch();
  }

  // One tab at a time, searchable, 20 per page (src/social.js listConnections)
  async fetch() {
    const s = this.state;
    const q = new URLSearchParams({ tab: API_TAB[s.tab], page: String(s.page) });
    if (s.q) q.set('q', s.q);
    s.data = await api('GET', `/api/connections?${q}`);
    s.page = s.data.page;
  }

  load2(patch, { scroll = false } = {}) {
    return this.act(async () => {
      Object.assign(this.state, patch);
      await this.fetch();
      if (scroll) scrollTo({ top: 0, behavior: 'smooth' });
    })();
  }

  setTab(tab) {
    history.replaceState(null, '', `/connessioni?tab=${tab}`);
    this.load2({ tab, page: 1 });
  }

  searchTyped = debounce(v => { if (v.trim() !== this.state.q) this.load2({ q: v.trim(), page: 1 }); });

  respond(c, action) {
    return this.act(async () => {
      await api('POST', `/api/connections/${c.connection_id}/${action}`);
      if (action === 'accept') toast(`Ora sei connesso con ${c.first_name}.`, { action: 'Apri chat', onAction: () => go(`/messaggi/${c.id}`) });
      await this.fetch();
    })();
  }

  renderVals() {
    const s = this.state;
    if (!s.data) return this.skeleton(skeletonState(s));
    const d = s.data;
    const counts = d.counts;
    const items = d.items;
    const empty = !counts.connected && !counts.received && !counts.sent;
    // a person's card, the same in the three tabs
    const card = c => ({
      name: c.name, role: [c.role.split(' · ')[0], c.from && c.to ? `${c.from} → ${c.to}` : c.from].filter(Boolean).join(' · '),
      photo: c.photo_url, ini: ini(c.name), href: `/persone/${c.id}?da=${s.tab}`, note: c.note ? `“${c.note}”` : '', when: timeAgo(c.created_at).toUpperCase(),
    });
    const none = s.q ? `Nessun risultato per “${s.q}”.` : '';
    // A count only when there is something to count
    const tabs = [['connessioni', counts.connected ? `Connessioni · ${counts.connected}` : 'Connessioni', 0], ['ricevute', 'Ricevute', counts.received], ['inviate', counts.sent ? `Inviate · ${counts.sent}` : 'Inviate', 0]]
      .map(([k, l, n]) => ({ l, count: n || 0, tone: s.tab === k ? 'selected' : 'default', on: s.tab === k ? 'true' : 'false', fn: () => this.setTab(k) }));
    return {
      loading: false, me: s.me, empty, notEmpty: !empty, tabs,
      isConn: s.tab === 'connessioni', isRec: s.tab === 'ricevute', isSent: s.tab === 'inviate',
      // search and pages
      q: s.q, searchProps: { onInput: v => this.searchTyped(v), onEnter: v => this.load2({ q: v.trim(), page: 1 }) },
      page: d.page, pages: d.pages, total: d.total, perPage: d.per_page, pagerProps: { onPage: n => this.load2({ page: n }, { scroll: true }) },
      noneLabel: none,
      conns: (s.tab === 'connessioni' ? items : []).map(c => ({ ...card(c), since: fmtShort(c.since).toUpperCase(), msg: () => go(`/messaggi/${c.id}?da=connessioni`) })),
      noConns: s.tab === 'connessioni' && !items.length, noConnsLabel: none || 'Nessuna connessione accettata per ora.',
      // Ricevute and Inviate: the same cards as Connessioni, with the note and the answer
      received: (s.tab === 'ricevute' ? items : []).map(c => ({
        ...card(c), aria: `Richiesta di ${c.name}`, accept: () => this.respond(c, 'accept'), decline: () => this.respond(c, 'decline'),
      })),
      noReceived: s.tab === 'ricevute' && !items.length, noReceivedLabel: none || 'Nessuna richiesta in attesa.',
      sent: (s.tab === 'inviate' ? items : []).map(c => ({ ...card(c), aria: `Richiesta a ${c.name}`, withdraw: () => this.respond(c, 'withdraw') })),
      noSent: s.tab === 'inviate' && !items.length, noSentLabel: none || 'Nessuna richiesta inviata in attesa.',
      discover: () => go('/scopri'),
    };
  }
}

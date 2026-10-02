// Connections (design 04 · 32a connessioni, 32b inviate, 33a stato vuoto).
import { api, debounce, fmtShort, getMe, go, qs, timeAgo, toast } from '../lib.js';
import { homeFor, Page } from './_base.js';

export const title = 'Connessioni';
export const tabbar = true;

const ini = n => n.split(' ').map(w => w[0]).join('').slice(0, 2);
const API_TAB = { connessioni: 'connected', ricevute: 'received', inviate: 'sent' };

export default class extends Page {
  async load() {
    const me = await getMe();
    if (me.user.status !== 'approved' || (!me.launched && me.user.role !== 'admin')) return go(homeFor(me));
    this.state.me = me;
    this.state.tab = ['ricevute', 'inviate'].includes(qs().get('tab')) ? qs().get('tab') : 'connessioni';
    this.state.q = '';
    this.state.page = 1;
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
    history.replaceState(null, '', tab === 'connessioni' ? '/connessioni' : `/connessioni?tab=${tab}`);
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
    if (!s.data) return { loading: true, me: s.me || {} };
    const d = s.data;
    const counts = d.counts;
    const items = d.items;
    // The banner shows the first received requests, whatever the tab
    const received = d.received_preview;
    const nReceived = counts.received;
    const empty = !counts.connected && !counts.received && !counts.sent;
    const none = s.q ? `Nessun risultato per “${s.q}”.` : '';
    const tabs = [['connessioni', `Connessioni · ${counts.connected}`, 0], ['ricevute', 'Ricevute', counts.received], ['inviate', `Inviate · ${counts.sent}`, 0]]
      .map(([k, l, n]) => ({ l, count: n || 0, tone: s.tab === k ? 'selected' : 'default', on: s.tab === k ? 'true' : 'false', fn: () => this.setTab(k) }));
    const names = received.slice(0, 2).map(r => r.first_name);
    return {
      loading: false, me: s.me, empty, notEmpty: !empty, tabs,
      isConn: s.tab === 'connessioni', isRec: s.tab === 'ricevute', isSent: s.tab === 'inviate',
      showBanner: s.tab === 'connessioni' && nReceived > 0 && !s.q,
      bannerPhotos: received.slice(0, 2).map(r => ({ src: r.photo_url, ini: ini(r.name) })),
      bannerA: names[0], bannerB: nReceived === 2 ? names[1] : nReceived > 2 ? `altre ${nReceived - 1} persone` : '',
      bannerTwo: nReceived > 1, bannerVerb: nReceived > 1 ? 'vogliono' : 'vuole',
      openReceived: () => (nReceived === 1 ? go(`/connessioni/${received[0].connection_id}`) : this.setTab('ricevute')),
      // search and pages
      q: s.q, searchProps: { onInput: v => this.searchTyped(v), onEnter: v => this.load2({ q: v.trim(), page: 1 }) },
      page: d.page, pages: d.pages, total: d.total, perPage: d.per_page, pagerProps: { onPage: n => this.load2({ page: n }, { scroll: true }) },
      noneLabel: none,
      conns: (s.tab === 'connessioni' ? items : []).map(c => ({ name: c.name, role: [c.role.split(' · ')[0], c.from && c.to ? `${c.from} → ${c.to.split(',')[0]}` : c.from].filter(Boolean).join(' · '), since: fmtShort(c.since).toUpperCase(), photo: c.photo_url, ini: ini(c.name), href: `/persone/${c.id}`, msg: () => go(`/messaggi/${c.id}`) })),
      noConns: s.tab === 'connessioni' && !items.length, noConnsLabel: none || 'Nessuna connessione accettata per ora.',
      received: (s.tab === 'ricevute' ? items : []).map(c => ({ n: c.name, d: `${c.role.split(' · ')[0] || 'Membro'} · ${timeAgo(c.created_at)}`, note: c.note, photo: c.photo_url, ini: ini(c.name), href: `/connessioni/${c.connection_id}`, accept: () => this.respond(c, 'accept'), decline: () => this.respond(c, 'decline') })),
      noReceived: s.tab === 'ricevute' && !items.length, noReceivedLabel: none || 'Nessuna richiesta in attesa.',
      sent: (s.tab === 'inviate' ? items : []).map(c => ({ n: c.name, d: `Inviata ${timeAgo(c.created_at)}`, photo: c.photo_url, ini: ini(c.name), href: `/persone/${c.id}`, withdraw: () => this.respond(c, 'withdraw') })),
      noSent: s.tab === 'inviate' && !items.length, noSentLabel: none || 'Nessuna richiesta inviata in attesa.',
      discover: () => go('/scopri'),
    };
  }
}

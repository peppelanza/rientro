// Connections (design 04 · 32a connessioni, 32b inviate, 33a stato vuoto).
import { api, fmtShort, getMe, go, qs, timeAgo, toast } from '../lib.js';
import { homeFor, Page } from './_base.js';

export const title = 'Connessioni';
export const tabbar = true;

const ini = n => n.split(' ').map(w => w[0]).join('').slice(0, 2);

export default class extends Page {
  async load() {
    const me = await getMe();
    if (me.user.status !== 'approved' || (!me.launched && me.user.role !== 'admin')) return go(homeFor(me));
    this.state.me = me;
    this.state.tab = ['ricevute', 'inviate'].includes(qs().get('tab')) ? qs().get('tab') : 'connessioni';
    this.state.data = await api('GET', '/api/connections');
  }

  setTab(tab) {
    this.state.tab = tab;
    history.replaceState(null, '', tab === 'connessioni' ? '/connessioni' : `/connessioni?tab=${tab}`);
    this.__rerender();
  }

  respond(c, action) {
    return this.act(async () => {
      await api('POST', `/api/connections/${c.connection_id}/${action}`);
      if (action === 'accept') toast(`Ora sei connesso con ${c.first_name}.`, { action: 'Apri chat', onAction: () => go(`/messaggi/${c.id}`) });
      this.state.data = await api('GET', '/api/connections');
    })();
  }

  renderVals() {
    const s = this.state;
    if (!s.data) return { loading: true, me: s.me || {} };
    const { connected, received, sent } = s.data;
    const empty = !connected.length && !received.length && !sent.length;
    const tabs = [['connessioni', `Connessioni · ${connected.length}`, 0], ['ricevute', 'Ricevute', received.length], ['inviate', `Inviate · ${sent.length}`, 0]]
      .map(([k, l, n]) => ({ l, count: n || 0, tone: s.tab === k ? 'selected' : 'default', on: s.tab === k ? 'true' : 'false', fn: () => this.setTab(k) }));
    const names = received.slice(0, 2).map(r => r.first_name);
    return {
      loading: false, me: s.me, empty, notEmpty: !empty, tabs,
      isConn: s.tab === 'connessioni', isRec: s.tab === 'ricevute', isSent: s.tab === 'inviate',
      showBanner: s.tab === 'connessioni' && received.length > 0,
      bannerPhotos: received.slice(0, 2).map(r => ({ src: r.photo_url, ini: ini(r.name) })),
      bannerA: names[0], bannerB: received.length === 2 ? names[1] : received.length > 2 ? `altre ${received.length - 1} persone` : '',
      bannerTwo: received.length > 1, bannerVerb: received.length > 1 ? 'vogliono' : 'vuole',
      openReceived: () => (received.length === 1 ? go(`/connessioni/${received[0].connection_id}`) : this.setTab('ricevute')),
      conns: connected.map(c => ({ name: c.name, role: [c.role.split(' · ')[0], c.from && c.to ? `${c.from} → ${c.to.split(',')[0]}` : c.from].filter(Boolean).join(' · '), since: fmtShort(c.since).toUpperCase(), photo: c.photo_url, ini: ini(c.name), href: `/persone/${c.id}`, msg: () => go(`/messaggi/${c.id}`) })),
      noConns: !connected.length,
      received: received.map(c => ({ n: c.name, d: `${c.role.split(' · ')[0] || 'Membro'} · ${timeAgo(c.created_at)}`, note: c.note, photo: c.photo_url, ini: ini(c.name), href: `/connessioni/${c.connection_id}`, accept: () => this.respond(c, 'accept'), decline: () => this.respond(c, 'decline') })),
      noReceived: !received.length,
      sent: sent.map(c => ({ n: c.name, d: `Inviata ${timeAgo(c.created_at)}`, photo: c.photo_url, ini: ini(c.name), href: `/persone/${c.id}`, withdraw: () => this.respond(c, 'withdraw') })),
      noSent: !sent.length,
      discover: () => go('/scopri'),
    };
  }
}

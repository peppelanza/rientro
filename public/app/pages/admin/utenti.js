// Admin · users table (design 06 · 45a). Filters live in the URL.
import { api, getCatalog, go } from '../../lib.js';
import { AdminPage, STATUS_KIND, initials } from './_admin.js';

export const title = 'Utenti · Admin';
const KEYS = ['q', 'status', 'intent', 'place', 'source', 'page'];
const two = n => String(n).padStart(2, '0');
const short = iso => { const d = new Date(iso); return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`; };

export default class extends AdminPage {
  async loadAdmin() {
    const q = new URLSearchParams(location.search);
    this.state.f = Object.fromEntries(KEYS.map(k => [k, q.get(k) || '']));
    this.state.cat = await getCatalog();
    await this.fetch();
  }

  async fetch() {
    const q = new URLSearchParams(Object.entries(this.state.f).filter(([, v]) => v));
    history.replaceState(null, '', `/admin/utenti${q.toString() ? `?${q}` : ''}`);
    this.state.d = await api('GET', `/api/admin/users?${q}`);
  }

  set(patch) { return this.act(async () => { Object.assign(this.state.f, { page: '' }, patch); await this.fetch(); })(); }

  renderVals() {
    const s = this.state;
    if (!s.d) return { loading: true, side: this.side('utenti') };
    const { d, f, cat } = s;
    const sel = (label, key, options) => ({ label, value: f[key], options, props: { onChange: v => this.set({ [key]: v }) } });
    const pages = [];
    for (let i = 1; i <= d.pages; i++) if (i === 1 || i === d.pages || Math.abs(i - d.page) <= 1) pages.push(i); else if (pages.at(-1) !== '…') pages.push('…');
    return {
      loading: false, side: this.side('utenti'), total: d.total.toLocaleString('it-IT'),
      q: f.q, qProps: { onEnter: v => this.set({ q: v.trim() }), onBlur: v => v.trim() !== f.q && this.set({ q: v.trim() }) },
      filters: [
        sel('Stato', 'status', [['onboarding', 'Bozza'], ['in_review', 'In revisione'], ['changes_requested', 'Modifiche'], ['approved', 'Approvato'], ['rejected', 'Rifiutato'], ['suspended', 'Sospeso']]),
        sel('Intento', 'intent', [['has_idea', "Ha già un'idea"], ['seeking_idea', "Cerca un'idea"], ['networking', 'Networking']]),
        sel('Fonte', 'source', cat.sources.map(x => [x, x])),
      ].map(x => ({ ...x, options: x.options.map(([v, l]) => ({ v, l })), placeholder: `${x.label}: tutti` })),
      users: d.users.map(u => ({ ...u, ini: initials(u.name), kind: STATUS_KIND[u.status], joined: short(u.joined), href: `/admin/utenti/${u.id}`, open: () => go(`/admin/utenti/${u.id}`) })),
      empty: !d.users.length,
      range: d.total ? `${(d.page - 1) * 10 + 1}–${Math.min(d.page * 10, d.total)} DI ${d.total}` : '0 RISULTATI',
      pages: pages.map(p => ({ l: String(p), gap: p === '…', cur: p === d.page, notCur: p !== d.page && p !== '…', go: () => this.set({ page: String(p) }) })),
      comuni: cat.comuni, place: f.place ? [f.place] : [], placeProps: { onChange: l => this.set({ place: l[0] ?? '' }) },
      exportCsv: () => go('/admin/esportazioni'),
    };
  }
}

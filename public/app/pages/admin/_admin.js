// Base for admin pages (design 06): checks the role, loads the sidebar counts, then loadAdmin().
import { api, debounce, getMe, go } from '../../lib.js';
import { Page } from '../_base.js';

export const STATUS_KIND = { approved: 'success', onboarding: 'neutral', suspended: 'neutral' };
export const initials = n => (n || '?').split(/[ @.]/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

export class AdminPage extends Page {
  async load() {
    const me = await getMe();
    if (me.user.role !== 'admin') return go('/');
    this.me = me;
    this.counts = await api('GET', '/api/admin/sidebar');
    await this.loadAdmin?.();
  }
  async refreshCounts() { this.counts = await api('GET', '/api/admin/sidebar'); }
  // Paged, searchable lists (src/paging.js): listPath is the API, listExtra() any other parameters
  async fetchList() {
    const s = this.state;
    s.q ??= '';
    s.page ??= 1;
    const q = new URLSearchParams({ ...(this.listExtra?.() ?? {}), page: String(s.page) });
    if (s.q) q.set('q', s.q);
    s.list = await api('GET', `${this.listPath}?${q}`);
    s.page = s.list.page;
  }
  listChange(patch) { return this.act(async () => { Object.assign(this.state, patch); await this.fetchList(); })(); }
  listVals() {
    const s = this.state;
    const l = s.list;
    this.searchTyped ??= debounce(v => { if (v.trim() !== s.q) this.listChange({ q: v.trim(), page: 1 }); });
    return {
      q: s.q, searchProps: { onInput: v => this.searchTyped(v) },
      page: l.page, pages: l.pages, total: l.total, perPage: l.per_page, pagerProps: { onPage: n => this.listChange({ page: n }) },
      noneFound: s.q ? `Nessun risultato per “${s.q}”.` : '',
    };
  }
  side(active) { return { active, counts: this.counts || {}, email: this.me?.user.email || '', site: this.me?.site_url || '/' }; }
}

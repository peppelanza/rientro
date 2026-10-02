// Settings · blocked people (reached from 39a "Persone bloccate · Gestisci").
import { api, debounce, fmtDate, getMe, toast } from '../lib.js';
import { Page } from './_base.js';
import { settingsMenu } from './_settings.js';

export const title = 'Persone bloccate';
export const tabbar = true;

export default class extends Page {
  async load() {
    Object.assign(this.state, { me: await getMe(), q: '', page: 1 });
    await this.fetch();
    this.state.any = this.state.list.total > 0;
  }

  // Searchable by name, 20 per page
  async fetch() {
    const s = this.state;
    const q = new URLSearchParams({ page: String(s.page) });
    if (s.q) q.set('q', s.q);
    s.list = await api('GET', `/api/me/blocks?${q}`);
    s.blocks = s.list.items;
    s.page = s.list.page;
  }

  change(patch) { return this.act(async () => { Object.assign(this.state, patch); await this.fetch(); })(); }

  searchTyped = debounce(v => this.change({ q: v.trim(), page: 1 }));

  unblock(b) {
    return this.act(async () => {
      await api('DELETE', `/api/blocks/${b.id}`);
      await this.fetch();
      this.state.any = this.state.list.total > 0 || !!this.state.q;
      toast(`${b.name} sbloccato. Potrete di nuovo vedere i vostri profili.`);
    })();
  }

  renderVals() {
    const s = this.state;
    if (!s.blocks) return { loading: true, me: {}, menu: settingsMenu };
    return {
      loading: false, me: s.me, menu: settingsMenu, none: !s.blocks.length, noneLabel: s.q ? `Nessun risultato per “${s.q}”.` : 'Non hai bloccato nessuno.',
      showSearch: !!s.any, q: s.q, searchProps: { onInput: v => this.searchTyped(v) },
      page: s.list.page, pages: s.list.pages, total: s.list.total, perPage: s.list.per_page, pagerProps: { onPage: n => this.change({ page: n }) },
      blocks: s.blocks.map((b, i) => ({ n: b.name, d: `Bloccato il ${fmtDate(b.since)}`, bt: i ? '1px solid #ECE8F7' : 'none', unblock: () => this.unblock(b) })),
    };
  }
}

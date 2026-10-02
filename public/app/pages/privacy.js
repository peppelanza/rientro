// Settings · privacy (design 05 · 39a chi vede cosa).
import { api, debounce, fmtDate, getCatalog, getMe, toast } from '../lib.js';
import { Page } from './_base.js';
import { settingsMenu } from './_settings.js';

export const title = 'Privacy';
export const tabbar = true;

// job_seeking only appears in the history of choices made before the option was removed
const PREF_LABEL = { job_seeking: 'Cerco anche lavoro in Italia', marketing_email: 'Novità di Rientro via email' };
const SOURCE_LABEL = { onboarding: 'durante la registrazione', settings: 'dalle impostazioni', signup: 'alla registrazione' };

export default class extends Page {
  async load() {
    if (location.hash === '#bloccati') requestAnimationFrame(() => document.getElementById('bloccati')?.scrollIntoView());
    Object.assign(this.state, { bq: '', bpage: 1 });
    const [me, cat, history] = await Promise.all([getMe(true), getCatalog(), api('GET', '/api/me/preference-history'), this.fetchBlocks()]);
    Object.assign(this.state, { me, cat, history });
    this.state.blockedTotal = this.state.blocks.total;
  }

  // Blocked people (the "Persone bloccate" page used to have them): searchable, 20 per page
  async fetchBlocks() {
    const s = this.state;
    const q = new URLSearchParams({ page: String(s.bpage) });
    if (s.bq) q.set('q', s.bq);
    s.blocks = await api('GET', `/api/me/blocks?${q}`);
    s.bpage = s.blocks.page;
  }

  blocksChange(patch) { return this.act(async () => { Object.assign(this.state, patch); await this.fetchBlocks(); })(); }

  searchBlocks = debounce(v => this.blocksChange({ bq: v.trim(), bpage: 1 }));

  unblock(b) {
    return this.act(async () => {
      await api('DELETE', `/api/blocks/${b.id}`);
      await this.fetchBlocks();
      if (!this.state.bq) this.state.blockedTotal = this.state.blocks.total;
      toast(`${b.name} sbloccato. Potrete di nuovo vedere i vostri profili.`);
    })();
  }

  toggleVideo = this.act(async () => {
    const p = this.state.me.profile;
    const saved = await api('PATCH', '/api/me/profile', { video_connections_only: !p.video_connections_only });
    p.video_connections_only = saved.video_connections_only;
    toast(p.video_connections_only ? 'Il video ora è visibile solo alle connessioni.' : 'Il video è visibile a tutti i membri.');
  });

  renderVals() {
    const s = this.state;
    if (!s.me) return { loading: true, me: {}, menu: settingsMenu };
    const { cat, me } = s;
    const n = s.blockedTotal;
    const bl = s.blocks;
    return {
      loading: false, me, menu: settingsMenu, cat,
      publicFields: ['Nome e foto', "Fascia d'età", 'Luoghi', 'Percorso', 'Formazione', 'Idea', 'Video', 'Interessi', 'LinkedIn', 'Sito', 'Cosa ti manca'],
      privateFields: ['Instagram', 'X / Twitter', 'Link calendario', 'Chat'],
      hasVideo: !!me.profile.video_url, blockedBorder: me.profile.video_url ? '1px solid #ECE8F7' : 'none', videoOnly: me.profile.video_connections_only, toggleVideo: this.toggleVideo,
      blockedLabel: n ? `${n} ${n === 1 ? 'persona' : 'persone'}` : 'nessuna',
      showBlockSearch: n > 5, bq: s.bq, blockSearchProps: { onInput: v => this.searchBlocks(v) },
      blocked: bl.items.map((b, i) => ({ n: b.name, d: `Bloccato il ${fmtDate(b.since)}`, bt: i ? '1px solid #ECE8F7' : 'none', unblock: () => this.unblock(b) })),
      noBlocks: !!s.bq && !bl.items.length, noBlocksLabel: `Nessun risultato per “${s.bq}”.`,
      bpage: bl.page, bpages: bl.pages, btotal: bl.total, bper: bl.per_page, blockPagerProps: { onPage: p => this.blocksChange({ bpage: p }) },
      history: s.history.slice(0, 8).map(h => ({ t: `${PREF_LABEL[h.preference] ?? h.preference}: ${h.value ? 'attivato' : 'disattivato'}`, d: `${fmtDate(h.created_at)} · ${SOURCE_LABEL[h.source] ?? h.source} · informativa ${h.notice_version ?? h.privacy_policy_version}` })),
      hasHistory: s.history.length > 0,
    };
  }
}

// Search (the top bar's field; on phones the magnifying glass): people, and what's written in the
// groups, on two tabs. Its own page, apart from Scopri: the words are what's searched, not one more
// filter. Persone has Scopri's filters beside it (people-filters.js), Gruppi the groups to search
// in. Words, tab, filters, group and page live in the address, so a new search from here keeps
// them (search-history.js searchUrl).
import { api, CERCA_BACK_KEY, getCatalog, getMe, go, routeOf, timeAgo } from '../lib.js';
import { apiQuery, filterPanel, moreOpenAtStart, readFilters, toQuery } from '../people-filters.js';
import { stickSide } from '../sticky-side.js';
import { Page } from './_base.js';

export const title = 'Cerca';
export const tabbar = true;

// Splits text around the first of the words typed that's in it (case-insensitive), to highlight it
function mark(text, words) {
  const t = text || '';
  for (const w of words) {
    const i = w ? t.toLowerCase().indexOf(w.toLowerCase()) : -1;
    if (i >= 0) return { a: t.slice(0, i), m: t.slice(i, i + w.length), b: t.slice(i + w.length) };
  }
  return { a: t, m: '', b: '' };
}
const fold = w => w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const initials = name => name.split(' ').map(w => w[0]).join('').slice(0, 2);

// Loading: the results as they will be (pages/_base.js skeleton()), one placeholder row
const FAKE_PEOPLE = { total: 1, page: 1, pages: 1, per_page: 12, people: Array.from({ length: 1 }, (_, i) => ({ id: `sk${i}`, name: 'Nome Cognome', role: 'Ruolo · Azienda', from: 'Città', to: 'Città', photo_url: null })) };
const FAKE_CAT = { areas: ['Area', 'Area', 'Area', 'Area'], sectors: ['Settore', 'Settore', 'Settore', 'Settore', 'Settore'], time: [], comuni: [], regions: [] };
const FAKE_HITS = { items: Array.from({ length: 1 }, (_, i) => ({ post_id: -i, group: { id: '', name: 'Gruppo' }, author: { name: 'Nome Cognome', photo_url: null }, text: 'Il testo di un post nei gruppi, abbastanza lungo da occupare una riga e mezza.', in_comment: false, created_at: new Date().toISOString() })) };

export default class extends Page {
  async load() {
    const [me, cat] = await Promise.all([getMe(), getCatalog()]);
    if (me.user.status !== 'approved') return go('/onboarding');
    if (!me.launched && me.user.role !== 'admin') return go('/benvenuto');
    const here = new URLSearchParams(location.search);
    const f = readFilters(here);
    Object.assign(this.state, {
      me, cat, f, q: (here.get('q') || '').trim(), tab: here.get('tab') === 'gruppi' ? 'gruppi' : 'persone',
      inGroup: here.get('gruppo') || null, page: Math.max(1, Number(here.get('page')) || 1),
      moreFilters: moreOpenAtStart(f), showFilters: false, moreBg: false, moreSectors: false, comuneCounts: {},
    });
    api('GET', '/api/comuni/counts').then(c => { this.state.comuneCounts = c; this.__rerender(); }).catch(() => {});
    if (this.state.q) document.title = `${this.state.q} · Cerca · Rientro`;
    this.__rerender(); // the top bar and the tabs for real, the results still a skeleton
    await this.fetch();
  }

  // People (src/profiles.js, best matches first) or the groups' posts and comments (src/groups.js)
  async fetch() {
    const s = this.state;
    if (!s.q) return;
    const q = encodeURIComponent(s.q);
    if (s.tab === 'gruppi') {
      s.groupList ??= (await api('GET', '/api/groups')).groups; // for the "Gruppo" filter
      s.hits = await api('GET', `/api/groups/search?q=${q}${s.inGroup ? `&group=${encodeURIComponent(s.inGroup)}` : ''}`);
    } else {
      s.people = await api('GET', `/api/profiles?q=${q}&${apiQuery(s.f)}&sort=match&page=${s.page}`);
      s.page = s.people.page;
    }
  }

  // Another tab, filters, group or page: in the address too
  change(patch, { scroll = false } = {}) {
    return this.act(async () => {
      Object.assign(this.state, patch);
      const s = this.state;
      const p = new URLSearchParams({ q: s.q });
      for (const [k, v] of toQuery(s.f)) p.set(k, v);
      if (s.tab === 'gruppi') { p.set('tab', 'gruppi'); if (s.inGroup) p.set('gruppo', s.inGroup); }
      else if (s.page > 1) p.set('page', String(s.page));
      history.replaceState(null, '', `/cerca?${p}`);
      await this.fetch();
      if (scroll) scrollTo({ top: 0, behavior: 'smooth' });
    })();
  }

  // New people filters (filterPanel), from page 1
  apply(f) { return this.change({ f, page: 1 }); }

  didRender(el) {
    try { sessionStorage.setItem(CERCA_BACK_KEY, location.search); } catch {}
    stickSide(el.querySelector('aside[aria-label="Filtri"], aside[aria-label="Gruppo"]'));
  }

  renderVals() {
    const s = this.state;
    const waiting = s.q && !(s.tab === 'gruppi' ? s.hits : s.people);
    if (!s.me || waiting) {
      const here = new URLSearchParams(location.search);
      return this.skeleton({
        me: s.me || {}, q: s.q ?? (here.get('q') || '').trim(), tab: s.tab ?? (here.get('tab') === 'gruppi' ? 'gruppi' : 'persone'),
        cat: s.cat || FAKE_CAT, f: s.f || readFilters(here), comuneCounts: {}, people: FAKE_PEOPLE, hits: FAKE_HITS,
      });
    }
    const { q } = s;
    const groupsTab = s.tab === 'gruppi';
    const res = groupsTab ? s.hits : s.people;
    const count = groupsTab ? res?.items.length ?? 0 : res?.total ?? 0;
    // only similar results (a typo forgiven: src/search.js) say so
    const similar = !!res?.fuzzy && count > 0;
    const words = q.split(/\s+/).filter(Boolean);
    const filters = filterPanel(this, s.people?.counts);
    const groupName = s.groupList?.find(g => g.id === s.inGroup)?.name;
    return {
      loading: false, me: s.me, q, noQuery: !q, hasQuery: !!q,
      // Persone: Scopri's filters beside the results (on a phone behind "Filtri")
      ...filters, filterUi: filters,
      // Gruppi: the groups to search in, as Gruppi's own menu (on a phone behind "Gruppo")
      groupMenu: [{ id: null, name: 'Tutti i gruppi' }, ...(s.groupList || [])].flatMap((g, i, all) => [
        ...(g.kind === 'region' && all[i - 1]?.kind !== 'region' ? [{ heading: 'Regioni' }] : []),
        { l: g.name, href: '#', click: e => { e.preventDefault(); this.change({ inGroup: g.id, showFilters: false }); } },
      ]),
      groupActive: groupName || 'Tutti i gruppi', groupChip: `Gruppo: ${groupName || 'tutti'}`,
      groupClass: s.showFilters ? '' : 'r-hide-sm',
      heading: similar ? `Risultati simili a “${q}”` : `Risultati per “${q}”`,
      countLabel: !res ? '' : similar ? `Nessun risultato esatto per “${q}”: eccone di simili.`
        : groupsTab ? `${count} post nei gruppi` : `${count} ${count === 1 ? 'persona' : 'persone'}`,
      tabs: [['persone', 'Persone'], ['gruppi', 'Gruppi']].map(([v, l]) => ({
        l, cls: `search-tab${s.tab === v ? ' on' : ''}`, sel: s.tab === v ? 'true' : 'false', pick: () => this.change({ tab: v, page: 1 }),
      })),
      peopleTab: !groupsTab, groupsTab,
      // Persone: a row each, the words highlighted; found elsewhere in the profile, it says where
      rows: groupsTab ? [] : (res?.people || []).map(p => {
        const one = mark(p.role, words); const two = mark(routeOf(p), words);
        return {
          name: p.name, photo: p.photo_url, ini: initials(p.name), href: `/persone/${p.id}?da=cerca`, // back: "Torna ai risultati"
          a: one.a, m1: one.m, b: one.b, has1: !!one.m, c: two.a, m2: two.m, d: two.b, has2: !!two.m,
          // the word as typed (the server's has no accents nor capitals)
          cites: p.match_in ? `Cita “${q.split(/\s+/).find(w => fold(w) === p.match_word) ?? p.match_word}” in ${p.match_in}` : '',
        };
      }),
      hasRows: !groupsTab && count > 0, noPeople: !groupsTab && !!res && !count,
      withFilters: filters.hasActive ? ' con questi filtri' : '',
      page: res?.page, pages: res?.pages, perPage: res?.per_page, total: res?.total,
      pagerProps: { onPage: n => this.change({ page: n }, { scroll: true }) },
      // Gruppi: the posts (or the comment that says it), narrowed to one group if picked
      hits: groupsTab ? (res?.items || []).map(h => {
        const m = mark(h.text.length > 240 ? `${h.text.slice(0, 239)}…` : h.text, words);
        return {
          href: `/gruppi/${h.group.id}?post=${h.post_id}`, // that post on its own group: h.group.name, name: h.author.name, photo: h.author.photo_url,
          ini: initials(h.author.name), when: timeAgo(h.created_at), where: h.in_comment ? 'in un commento' : '',
          a: m.a, m: m.m, b: m.b, hasM: !!m.m,
        };
      }) : [],
      hasHits: groupsTab && count > 0, noHits: groupsTab && !!res && !count,
    };
  }
}

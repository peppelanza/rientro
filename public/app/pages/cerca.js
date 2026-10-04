// Search (the top bar's field; on phones the magnifying glass): people, and what's written in the
// groups, on two tabs. Its own page, apart from Scopri: the words are what's searched, not one more
// filter. Words, tab, group and page live in the address (?q=&tab=gruppi&gruppo=&page=), so a new
// search from here keeps the tab and the group (search-history.js searchUrl).
import { api, CERCA_BACK_KEY, getMe, go, timeAgo } from '../lib.js';
import { Page } from './_base.js';

export const title = 'Cerca';
export const tabbar = true;

// Splits text around the first case-insensitive match, to highlight it
function mark(text, needle) {
  const t = text || '';
  const i = needle ? t.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  return i < 0 ? { a: t, m: '', b: '' } : { a: t.slice(0, i), m: t.slice(i, i + needle.length), b: t.slice(i + needle.length) };
}
const initials = name => name.split(' ').map(w => w[0]).join('').slice(0, 2);

// Loading: the results as they will be (pages/_base.js skeleton()), placeholder rows
const FAKE_PEOPLE = { total: 5, page: 1, pages: 1, per_page: 12, people: Array.from({ length: 5 }, (_, i) => ({ id: `sk${i}`, name: 'Nome Cognome', role: 'Ruolo · Azienda', from: 'Città', to: 'Città', photo_url: null })) };
const FAKE_HITS = { items: Array.from({ length: 4 }, (_, i) => ({ post_id: -i, group: { id: '', name: 'Gruppo' }, author: { name: 'Nome Cognome', photo_url: null }, text: 'Il testo di un post nei gruppi, abbastanza lungo da occupare una riga e mezza.', in_comment: false, created_at: new Date().toISOString() })) };

export default class extends Page {
  async load() {
    const me = await getMe();
    if (me.user.status !== 'approved') return go('/onboarding');
    if (!me.launched && me.user.role !== 'admin') return go('/benvenuto');
    const here = new URLSearchParams(location.search);
    Object.assign(this.state, {
      me, q: (here.get('q') || '').trim(), tab: here.get('tab') === 'gruppi' ? 'gruppi' : 'persone',
      inGroup: here.get('gruppo') || null, page: Math.max(1, Number(here.get('page')) || 1),
    });
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
      s.people = await api('GET', `/api/profiles?q=${q}&sort=match&page=${s.page}`);
      s.page = s.people.page;
    }
  }

  // Another tab, group or page: in the address too
  change(patch, { scroll = false } = {}) {
    return this.act(async () => {
      Object.assign(this.state, patch);
      const s = this.state;
      const p = new URLSearchParams({ q: s.q });
      if (s.tab === 'gruppi') { p.set('tab', 'gruppi'); if (s.inGroup) p.set('gruppo', s.inGroup); }
      else if (s.page > 1) p.set('page', String(s.page));
      history.replaceState(null, '', `/cerca?${p}`);
      await this.fetch();
      if (scroll) scrollTo({ top: 0, behavior: 'smooth' });
    })();
  }

  didRender() {
    try { sessionStorage.setItem(CERCA_BACK_KEY, location.search); } catch {}
  }

  renderVals() {
    const s = this.state;
    const waiting = s.q && !(s.tab === 'gruppi' ? s.hits : s.people);
    if (!s.me || waiting) {
      const here = new URLSearchParams(location.search);
      return this.skeleton({ me: s.me || {}, q: s.q ?? (here.get('q') || '').trim(), tab: s.tab ?? (here.get('tab') === 'gruppi' ? 'gruppi' : 'persone'), people: FAKE_PEOPLE, hits: FAKE_HITS });
    }
    const { q } = s;
    const groupsTab = s.tab === 'gruppi';
    const res = groupsTab ? s.hits : s.people;
    const count = groupsTab ? res?.items.length ?? 0 : res?.total ?? 0;
    // only similar results (a typo forgiven: src/search.js) say so
    const similar = !!res?.fuzzy && count > 0;
    const first = q.split(/\s+/)[0];
    return {
      loading: false, me: s.me, q, noQuery: !q, hasQuery: !!q,
      heading: similar ? `Risultati simili a “${q}”` : `Risultati per “${q}”`,
      countLabel: !res ? '' : similar ? `Nessun risultato esatto per “${q}”: eccone di simili.`
        : groupsTab ? `${count} post nei gruppi` : `${count} ${count === 1 ? 'persona' : 'persone'}`,
      tabs: [['persone', 'Persone'], ['gruppi', 'Gruppi']].map(([v, l]) => ({
        l, cls: `search-tab${s.tab === v ? ' on' : ''}`, sel: s.tab === v ? 'true' : 'false', pick: () => this.change({ tab: v, page: 1 }),
      })),
      peopleTab: !groupsTab, groupsTab,
      // Persone: a row each, the words highlighted; found elsewhere in the profile, it says where
      rows: groupsTab ? [] : (res?.people || []).map(p => {
        const one = mark(p.role, first); const two = mark([p.from, p.to].filter(Boolean).join(' → '), first);
        return {
          name: p.name, photo: p.photo_url, ini: initials(p.name), href: `/persone/${p.id}?da=cerca`, // back: "Torna ai risultati"
          a: one.a, m1: one.m, b: one.b, has1: !!one.m, c: two.a, m2: two.m, d: two.b, has2: !!two.m,
          cites: p.match_in ? `Cita “${q}” in ${p.match_in}` : '',
        };
      }),
      hasRows: !groupsTab && count > 0, noPeople: !groupsTab && !!res && !count,
      page: res?.page, pages: res?.pages, perPage: res?.per_page, total: res?.total,
      pagerProps: { onPage: n => this.change({ page: n }, { scroll: true }) },
      // Gruppi: the posts (or the comment that says it), narrowed to one group if picked
      groupChoices: [{ id: null, name: 'Tutti i gruppi' }, ...(s.groupList || [])].map(g => ({
        l: g.name, tone: s.inGroup === g.id ? 'selected' : 'default', aria: s.inGroup === g.id ? 'true' : 'false', pick: () => this.change({ inGroup: g.id }),
      })),
      hits: groupsTab ? (res?.items || []).map(h => {
        const m = mark(h.text.length > 240 ? `${h.text.slice(0, 239)}…` : h.text, first);
        return {
          href: `/gruppi/${h.group.id}#post-${h.post_id}`, group: h.group.name, name: h.author.name, photo: h.author.photo_url,
          ini: initials(h.author.name), when: timeAgo(h.created_at), where: h.in_comment ? 'in un commento' : '',
          a: m.a, m: m.m, b: m.b, hasM: !!m.m,
        };
      }) : [],
      hasHits: groupsTab && count > 0, noHits: groupsTab && !!res && !count,
    };
  }
}

// Discover (design 03 · 26a filtri, 26b mobile, 27a comuni, 28b nessun risultato): browsing people
// with filters. Filters live in the URL so a filtered view can be bookmarked and survives reloads.
// Searching by words is its own page (cerca.js).
import { api, getCatalog, getMe, go, SCOPRI_BACK_KEY } from '../lib.js';
import { activeFilters, apiQuery, filterPanel, moreOpenAtStart, readFilters, toQuery } from '../people-filters.js';
import { stickSide } from '../sticky-side.js';
import { connect } from '../social.js';
import { Page } from './_base.js';

export const title = 'Scopri chi torna';
export const tabbar = true;

// "Più affini" by default; once the member picks an order it stays (this browser only)
const SORT_KEY = 'rientro.scopri.sort';
function readSort() {
  try { return localStorage.getItem(SORT_KEY) === 'recent' ? 'recent' : 'match'; } catch { return 'match'; }
}
function saveSort(sort) {
  try { localStorage.setItem(SORT_KEY, sort); } catch {}
}

// Loading: the page as it will be (pages/_base.js skeleton()), with one placeholder person
const FAKE_PERSON = i => ({
  id: `sk${i}`, name: 'Nome Cognome', first_name: 'Nome', role: 'Ruolo · Azienda', from: 'Città', to: 'Città o Città',
  seeks: 'Prodotto, Engineering', tags: 'Settore · Settore', comp: '', intent: 'networking', photo_url: null, connection: null,
});
const FAKE_CAT = { areas: ['Area', 'Area', 'Area', 'Area'], sectors: ['Settore', 'Settore', 'Settore', 'Settore', 'Settore'], comuni: [], regions: [] };
const skeletonState = s => ({
  cat: s.cat || FAKE_CAT, f: s.f || readFilters(), sort: s.sort || readSort(), moreFilters: s.moreFilters ?? false, comuneCounts: {},
  res: { total: 1, page: 1, pages: 1, per_page: 12, people: [FAKE_PERSON(0)], counts: { intent: {}, backgrounds: {}, desired: {} } },
});

export default class extends Page {
  async load() {
    // an old search address (/scopri?q=): the search is its own page now
    const words = new URLSearchParams(location.search).get('q');
    if (words) return location.replace(`/cerca?${new URLSearchParams({ q: words })}`);
    const [me, cat] = await Promise.all([getMe(), getCatalog()]);
    if (me.user.status !== 'approved') return go('/onboarding');
    if (!me.launched && me.user.role !== 'admin') return go('/benvenuto');
    const f = readFilters();
    // "Tutti i filtri" starts open when one of them is in use (e.g. a bookmarked search) or when you
    // left it open (coming back from a profile)
    Object.assign(this.state, { me, cat, f, moreFilters: moreOpenAtStart(f), page: Math.max(1, Number(new URLSearchParams(location.search).get('page')) || 1), sort: readSort(), showFilters: false, moreBg: false, moreSectors: false, counts: {} });
    this.__rerender(); // the top bar and the filters for real, the people still a skeleton
    const [res, comuneCounts] = await Promise.all([api('GET', `/api/profiles?${this.listQuery()}`), api('GET', '/api/comuni/counts')]);
    this.state.res = res;
    this.state.comuneCounts = comuneCounts;
    await this.suggestRelax();
  }

  // 28b: "Senza “Part-time” ci sono 4 persone."
  async suggestRelax() {
    this.state.relax = null;
    const act = activeFilters(this.state.f, this.state.cat);
    if (this.state.res.total || act.length < 2) return;
    const last = act.at(-1);
    const r = await api('GET', `/api/profiles?${apiQuery(last.without(this.state.f))}`).catch(() => null);
    if (r?.total) this.state.relax = { label: last.label, total: r.total, f: last.without(this.state.f) };
  }

  // Filters, order and page for the API; the page is in the address too (?page=)
  listQuery(f = this.state.f) {
    return `${apiQuery(f)}&sort=${this.state.sort}&page=${this.state.page}`;
  }

  // New filters or a new order start again from page 1
  apply(f, { page = 1, scroll = false } = {}) {
    return this.latest(async current => {
      this.state.f = f;
      this.state.page = page;
      const q = toQuery(f);
      if (page > 1) q.set('page', String(page));
      history.replaceState(null, '', `/scopri${q.toString() ? `?${q}` : ''}`);
      this.__rerender(); // the filter shows as chosen at once
      const res = await api('GET', `/api/profiles?${this.listQuery(f)}`);
      if (!current()) return; // a newer choice is on its way
      this.state.res = res;
      this.state.page = res.page;
      await this.suggestRelax();
      if (scroll && current()) scrollTo({ top: 0, behavior: 'smooth' });
    })();
  }

  async connectTo(person) {
    const r = await connect({ ...person, onChange: () => this.apply(this.state.f) });
    if (r) { person.connection = { status: 'pending_sent', id: r.id }; this.__rerender(); }
  }

  componentWillUnmount() { removeEventListener('scroll', this.snapBefore); this.endWatch?.disconnect(); }

  didRender(el) {
    // phones: the cards one at a time (app.css html.scopri-snap), only while there are cards; once
    // what comes after the last one shows (the pages bar, the end of the page), the scroll is free
    // again, and back up among the cards it snaps again
    const cards = el.querySelector('.scopri-cards');
    document.documentElement.classList.toggle('scopri-snap', !!cards);
    // With the filters open (longer than the screen) the scroll is free above the cards, to reach the
    // filters at the bottom; one at a time again from the first card (in the top half of the screen)
    this.snapBefore ??= () => {
      const first = this.state.showFilters && document.querySelector('.scopri-cards > *');
      document.documentElement.classList.toggle('scopri-snap-before', !!first && first.getBoundingClientRect().top > innerHeight / 2);
    };
    if (!this.snapBeforeOn) { addEventListener('scroll', this.snapBefore, { passive: true }); this.snapBeforeOn = true; }
    this.snapBefore();
    this.endWatch?.disconnect();
    const end = el.querySelector('.scopri-end'); // right after the last card
    if (end) {
      this.endWatch = new IntersectionObserver(([e]) => document.documentElement.classList.toggle('scopri-snap-free', e.isIntersecting || e.boundingClientRect.top < 0));
      this.endWatch.observe(end);
    }
    try { sessionStorage.setItem(SCOPRI_BACK_KEY, location.search); } catch {}
    stickSide(el.querySelector('aside[aria-label="Filtri"]'));
  }

  renderVals() {
    const s = this.state;
    if (!s.res) return this.skeleton(skeletonState(s));
    const { f, res } = s;
    const people = res.people;
    const filters = filterPanel(this, res.counts);
    return {
      loading: false, loaded: true, me: s.me, f, ...filters, filterUi: filters,
      total: res.total, totalLabel: `${res.total} ${res.total === 1 ? 'persona' : 'persone'} con questi filtri`,
      // results
      sortLabel: s.sort === 'match' ? 'Ordina: Più affini ▾' : 'Ordina: Più recenti ▾',
      toggleSort: () => { const sort = s.sort === 'match' ? 'recent' : 'match'; saveSort(sort); s.sort = sort; this.apply(f); },
      // pages
      page: res.page, pages: res.pages, perPage: res.per_page, total2: res.total,
      pagerProps: { onPage: n => this.apply(f, { page: n, scroll: true }) },
      isGrid: res.total > 0, isEmpty: res.total === 0,
      people, cardProps: { onConnect: p => this.connectTo(p) },
      relax: s.relax, relaxText: s.relax ? `Senza “${s.relax.label}” ${s.relax.total === 1 ? 'c’è 1 persona' : `ci sono ${s.relax.total} persone`}.` : '',
      relaxLabel: s.relax ? `Togli solo “${s.relax.label}”` : '', applyRelax: () => this.apply(s.relax.f),
    };
  }
}


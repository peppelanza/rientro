// Discover (design 03 · 26a filtri, 26b mobile, 27a comuni, 28b nessun risultato): browsing people
// with filters. Filters live in the URL so a filtered view can be bookmarked and survives reloads.
// Searching by words is its own page (cerca.js).
import { api, getCatalog, getMe, go, SCOPRI_BACK_KEY } from '../lib.js';
import { stickSide } from '../sticky-side.js';
import { connect } from '../social.js';
import { Page } from './_base.js';

export const title = 'Scopri chi torna';
export const tabbar = true;

const LIST_KEYS = ['intent', 'backgrounds', 'sectors', 'desired'];
const AGES = [['18-24', '18–24', ['18-24']], ['25-29', '25–29', ['25-29']], ['30-34', '30–34', ['30-34']], ['35-39', '35–39', ['35-39']], ['40+', '40+', ['40-44', '45-50+']]];
const INTENT = { has_idea: "Ha già un'idea", seeking_idea: "Cerca un'idea insieme", networking: 'Networking' };

function readFilters() {
  const q = new URLSearchParams(location.search);
  const f = { lives: q.get('lives') || '', time: q.get('time') || '', age: q.get('age') || '', include_unknown: q.get('include_unknown') === '1' };
  for (const k of LIST_KEYS) f[k] = q.get(k) ? q.get(k).split(',').filter(Boolean) : [];
  return f;
}

// The filters behind "Tutti i filtri" (computer): everything but where they live and want to live
const hiddenFilters = f => f.intent.length + f.backgrounds.length + f.sectors.length + (f.time ? 1 : 0) + (f.age ? 1 : 0);

function toQuery(f) {
  const q = new URLSearchParams();
  for (const k of LIST_KEYS) if (f[k].length) q.set(k, f[k].join(','));
  if (f.lives) q.set('lives', f.lives);
  if (f.time) q.set('time', f.time);
  if (f.age) q.set('age', f.age);
  if (f.include_unknown && f.desired.length) q.set('include_unknown', '1');
  return q;
}

// The API takes age bands; "40+" covers two of them.
function apiQuery(f) {
  const q = toQuery(f);
  if (f.age) q.set('age', AGES.find(a => a[0] === f.age)?.[2].join(',') ?? '');
  return q.toString();
}

// "Più affini" by default; once the member picks an order it stays (this browser only)
const SORT_KEY = 'rientro.scopri.sort';
function readSort() {
  try { return localStorage.getItem(SORT_KEY) === 'recent' ? 'recent' : 'match'; } catch { return 'match'; }
}
function saveSort(sort) {
  try { localStorage.setItem(SORT_KEY, sort); } catch {}
}
// "Tutti i filtri" open or closed, for this visit
const MORE_KEY = 'rientro.scopri.more';
function readMore() {
  try { return sessionStorage.getItem(MORE_KEY) === '1'; } catch { return false; }
}
function saveMore(open) {
  try { sessionStorage.setItem(MORE_KEY, open ? '1' : ''); } catch {}
}

// Loading: the page as it will be (pages/_base.js skeleton()), with placeholder people
const FAKE_PERSON = i => ({
  id: `sk${i}`, name: 'Nome Cognome', first_name: 'Nome', age: '30–34', role: 'Ruolo · Azienda', from: 'Città', to: 'Città o Città',
  seeks: 'Prodotto, Engineering', tags: 'Settore · Settore', time: 'Full-time', comp: '', intent: 'networking', photo_url: null, connection: null,
});
const FAKE_CAT = { areas: ['Area', 'Area', 'Area', 'Area'], sectors: ['Settore', 'Settore', 'Settore', 'Settore', 'Settore'], time: [], comuni: [], regions: [] };
const skeletonState = s => ({
  cat: s.cat || FAKE_CAT, f: s.f || readFilters(), sort: s.sort || readSort(), moreFilters: s.moreFilters ?? false, comuneCounts: {},
  res: { total: 6, page: 1, pages: 1, per_page: 12, people: Array.from({ length: 6 }, (_, i) => FAKE_PERSON(i)), counts: { intent: {}, backgrounds: {}, desired: {} } },
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
    Object.assign(this.state, { me, cat, f, moreFilters: hiddenFilters(f) > 0 || readMore(), page: Math.max(1, Number(new URLSearchParams(location.search).get('page')) || 1), sort: readSort(), showFilters: false, moreBg: false, moreSectors: false, counts: {} });
    this.__rerender(); // the top bar and the filters for real, the people still a skeleton
    const [res, comuneCounts] = await Promise.all([api('GET', `/api/profiles?${this.listQuery()}`), api('GET', '/api/comuni/counts')]);
    this.state.res = res;
    this.state.comuneCounts = comuneCounts;
    await this.suggestRelax();
  }

  // Active filters, in the order they appear in the sidebar: [{ key, label, remove(f) }]
  active(f = this.state.f) {
    const cat = this.state.cat;
    const out = [];
    for (const c of f.desired) out.push({ label: c, without: g => ({ ...g, desired: g.desired.filter(x => x !== c) }) });
    if (f.lives) out.push({ label: f.lives === 'italy' ? 'Vive in Italia' : 'Vive all’estero', without: g => ({ ...g, lives: '' }) });
    for (const i of f.intent) out.push({ label: INTENT[i], without: g => ({ ...g, intent: g.intent.filter(x => x !== i) }) });
    for (const b of f.backgrounds) out.push({ label: b.split(' /')[0], without: g => ({ ...g, backgrounds: g.backgrounds.filter(x => x !== b) }) });
    for (const s of f.sectors) out.push({ label: s, without: g => ({ ...g, sectors: g.sectors.filter(x => x !== s) }) });
    if (f.time) out.push({ label: cat.time.find(t => t[0] === f.time)?.[1], without: g => ({ ...g, time: '' }) });
    if (f.age) out.push({ label: AGES.find(a => a[0] === f.age)?.[1], without: g => ({ ...g, age: '' }) });
    return out;
  }

  // 28b: "Senza “Part-time” ci sono 4 persone."
  async suggestRelax() {
    this.state.relax = null;
    const act = this.active();
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
    return this.act(async () => {
      this.state.f = f;
      this.state.page = page;
      const q = toQuery(f);
      if (page > 1) q.set('page', String(page));
      history.replaceState(null, '', `/scopri${q.toString() ? `?${q}` : ''}`);
      this.state.res = await api('GET', `/api/profiles?${this.listQuery(f)}`);
      this.state.page = this.state.res.page;
      await this.suggestRelax();
      if (scroll) scrollTo({ top: 0, behavior: 'smooth' });
    })();
  }

  set(patch) { this.apply({ ...this.state.f, ...patch }); }
  toggle(key, v) { const l = this.state.f[key]; this.set({ [key]: l.includes(v) ? l.filter(x => x !== v) : [...l, v] }); }

  async connectTo(person) {
    const r = await connect({ ...person, onChange: () => this.apply(this.state.f) });
    if (r) { person.connection = { status: 'pending_sent', id: r.id }; this.__rerender(); }
  }

  // The picker offers the 20 regions too ("Sicilia (regione)": anyone who chose a comune there),
  // ranked by population like the comuni, so typing "Sic" shows Sicilia first
  places(cat) {
    if (this.placeCat !== cat) { // (worked out again once the real catalogue replaces the skeleton's)
      this.placeCat = cat;
      const pop = {};
      for (const c of cat.comuni) pop[c[2]] = (pop[c[2]] || 0) + c[3];
      this.placeList = [...cat.regions.map(r => [`${r} (regione)`, '', 'Regione', pop[r] || 0]), ...cat.comuni];
    }
    return this.placeList;
  }

  didRender(el) {
    // phones: the cards one at a time (app.css html.scopri-snap), only while there are cards; once
    // what comes after the last one shows (the pages bar, the end of the page), the scroll is free
    // again, and back up among the cards it snaps again
    const cards = el.querySelector('.scopri-cards');
    document.documentElement.classList.toggle('scopri-snap', !!cards);
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
    const { f, cat, res } = s;
    const counts = res.counts;
    const act = this.active();
    const people = res.people;
    const bgList = cat.areas.map(a => ({ l: a, count: counts.backgrounds[a] ?? 0, on: f.backgrounds.includes(a), fn: () => this.toggle('backgrounds', a) }));
    const secList = cat.sectors.map(l => ({ l, tone: f.sectors.includes(l) ? 'tint' : 'default', aria: f.sectors.includes(l) ? 'true' : 'false', fn: () => this.toggle('sectors', l) }));
    const shownSectors = s.moreSectors ? secList : secList.filter((x, i) => i < 4 || f.sectors.includes(x.l));
    return {
      loading: false, loaded: true, me: s.me, f, showFilters: s.showFilters,
      // computer: only "Dove vuole vivere" and "Dove vive" show; the others open below them (on a phone the whole
      // panel is behind "Filtri" already, all of it)
      moreCls: `filters-more${s.moreFilters ? ' open' : ''}${this.animateMore ? ' opening' : ''}`, moreOpen: s.moreFilters ? 'true' : 'false', moreClosed: !s.moreFilters, moreOpenFlag: s.moreFilters, // closed: under "Dove vive"; open: at the bottom
      moreLabel: s.moreFilters ? 'Meno filtri' : hiddenFilters(f) ? `Tutti i filtri · ${hiddenFilters(f)}` : 'Tutti i filtri',
      toggleMore: () => { this.animateMore = !s.moreFilters; saveMore(!s.moreFilters); this.setState({ moreFilters: !s.moreFilters }); this.animateMore = false; },
      total: res.total, totalLabel: `${res.total} ${res.total === 1 ? 'persona' : 'persone'} con questi filtri`,
      hasActive: act.length > 0, activeLabel: `${act.length} ${act.length === 1 ? 'filtro attivo' : 'filtri attivi'}`,
      activeChips: act.map(a => ({ l: a.label, aria: `Rimuovi ${a.label}`, remove: () => this.apply(a.without(f)) })),
      offChips: act.map(a => ({ l: a.label })),
      clearAll: () => this.apply({ ...readFiltersEmpty() }),
      // sidebar
      filterClass: s.showFilters ? '' : 'r-hide-sm', toggleFilters: () => this.setState({ showFilters: !s.showFilters }),
      filtersCount: act.length, filtersTone: s.showFilters ? 'selected' : 'default',
      comuni: this.places(cat), desired: f.desired, comuneCounts: s.comuneCounts,
      desiredProps: { onChange: list => this.set({ desired: list }) },
      includeUnknown: f.include_unknown, toggleUnknown: () => this.set({ include_unknown: !f.include_unknown }), hasDesired: f.desired.length > 0,
      livesOpts: [{ v: '', l: 'Ovunque' }, { v: 'italy', l: 'Italia' }, { v: 'abroad', l: 'Estero' }], lives: f.lives,
      livesProps: { onSelect: v => this.set({ lives: v }) },
      intents: Object.entries(INTENT).map(([v, l]) => ({ l, count: counts.intent[v] ?? 0, on: f.intent.includes(v), fn: () => this.toggle('intent', v) })),
      bgs: s.moreBg ? bgList : bgList.filter((x, i) => i < 3 || x.on), moreBgLabel: s.moreBg ? 'Mostra meno' : `Mostra altri ${cat.areas.length - 3}`,
      toggleMoreBg: () => this.setState({ moreBg: !s.moreBg }),
      sectors: shownSectors, moreSectorsLabel: s.moreSectors ? 'Meno' : `+ ${cat.sectors.length - shownSectors.length}`, hasMoreSectors: s.moreSectors || shownSectors.length < cat.sectors.length,
      toggleMoreSectors: () => this.setState({ moreSectors: !s.moreSectors }),
      timeOpts: [{ v: 'full_time', l: 'Full-time' }, { v: 'part_time', l: 'Part-time' }], time: f.time, timeProps: { onSelect: v => this.set({ time: v }) },
      ageOpts: AGES.map(([v, l]) => ({ v, l })), age: f.age, ageProps: { onSelect: v => this.set({ age: v }) },
      // results
      sortLabel: s.sort === 'match' ? 'Ordina: Più affini ▾' : 'Ordina: Più recenti ▾',
      toggleSort: () => { const sort = s.sort === 'match' ? 'recent' : 'match'; saveSort(sort); s.sort = sort; this.apply(f); },
      // pages
      page: res.page, pages: res.pages, perPage: res.per_page, total2: res.total,
      pagerProps: { onPage: n => this.apply(f, { page: n, scroll: true }) },
      isGrid: res.total > 0, isEmpty: res.total === 0,
      people, cardProps: { onConnect: p => this.connectTo(p) },
      relax: s.relax, relaxText: s.relax ? `Senza “${s.relax.label}” ci ${s.relax.total === 1 ? 'è 1 persona' : `sono ${s.relax.total} persone`}.` : '',
      relaxLabel: s.relax ? `Togli solo “${s.relax.label}”` : '', applyRelax: () => this.apply(s.relax.f),
    };
  }
}

function readFiltersEmpty() {
  return { lives: '', time: '', age: '', include_unknown: false, intent: [], backgrounds: [], sectors: [], desired: [] };
}

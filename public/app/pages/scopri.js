// Discover (design 03 · 26a filtri, 26b mobile, 27a comuni, 28a ricerca, 28b nessun risultato).
// Filters live in the URL so a filtered view can be bookmarked and survives reloads.
import { api, getCatalog, getMe, go } from '../lib.js';
import { connect } from '../social.js';
import { Page } from './_base.js';

export const title = 'Scopri chi torna';
export const tabbar = true;

const LIST_KEYS = ['intent', 'backgrounds', 'sectors', 'desired'];
const AGES = [['18-24', '18–24', ['18-24']], ['25-29', '25–29', ['25-29']], ['30-34', '30–34', ['30-34']], ['35-39', '35–39', ['35-39']], ['40+', '40+', ['40-44', '45-50+']]];
const INTENT = { has_idea: "Ha già un'idea", seeking_idea: "Cerca un'idea insieme", networking: 'Networking' };

function readFilters() {
  const q = new URLSearchParams(location.search);
  const f = { lives: q.get('lives') || '', time: q.get('time') || '', age: q.get('age') || '', include_unknown: q.get('include_unknown') === '1', q: q.get('q') || '' };
  for (const k of LIST_KEYS) f[k] = q.get(k) ? q.get(k).split(',').filter(Boolean) : [];
  return f;
}

function toQuery(f) {
  const q = new URLSearchParams();
  for (const k of LIST_KEYS) if (f[k].length) q.set(k, f[k].join(','));
  if (f.lives) q.set('lives', f.lives);
  if (f.time) q.set('time', f.time);
  if (f.age) q.set('age', f.age);
  if (f.include_unknown && f.desired.length) q.set('include_unknown', '1');
  if (f.q) q.set('q', f.q);
  return q;
}

// The API takes age bands; "40+" covers two of them.
function apiQuery(f) {
  const q = toQuery(f);
  if (f.age) q.set('age', AGES.find(a => a[0] === f.age)?.[2].join(',') ?? '');
  return q.toString();
}

// Splits text around the first case-insensitive match (28a highlights).
function mark(text, needle) {
  const t = text || '';
  const i = needle ? t.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  return i < 0 ? { a: t, m: '', b: '' } : { a: t.slice(0, i), m: t.slice(i, i + needle.length), b: t.slice(i + needle.length) };
}

export default class extends Page {
  async load() {
    const [me, cat] = await Promise.all([getMe(), getCatalog()]);
    if (me.user.status !== 'approved') return go('/stato');
    if (!me.launched && me.user.role !== 'admin') return go('/profilo');
    Object.assign(this.state, { me, cat, f: readFilters(), sort: 'recent', showFilters: false, moreBg: false, moreSectors: false, counts: {} });
    const [res, comuneCounts] = await Promise.all([api('GET', `/api/profiles?${apiQuery(this.state.f)}`), api('GET', '/api/comuni/counts')]);
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
    if (f.q) out.push({ label: `“${f.q}”`, without: g => ({ ...g, q: '' }) });
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

  apply(f) {
    return this.act(async () => {
      this.state.f = f;
      history.replaceState(null, '', `/scopri${toQuery(f).toString() ? `?${toQuery(f)}` : ''}`);
      this.state.res = await api('GET', `/api/profiles?${apiQuery(f)}`);
      await this.suggestRelax();
    })();
  }

  set(patch) { this.apply({ ...this.state.f, ...patch }); }
  toggle(key, v) { const l = this.state.f[key]; this.set({ [key]: l.includes(v) ? l.filter(x => x !== v) : [...l, v] }); }

  async connectTo(person) {
    const r = await connect({ ...person, onChange: () => this.apply(this.state.f) });
    if (r) { person.connection = { status: 'pending_sent', id: r.id }; this.__rerender(); }
  }

  renderVals() {
    const s = this.state;
    if (!s.res) return { loading: true, me: s.me || {} };
    const { f, cat, res } = s;
    const counts = res.counts;
    const act = this.active();
    const people = s.sort === 'match' ? [...res.people].sort((a, b) => !!b.comp - !!a.comp) : res.people;
    const bgList = cat.areas.map(a => ({ l: a, count: counts.backgrounds[a] ?? 0, on: f.backgrounds.includes(a), fn: () => this.toggle('backgrounds', a) }));
    const secList = cat.sectors.map(l => ({ l, tone: f.sectors.includes(l) ? 'tint' : 'default', aria: f.sectors.includes(l) ? 'true' : 'false', fn: () => this.toggle('sectors', l) }));
    const shownSectors = s.moreSectors ? secList : secList.filter((x, i) => i < 4 || f.sectors.includes(x.l));
    const qn = f.q.trim();
    return {
      loading: false, me: s.me, f, showFilters: s.showFilters,
      total: res.total, totalLabel: `${res.total} ${res.total === 1 ? 'persona' : 'persone'} con questi filtri`,
      hasActive: act.length > 0, activeLabel: `${act.length} ${act.length === 1 ? 'filtro attivo' : 'filtri attivi'}`,
      activeChips: act.map(a => ({ l: a.label, aria: `Rimuovi ${a.label}`, remove: () => this.apply(a.without(f)) })),
      offChips: act.map(a => ({ l: a.label })),
      clearAll: () => this.apply({ ...readFiltersEmpty() }),
      // sidebar
      filterClass: s.showFilters ? '' : 'r-hide-sm', toggleFilters: () => this.setState({ showFilters: !s.showFilters }),
      filtersCount: act.length, filtersTone: s.showFilters ? 'selected' : 'default',
      comuni: cat.comuni, desired: f.desired, comuneCounts: s.comuneCounts,
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
      toggleSort: () => this.setState({ sort: s.sort === 'match' ? 'recent' : 'match' }),
      isSearch: !!qn && res.total > 0, isGrid: !qn && res.total > 0, isEmpty: res.total === 0,
      heading: qn ? `Risultati per “${qn}”` : 'Scopri chi torna',
      people, cardProps: { onConnect: p => this.connectTo(p) },
      rows: people.map(p => {
        const one = mark(p.role, qn); const two = mark([p.from, p.to].filter(Boolean).join(' → '), qn);
        return { name: p.name, photo: p.photo_url, ini: p.name.split(' ').map(w => w[0]).join('').slice(0, 2), a: one.a, m1: one.m, b: one.b, c: two.a, m2: two.m, d: two.b, has1: !!one.m, has2: !!two.m, href: `/persone/${p.id}` };
      }),
      relax: s.relax, relaxText: s.relax ? `Senza “${s.relax.label}” ci ${s.relax.total === 1 ? 'è 1 persona' : `sono ${s.relax.total} persone`}.` : '',
      relaxLabel: s.relax ? `Togli solo “${s.relax.label}”` : '', applyRelax: () => this.apply(s.relax.f),
    };
  }
}

function readFiltersEmpty() {
  return { lives: '', time: '', age: '', include_unknown: false, q: '', intent: [], backgrounds: [], sectors: [], desired: [] };
}

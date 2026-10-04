// People filters, shared by Scopri (browsing) and the search's Persone tab (pages/cerca.js): what
// they are, how they live in the address (bookmarkable, kept on reload), and the values of the side
// panel (App People Filters, components.js) and of the phone's "Filtri" row above the results.

export const LIST_KEYS = ['intent', 'backgrounds', 'sectors', 'desired'];
export const AGES = [['18-24', '18–24', ['18-24']], ['25-29', '25–29', ['25-29']], ['30-34', '30–34', ['30-34']], ['35-39', '35–39', ['35-39']], ['40+', '40+', ['40-44', '45-50+']]];
export const INTENT = { has_idea: "Ha già un'idea", seeking_idea: "Cerca un'idea insieme", networking: 'Networking' };

export function readFilters(params = new URLSearchParams(location.search)) {
  const f = { lives: params.get('lives') || '', time: params.get('time') || '', age: params.get('age') || '', include_unknown: params.get('include_unknown') === '1' };
  for (const k of LIST_KEYS) f[k] = params.get(k) ? params.get(k).split(',').filter(Boolean) : [];
  return f;
}
export const emptyFilters = () => ({ lives: '', time: '', age: '', include_unknown: false, intent: [], backgrounds: [], sectors: [], desired: [] });

// The filters behind "Tutti i filtri" (computer): everything but where they live and want to live
export const hiddenFilters = f => f.intent.length + f.backgrounds.length + f.sectors.length + (f.time ? 1 : 0) + (f.age ? 1 : 0);

// For the address
export function toQuery(f) {
  const q = new URLSearchParams();
  for (const k of LIST_KEYS) if (f[k].length) q.set(k, f[k].join(','));
  if (f.lives) q.set('lives', f.lives);
  if (f.time) q.set('time', f.time);
  if (f.age) q.set('age', f.age);
  if (f.include_unknown && f.desired.length) q.set('include_unknown', '1');
  return q;
}

// For the API, which takes age bands ("40+" covers two of them)
export function apiQuery(f) {
  const q = toQuery(f);
  if (f.age) q.set('age', AGES.find(a => a[0] === f.age)?.[2].join(',') ?? '');
  return q.toString();
}

// "Tutti i filtri" open or closed, for this visit; open by itself when one of them is in use
const MORE_KEY = 'rientro.scopri.more';
export function moreOpenAtStart(f) {
  try { return hiddenFilters(f) > 0 || sessionStorage.getItem(MORE_KEY) === '1'; } catch { return hiddenFilters(f) > 0; }
}
function saveMore(open) {
  try { sessionStorage.setItem(MORE_KEY, open ? '1' : ''); } catch {}
}

// The filters in use, in the order they appear in the panel: [{ label, without(f) }]
export function activeFilters(f, cat) {
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

// "Dove vuole vivere" offers the 20 regions too ("Sicilia (regione)": anyone who chose a comune
// there), ranked by population like the comuni, so typing "Sic" shows Sicilia first
const placeLists = new WeakMap();
function places(cat) {
  if (!placeLists.has(cat)) {
    const pop = {};
    for (const c of cat.comuni) pop[c[2]] = (pop[c[2]] || 0) + c[3];
    placeLists.set(cat, [...cat.regions.map(r => [`${r} (regione)`, '', 'Regione', pop[r] || 0]), ...cat.comuni]);
  }
  return placeLists.get(cat);
}

// The panel's and the phone row's values. page.state has f, cat, comuneCounts and the panel's own
// moreFilters, moreBg, moreSectors, showFilters (phones: the panel open); page.apply(f) runs new
// filters (from page 1); counts: the API's, per filter value.
export function filterPanel(page, counts = { intent: {}, backgrounds: {} }) {
  const s = page.state;
  const { f, cat } = s;
  const set = patch => page.apply({ ...f, ...patch });
  const toggle = (key, v) => set({ [key]: f[key].includes(v) ? f[key].filter(x => x !== v) : [...f[key], v] });
  const act = activeFilters(f, cat);
  const bgList = cat.areas.map(a => ({ l: a, count: counts.backgrounds?.[a] ?? 0, on: f.backgrounds.includes(a), fn: () => toggle('backgrounds', a) }));
  const secList = cat.sectors.map(l => ({ l, tone: f.sectors.includes(l) ? 'tint' : 'default', aria: f.sectors.includes(l) ? 'true' : 'false', fn: () => toggle('sectors', l) }));
  const shownSectors = s.moreSectors ? secList : secList.filter((x, i) => i < 4 || f.sectors.includes(x.l));
  const hidden = hiddenFilters(f);
  return {
    // the phone's row above the results, and the active filters on a computer
    showFilters: s.showFilters, toggleFilters: () => page.setState({ showFilters: !s.showFilters }),
    filtersCount: act.length, filtersTone: s.showFilters ? 'selected' : 'default',
    hasActive: act.length > 0, activeLabel: `${act.length} ${act.length === 1 ? 'filtro attivo' : 'filtri attivi'}`,
    activeChips: act.map(a => ({ l: a.label, aria: `Rimuovi ${a.label}`, remove: () => page.apply(a.without(f)) })),
    offChips: act.map(a => ({ l: a.label })),
    clearAll: () => page.apply(emptyFilters()),
    // the panel (hidden on a phone until "Filtri"); on a computer only "Dove vuole vivere" and "Dove
    // vive" show, the others open below them ("Tutti i filtri", at the bottom once open)
    filterClass: s.showFilters ? '' : 'r-hide-sm',
    moreCls: `filters-more${s.moreFilters ? ' open' : ''}${page.animateMore ? ' opening' : ''}`, moreOpen: s.moreFilters ? 'true' : 'false', moreClosed: !s.moreFilters, moreOpenFlag: s.moreFilters,
    moreLabel: s.moreFilters ? 'Meno filtri' : hidden ? `Tutti i filtri · ${hidden}` : 'Tutti i filtri',
    toggleMore: () => { page.animateMore = !s.moreFilters; saveMore(!s.moreFilters); page.setState({ moreFilters: !s.moreFilters }); page.animateMore = false; },
    comuni: places(cat), desired: f.desired, comuneCounts: s.comuneCounts,
    desiredProps: { onChange: list => set({ desired: list }) },
    includeUnknown: f.include_unknown, toggleUnknown: () => set({ include_unknown: !f.include_unknown }), hasDesired: f.desired.length > 0,
    livesOpts: [{ v: '', l: 'Ovunque' }, { v: 'italy', l: 'Italia' }, { v: 'abroad', l: 'Estero' }], lives: f.lives,
    livesProps: { onSelect: v => set({ lives: v }) },
    intents: Object.entries(INTENT).map(([v, l]) => ({ l, count: counts.intent?.[v] ?? 0, on: f.intent.includes(v), fn: () => toggle('intent', v) })),
    bgs: s.moreBg ? bgList : bgList.filter((x, i) => i < 3 || x.on), moreBgLabel: s.moreBg ? 'Mostra meno' : `Mostra altri ${cat.areas.length - 3}`,
    toggleMoreBg: () => page.setState({ moreBg: !s.moreBg }),
    sectors: shownSectors, moreSectorsLabel: s.moreSectors ? 'Meno' : `+ ${cat.sectors.length - shownSectors.length}`, hasMoreSectors: s.moreSectors || shownSectors.length < cat.sectors.length,
    toggleMoreSectors: () => page.setState({ moreSectors: !s.moreSectors }),
    timeOpts: [{ v: 'full_time', l: 'Full-time' }, { v: 'part_time', l: 'Part-time' }], time: f.time, timeProps: { onSelect: v => set({ time: v }) },
    ageOpts: AGES.map(([v, l]) => ({ v, l })), age: f.age, ageProps: { onSelect: v => set({ age: v }) },
  };
}

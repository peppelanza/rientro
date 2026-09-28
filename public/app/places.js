// Countries (Italian names, CLDR) and their cities (GeoNames), built by scripts/build-places.js.
// Loaded on demand and cached by the browser for a day.
const cache = new Map();
const load = url => {
  if (!cache.has(url)) cache.set(url, fetch(url).then(r => (r.ok ? r.json() : [])).catch(() => []));
  return cache.get(url);
};

// [[ISO, nome]]
export const loadPaesi = () => load('/data/paesi.json');

// City names for a country given its Italian name, most populous first
export async function loadCitta(countryName) {
  const paese = (await loadPaesi()).find(p => p[1] === countryName);
  return paese ? load(`/data/citta/${paese[0]}.json`) : [];
}

// "Quando è stato il rientro?": spans relative to today (the server keeps them as dates)
export const ARRIVED_WHEN = [
  { v: '0_3m', l: '0–3 mesi fa' }, { v: '3_12m', l: '3–12 mesi fa' }, { v: '1_2y', l: '1–2 anni fa' }, { v: '2y_plus', l: 'Più di 2 anni fa' },
];

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

// Half years of the last two years, newest first: { v: '2026-H2', l: 'Lug–set 2026' }
const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
export function arrivalPeriods(today = new Date()) {
  const nowM = today.getFullYear() * 12 + today.getMonth();
  const oldest = nowM - 24;
  const out = [];
  for (let start = nowM - (today.getMonth() % 6); start + 5 >= oldest; start -= 6) {
    const from = Math.max(start, oldest), to = Math.min(start + 5, nowM);
    const y = Math.floor(start / 12);
    const range = from === to ? MONTHS[from % 12] : `${MONTHS[from % 12]}–${MONTHS[to % 12].toLowerCase()}`;
    out.push({ v: `${y}-H${start % 12 < 6 ? 1 : 2}`, l: `${range} ${y}` });
  }
  return out;
}

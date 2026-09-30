import { getCatalog } from './lib.js';

// Countries (Italian names, CLDR) and their cities (GeoNames), built by scripts/build-places.js.
// Loaded on demand and cached by the browser for a day.
const cache = new Map();
const load = url => {
  if (!cache.has(url)) cache.set(url, fetch(url).then(r => (r.ok ? r.json() : [])).catch(() => []));
  return cache.get(url);
};

// [[ISO, nome]]. Italy comes first: "Vivo fuori" also means the North, and before coming
// back one may have lived elsewhere in Italy. Its cities are the comuni.
export const loadPaesi = async () => [['IT', 'Italia'], ...await load('/data/paesi.json')];

// City names for a country given its Italian name, most populous first
export async function loadCitta(countryName) {
  if (countryName === 'Italia') return [...(await getCatalog()).comuni].sort((a, b) => b[3] - a[3]).map(c => c[0]);
  const paese = (await loadPaesi()).find(p => p[1] === countryName);
  return paese ? load(`/data/citta/${paese[0]}.json`) : [];
}

// Birth year: private, others see the age band. Required; "19" is not a year yet
export const parseBirthYear = v => (!v.trim() ? null : /^\d{4}$/.test(v.trim()) ? Number(v.trim()) : v);
export const validBirthYear = y => (Number.isInteger(y) && y <= new Date().getFullYear() - 18 && y >= new Date().getFullYear() - 100);
// Same bands as ageBandFor in src/catalog.js (the year alone: everyone moves up on 1 January)
export function ageBandLabel(y) {
  if (!Number.isInteger(y)) return null;
  const age = new Date().getFullYear() - y;
  return age < 25 ? '18–24' : age < 30 ? '25–29' : age < 35 ? '30–34' : age < 40 ? '35–39' : age < 45 ? '40–44' : '45–50+';
}

// "Quando è stato il rientro?": spans relative to today (the server keeps them as dates)
export const ARRIVED_WHEN = [
  { v: '0_3m', l: '0–3 mesi fa' }, { v: '3_12m', l: '3–12 mesi fa' }, { v: '1_2y', l: '1–2 anni fa' }, { v: '2y_plus', l: 'Più di 2 anni fa' },
];

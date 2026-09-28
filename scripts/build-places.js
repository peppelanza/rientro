// Builds the place lists used by the pickers. Run again when a source updates.
//
//   node scripts/build-places.js <comuni.json> <all-the-cities dir>
//
// Sources (downloaded, not generated):
// - Comuni: github.com/matteocontrini/comuni-json (comuni.json, derived from ISTAT)
// - World cities: npm "all-the-cities" (GeoNames, population ≥ 1000; needs its "pbf" dependency)
// - Country names in Italian: Unicode CLDR via Intl.DisplayNames (built into Node)
//
// Outputs (committed):
// - src/data/comuni.json          [nome, sigla, regione, popolazione], sorted by name
// - public/data/paesi.json        [codice ISO, nome italiano], sorted alphabetically (Italy excluded)
// - public/data/citta/<ISO>.json  city names, most populous first
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [comuniFile, citiesDir] = process.argv.slice(2);
if (!comuniFile || !citiesDir) throw new Error('usage: node scripts/build-places.js <comuni.json> <all-the-cities dir>');

const write = (rel, data) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
};

// Comuni: "Trentino-Alto Adige/Südtirol" → "Trentino-Alto Adige", matching catalog.REGIONS
const comuni = JSON.parse(fs.readFileSync(comuniFile, 'utf8'))
  .map(c => [c.nome, c.sigla, c.regione.nome.split('/')[0], c.popolazione ?? 0])
  .sort((a, b) => a[0].localeCompare(b[0], 'it'));
write('src/data/comuni.json', comuni);

// Cities: at least 15,000 inhabitants; small countries keep their 30 largest places
const cities = createRequire(path.join(path.resolve(citiesDir), 'index.js'))(path.resolve(citiesDir));
const byCountry = new Map();
for (const c of cities) {
  if (!byCountry.has(c.country)) byCountry.set(c.country, []);
  byCountry.get(c.country).push(c);
}
const names = new Intl.DisplayNames(['it'], { type: 'region', fallback: 'none' });
const countries = [];
fs.rmSync(path.join(root, 'public/data/citta'), { recursive: true, force: true });
for (const [code, list] of byCountry) {
  const name = names.of(code);
  if (!name || code === 'IT') continue;
  list.sort((a, b) => b.population - a.population);
  const keep = list.filter(c => c.population >= 15000);
  const chosen = keep.length >= 30 ? keep : list.slice(0, 30);
  write(`public/data/citta/${code}.json`, [...new Set(chosen.map(c => c.name))]);
  countries.push([code, name]);
}
countries.sort((a, b) => a[1].localeCompare(b[1], 'it'));
write('public/data/paesi.json', countries);

console.log(`${comuni.length} comuni · ${countries.length} paesi`);

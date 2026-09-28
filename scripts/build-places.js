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

// Italian names (where Italian has its own) for the 50 most populous cities outside Italy,
// plus the European and other cities where Italians abroad most often live. Keyed "ISO:GeoNames name".
const ITALIAN = {
  // 50 most populous (GeoNames)
  'MX:Mexico City': 'Città del Messico', 'CN:Beijing': 'Pechino', 'CN:Guangzhou': 'Canton', 'RU:Moscow': 'Mosca',
  'BR:São Paulo': 'San Paolo', 'ID:Jakarta': 'Giacarta', 'US:New York City': 'New York', 'EG:Cairo': 'Il Cairo',
  'GB:London': 'Londra', 'CN:Nanjing': 'Nanchino', 'IR:Tehran': 'Teheran', 'RU:Saint Petersburg': 'San Pietroburgo',
  'CL:Santiago': 'Santiago del Cile', 'IN:Kolkata': 'Calcutta',
  // Where Italians abroad live
  'FR:Paris': 'Parigi', 'FR:Marseille': 'Marsiglia', 'FR:Lyon': 'Lione', 'FR:Nice': 'Nizza', 'FR:Toulouse': 'Tolosa',
  'DE:Munich': 'Monaco di Baviera', 'DE:Berlin': 'Berlino', 'DE:Köln': 'Colonia', 'DE:Frankfurt am Main': 'Francoforte',
  'DE:Hamburg': 'Amburgo', 'DE:Nürnberg': 'Norimberga', 'DE:Stuttgart': 'Stoccarda', 'DE:Dresden': 'Dresda',
  'CH:Zürich': 'Zurigo', 'CH:Genève': 'Ginevra', 'CH:Basel': 'Basilea', 'CH:Bern': 'Berna', 'CH:Luzern': 'Lucerna',
  'CH:Lausanne': 'Losanna', 'BE:Brussels': 'Bruxelles', 'BE:Antwerpen': 'Anversa', 'NL:The Hague': "L'Aia",
  'PT:Lisbon': 'Lisbona', 'ES:Barcelona': 'Barcellona', 'ES:Sevilla': 'Siviglia', 'GR:Athens': 'Atene',
  'PL:Warsaw': 'Varsavia', 'CZ:Prague': 'Praga', 'GB:Edinburgh': 'Edimburgo', 'SE:Stockholm': 'Stoccolma',
  'DK:Copenhagen': 'Copenaghen', 'IE:Dublin': 'Dublino', 'RO:Bucharest': 'Bucarest', 'RS:Belgrade': 'Belgrado',
  'UA:Kyiv': 'Kiev', 'US:Philadelphia': 'Filadelfia', 'CU:Havana': "L'Avana", 'IL:Jerusalem': 'Gerusalemme',
  'TN:Tunis': 'Tunisi', 'DZ:Algiers': 'Algeri', 'ZA:Cape Town': 'Città del Capo', 'LU:Luxembourg': 'Lussemburgo',
};

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
  write(`public/data/citta/${code}.json`, [...new Set(chosen.map(c => ITALIAN[`${code}:${c.name}`] ?? c.name))]);
  countries.push([code, name]);
}
countries.sort((a, b) => a[1].localeCompare(b[1], 'it'));
write('public/data/paesi.json', countries);

const used = new Set(cities.filter(c => c.population >= 15000).map(c => `${c.country}:${c.name}`));
const unused = Object.keys(ITALIAN).filter(k => !used.has(k));
if (unused.length) throw new Error(`Italian names with no matching city: ${unused.join(', ')}`);

console.log(`${comuni.length} comuni · ${countries.length} paesi`);

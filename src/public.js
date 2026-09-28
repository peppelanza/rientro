// Public, unauthenticated data for the territory landing pages (design 51).
// Only aggregates of approved, visible members; any count below publicStatsMinCount is
// replaced by null ("meno di 5") so small groups can't be singled out. No person cards:
// profiles are visible only to approved members (design 39a).
import fs from 'node:fs';
import path from 'node:path';
import { COMUNI, REGIONS, TERRITORY_CITIES } from './catalog.js';
import { config } from './config.js';

// Photo of a territory: public/img/territori/<slug>.<ext> (regions use a photo of their capital).
// "Valle d'Aosta" → valle-d-aosta, "Forlì" → forli.
export const photoSlug = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PHOTO_EXT = ['webp', 'jpg', 'jpeg', 'png', 'avif'];
function photoFor(name) {
  const slug = photoSlug(name);
  const ext = PHOTO_EXT.find(e => fs.existsSync(path.join(config.publicDir, 'img', 'territori', `${slug}.${e}`)));
  return ext ? `/img/territori/${slug}.${ext}` : null;
}

const regionOf = Object.fromEntries(COMUNI.map(c => [c[0], c[2]]));

// "Tornare nel Lazio", "nelle Marche", "nel Molise"; every other region takes "in"
const REGION_PREP = { Lazio: 'nel', Marche: 'nelle', Molise: 'nel' };
const regionPrep = name => REGION_PREP[name] ?? 'in';

// URL → territory name: exact name ("Napoli", "Valle d'Aosta") or its slug ("napoli", "valle-d-aosta"),
// any case. On a slug shared by two comuni the region wins, then the most populous comune.
const bySlug = new Map();
for (const name of [...REGIONS, ...[...COMUNI].sort((a, b) => b[3] - a[3]).map(c => c[0])]) {
  if (!bySlug.has(photoSlug(name))) bySlug.set(photoSlug(name), name);
}
export const resolveTerritory = raw => bySlug.get(photoSlug(raw)) ?? null;

export function territory(db, raw) {
  const place = resolveTerritory(raw);
  if (!place) return null;
  const isRegion = REGIONS.includes(place);
  const isCity = !isRegion && COMUNI.some(c => c[0] === place);
  if (!isRegion && !isCity) return null;
  const cities = isRegion ? COMUNI.filter(c => c[2] === place).map(c => c[0]) : [place];
  const rows = db.prepare(
    `SELECT p.* FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.status = 'approved' AND p.visible = 1`,
  ).all().map(p => ({ ...p, desired: JSON.parse(p.desired_comuni), sectors: JSON.parse(p.sectors) }));
  const wants = rows.filter(p => p.desired.some(c => cities.includes(c)));
  const livesThere = rows.filter(p => p.lives_in === 'italy' && cities.includes(p.lives_in_city));
  const k = n => (n >= config.publicStatsMinCount ? n : null);
  const tally = (items, pick) => {
    const m = new Map();
    for (const x of items) for (const v of pick(x)) m.set(v, (m.get(v) || 0) + 1);
    return [...m.entries()].filter(([, n]) => n >= config.publicStatsMinCount).sort((a, b) => b[1] - a[1]);
  };
  const withIdea = wants.filter(p => p.primary_intent === 'has_idea').length;
  return {
    name: place,
    slug: photoSlug(place),
    kind: isRegion ? 'region' : 'city',
    region: isCity ? regionOf[place] ?? null : null,
    prep: isRegion ? regionPrep(place) : /^a/i.test(place) ? 'ad' : 'a', // "ad Aosta", "ad Ancona"
    regionPrep: isCity && regionOf[place] ? regionPrep(regionOf[place]) : null,
    photo: photoFor(place),
    count: k(wants.length),
    living: k(livesThere.length),
    idea: k(withIdea),
    explore: k(wants.length - withIdea),
    origins: tally(wants.filter(p => p.lives_in === 'abroad'), p => [p.lives_in_city])
      .slice(0, 5).map(([from, n]) => ({ from, n })),
    sectors: tally(wants, p => p.sectors).slice(0, 8).map(([l, n]) => ({ l, n })),
    // 12 other comuni of the region: most wanted first (only counts ≥ 5 are shown), then most populous
    places: COMUNI.filter(c => c[2] === (isRegion ? place : regionOf[place]) && c[0] !== place)
      .map(c => ({ name: c[0], pop: c[3], wanted: rows.filter(p => p.desired.includes(c[0])).length }))
      .sort((a, b) => (k(b.wanted) ?? 0) - (k(a.wanted) ?? 0) || b.pop - a.pop)
      .slice(0, 12)
      .map(c => ({ name: c.name, n: k(c.wanted), linkable: TERRITORY_CITIES.includes(c.name) || REGIONS.includes(c.name) })),
    regions: REGIONS, cities: TERRITORY_CITIES,
  };
}

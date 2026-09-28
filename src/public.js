// Public, unauthenticated data for the territory landing pages (design 51).
// Only aggregates of approved, visible members; any count below publicStatsMinCount is
// replaced by null ("meno di 5") so small groups can't be singled out. No person cards:
// profiles are visible only to approved members (design 39a).
import { COMUNI, REGIONS, TERRITORY_CITIES } from './catalog.js';
import { config } from './config.js';

const regionOf = Object.fromEntries(COMUNI.map(c => [c[0], c[2]]));

export function territory(db, place) {
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
    kind: isRegion ? 'region' : 'city',
    region: isCity ? regionOf[place] ?? null : null,
    prep: isRegion ? 'in' : 'a',
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

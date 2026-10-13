// What a Scopri card shows about a person (App Person Card), from their profile. One function for
// the server (src/profiles.js card()) and for the preview in Il tuo profilo, so "come ti vedono gli
// altri" is what the others really see. Pure: no browser nor server code in here.
// p: the profile (desired_comuni, sectors… as arrays); years: the catalog's [[value, label]]

export function orList(items, max = Infinity) {
  const list = items.filter(Boolean);
  if (list.length > max) return `${list.slice(0, max).join(', ')} o altre ${list.length - max} città`;
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} o ${list.at(-1)}` : (list[0] ?? '');
}

export function cardFields(p, years, { places = p.desired_comuni, sectors = p.sectors } = {}) {
  const yearsLabel = p.years_experience ? years.find(([v]) => v === p.years_experience)?.[1] ?? p.years_experience : null;
  return {
    name: [p.first_name, p.last_name].filter(Boolean).join(' '),
    first_name: p.first_name,
    // under the name: the job marked "Lavoro ancora qui" (kept in current_role / current_company)
    job: p.current_role ? [p.current_role, p.current_company].filter(Boolean).join(' da ') : '',
    from: p.lives_in_city ?? '',
    // already back in Italy: where from ("Londra → Catania" instead of where they'd like to go)
    back_from: p.lives_in === 'italy' ? (p.arrived_from_city || p.arrived_from_country || '') : '',
    to: orList(places, 3) || (p.desired_unknown ? 'Non lo sa ancora' : ''),
    idea: p.primary_intent === 'has_idea',
    intent: p.primary_intent,
    idea_title: p.idea_title,
    tags: sectors.slice(0, 3).join(' · '),
    // "Tecnologia e ingegneria · 8–12 anni"
    background: [p.background_area, yearsLabel && `${yearsLabel} anni`].filter(Boolean).join(' · '),
  };
}

import fs from 'node:fs';

// Option lists. Labels are taken verbatim from the Claude Design files (design/Rientro 02 …).
// Served to the frontend via GET /api/catalog so both sides validate against the same values.

// Background: one of these, or "Altro" with the member's own words (up to 25 characters, stored as is)
export const AREAS = ['Tecnologia e ingegneria', 'Design, arte e cultura', 'Business, finanza e diritto', 'Marketing e comunicazione', 'Educazione e formazione', 'Scienze e ricerca', 'Salute e benessere', 'Sociale e servizi alla persona', 'Ambiente e agricoltura', 'Industria e artigianato', 'Turismo e ospitalità'];
export const AREA_OTHER = 'Altro';
export const AREA_OTHER_MAX = 25;
// Search filter: the areas plus "Altro" for whoever wrote their own
export const areaKey = v => (!v ? null : AREAS.includes(v) ? v : AREA_OTHER);
// Earlier areas, moved over by db.js migrateAreas
export const OLD_AREAS = { 'Tech / Engineering': 'Tecnologia e ingegneria', Prodotto: 'Tecnologia e ingegneria', Design: 'Design, arte e cultura', 'Business / Sales': 'Business, finanza e diritto', 'Marketing / Growth': 'Marketing e comunicazione', Operations: 'Business, finanza e diritto', Finanza: 'Business, finanza e diritto', 'Ricerca / Scienza': 'Scienze e ricerca',
  // shortened afterwards
  'Industria, artigianato e costruzioni': 'Industria e artigianato', 'Turismo, ospitalità e ristorazione': 'Turismo e ospitalità' };

export const SECTORS = ['AI, Software & SaaS', 'Finanza & Assicurazioni', 'Immobiliare & Costruzioni', 'Industria & Manifattura', 'Moda, Design & Creatività', 'Media, Cinema & Intrattenimento', 'Arte & Cultura', 'Educazione & Formazione', 'Salute & Benessere', 'Agricoltura, Food & Vino', 'Turismo & Ospitalità', 'Ambiente, Energia & Clima', 'Mobilità & Trasporti', 'Scienza & Ricerca', 'Sociale & Terzo Settore', 'Sport & Tempo Libero', 'Servizi Professionali', 'Commercio & Retail', 'Telecomunicazioni & Infrastrutture', 'Politica & Pubblica Amministrazione'];
// Earlier sectors, moved over by db.js migrateSectors
export const OLD_SECTORS = { AI: 'AI, Software & SaaS', SaaS: 'AI, Software & SaaS', 'Dev tools': 'AI, Software & SaaS', PropTech: 'Immobiliare & Costruzioni', Fintech: 'Finanza & Assicurazioni', Climate: 'Ambiente, Energia & Clima', Turismo: 'Turismo & Ospitalità', 'Food & Agritech': 'Agricoltura, Food & Vino', HealthTech: 'Salute & Benessere', Education: 'Educazione & Formazione', 'Moda & Design': 'Moda, Design & Creatività', Manifattura: 'Industria & Manifattura', Hardware: 'Industria & Manifattura', 'Mobilità': 'Mobilità & Trasporti', Media: 'Media, Cinema & Intrattenimento', 'Impact / Non profit': 'Sociale & Terzo Settore' };

export const SOURCES = ['Passaparola, un amico o collega', 'LinkedIn', 'Instagram', 'Articolo, podcast o newsletter', 'Un evento', 'Altro'];

export const AGE_BANDS = [['18-24', '18–24'], ['25-29', '25–29'], ['30-34', '30–34'], ['35-39', '35–39'], ['40-44', '40–44'], ['45-50+', '45–50+']];
// Age band shown to others, from the birth year (the year alone: everyone moves up on 1 January)
export function ageBandFor(birthYear, now = new Date()) {
  if (!birthYear) return null;
  const age = now.getFullYear() - birthYear;
  return age < 25 ? '18-24' : age < 30 ? '25-29' : age < 35 ? '30-34' : age < 40 ? '35-39' : age < 45 ? '40-44' : '45-50+';
}
export const YEARS = [['0-3', '0–3'], ['4-7', '4–7'], ['8-12', '8–12'], ['13+', '13+']];

// Codes reuse values the database already allows (schema CHECK), so no schema change was needed
export const IDEA_STAGES = [['idea', 'Solo un\'idea'], ['prototype', 'Ci sto lavorando'], ['revenue', 'Già operativo']];
// Stages used before they were reduced to three, and where each one now belongs
export const OLD_IDEA_STAGES = { validation: 'prototype', first_customers: 'revenue' };

// "Dove dovrebbe vivere": only "in my city" is asked (the member's city, profiles.js myPlace); else indifferent
export const SEEKING_LOCATION = [['any', 'Indifferente'], ['same_city', 'Nella mia città']];

export const REPORT_REASONS = [
  ['fake_profile', 'Profilo falso o foto non sua'],
  ['harassment', 'Messaggi inappropriati o molesti'],
  ['spam', 'Spam o vendita di servizi'],
  ['other', 'Altro'],
];

// Job-seeking step (spec §10)
export const WORK_ARRANGEMENTS = [['on_site', 'In presenza'], ['hybrid', 'Ibrido'], ['remote', 'Da remoto'], ['any', 'Indifferente']];
export const EMPLOYMENT_TYPES = [['full_time', 'Full-time'], ['part_time', 'Part-time'], ['any', 'Indifferente']];
export const AVAILABILITY = [['now', 'Subito'], ['within_3_months', 'Entro 3 mesi'], ['within_6_months', 'Entro 6 mesi'], ['within_12_months', 'Entro un anno'], ['later', 'Più avanti']];

// All Italian comuni (ISTAT, via github.com/matteocontrini/comuni-json), built by
// scripts/build-places.js: [nome, sigla, regione, popolazione].
export const COMUNI = JSON.parse(fs.readFileSync(new URL('./data/comuni.json', import.meta.url), 'utf8'));

export const COMUNE_NAMES = new Set(COMUNI.map(c => c[0]));

// Territory landing pages (design 51): regions and cities offered as tabs.
export const REGIONS = ['Lombardia', 'Lazio', 'Campania', 'Sicilia', 'Veneto', 'Emilia-Romagna', 'Piemonte', 'Puglia', 'Toscana', 'Calabria', 'Liguria', 'Sardegna', 'Marche', 'Abruzzo', 'Friuli-Venezia Giulia', 'Trentino-Alto Adige', 'Umbria', 'Basilicata', 'Molise', 'Valle d\'Aosta'];
// Cities with their own listed page: every regional capital plus every comune over 100,000
// inhabitants, most populous first. Any other comune still has a page, it just isn't listed.
export const REGIONAL_CAPITALS = ['Roma', 'Milano', 'Napoli', 'Torino', 'Palermo', 'Genova', 'Bologna', 'Firenze', 'Bari', 'Venezia', 'Trieste', 'Trento', 'Aosta', 'Ancona', 'Perugia', "L'Aquila", 'Campobasso', 'Potenza', 'Catanzaro', 'Cagliari'];
export const TERRITORY_CITIES = COMUNI.filter(c => REGIONAL_CAPITALS.includes(c[0]) || c[3] >= 100_000).sort((a, b) => b[3] - a[3]).map(c => c[0]);

export const catalog = {
  areas: AREAS, areaOther: AREA_OTHER, areaOtherMax: AREA_OTHER_MAX, sectors: SECTORS, sources: SOURCES, ageBands: AGE_BANDS, years: YEARS, ideaStages: IDEA_STAGES,
  seekingLocation: SEEKING_LOCATION, reportReasons: REPORT_REASONS,
  workArrangements: WORK_ARRANGEMENTS, employmentTypes: EMPLOYMENT_TYPES, availability: AVAILABILITY,
  comuni: COMUNI, regions: REGIONS, territoryCities: TERRITORY_CITIES,
};

export const label = (pairs, value) => pairs.find(p => p[0] === value)?.[1] ?? null;

// "Napoli", "Napoli o Torino", "Napoli, Torino o Palermo"; past max: "…, Palermo o altre 2 città"
export function orList(items, max = Infinity) {
  const list = items.filter(Boolean);
  if (list.length > max) return `${list.slice(0, max).join(', ')} o altre ${list.length - max} città`;
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} o ${list.at(-1)}` : (list[0] ?? '');
}

import fs from 'node:fs';

// Option lists. Labels are taken verbatim from the Claude Design files (design/Rientro 02 …).
// Served to the frontend via GET /api/catalog so both sides validate against the same values.

export const AREAS = ['Tech / Engineering', 'Prodotto', 'Design', 'Business / Sales', 'Marketing / Growth', 'Operations', 'Finanza', 'Ricerca / Scienza'];

export const SECTORS = ['AI', 'SaaS', 'PropTech', 'Fintech', 'Climate', 'Turismo', 'Food & Agritech', 'HealthTech', 'Education', 'Dev tools', 'Moda & Design', 'Manifattura', 'Mobilità', 'Media', 'Impact / Non profit', 'Hardware'];

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

export const TIME = [
  ['full_time', 'Full-time', 'È il mio progetto principale'],
  ['part_time', 'Part-time', 'Accanto al lavoro attuale'],
  ['tbd', 'Da definire', 'Dipende dal progetto'],
];
export const START = [['now', 'Subito'], ['6_months', 'Entro 6 mesi'], ['1_year', 'Entro un anno'], ['later', 'Più avanti']];
export const SEEKING_LOCATION = [['any', 'Indifferente'], ['same_city', 'Nella mia stessa città'], ['italy', 'In Italia']];

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
  areas: AREAS, sectors: SECTORS, sources: SOURCES, ageBands: AGE_BANDS, years: YEARS, ideaStages: IDEA_STAGES,
  time: TIME, start: START, seekingLocation: SEEKING_LOCATION, reportReasons: REPORT_REASONS,
  workArrangements: WORK_ARRANGEMENTS, employmentTypes: EMPLOYMENT_TYPES, availability: AVAILABILITY,
  comuni: COMUNI, regions: REGIONS, territoryCities: TERRITORY_CITIES,
};

export const label = (pairs, value) => pairs.find(p => p[0] === value)?.[1] ?? null;

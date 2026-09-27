// Option lists. Labels are taken verbatim from the Claude Design files (design/Rientro 02 …).
// Served to the frontend via GET /api/catalog so both sides validate against the same values.

export const AREAS = ['Tech / Engineering', 'Prodotto', 'Design', 'Business / Sales', 'Marketing / Growth', 'Operations', 'Finanza', 'Ricerca / Scienza'];

export const SECTORS = ['AI', 'SaaS', 'PropTech', 'Fintech', 'Climate', 'Turismo', 'Food & Agritech', 'HealthTech', 'Education', 'Dev tools', 'Moda & Design', 'Manifattura', 'Mobilità', 'Media', 'Impact / Non profit', 'Hardware'];

export const SOURCES = ['Passaparola, un amico o collega', 'LinkedIn', 'Instagram', 'Articolo, podcast o newsletter', 'Un evento', 'Altro'];

export const AGE_BANDS = [['25-29', '25–29'], ['30-34', '30–34'], ['35-39', '35–39'], ['40-44', '40–44'], ['45-50+', '45–50+']];
export const YEARS = [['0-3', '0–3'], ['4-7', '4–7'], ['8-12', '8–12'], ['13+', '13+']];

export const IDEA_STAGES = [['idea', 'Solo un\'idea'], ['validation', 'Validazione'], ['prototype', 'Prototipo'], ['first_customers', 'Primi clienti'], ['revenue', 'Ricavi']];

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

// Comuni for autocomplete: every capoluogo di provincia plus a few frequent choices.
// TODO before launch: load the full ISTAT list (7.896 comuni, design 00 "Comune · autocomplete").
// [name, sigla, regione]
export const COMUNI = [
  ['Agrigento', 'AG', 'Sicilia'], ['Alessandria', 'AL', 'Piemonte'], ['Ancona', 'AN', 'Marche'], ['Aosta', 'AO', 'Valle d\'Aosta'],
  ['Arezzo', 'AR', 'Toscana'], ['Ascoli Piceno', 'AP', 'Marche'], ['Asti', 'AT', 'Piemonte'], ['Avellino', 'AV', 'Campania'],
  ['Bari', 'BA', 'Puglia'], ['Barletta', 'BT', 'Puglia'], ['Belluno', 'BL', 'Veneto'], ['Benevento', 'BN', 'Campania'],
  ['Bergamo', 'BG', 'Lombardia'], ['Biella', 'BI', 'Piemonte'], ['Bologna', 'BO', 'Emilia-Romagna'], ['Bolzano', 'BZ', 'Trentino-Alto Adige'],
  ['Brescia', 'BS', 'Lombardia'], ['Brindisi', 'BR', 'Puglia'], ['Cagliari', 'CA', 'Sardegna'], ['Caltanissetta', 'CL', 'Sicilia'],
  ['Campobasso', 'CB', 'Molise'], ['Carbonia', 'SU', 'Sardegna'], ['Caserta', 'CE', 'Campania'], ['Catania', 'CT', 'Sicilia'],
  ['Catanzaro', 'CZ', 'Calabria'], ['Chieti', 'CH', 'Abruzzo'], ['Como', 'CO', 'Lombardia'], ['Cosenza', 'CS', 'Calabria'],
  ['Cremona', 'CR', 'Lombardia'], ['Crotone', 'KR', 'Calabria'], ['Cuneo', 'CN', 'Piemonte'], ['Enna', 'EN', 'Sicilia'],
  ['Fermo', 'FM', 'Marche'], ['Ferrara', 'FE', 'Emilia-Romagna'], ['Firenze', 'FI', 'Toscana'], ['Foggia', 'FG', 'Puglia'],
  ['Forlì', 'FC', 'Emilia-Romagna'], ['Frosinone', 'FR', 'Lazio'], ['Genova', 'GE', 'Liguria'], ['Gorizia', 'GO', 'Friuli-Venezia Giulia'],
  ['Grosseto', 'GR', 'Toscana'], ['Imperia', 'IM', 'Liguria'], ['Isernia', 'IS', 'Molise'], ['La Spezia', 'SP', 'Liguria'],
  ['L\'Aquila', 'AQ', 'Abruzzo'], ['Latina', 'LT', 'Lazio'], ['Lecce', 'LE', 'Puglia'], ['Lecco', 'LC', 'Lombardia'],
  ['Livorno', 'LI', 'Toscana'], ['Lodi', 'LO', 'Lombardia'], ['Lucca', 'LU', 'Toscana'], ['Macerata', 'MC', 'Marche'],
  ['Mantova', 'MN', 'Lombardia'], ['Massa', 'MS', 'Toscana'], ['Matera', 'MT', 'Basilicata'], ['Messina', 'ME', 'Sicilia'],
  ['Milano', 'MI', 'Lombardia'], ['Modena', 'MO', 'Emilia-Romagna'], ['Monza', 'MB', 'Lombardia'], ['Napoli', 'NA', 'Campania'],
  ['Novara', 'NO', 'Piemonte'], ['Nuoro', 'NU', 'Sardegna'], ['Oristano', 'OR', 'Sardegna'], ['Padova', 'PD', 'Veneto'],
  ['Palermo', 'PA', 'Sicilia'], ['Parma', 'PR', 'Emilia-Romagna'], ['Pavia', 'PV', 'Lombardia'], ['Perugia', 'PG', 'Umbria'],
  ['Pesaro', 'PU', 'Marche'], ['Pescara', 'PE', 'Abruzzo'], ['Piacenza', 'PC', 'Emilia-Romagna'], ['Pisa', 'PI', 'Toscana'],
  ['Pistoia', 'PT', 'Toscana'], ['Pordenone', 'PN', 'Friuli-Venezia Giulia'], ['Potenza', 'PZ', 'Basilicata'], ['Prato', 'PO', 'Toscana'],
  ['Ragusa', 'RG', 'Sicilia'], ['Ravenna', 'RA', 'Emilia-Romagna'], ['Reggio Calabria', 'RC', 'Calabria'], ['Reggio Emilia', 'RE', 'Emilia-Romagna'],
  ['Rieti', 'RI', 'Lazio'], ['Rimini', 'RN', 'Emilia-Romagna'], ['Roma', 'RM', 'Lazio'], ['Rovigo', 'RO', 'Veneto'],
  ['Salerno', 'SA', 'Campania'], ['Sassari', 'SS', 'Sardegna'], ['Savona', 'SV', 'Liguria'], ['Siena', 'SI', 'Toscana'],
  ['Siracusa', 'SR', 'Sicilia'], ['Sondrio', 'SO', 'Lombardia'], ['Taranto', 'TA', 'Puglia'], ['Teramo', 'TE', 'Abruzzo'],
  ['Terni', 'TR', 'Umbria'], ['Torino', 'TO', 'Piemonte'], ['Trapani', 'TP', 'Sicilia'], ['Trento', 'TN', 'Trentino-Alto Adige'],
  ['Treviso', 'TV', 'Veneto'], ['Trieste', 'TS', 'Friuli-Venezia Giulia'], ['Udine', 'UD', 'Friuli-Venezia Giulia'], ['Varese', 'VA', 'Lombardia'],
  ['Venezia', 'VE', 'Veneto'], ['Verbania', 'VB', 'Piemonte'], ['Vercelli', 'VC', 'Piemonte'], ['Verona', 'VR', 'Veneto'],
  ['Vibo Valentia', 'VV', 'Calabria'], ['Vicenza', 'VI', 'Veneto'], ['Viterbo', 'VT', 'Lazio'],
  // Frequent non-capoluoghi
  ['Casalecchio di Reno', 'BO', 'Emilia-Romagna'], ['San Giovanni in Persiceto', 'BO', 'Emilia-Romagna'], ['Imola', 'BO', 'Emilia-Romagna'],
  ['San Giorgio a Cremano', 'NA', 'Campania'], ['Pozzuoli', 'NA', 'Campania'], ['Sorrento', 'NA', 'Campania'],
  ['Monopoli', 'BA', 'Puglia'], ['Polignano a Mare', 'BA', 'Puglia'], ['Ostuni', 'BR', 'Puglia'], ['Noto', 'SR', 'Sicilia'],
  ['Cefalù', 'PA', 'Sicilia'], ['Taormina', 'ME', 'Sicilia'], ['Alba', 'CN', 'Piemonte'], ['Ivrea', 'TO', 'Piemonte'],
  ['Rovereto', 'TN', 'Trentino-Alto Adige'], ['Merano', 'BZ', 'Trentino-Alto Adige'], ['Bassano del Grappa', 'VI', 'Veneto'],
  ['Tropea', 'VV', 'Calabria'], ['Olbia', 'SS', 'Sardegna'], ['Alghero', 'SS', 'Sardegna'], ['Pantelleria', 'TP', 'Sicilia'],
];

export const COMUNE_NAMES = new Set(COMUNI.map(c => c[0]));

// Territory landing pages (design 51): regions and cities offered as tabs.
export const REGIONS = ['Lombardia', 'Lazio', 'Campania', 'Sicilia', 'Veneto', 'Emilia-Romagna', 'Piemonte', 'Puglia', 'Toscana', 'Calabria', 'Liguria', 'Sardegna', 'Marche', 'Abruzzo', 'Friuli-Venezia Giulia', 'Trentino-Alto Adige', 'Umbria', 'Basilicata', 'Molise', 'Valle d\'Aosta'];
export const TERRITORY_CITIES = ['Roma', 'Milano', 'Napoli', 'Torino', 'Palermo', 'Genova', 'Bologna', 'Firenze', 'Bari', 'Catania'];

export const catalog = {
  areas: AREAS, sectors: SECTORS, sources: SOURCES, ageBands: AGE_BANDS, years: YEARS, ideaStages: IDEA_STAGES,
  time: TIME, start: START, seekingLocation: SEEKING_LOCATION, reportReasons: REPORT_REASONS,
  workArrangements: WORK_ARRANGEMENTS, employmentTypes: EMPLOYMENT_TYPES, availability: AVAILABILITY,
  comuni: COMUNI, regions: REGIONS, territoryCities: TERRITORY_CITIES,
};

export const label = (pairs, value) => pairs.find(p => p[0] === value)?.[1] ?? null;

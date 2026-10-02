// Test people, made from the admin panel ("Utenti" → "Crea 10 persone di prova") to try the site
// with a populated community, and removed with one click. They are complete, online profiles with a
// generated avatar. Their addresses use a reserved domain that never receives mail: no email is ever
// sent to them (mail.js), and they're left out of the public numbers on the territory pages.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { audit } from './admin.js';
import { ageBandFor } from './catalog.js';
import { config } from './config.js';
import { newId, now, tx } from './db.js';
import { attachUpload } from './files.js';
import { eraseAccount } from './privacy.js';
import { arrivedRange } from './profiles.js';

export const DEMO_DOMAIN = 'prova.rientro.invalid';
export const isDemoEmail = email => typeof email === 'string' && email.toLowerCase().endsWith(`@${DEMO_DOMAIN}`);
export const NOT_DEMO_SQL = `u.email NOT LIKE '%@${DEMO_DOMAIN}'`;

const PEOPLE = [
  { first: 'Giulia', last: 'Ferrara', year: 1991, lives: ['abroad', 'Regno Unito', 'Londra'], want: ['Palermo', 'Catania'], intent: 'has_idea', idea: ['Agriturismo digitale sull’Etna', 'Prenotazioni e vendita diretta per piccoli produttori dell’Etna, con esperienze per chi viaggia.', 'prototype'], area: 'Prodotto', role: 'Senior Product Manager', company: 'Deliveroo', years: '8-12', sectors: ['Turismo', 'Food & Agritech'], seek: ['Tech / Engineering', 'Marketing / Growth'], time: 'full_time', start: '6_months', bio: 'Dieci anni a Londra tra marketplace e food delivery. Torno in Sicilia per costruire qualcosa che resti: cerco un CTO con cui partire dal primo prototipo.', misses: 'Il mare d’inverno e il pranzo della domenica.' },
  { first: 'Marco', last: 'Esposito', year: 1988, lives: ['abroad', 'Germania', 'Berlino'], want: ['Napoli'], intent: 'seeking_idea', area: 'Tech / Engineering', role: 'Staff Engineer', company: 'Zalando', years: '13+', sectors: ['AI', 'SaaS'], seek: ['Prodotto', 'Business / Sales'], time: 'full_time', start: '1_year', bio: 'Backend e infrastruttura da quindici anni, gli ultimi otto a Berlino. Non ho ancora un’idea, ho tanta voglia di trovarla con qualcuno a Napoli.', misses: 'La pizza a portafoglio e il caos buono.' },
  { first: 'Sara', last: 'Lombardo', year: 1994, lives: ['abroad', 'Paesi Bassi', 'Amsterdam'], want: ['Bari', 'Lecce'], intent: 'networking', area: 'Design', role: 'Product Designer', company: 'Booking.com', years: '4-7', sectors: ['Moda & Design', 'Turismo'], seek: ['Prodotto'], time: 'part_time', start: 'later', bio: 'Designer in Olanda da sei anni. Sto pensando al rientro in Puglia e voglio conoscere chi l’ha già fatto: un caffè, un consiglio, un contatto.', misses: 'La luce di Lecce alle sette di sera.' },
  { first: 'Luca', last: 'Romano', year: 1986, lives: ['italy', 'Italia', 'Bologna'], arrived: ['Svizzera', 'Zurigo', '1_2y'], want: ['Bologna'], intent: 'has_idea', idea: ['Software per cantine', 'Gestionale semplice per piccole cantine: vendemmia, magazzino, vendita online.', 'revenue'], area: 'Business / Sales', role: 'Founder', company: 'Vinario', years: '13+', sectors: ['SaaS', 'Food & Agritech'], seek: ['Tech / Engineering'], time: 'full_time', start: 'now', bio: 'Rientrato da Zurigo dopo anni in consulenza. Ho i primi clienti e cerco un socio tecnico che creda nel progetto.', misses: '' },
  { first: 'Chiara', last: 'Greco', year: 1997, lives: ['abroad', 'Francia', 'Parigi'], want: ['Reggio di Calabria', 'Cosenza'], intent: 'seeking_idea', area: 'Marketing / Growth', role: 'Growth Marketer', company: 'BlaBlaCar', years: '4-7', sectors: ['Mobilità', 'Climate'], seek: ['Tech / Engineering', 'Prodotto'], time: 'tbd', start: '1_year', bio: 'Growth e community a Parigi. Voglio tornare in Calabria e lavorare su mobilità e clima: cerco persone con cui capire da dove partire.', misses: 'Le montagne della Sila.' },
  { first: 'Davide', last: 'Ricci', year: 1990, lives: ['abroad', 'Spagna', 'Barcellona'], want: ['Cagliari'], intent: 'has_idea', idea: ['Energia per i borghi', 'Comunità energetiche per piccoli comuni sardi, dal progetto alla gestione.', 'idea'], area: 'Operations', role: 'Operations Lead', company: 'Glovo', years: '8-12', sectors: ['Climate', 'Impact / Non profit'], seek: ['Finanza', 'Tech / Engineering'], time: 'part_time', start: '6_months', bio: 'Operations in scale-up spagnole. Ho un’idea sulle comunità energetiche in Sardegna e cerco chi mi aiuti a capire se regge.', misses: 'Il maestrale.' },
  { first: 'Francesca', last: 'Marino', year: 1985, lives: ['italy', 'Italia', 'Torino'], always: true, want: ['Torino', 'Milano'], intent: 'networking', area: 'Finanza', role: 'Investment Manager', company: 'Fondo regionale', years: '13+', sectors: ['Fintech', 'Manifattura'], seek: ['Business / Sales'], time: 'part_time', start: 'now', bio: 'Lavoro con startup e PMI del Nord-Ovest. Mi piace conoscere chi rientra e mettere in contatto le persone giuste.', misses: '' },
  { first: 'Andrea', last: 'Gallo', year: 1999, lives: ['abroad', 'Stati Uniti', 'New York'], want: ['Roma'], intent: 'seeking_idea', area: 'Ricerca / Scienza', role: 'PhD, Biotech', company: 'Columbia University', years: '0-3', sectors: ['HealthTech', 'AI'], seek: ['Business / Sales', 'Prodotto'], time: 'full_time', start: 'later', bio: 'Dottorato in biotecnologie a New York. Vorrei tornare a Roma con un progetto tra ricerca e impresa, ancora tutto da definire.', misses: 'Le passeggiate a Trastevere.' },
  { first: 'Elena', last: 'Conti', year: 1992, lives: ['italy', 'Italia', 'Milano'], want: ['Palermo'], intent: 'has_idea', idea: ['Scuola di coding per ragazze', 'Corsi serali di programmazione per ragazze e donne nel Sud, con aziende partner.', 'prototype'], area: 'Tech / Engineering', role: 'Engineering Manager', company: 'Satispay', years: '8-12', sectors: ['Education', 'Impact / Non profit'], seek: ['Marketing / Growth', 'Operations'], time: 'part_time', start: '6_months', bio: 'Dieci anni a Milano tra fintech e team tecnici. Il prossimo passo è Palermo, con una scuola di coding che sto già testando.', misses: 'Le arancine, ovviamente.' },
  { first: 'Matteo', last: 'Bruno', year: 1983, lives: ['abroad', 'Svezia', 'Stoccolma'], want: ['Firenze', 'Perugia'], intent: 'networking', area: 'Tech / Engineering', role: 'CTO', company: 'Klarna (ex)', years: '13+', sectors: ['Fintech', 'Dev tools'], seek: ['Prodotto', 'Design'], time: 'tbd', start: '1_year', bio: 'CTO in Svezia per molti anni. Rientro in Toscana con la famiglia e voglio conoscere chi sta costruendo qualcosa nel Centro Italia.', misses: 'Le colline e il pane sciapo.' },
];

// A plain 400×400 PNG avatar: soft two-tone background and a head-and-shoulders silhouette
function avatar(seed) {
  const W = 400, H = 400;
  const palette = [[108, 77, 245], [26, 23, 38], [62, 43, 168], [217, 119, 87], [47, 163, 107], [212, 154, 26], [142, 127, 224], [180, 60, 90]];
  const [r1, g1, b1] = palette[seed % palette.length];
  const [r2, g2, b2] = palette[(seed + 3) % palette.length];
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const t = (x + y) / (W + H);
      let r = r1 + (r2 - r1) * t, g = g1 + (g2 - g1) * t, b = b1 + (b2 - b1) * t;
      const head = (x - 200) ** 2 + (y - 165) ** 2 < 72 ** 2;
      const body = y > 255 && ((x - 200) / 150) ** 2 + ((y - 400) / 140) ** 2 < 1;
      if (head || body) { r = r + (255 - r) * 0.82; g = g + (255 - g) * 0.82; b = b + (255 - b) * 0.82; }
      const i = y * (W * 3 + 1) + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '');

export function createDemoPeople(db, admin) {
  const created = [];
  const ts = now();
  PEOPLE.forEach((p, i) => {
    const email = `${slug(p.first)}.${slug(p.last)}@${DEMO_DOMAIN}`;
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return;
    const id = newId();
    tx(db, () => {
      db.prepare("INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES (?, ?, 'member', 'approved', ?, ?)").run(id, email, ts, ts);
      const [livesIn, country, city] = p.lives;
      const arrived = p.arrived ?? [];
      db.prepare(`INSERT INTO profiles (user_id, lives_in, lives_in_country, lives_in_city, arrived_from_country, arrived_from_city, always_in_italy,
          desired_comuni, primary_intent, idea_title, idea_description, idea_stage, first_name, last_name, birth_year, age_band, bio,
          background_area, current_role, current_company, years_experience, sectors, seeking_backgrounds, time_commitment, start_when,
          misses_italy, linkedin_url, source, visible, submitted_at, approved_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).run(
        id, livesIn, country, city, arrived[0] ?? null, arrived[1] ?? null, p.always ? 1 : 0,
        JSON.stringify(p.want), p.intent, p.idea?.[0] ?? null, p.idea?.[1] ?? null, p.idea?.[2] ?? null, p.first, p.last, p.year, ageBandFor(p.year), p.bio,
        p.area, p.role, p.company, p.years, JSON.stringify(p.sectors), JSON.stringify(p.seek), p.time, p.start,
        p.misses || null, `https://www.linkedin.com/in/${slug(p.first)}-${slug(p.last)}-prova`, 'Passaparola, un amico o collega', ts, ts, ts,
      );
      if (p.arrived) {
        const r = arrivedRange(p.arrived[2]);
        db.prepare('UPDATE profiles SET arrived_after = ?, arrived_before = ? WHERE user_id = ?').run(r.arrived_after, r.arrived_before, id);
      }
    });
    const buf = avatar(i);
    const key = crypto.randomBytes(24).toString('hex');
    fs.mkdirSync(config.uploadDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(config.uploadDir, key), buf, { mode: 0o600 });
    attachUpload(db, { id, status: 'approved' }, 'profile_photo', { key, mime: 'image/png', size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
    created.push(id);
  });
  audit(db, admin.id, 'demo.create', null, { count: created.length });
  return { created: created.length, total: demoCount(db) };
}

// Gone for good, with everything they touched (connections, messages, files): like an erased account
export function removeDemoPeople(db, admin) {
  const users = db.prepare(`SELECT * FROM users u WHERE u.email LIKE '%@${DEMO_DOMAIN}'`).all();
  for (const u of users) eraseAccount(db, u);
  audit(db, admin.id, 'demo.remove', null, { count: users.length });
  return { removed: users.length, total: 0 };
}

export const demoCount = db => db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE u.email LIKE '%@${DEMO_DOMAIN}'`).get().n;

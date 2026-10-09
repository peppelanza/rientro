// What search engines and link previews (LinkedIn, WhatsApp, Facebook, X) get from a public page
// before any JavaScript runs: its own title and description, the canonical address, the preview
// image (Open Graph / Twitter), structured data (schema.org) and the page's text written into
// #app (hidden, .ssr-page: the app draws the real page over it). Member pages aren't here: they
// need signing in. The texts come from the pages themselves (their data, or their template with
// the app's markup taken out), so they never drift apart.
import fs from 'node:fs';
import path from 'node:path';
import { REGIONS, TERRITORY_CITIES } from './catalog.js';
import { config, isLaunched } from './config.js';
import { groupIds, groupPageHtml } from './groups.js';
import { photoSlug, resolveTerritory, territory } from './public.js';

const page = name => path.join(config.publicDir, 'app', 'pages', name);
const pages = {
  home: await import('../public/app/pages/home.js'),
  cervelli: await import('../public/app/pages/cervelli.js'),
  legal: await import('../public/app/pages/legal.js'),
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n = 160) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);
const abs = p => `${config.baseUrl}${p}`;

export const SITE_DESCRIPTION = 'Rientro è la community gratuita per chi torna in Italia o al Sud: trova persone con cui fare rete, fondare un’azienda o costruire un progetto.';
const OG = { home: '/img/og/home.png', cervelli: '/img/og/rientro-dei-cervelli.png', press: '/img/og/press.png' };
const ORG = {
  '@type': 'Organization', '@id': abs('/#organizzazione'), name: 'Rientro', url: abs('/'),
  logo: abs('/press/brand/rientro-icona.png'), email: 'ciao@rientro.it',
};

// --- A page's template as plain HTML -------------------------------------------------------
// Lists (sc-for) are filled from vals, conditions (sc-if) kept or dropped, the app's components
// left out (an eyebrow keeps its text), and styles, classes, events and icons removed.
const get = (scope, expr) => expr.trim().split('.').reduce((o, k) => (o == null ? o : o[k]), scope);
function fill(html, scope) {
  let prev;
  do { // innermost conditions first
    prev = html;
    html = html.replace(/<sc-if value="\{\{([^}]+)\}\}">((?:(?!<sc-if)[\s\S])*?)<\/sc-if>/g, (_, e, inner) => (get(scope, e) ? inner : ''));
  } while (html !== prev);
  return html.replace(/\{\{([^}]+)\}\}/g, (_, e) => { const v = get(scope, e); return typeof v === 'string' || typeof v === 'number' ? esc(v) : ''; });
}
export function templateText(file, vals = {}) {
  let html = fs.readFileSync(page(file), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<helmet>[\s\S]*?<\/helmet>/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '');
  html = html.replace(/<sc-for list="\{\{\s*(\w+)\s*\}\}" as="(\w+)">([\s\S]*?)<\/sc-for>/g,
    (_, list, as, body) => (vals[list] ?? []).map(item => fill(body, { ...vals, [as]: item })).join(''));
  html = fill(html, vals)
    .replace(/<dc-import name="UI Eyebrow" text="([^"]*)"[^>]*><\/dc-import>/g, '<p>$1</p>')
    .replace(/<dc-import[^>]*><\/dc-import>/g, '')
    .replace(/<(button|input|label|select|textarea)\b[\s\S]*?<\/\1>|<input[^>]*>/g, '')
    .replace(/\s(?:style|class|on[A-Za-z]+|data-[\w-]+|host-[\w-]+|aria-[\w-]+|role|tabindex|loading|decoding|draggable)="[^"]*"/g, '')
    .replace(/<(div|span|section|p)>\s*<\/\1>/g, '');
  return html.replace(/\n\s*\n+/g, '\n').trim();
}

// The questions in the guide's #faq block: [question, answer]
function guideFaq() {
  const html = fs.readFileSync(page('cervelli.html'), 'utf8');
  const block = html.slice(html.indexOf('id="faq"'), html.indexOf('</article>'));
  return [...block.matchAll(/<span style="font-weight:600[^"]*">([\s\S]*?)<\/span><span[^>]*>([\s\S]*?)<\/span>/g)].map(m => [m[1], m[2]]);
}
const faqPage = pairs => ({
  '@type': 'FAQPage',
  mainEntity: pairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

const nav = () => `<nav><a href="/">Rientro</a> · <a href="/rientro-dei-cervelli">Rientro dei cervelli</a> · <a href="/press">Press</a>
<p>Rientrare in: ${REGIONS.map(r => `<a href="/territori/${photoSlug(r)}">${esc(r)}</a>`).join(', ')}</p>
<p>Città: ${TERRITORY_CITIES.map(c => `<a href="/territori/${photoSlug(c)}">${esc(c)}</a>`).join(', ')}</p>
<p><a href="/legal/privacy">Privacy Policy</a> · <a href="/legal/termini">Termini</a> · <a href="/legal/cookie">Cookie Policy</a></p></nav>`;
const wrap = inner => `<div class="ssr-page">${inner}\n${nav()}</div>`;

// --- Pages --------------------------------------------------------------------------------
// path → { title, description, image, type, robots, ld[], body } | { redirect } | { notFound } | null
export function seoFor(db, p) {
  if (p === '/' || p === '/prelancio') {
    const { title, faq, steps, forWho } = pages.home;
    return {
      canonical: '/', title: `${title} · Rientro`, description: SITE_DESCRIPTION, image: OG.home,
      ld: [ORG, { '@type': 'WebSite', '@id': abs('/#sito'), name: 'Rientro', url: abs('/'), inLanguage: 'it-IT', publisher: { '@id': ORG['@id'] } }, faqPage(faq.map(f => [f.q, f.a]))],
      body: wrap(templateText('home.html', { faq, steps, forWho, launched: isLaunched(), heroPeople: [] })),
    };
  }
  if (p === '/rientro-dei-cervelli') {
    const { title, description } = pages.cervelli;
    return {
      canonical: p, title: `${title} · Rientro`, description, image: OG.cervelli, type: 'article',
      ld: [ORG, {
        '@type': 'Article', headline: title, description, inLanguage: 'it-IT', image: abs(OG.cervelli),
        mainEntityOfPage: abs(p), author: { '@id': ORG['@id'] }, publisher: { '@id': ORG['@id'] },
      }, faqPage(guideFaq())],
      body: wrap(templateText('cervelli.html')),
    };
  }
  if (p === '/press') {
    return {
      canonical: p, title: 'Press · Rientro', image: OG.press, ld: [ORG],
      description: 'Logo, icone e materiali per la stampa di Rientro, la community per chi torna in Italia o al Sud. Contatti stampa: ciao@rientro.it.',
      body: wrap(`<main><h1>Press · materiali per la stampa</h1>
<h2>Brand</h2><ul>${['rientro-logo', 'rientro-logo-bianco', 'rientro-icona', 'rientro-icona-bianca'].flatMap(f => ['svg', 'png', 'jpg'].map(x => `<li><a href="/press/brand/${f}.${x}">${f}.${x}</a></li>`)).join('')}</ul>
<h2>Ufficio stampa</h2><ul><li><a href="/press/ufficio-stampa/rientro-comunicato-stampa.pdf">Comunicato stampa (PDF)</a></li></ul>
<p><a href="/press/rientro-press-kit.pdf">Rientro · Press kit (PDF)</a></p>
<p>Contatti stampa: <a href="mailto:ciao@rientro.it">ciao@rientro.it</a></p></main>`),
    };
  }
  const legal = /^\/legal\/(privacy|termini|cookie)$/.exec(p);
  if (legal) {
    const doc = pages.legal.DOCS[legal[1]];
    return {
      canonical: p, title: `${doc.title} · Rientro`, image: OG.home, ld: [ORG],
      description: clip(`${doc.title} di Rientro. ${doc.summary.map(s => s[1]).join(' ')}`),
      body: wrap(`<main><h1>${esc(doc.title)}</h1><p>${esc(doc.updated)}</p>
${doc.summary.map(([t, d]) => `<h3>${esc(t)}</h3><p>${esc(d)}</p>`).join('')}
${doc.sections.map(([t, ps], i) => `<section id="s${i + 1}"><h2>${i + 1}. ${esc(t)}</h2>${ps.map(x => `<p>${esc(x)}</p>`).join('')}</section>`).join('\n')}</main>`),
    };
  }
  const terr = /^\/territori\/([^/]+)$/.exec(p);
  if (terr) {
    let raw;
    try { raw = decodeURIComponent(terr[1]); } catch { return { notFound: true }; }
    const name = resolveTerritory(raw);
    if (!name) return { notFound: true };
    const t = territory(db, name);
    if (!t) return { notFound: true };
    // One address per territory: /territori/Napoli → /territori/napoli
    if (terr[1] !== t.slug) return { redirect: `/territori/${t.slug}` };
    const description = `Chi vive all'estero e vuole tornare ${t.prep} ${t.name} è già su Rientro. Trova le persone con cui costruire un'azienda o un progetto.`;
    const listed = t.kind === 'region' || TERRITORY_CITIES.includes(t.name);
    return {
      canonical: `/territori/${t.slug}`, title: `Tornare ${t.prep} ${t.name}, con qualcuno · Rientro`, description,
      image: t.photo?.endsWith('.jpg') ? t.photo : OG.home, ld: [ORG],
      // the many small comuni have a page but not one worth indexing: the regions and the main cities do
      robots: listed ? null : 'noindex, follow',
      body: wrap(`<main><h1>Tornare ${esc(t.prep)} ${esc(t.name)}, con qualcuno</h1><p>${esc(description)}</p>
${t.count ? `<p>${t.count} persone vogliono vivere ${esc(t.prep)} ${esc(t.name)}.</p>` : ''}
${t.places.length ? `<h2>Altri comuni ${t.kind === 'region' ? `${esc(t.prep)} ${esc(t.name)}` : `${esc(t.regionPrep ?? 'in')} ${esc(t.region ?? '')}`}</h2><p>${t.places.map(c => (c.linkable ? `<a href="/territori/${photoSlug(c.name)}">${esc(c.name)}</a>` : esc(c.name))).join(', ')}</p>` : ''}
<p><a href="/accedi">Accedi a Rientro</a></p></main>`),
    };
  }
  if (p === '/accedi') return { canonical: p, title: 'Accedi a Rientro · Rientro', description: SITE_DESCRIPTION, image: OG.home, robots: 'noindex, follow', ld: [] };
  const group = /^\/gruppi\/([^/]+)$/.exec(p);
  if (group) {
    let id;
    try { id = decodeURIComponent(group[1]); } catch { return { notFound: true }; }
    const g = groupPageHtml(db, id);
    if (!g) return { notFound: true };
    return { canonical: p, title: g.title, description: clip(g.description), image: OG.home, ld: [ORG], body: g.body };
  }
  return null;
}

// The app's page with a page's head and text written in
export function pageHtml(shellHtml, seo) {
  const url = abs(seo.canonical);
  const img = abs(seo.image ?? OG.home);
  const ld = (seo.ld ?? []).length ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': seo.ld }).replace(/</g, '\\u003c')}</script>` : '';
  const head = [
    `<link rel="canonical" href="${esc(url)}">`,
    seo.robots ? `<meta name="robots" content="${esc(seo.robots)}">` : '',
    `<meta property="og:type" content="${seo.type ?? 'website'}">`,
    '<meta property="og:site_name" content="Rientro">',
    '<meta property="og:locale" content="it_IT">',
    `<meta property="og:title" content="${esc(seo.title)}">`,
    `<meta property="og:description" content="${esc(seo.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    ...(Object.values(OG).includes(seo.image ?? OG.home) ? ['<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">'] : []),
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(seo.title)}">`,
    `<meta name="twitter:description" content="${esc(seo.description)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
    ld,
  ].filter(Boolean).join('\n');
  return shellHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(seo.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(seo.description)}">`)
    .replace('</head>', `${head}\n</head>`)
    .replace('<div id="app" aria-live="polite"></div>', `<div id="app" aria-live="polite">${seo.body ?? ''}</div>`);
}

// Every public page worth finding: the home, the guide, Press, the legal pages, the regions and
// main cities, the groups
export const sitemapPaths = db => [
  '/', '/rientro-dei-cervelli', '/press', '/legal/privacy', '/legal/termini', '/legal/cookie',
  ...REGIONS.map(r => `/territori/${photoSlug(r)}`), ...TERRITORY_CITIES.map(c => `/territori/${photoSlug(c)}`),
  ...groupIds(db).map(id => `/gruppi/${id}`),
];

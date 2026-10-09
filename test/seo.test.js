// What search engines and link previews get before any JavaScript: own title and description,
// canonical address, preview image, structured data and the page's text; real 404s; the sitemap.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { startApp } from './helpers.js';

const t = await startApp();
after(() => t.close());
const page = async p => {
  const r = await fetch(`${t.base}${p}`, { redirect: 'manual' });
  return { status: r.status, location: r.headers.get('location'), html: await r.text() };
};
const tag = (html, re) => html.match(re)?.[1] ?? null;
const ld = html => JSON.parse(tag(html, /<script type="application\/ld\+json">(.*?)<\/script>/s))['@graph'];
const text = html => html.slice(html.indexOf('<div id="app"'), html.indexOf('<script type="module"')).replace(/<[^>]+>/g, ' ');

test('every public page has its own title, description, canonical address and preview', async () => {
  const seen = new Set();
  for (const p of ['/', '/rientro-dei-cervelli', '/press', '/legal/privacy', '/territori/sicilia', '/territori/napoli']) {
    const { status, html } = await page(p);
    assert.equal(status, 200, p);
    const title = tag(html, /<title>([^<]*)<\/title>/);
    assert.ok(title && title !== 'Rientro' && !seen.has(title), `${p}: own title`);
    seen.add(title);
    assert.ok(tag(html, /<meta name="description" content="([^"]+)">/)?.length > 50, `${p}: description`);
    assert.ok(tag(html, /<link rel="canonical" href="([^"]+)">/).endsWith(p === '/' ? '/' : p), `${p}: canonical`);
    assert.match(tag(html, /<meta property="og:image" content="([^"]+)">/), /\/img\/og\/[\w-]+\.png$/, `${p}: preview image`);
    assert.equal(tag(html, /<meta name="twitter:card" content="([^"]+)">/), 'summary_large_image');
    assert.ok(text(html).split(/\s+/).filter(Boolean).length > 50, `${p}: the page's text is in the HTML`);
  }
});

test('the text and the FAQ data come from the pages themselves', async () => {
  const home = (await page('/')).html;
  assert.match(text(home), /Rientra in Italia o al Sud/);
  assert.match(text(home), /Quanto costa\?/);
  assert.deepEqual(ld(home).map(x => x['@type']), ['Organization', 'WebSite', 'FAQPage']);
  assert.equal(ld(home)[2].mainEntity.find(q => q.name === 'Quanto costa?').acceptedAnswer.text, 'Niente. Rientro è gratuito.');
  assert.ok(!/\{\{|<dc-import|<sc-if|style="/.test(home.slice(home.indexOf('<div id="app"'))), 'no template markup or inline styles left');

  const guide = (await page('/rientro-dei-cervelli')).html;
  assert.match(text(guide), /I cinque requisiti/);
  const [, article, faq] = ld(guide);
  assert.equal(article['@type'], 'Article');
  assert.equal(faq.mainEntity[0].name, 'Serve la laurea?');
  assert.equal(tag(guide, /<meta property="og:type" content="([^"]+)">/), 'article');
});

test('territories: one address each, unknown ones are a real 404, small comuni not indexed', async () => {
  assert.deepEqual([(await page('/territori/Napoli')).status, (await page('/territori/Napoli')).location], [301, '/territori/napoli']);
  assert.equal((await page('/territori/zzzz')).status, 404);
  assert.equal(tag((await page('/territori/sicilia')).html, /<meta name="robots" content="([^"]+)">/), null);
  assert.equal(tag((await page('/territori/vizzini')).html, /<meta name="robots" content="([^"]+)">/), 'noindex, follow');
  assert.equal(tag((await page('/accedi')).html, /<meta name="robots" content="([^"]+)">/), 'noindex, follow');
  assert.equal((await page('/gruppi/non-esiste')).status, 404);
});

test('the sitemap lists the guide, Press, the legal pages, regions, main cities and groups', async () => {
  const xml = (await page('/sitemap.xml')).html;
  for (const p of ['/', '/rientro-dei-cervelli', '/press', '/legal/termini', '/territori/sicilia', '/territori/napoli', '/gruppi/generale']) {
    assert.ok(xml.includes(`${p}</loc>`), p);
  }
  assert.ok(!xml.includes('/territori/vizzini'));
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.equal(new Set(locs).size, locs.length, 'no address twice');
});

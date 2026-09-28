// Territory landing (design 07 · 51a desktop, 51b mobile). Public page: aggregates only, every
// count under 5 is hidden server-side, and no person cards (profiles are members-only, 39a).
import { Page, homeFor, peekMe } from './_base.js';

export const title = 'Rientro';

const few = v => (v == null ? 'meno di 5' : v.toLocaleString('it-IT'));
// Same as photoSlug in src/public.js: "Valle d'Aosta" → valle-d-aosta
const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default class extends Page {
  async load() {
    const place = decodeURIComponent(this.props.params.luogo);
    const [me, t] = await Promise.all([peekMe(), fetch(`/api/public/territory/${encodeURIComponent(place)}`).then(r => (r.ok ? r.json() : null))]);
    Object.assign(this.state, { me, t, place });
    if (t) {
      // One address per territory: /territori/Napoli and /territori/NAPOLI become /territori/napoli
      if (place !== t.slug) history.replaceState(history.state, '', `/territori/${t.slug}${location.search}${location.hash}`);
      document.title = `Tornare ${t.prep} ${t.name}, con qualcuno · Rientro`;
      document.querySelector('meta[name=description]')?.setAttribute('content', `Chi vive all'estero e vuole tornare ${t.prep} ${t.name} è già su Rientro. Trova le persone con cui costruire un'azienda o un progetto.`);
    }
  }

  renderVals() {
    const s = this.state;
    if (!s.ready) return { loading: true };
    const t = s.t;
    if (!t) return { loading: false, notFound: true, place: s.place };
    const isCity = t.kind === 'city';
    const enterHref = s.me ? homeFor(s.me) : '/accedi';
    const link = x => ({ label: x, href: `/territori/${slug(x)}` });
    const abc = list => list.filter(x => x !== t.name).sort((a, b) => a.localeCompare(b, 'it')).map(link);
    const otherRegions = abc(t.regions);
    const otherCities = abc(t.cities);
    return {
      loading: false, notFound: false, isCity, region: t.region, regionHref: t.region ? `/territori/${slug(t.region)}` : '#',
      name: t.name, prep: t.prep, nameUpper: t.name.toUpperCase(),
      eyebrow: `Rientro ${t.prep} ${t.name}`,
      lede: `Chi vive all'estero e vuole tornare ${t.prep} ${t.name} è già qui. Trova le persone con cui costruire un'azienda o un progetto${isCity ? ' in città' : ''}.`,
      cta: `Scopri chi torna ${t.prep} ${t.name} →`, photoLabel: `FOTO · ${t.name.toUpperCase()}`, photo: t.photo || '', photoAlt: t.name,
      stats: [
        { v: few(t.count), l: `persone vogliono vivere ${t.prep} ${t.name}` },
        { v: few(t.living), l: 'ci vivono già e cercano soci' },
        { v: few(t.idea), l: "hanno già un'idea da costruire" },
      ],
      origins: t.origins.map(o => ({ from: o.from.toUpperCase(), to: t.name.toUpperCase(), n: String(o.n) })), hasOrigins: t.origins.length > 0,
      sectors: t.sectors.map(x => ({ l: x.l, n: String(x.n) })), hasSectors: t.sectors.length > 0,
      idea: few(t.idea), explore: few(t.explore),
      placesTitle: isCity ? `Altre città in ${t.region}` : `Città in ${t.name}`,
      places: t.places.slice(0, 12).map(c => ({ name: c.name, n: c.n == null ? 'Meno di 5 persone' : `${c.n} persone`, href: `/territori/${slug(c.name)}` })),
      steps: [
        { n: '01', t: 'Crea il profilo', d: `Indica ${t.name} tra i posti dove vuoi vivere. Ci vogliono circa 10 minuti.` },
        { n: '02', t: 'Lo rivediamo', d: 'Ogni profilo viene letto da una persona prima di andare online.' },
        { n: '03', t: 'Connettiti', d: 'Invii una richiesta. Se viene accettata, si apre la chat.' },
      ],
      closing: t.count == null ? 'Le prime persone ti aspettano' : `${t.count.toLocaleString('it-IT')} persone ti aspettano`,
      otherRegions, otherCities, enterHref, loginLabel: s.me ? 'Il tuo spazio' : 'Accedi', loginHref: s.me ? homeFor(s.me) : '/accedi?mode=login',
      enter: () => { location.href = enterHref; }, how: () => document.getElementById('come-funziona')?.scrollIntoView(),
      year: new Date().getFullYear(),
    };
  }
}

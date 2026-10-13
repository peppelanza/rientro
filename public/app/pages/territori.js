// Territory landing (design 07 · 51a desktop, 51b mobile). Public page: no statistics (no counts,
// origins or sectors) and no person cards (profiles are members-only, 39a).
import { Page, homeFor, peekMe } from './_base.js';

export const title = 'Rientro';

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
    // Signing in from here: the sign-in page with this territory's postcard (accedi.js)
    const enterHref = s.me ? homeFor(s.me) : `/accedi?citta=${encodeURIComponent(t.name)}`;
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
      found: true,
      placesTitle: isCity ? `Altre città ${t.regionPrep} ${t.region}` : `Città ${t.prep} ${t.name}`,
      places: t.places.slice(0, 12).map(c => ({ name: c.name, href: `/territori/${slug(c.name)}` })),
      steps: [
        { n: '01', t: 'Crea il profilo', d: `Indica ${t.name} tra i posti dove vuoi vivere. Ci vogliono circa 10 minuti.` },
        { n: '02', t: 'Sei online', d: 'Appena lo pubblichi, il tuo profilo è visibile agli altri membri.' },
        { n: '03', t: 'Connettiti', d: 'Invii una richiesta. Se viene accettata, si apre la chat.' },
      ],
      closing: 'Chi torna ti aspetta',
      otherRegions, otherCities, enterHref,
      enter: () => { location.href = enterHref; }, headerProps: { onEnter: () => { location.href = enterHref; } }, how: () => document.getElementById('come-funziona')?.scrollIntoView(),
      year: new Date().getFullYear(),
    };
  }
}

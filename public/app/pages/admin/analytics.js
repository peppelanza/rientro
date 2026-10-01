// Admin · analytics (design 06 · 49a).
import { api } from '../../lib.js';
import { AdminPage } from './_admin.js';

export const title = 'Analytics · Admin';
const PERIOD_LONG = { 1: 'ultime 24 ore', 30: 'ultimi 30 giorni', 90: 'ultimi 90 giorni', 365: 'ultimi 12 mesi' };
const PERIOD_SHORT = { 1: '24 h', 30: '30 g', 90: '90 g', 365: '12 mesi' };
// Cloudflare gives country codes (IT, GB…): their Italian names
const regionNames = new Intl.DisplayNames(['it'], { type: 'region' });
const countryName = c => { try { return /^[A-Z]{2}$/.test(c) ? regionNames.of(c) : c; } catch { return c; } };

export default class extends AdminPage {
  async loadAdmin() { await this.loadPeriod('90'); }

  // Members (our database) and visits (Cloudflare Web Analytics, src/web-analytics.js) side by side
  async loadPeriod(p) {
    const [d, t] = await Promise.all([api('GET', `/api/admin/analytics?period=${p}`), api('GET', `/api/admin/traffic?period=${p}`).catch(() => null)]);
    Object.assign(this.state, { period: p, d, t });
  }

  setPeriod(p) { return this.act(() => this.loadPeriod(p))(); }

  traffic() {
    const t = this.state.t;
    if (!t?.enabled || t.error) return null;
    const n = v => v.toLocaleString('it-IT');
    const max = Math.max(1, ...t.days.map(d => d.visits));
    const mobile = t.devices.filter(d => /mobile|tablet|smartphone/i.test(d.l)).reduce((a, d) => a + d.v, 0);
    const label = { desktop: 'Computer', mobile: 'Telefono', smartphone: 'Telefono', tablet: 'Tablet' };
    const lists = {
      pages: t.pages.map(x => ({ l: x.l, v: n(x.v) })),
      referrers: t.referrers.map(x => ({ l: x.l, v: n(x.v) })),
      refPages: (t.referrer_pages ?? []).map(x => ({ l: x.l, v: n(x.v), href: `https://${x.l}` })),
      countries: t.countries.map(x => ({ l: countryName(x.l), v: n(x.v) })),
      devices: t.devices.map(x => ({ l: label[x.l.toLowerCase()] ?? x.l, v: n(x.v) })),
    };
    return {
      visits: n(t.visits), pageviews: n(t.pageviews), periodLabel: PERIOD_LONG[this.state.period],
      perVisit: t.visits ? `${(t.pageviews / t.visits).toFixed(1).replace('.', ',')} per visita` : '',
      conversion: t.visits ? `${((this.state.d.new_in_period / t.visits) * 100).toFixed(1).replace('.', ',')}%` : '—',
      mobile: t.pageviews ? `${Math.round((mobile / t.pageviews) * 100)}%` : '—',
      refPagesOff: t.referrer_pages === null,
      chartTitle: t.hourly ? 'Visite per ora' : 'Visite per giorno',
      days: t.days.map(d => ({ h: `${(d.visits / max) * 100}%`, title: `${t.hourly ? new Date(d.date).toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : d.date}: ${d.visits} visite, ${d.pageviews} pagine` })),
      ...lists, ...Object.fromEntries(Object.entries(lists).map(([k, v]) => [`no_${k}`, !v.length])),
      no_refPages: t.referrer_pages !== null && !(t.referrer_pages ?? []).length,
    };
  }

  renderVals() {
    const s = this.state;
    if (!s.d) return { loading: true, side: this.side('analytics') };
    const d = s.d;
    const c = d.composition;
    const maxW = Math.max(1, ...d.weeks.map(w => w.requests));
    const other = Math.max(0, 100 - c.full_time - c.part_time);
    return {
      loading: false, side: this.side('analytics'),
      tr: this.traffic(), trOff: !s.t?.enabled, trError: s.t?.error ?? '',
      periodOpts: [{ v: '1', l: '24 h' }, { v: '30', l: '30 g' }, { v: '90', l: '90 g' }, { v: '365', l: '12 mesi' }], period: s.period, periodProps: { onSelect: v => v && this.setPeriod(v) },
      total: d.total.toLocaleString('it-IT'), newIn: `+${d.new_in_period} in ${PERIOD_SHORT[s.period]}`,
      rate: d.requests_per_active, acceptance: `${d.acceptance}%`,
      split: `${d.abroad} / ${d.italy}`, abroadW: `${d.abroad}%`, italyW: `${d.italy}%`,
      methods: d.sign_in_methods.map(m => ({ l: m.l, v: `${m.v}%`, w: `${m.v}%` })),
      sources: d.sources.map(x => ({ l: x.l, v: `${x.v}%` })),
      topCities: d.top_comuni.map((x, i) => ({ i: String(i + 1).padStart(2, '0'), n: x.n, v: String(x.v) })), noCities: !d.top_comuni.length,
      comuniNote: `${d.distinct_comuni} comuni diversi selezionati · ${d.unknown_pct}% “Non lo so ancora”`,
      comp: [
        { l: 'Con idea / senza idea', v: `${c.idea} / ${100 - c.idea}`, segs: [{ w: `${c.idea}%`, c: '#6C4DF5' }, { w: `${100 - c.idea}%`, c: '#1A1726' }] },
        { l: 'Full-time / part-time / da definire', v: `${c.full_time} / ${c.part_time} / ${other}`, segs: [{ w: `${c.full_time}%`, c: '#1A1726' }, { w: `${c.part_time}%`, c: '#6C4DF5' }, { w: `${other}%`, c: '#B9ACF7' }] },
      ],
      bgs: d.backgrounds.map(b => ({ l: b.l, v: `${b.v}%` })),
      weeks: d.weeks.map(w => ({ r: `${(w.requests / maxW) * 100}%`, a: w.requests ? `${(w.accepted / w.requests) * 100}%` : '0%', title: `${w.requests} richieste, ${w.accepted} accettate` })),
    };
  }
}

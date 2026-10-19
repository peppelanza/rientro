// Admin · analytics (design 06 · 49a): Traffico from our server (src/visits.js), Iscrizioni and
// Community from the members' database (src/admin.js analytics), and Cloudflare's own estimate
// (src/web-analytics.js), each section tagged with where its numbers come from.
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
    const [d, t, v] = await Promise.all([api('GET', `/api/admin/analytics?period=${p}`), api('GET', `/api/admin/traffic?period=${p}`).catch(() => null), api('GET', `/api/admin/visits?period=${p}`).catch(() => null)]);
    Object.assign(this.state, { period: p, d, t, v });
  }

  setPeriod(p) { return this.act(() => this.loadPeriod(p))(); }

  // Cloudflare's estimate: only its totals and most viewed pages (its finer lists are sampled: the
  // server's are exact)
  traffic() {
    const t = this.state.t;
    if (!t?.enabled || t.error) return null;
    const n = v => v.toLocaleString('it-IT');
    const pages = t.pages.map(x => ({ l: x.l, v: n(x.v) }));
    return {
      visits: n(t.visits), pageviews: n(t.pageviews),
      perVisit: t.visits ? (t.pageviews / t.visits).toFixed(1).replace('.', ',') : '—',
      pages, noPages: !pages.length,
    };
  }

  // Openings counted by our server (src/visits.js): every opening of the site, also who blocks Cloudflare
  serverVisits() {
    const v = this.state.v;
    if (!v) return null;
    const t = this.state.t;
    const n = x => x.toLocaleString('it-IT');
    const max = Math.max(1, ...v.days.map(d => d.n));
    // Sign-ups and Cloudflare's visits are compared over whole days only, from the day after counting
    // started (that one was partial): the same days on both sides (src/visits.js compare)
    const c = v.compare;
    const cf = c && t?.enabled && !t.error && !t.hourly ? t.days.filter(d => d.date >= c.from).reduce((a, d) => a + d.visits, 0) : null;
    const dayName = d => new Date(`${d}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
    const pct = (a, b) => `${((a / b) * 100).toFixed(1).replace('.', ',')}%`;
    const devices = v.devices.reduce((a, d) => a + d.v, 0);
    const phone = v.devices.filter(d => d.l !== 'Computer').reduce((a, d) => a + d.v, 0);
    return {
      total: n(v.total),
      conversion: c?.openings ? pct(c.signups, c.openings) : '—',
      conversionNote: c?.openings ? `${n(c.signups)} iscrizioni su ${n(c.openings)} aperture, dal ${dayName(c.from)}` : 'da domani: si confrontano solo giorni interi',
      mobile: devices ? `${Math.round((phone / devices) * 100)}%` : '—',
      extra: c?.openings && cf ? `${c.openings >= cf ? '+' : ''}${Math.round(((c.openings - cf) / cf) * 100)}%` : '—',
      extraNote: t?.hourly ? 'scegli 30 giorni o più' : c?.openings && cf ? `${n(c.openings)} aperture contro ${n(cf)} visite, dal ${dayName(c.from)}` : 'da domani: si confrontano solo giorni interi',
      sinceNote: v.since ? `Conteggio attivo dal ${dayName(v.since)} (da metà giornata: quel giorno resta fuori dai confronti).` : 'Il conteggio è appena partito.',
      days: v.days.map(d => ({ h: `${(d.n / max) * 100}%`, title: `${dayName(d.day)}: ${d.n} aperture` })),
      sources: v.sources.map(x => ({ l: x.l, v: n(x.v) })), pages: v.pages.map(x => ({ l: x.l, v: n(x.v) })), none: !v.total,
      countries: v.countries.map(x => ({ l: countryName(x.l), v: n(x.v) })), noCountries: !v.countries.length,
      devices: v.devices.map(x => ({ l: x.l, v: n(x.v) })), noDevices: !v.devices.length,
    };
  }

  // Sign-ups of the period (database): where they are now, per day
  signups() {
    const { signups: g, new_in_period: joined } = this.state.d;
    const share = x => (joined ? `${Math.round((x / joined) * 100)}% dei nuovi iscritti` : '—');
    const max = Math.max(1, ...g.buckets.map(b => b.n));
    const when = at => (g.hourly ? new Date(at).toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : new Date(at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }));
    return {
      online: String(g.online), onlinePct: share(g.online),
      onboarding: String(g.onboarding), onboardingPct: share(g.onboarding),
      invite: String(g.via_invite), invitePct: share(g.via_invite),
      leavingNote: [g.leaving && `${g.leaving} ${g.leaving === 1 ? 'ha' : 'hanno'} chiesto di eliminare l’account`, g.suspended && `${g.suspended} ${g.suspended === 1 ? 'sospeso' : 'sospesi'}`].filter(Boolean).join(' · '),
      chartTitle: g.hourly ? 'Iscrizioni per ora' : 'Iscrizioni per giorno',
      bars: g.buckets.map(b => ({ h: `${(b.n / max) * 100}%`, title: `${when(b.at)}: ${b.n} ${b.n === 1 ? 'iscrizione' : 'iscrizioni'}` })),
    };
  }

  renderVals() {
    const s = this.state;
    if (!s.d) return { loading: true, side: this.side('analytics') };
    const d = s.d;
    const c = d.composition;
    const maxW = Math.max(1, ...d.weeks.map(w => w.requests));
    return {
      loading: false, side: this.side('analytics'), periodLabel: PERIOD_LONG[s.period],
      tr: this.traffic(), sv: this.serverVisits(), su: this.signups(), trOff: !s.t?.enabled, trError: s.t?.error ?? '',
      periodOpts: [{ v: '1', l: '24 h' }, { v: '30', l: '30 g' }, { v: '90', l: '90 g' }, { v: '365', l: '12 mesi' }], period: s.period, periodProps: { onSelect: v => v && this.setPeriod(v) },
      joined: d.new_in_period.toLocaleString('it-IT'),
      total: d.total.toLocaleString('it-IT'), newIn: `+${d.new_in_period} in ${PERIOD_SHORT[s.period]}`,
      rate: d.requests_per_active, acceptance: `${d.acceptance}%`,
      split: `${d.abroad} / ${d.italy}`, abroadW: `${d.abroad}%`, italyW: `${d.italy}%`,
      methods: d.new_in_period ? d.sign_in_methods.map(m => ({ l: m.l, v: `${m.v}%`, w: `${m.v}%` })) : [], noMethods: !d.new_in_period,
      sources: d.sources.map(x => ({ l: x.l, v: `${x.v}%` })),
      topCities: d.top_comuni.map((x, i) => ({ i: String(i + 1).padStart(2, '0'), n: x.n, v: String(x.v) })), noCities: !d.top_comuni.length,
      comuniNote: `${d.distinct_comuni} comuni diversi selezionati · ${d.unknown_pct}% “Non lo so ancora”`,
      comp: [
        { l: 'Con idea / senza idea', v: `${c.idea} / ${100 - c.idea}`, segs: [{ w: `${c.idea}%`, c: '#6C4DF5' }, { w: `${100 - c.idea}%`, c: '#1A1726' }] },
      ],
      bgs: d.backgrounds.map(b => ({ l: b.l, v: `${b.v}%` })),
      weeks: d.weeks.map(w => ({ r: `${(w.requests / maxW) * 100}%`, a: w.requests ? `${(w.accepted / w.requests) * 100}%` : '0%', title: `${w.requests} richieste, ${w.accepted} accettate` })),
      noWeeks: !d.weeks.some(w => w.requests),
    };
  }
}

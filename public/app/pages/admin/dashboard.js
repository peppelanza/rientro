// Admin · dashboard (design 06 · 44a).
import { api } from '../../lib.js';
import { AdminPage } from './_admin.js';

export const title = 'Admin';
const MONTHS = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
const dm = iso => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

export default class extends AdminPage {
  async loadAdmin() {
    this.state.period = '30';
    this.state.d = await api('GET', '/api/admin/dashboard?period=30');
  }

  setPeriod(p) {
    return this.act(async () => { this.state.period = p; this.state.d = await api('GET', `/api/admin/dashboard?period=${p}`); })();
  }

  renderVals() {
    const s = this.state;
    if (!s.d) return { loading: true, side: this.side('dashboard') };
    const d = s.d;
    const max = Math.max(1, ...d.signups.map(x => Math.max(x.signups, x.approved)));
    const bar = arr => { const m = Math.max(1, ...arr.map(x => x[1])); return arr.map(([n, v]) => ({ n, v: String(v), w: `${(v / m) * 100}%` })); };
    const ticks = d.signups.length ? [0, Math.floor(d.signups.length / 3), Math.floor((2 * d.signups.length) / 3), d.signups.length - 1].map(i => dm(d.signups[i].day)) : [];
    const funnelColors = ['#1A1726', '#6C4DF5', '#B9ACF7', '#2FA36B'];
    const jobDots = Math.round(d.job.pct / 10);
    return {
      loading: false, side: this.side('dashboard'),
      periodOpts: [{ v: '7', l: '7 g' }, { v: '30', l: '30 g' }, { v: '90', l: '90 g' }, { v: 'all', l: 'Tutto' }], period: s.period,
      periodProps: { onSelect: v => v && this.setPeriod(v) },
      range: d.signups.length ? `${dm(d.signups[0].day)} – ${dm(d.signups.at(-1).day)} ${new Date().getFullYear()}` : '',
      kpis: d.kpis.map(k => ({ ...k, tone: k.tone ?? 'positive' })),
      signups: d.signups.map(x => ({ a: `${(x.signups / max) * 100}%`, b: `${(x.approved / max) * 100}%`, title: `${x.day}: ${x.signups} iscrizioni, ${x.approved} approvati` })),
      ticks: ticks.map(t => ({ t })),
      funnel: d.funnel.map((f, i) => ({ ...f, w: `${f.w}%`, c: funnelColors[i] })),
      cities: bar(d.cities), inds: bar(d.sectors), noCities: !d.cities.length, noInds: !d.sectors.length,
      ideaW: `${d.intent.has_idea}%`, seekW: `${d.intent.seeking_idea}%`, ideaPct: `${d.intent.has_idea}%`, seekPct: `${d.intent.seeking_idea}%`,
      jobPct: `${d.job.pct}%`, jobOf: `${d.job.count.toLocaleString('it-IT')} su ${d.job.total.toLocaleString('it-IT')} utenti`,
      dots: Array.from({ length: 10 }, (_, i) => ({ c: i < jobDots ? '#6C4DF5' : '#F1EFF8' })),
    };
  }
}

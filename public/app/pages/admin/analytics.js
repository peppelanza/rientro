// Admin · analytics (design 06 · 49a).
import { api } from '../../lib.js';
import { AdminPage } from './_admin.js';

export const title = 'Analytics · Admin';

export default class extends AdminPage {
  async loadAdmin() { this.state.period = '90'; this.state.d = await api('GET', '/api/admin/analytics?period=90'); }

  setPeriod(p) { return this.act(async () => { this.state.period = p; this.state.d = await api('GET', `/api/admin/analytics?period=${p}`); })(); }

  renderVals() {
    const s = this.state;
    if (!s.d) return { loading: true, side: this.side('analytics') };
    const d = s.d;
    const c = d.composition;
    const maxW = Math.max(1, ...d.weeks.map(w => w.requests));
    const other = Math.max(0, 100 - c.full_time - c.part_time);
    return {
      loading: false, side: this.side('analytics'),
      periodOpts: [{ v: '30', l: '30 g' }, { v: '90', l: '90 g' }, { v: '365', l: '12 mesi' }], period: s.period, periodProps: { onSelect: v => v && this.setPeriod(v) },
      total: d.total.toLocaleString('it-IT'), newIn: `+${d.new_in_period} in ${s.period === '365' ? '12 mesi' : `${s.period} g`}`,
      rate: d.requests_per_active, acceptance: `${d.acceptance}%`,
      split: `${d.abroad} / ${d.italy}`, abroadW: `${d.abroad}%`, italyW: `${d.italy}%`,
      methods: d.sign_in_methods.map(m => ({ l: m.l, v: `${m.v}%`, w: `${m.v}%` })),
      sources: d.sources.map(x => ({ l: x.l, v: `${x.v}%` })),
      topCities: d.top_comuni.map((x, i) => ({ i: String(i + 1).padStart(2, '0'), n: x.n, v: String(x.v) })), noCities: !d.top_comuni.length,
      comuniNote: `${d.distinct_comuni} comuni diversi selezionati · ${d.unknown_pct}% “Non lo so ancora”`,
      comp: [
        { l: 'Con idea / senza idea', v: `${c.idea} / ${100 - c.idea}`, segs: [{ w: `${c.idea}%`, c: '#6C4DF5' }, { w: `${100 - c.idea}%`, c: '#1A1726' }] },
        { l: 'Full-time / part-time / da definire', v: `${c.full_time} / ${c.part_time} / ${other}`, segs: [{ w: `${c.full_time}%`, c: '#1A1726' }, { w: `${c.part_time}%`, c: '#6C4DF5' }, { w: `${other}%`, c: '#B9ACF7' }] },
        { l: 'Cercano lavoro in Italia', v: `${c.job}%`, segs: [{ w: `${c.job}%`, c: '#1A1726' }] },
      ],
      bgs: d.backgrounds.map(b => ({ l: b.l, v: `${b.v}%` })),
      weeks: d.weeks.map(w => ({ r: `${(w.requests / maxW) * 100}%`, a: w.requests ? `${(w.accepted / w.requests) * 100}%` : '0%', title: `${w.requests} richieste, ${w.accepted} accettate` })),
    };
  }
}

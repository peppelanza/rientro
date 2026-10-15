// Admin · Errori: what went wrong on the server and in the members' browsers, last 30 days
// (src/error-log.js). The same error within an hour is one row with how many times.
import { fmtDate, fmtTime } from '../../lib.js';
import { AdminPage } from './_admin.js';

export const title = 'Errori · Admin';
const SOURCE = { server: 'Server', browser: 'Browser' };

export default class extends AdminPage {
  listPath = '/api/admin/errors';
  listExtra() { const s = this.state; return { ...(s.source ? { source: s.source } : {}), ...(s.level ? { level: s.level } : {}) }; }
  async loadAdmin() { await this.fetchList(); }

  renderVals() {
    const s = this.state;
    if (!s.list) return { loading: true, side: this.side('errori') };
    const chip = (key, v, l) => ({ l, tone: s[key] === v ? 'selected' : 'default', fn: () => this.listChange({ [key]: v, page: 1 }) });
    const when = iso => `${fmtDate(iso)} ${fmtTime(iso)}`;
    return {
      loading: false, side: this.side('errori'), ...this.listVals(),
      last24: s.list.last24 === 1 ? '1 errore nelle ultime 24 ore' : `${s.list.last24} errori nelle ultime 24 ore`,
      sources: [chip('source', null, 'Tutti'), chip('source', 'server', 'Server'), chip('source', 'browser', 'Browser')],
      levels: [chip('level', null, 'Tutti i livelli'), chip('level', 'error', 'Errori'), chip('level', 'warn', 'Avvisi')],
      none: !s.list.items.length, noneText: s.q ? `Nessun risultato per “${s.q}”.` : 'Nessun errore registrato. 🎉',
      items: s.list.items.map(r => ({
        when: when(r.last_at), first: r.count > 1 ? `dal ${when(r.first_at)}` : '',
        count: r.count > 1 ? `×${r.count}` : '', source: SOURCE[r.source] ?? r.source,
        kind: r.kind || '', isWarn: r.level === 'warn', message: r.message, path: r.path || '',
        user: r.user_id ? `/admin/utenti/${r.user_id}` : null, detail: r.detail || '', hasDetail: !!r.detail,
      })),
    };
  }
}

// Admin · CSV export (design 06 · 50a). Every export is written to the audit log with row count.
import { api, download, fmtShort, toast } from '../../lib.js';
import { AdminPage } from './_admin.js';

export const title = 'Esportazioni · Admin';
const COLUMNS = {
  users: ['Nome e cognome', 'Email', 'Vive a', 'Vuole vivere a', 'Intento', 'Background', 'Settori', 'Tempo', 'Fonte', 'Stato'],
  connections: ['Da', 'A', 'Stato', 'Creata', 'Risposta'],
  reports: ['Segnalato', 'Motivo', 'Stato', 'Aperta'],
};
const DATASET_LABEL = { users: 'utenti', connections: 'connessioni', reports: 'segnalazioni' };

export default class extends AdminPage {
  async loadAdmin() {
    Object.assign(this.state, { dataset: 'users', status: 'approved', job: false, cols: COLUMNS.users.slice(0, 6) });
    this.state.recent = await api('GET', '/api/admin/exports/recent');
  }

  generate = this.act(async () => {
    const s = this.state;
    if (!s.cols.length) { toast('Scegli almeno una colonna.', { tone: 'err' }); return; }
    const body = { dataset: s.dataset, columns: s.cols, ...(s.dataset === 'users' ? { status: s.status || null, job: s.job } : {}) };
    const r = await api('POST', '/api/admin/exports', body);
    download(r.filename, new Blob([r.csv], { type: 'text/csv;charset=utf-8' }));
    toast(`${r.rows} righe esportate. L'esportazione è stata registrata.`);
    s.recent = await api('GET', '/api/admin/exports/recent');
  });

  renderVals() {
    const s = this.state;
    if (!s.recent) return { loading: true, side: this.side('esportazioni') };
    const all = COLUMNS[s.dataset];
    const statusLabel = { onboarding: 'Bozza', in_review: 'In revisione', changes_requested: 'Modifiche', approved: 'Approvato', rejected: 'Rifiutato', suspended: 'Sospeso' };
    return {
      loading: false, side: this.side('esportazioni'),
      datasetOpts: [{ v: 'users', l: 'Utenti' }, { v: 'connections', l: 'Connessioni' }, { v: 'reports', l: 'Segnalazioni' }], dataset: s.dataset,
      datasetProps: { onSelect: v => { if (!v) return; s.dataset = v; s.cols = COLUMNS[v].slice(0, v === 'users' ? 6 : 99); this.__rerender(); } },
      isUsers: s.dataset === 'users',
      statusOpts: Object.entries(statusLabel).map(([v, l]) => ({ v, l })), status: s.status, statusProps: { onChange: v => { s.status = v; this.__rerender(); } },
      job: s.job, toggleJob: () => this.setState({ job: !s.job }),
      columns: all.map(l => ({ l, on: s.cols.includes(l), fn: () => this.setState({ cols: s.cols.includes(l) ? s.cols.filter(x => x !== l) : all.filter(x => x === l || s.cols.includes(x)) }) })),
      summary: `${DATASET_LABEL[s.dataset].toUpperCase()} · ${s.cols.length} COLONNE`,
      generate: this.generate,
      recent: s.recent.map((r, i) => ({ f: `${r.dataset}.csv`, m: `${(r.admin_email || 'admin').split('@')[0].toUpperCase()} · ${fmtShort(r.created_at).toUpperCase()} · ${r.rows} RIGHE`, bt: i ? '1px solid #ECE8F7' : 'none' })),
      noRecent: !s.recent.length,
    };
  }
}

// Admin · photos that didn't pass the automatic check in the browser (face.js). Nobody is held up:
// members sign up as usual, and their photo is looked at here afterwards.
import { api, fmtDate, toast } from '../../lib.js';
import { AdminPage } from './_admin.js';

export const title = 'Foto da controllare · Admin';
const STATUS = { onboarding: 'In compilazione', approved: 'Online', suspended: 'Sospeso' };

export default class extends AdminPage {
  listPath = '/api/admin/photo-checks';
  async loadAdmin() { await this.fetchList(); this.state.rows = this.state.list.items; }

  async ok(r) {
    await api('POST', `/api/admin/photo-checks/${r.id}/ok`);
    await this.fetchList();
    this.state.rows = this.state.list.items;
    this.counts.photos = Math.max(0, (this.counts.photos || 1) - 1);
    toast('Foto confermata.');
    this.__rerender();
  }

  renderVals() {
    const s = this.state;
    if (!s.rows) return { loading: true, side: this.side('foto') };
    return {
      loading: false, side: this.side('foto'), empty: !s.rows.length, count: s.list.total, ...this.listVals(),
      emptyText: s.q ? `Nessun risultato per “${s.q}”.` : 'Nessuna foto da controllare.',
      rows: s.rows.map(r => ({
        ...r, status: STATUS[r.status] ?? r.status, when: fmtDate(r.updated_at), href: `/admin/utenti/${r.id}`,
        hasPhoto: !!r.photo_url, ok: () => this.ok(r),
      })),
    };
  }
}

// Admin · photos that didn't pass the automatic check in the browser (face.js). Nobody is held up:
// members sign up as usual, and their photo is looked at here afterwards.
import { api, fmtDate, toast } from '../../lib.js';
import { AdminPage } from './_admin.js';

export const title = 'Foto da controllare · Admin';
const STATUS = { onboarding: 'In onboarding', in_review: 'In revisione', approved: 'Approvato', changes_requested: 'Modifiche richieste', rejected: 'Non approvato', suspended: 'Sospeso' };

export default class extends AdminPage {
  async loadAdmin() { this.state.rows = await api('GET', '/api/admin/photo-checks'); }

  async ok(r) {
    await api('POST', `/api/admin/photo-checks/${r.id}/ok`);
    this.state.rows = this.state.rows.filter(x => x.id !== r.id);
    this.counts.photos = Math.max(0, (this.counts.photos || 1) - 1);
    toast('Foto confermata.');
    this.__rerender();
  }

  renderVals() {
    const s = this.state;
    if (!s.rows) return { loading: true, side: this.side('foto') };
    return {
      loading: false, side: this.side('foto'), empty: !s.rows.length, count: s.rows.length,
      rows: s.rows.map(r => ({
        ...r, status: STATUS[r.status] ?? r.status, when: fmtDate(r.updated_at), href: `/admin/utenti/${r.id}`,
        hasPhoto: !!r.photo_url, ok: () => this.ok(r),
      })),
    };
  }
}

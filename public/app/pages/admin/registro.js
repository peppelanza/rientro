// Admin · access log and record of processing activities (spec §41; not in the design files).
import { api, fmtDate, fmtTime } from '../../lib.js';
import { AdminPage } from './_admin.js';

export const title = 'Registro · Admin';
const ACTION = {
  'dashboard.view': 'Ha aperto la dashboard', 'users.list': 'Ha consultato la lista utenti', 'user.view': 'Ha aperto un profilo', 'user.note': 'Ha aggiunto una nota',
  'user.approve': 'Ha approvato', 'user.request_changes': 'Ha richiesto modifiche', 'user.reject': 'Ha rifiutato', 'user.suspend': 'Ha sospeso', 'user.unsuspend': 'Ha riattivato',
  'approvals.list': 'Ha aperto la coda approvazioni', 'reports.list': 'Ha consultato le segnalazioni', 'report.dismiss': 'Ha ignorato una segnalazione',
  'report.suspend': 'Ha sospeso da segnalazione', 'report.request_changes': 'Ha richiesto modifiche da segnalazione', 'report.view_chat': 'Ha letto una chat segnalata',
  'photos.list': 'Ha aperto le foto da controllare', 'photo.ok': 'Ha confermato una foto',
  'analytics.view': 'Ha aperto le analytics', 'export.csv': 'Ha esportato un CSV', 'audit.view': 'Ha aperto il registro accessi',
};

export default class extends AdminPage {
  async loadAdmin() {
    const [log, register] = await Promise.all([api('GET', '/api/admin/audit'), api('GET', '/api/admin/processing')]);
    Object.assign(this.state, { log, register, tab: 'log' });
  }

  renderVals() {
    const s = this.state;
    if (!s.log) return { loading: true, side: this.side('registro') };
    const tab = (k, l) => ({ l, tone: s.tab === k ? 'selected' : 'default', on: s.tab === k ? 'true' : 'false', fn: () => this.setState({ tab: k }) });
    return {
      loading: false, side: this.side('registro'), tLog: tab('log', 'Accessi ai dati'), tReg: tab('reg', 'Registro dei trattamenti'),
      isLog: s.tab === 'log', isReg: s.tab === 'reg',
      log: s.log.map(r => ({
        when: `${fmtDate(r.created_at)} ${fmtTime(r.created_at)}`, who: (r.admin_email || '—').split('@')[0], what: ACTION[r.action] ?? r.action,
        target: r.target_user_id ? `/admin/utenti/${r.target_user_id}` : null, ref: r.target_ref ? `#${r.target_ref}` : (r.target_user_id ? '' : '—'),
        details: Object.entries(r.details || {}).filter(([, v]) => v !== null && v !== 'all').map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : v}`).join(' · '),
      })),
      register: s.register.map(r => ({ ...r, pending: r.review_status !== 'approved' })),
    };
  }
}

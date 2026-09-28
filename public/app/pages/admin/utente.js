// Admin · user detail (design 06 · 46a). Opening this page is written to the audit log.
import { api, fmtDate, fmtShort, getCatalog, go, timeAgo, toast } from '../../lib.js';
import { AdminPage, STATUS_KIND, initials } from './_admin.js';

export const title = 'Utente · Admin';
const ACTION_LABEL = { approve: 'Approvato', request_changes: 'Modifiche richieste', reject: 'Rifiutato', suspend: 'Sospeso', unsuspend: 'Riattivato' };
const REASON = { fake_profile: 'Profilo falso', harassment: 'Messaggi molesti', spam: 'Spam', other: 'Altro' };
// job_seeking only appears in the history of choices made before the option was removed
const PREF = { job_seeking: 'Cerca lavoro in Italia', marketing_email: 'Email marketing' };

export default class extends AdminPage {
  async loadAdmin() {
    this.state.cat = await getCatalog();
    this.state.tab = 'profilo';
    this.state.note = '';
    this.state.userNote = '';
    await this.fetch();
  }

  async fetch() { this.state.d = await api('GET', `/api/admin/users/${encodeURIComponent(this.props.params.id)}`); }

  review(action) {
    return this.act(async () => {
      const s = this.state;
      if (['request_changes', 'reject'].includes(action) && !s.userNote.trim()) { toast('Scrivi una nota per l’utente.', { tone: 'err' }); document.querySelector('[data-key="user-note"]')?.focus(); return; }
      if (action === 'suspend' && !confirm('Sospendere l’account? L’utente verrà disconnesso e il profilo nascosto.')) return;
      await api('POST', `/api/admin/users/${this.props.params.id}/review`, { action, note: s.userNote.trim() || null });
      s.userNote = '';
      toast(ACTION_LABEL[action]);
      await Promise.all([this.fetch(), this.refreshCounts()]);
    })();
  }

  addNote = this.act(async () => {
    const s = this.state;
    if (!s.note.trim()) return;
    s.d.notes = await api('POST', `/api/admin/users/${this.props.params.id}/notes`, { body: s.note.trim() });
    s.note = '';
  });

  renderVals() {
    const s = this.state;
    if (!s.d) return { loading: true, side: this.side('utenti') };
    const { d, cat } = s;
    const p = d.profile;
    const u = d.user;
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || u.email;
    const lab = (pairs, v) => pairs.find(x => x[0] === v)?.[1];
    const rows = [
      ['Vive a', [p.lives_in_city, p.lives_in_country].filter(Boolean).join(', ')],
      ['Vuole vivere a', p.desired_comuni.join(', ') || (p.desired_unknown ? 'Non lo sa ancora' : '')],
      ['Intento', d.labels.intent], ['Idea', p.idea_title],
      ['Background', [p.background_area, lab(cat.years, p.years_experience) && `${lab(cat.years, p.years_experience)} anni`].filter(Boolean).join(' · ')],
      ['Ruolo', [p.current_role, p.current_company].filter(Boolean).join(' · ')], ['Età', d.labels.age],
      ['Cerca', p.seeking_backgrounds.join(', ')], ['Settori', p.sectors.join(', ')],
      ['Tempo', [d.labels.time, d.labels.start?.toLowerCase()].filter(Boolean).join(' · ')], ['Fonte', p.source],
      ['LinkedIn', p.linkedin_url], ['Su di me', p.bio],
    ].filter(([, v]) => v).map(([k, v], i) => ({ k, v, bt: i ? '1px solid #ECE8F7' : 'none' }));
    const tab = k => ({ tone: s.tab === k ? 'selected' : 'default', on: s.tab === k ? 'true' : 'false', fn: () => this.setState({ tab: k }) });
    const st = u.status;
    return {
      loading: false, side: this.side('utenti'), name, photo: p.photo_url, ini: initials(name), kind: STATUS_KIND[st], statusLabel: u.status_label,
      sub: `${u.email} · iscritto ${fmtDate(u.created_at)}`,
      pending: d.has_pending_changes, pendingText: `Modifiche in attesa: ${d.pending_keys.map(k => ({ first_name: 'nome', last_name: 'cognome', idea_title: 'idea', idea_description: 'descrizione idea', photo_file_id: 'foto' }[k] ?? k)).join(', ')}`,
      tProfilo: tab('profilo'), tAttivita: tab('attivita'), tSegn: { ...tab('segnalazioni'), l: `Segnalazioni · ${d.reports.length}` }, tStorico: tab('storico'),
      isProfilo: s.tab === 'profilo', isAttivita: s.tab === 'attivita', isSegn: s.tab === 'segnalazioni', isStorico: s.tab === 'storico',
      rows,
      prefs: d.preference_history.map((h, i) => ({ t: `${PREF[h.preference] ?? h.preference}: ${h.value ? 'attivato' : 'disattivato'}`, d: `${fmtDate(h.created_at)} · ${h.source} · ${h.notice_version ?? h.privacy_policy_version}`, bt: i ? '1px solid #ECE8F7' : 'none' })),
      noPrefs: !d.preference_history.length,
      reports: d.reports.map((r, i) => ({ t: REASON[r.reason], d: r.details || '—', m: `${fmtDate(r.created_at)} · ${r.status}`, bt: i ? '1px solid #ECE8F7' : 'none' })), noReports: !d.reports.length,
      reviews: d.reviews.map((r, i) => ({ t: ACTION_LABEL[r.action] ?? r.action, d: r.note || '', m: `${fmtDate(r.created_at)} · ${r.admin_email ?? 'admin'}`, bt: i ? '1px solid #ECE8F7' : 'none' })), noReviews: !d.reviews.length,
      stats: [['Richieste inviate', d.stats.sent], ['Ricevute', d.stats.received], ['Connessioni', d.stats.connections], ['Ultimo accesso', d.stats.last_seen_at ? timeAgo(d.stats.last_seen_at, { short: true }) : '—']].map(([l, v]) => ({ l, v: String(v) })),
      notes: d.notes.map(n => ({ b: n.body, m: `${(n.admin_email || 'admin').split('@')[0].toUpperCase()} · ${fmtShort(n.created_at).toUpperCase()}` })),
      note: s.note, noteProps: { onInput: v => { s.note = v; }, onEnter: () => this.addNote() }, addNote: this.addNote,
      userNote: s.userNote, userNoteProps: { onInput: v => { s.userNote = v; } },
      canApprove: st === 'in_review' || st === 'changes_requested' || (st === 'approved' && d.has_pending_changes),
      approveLabel: st === 'approved' ? 'Approva le modifiche' : 'Approva',
      canChanges: ['in_review', 'approved', 'changes_requested'].includes(st), canReject: ['in_review', 'changes_requested'].includes(st),
      canSuspend: st !== 'suspended', canUnsuspend: st === 'suspended', canView: st === 'approved',
      approve: () => this.review('approve'), changes: () => this.review('request_changes'), reject: () => this.review('reject'),
      suspend: () => this.review('suspend'), unsuspend: () => this.review('unsuspend'), viewAsMember: () => go(`/persone/${u.id}`),
    };
  }
}

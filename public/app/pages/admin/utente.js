// Admin · user detail (design 06 · 46a). Opening this page is written to the audit log.
import { api, fmtDate, fmtShort, getCatalog, go, timeAgo, toast } from '../../lib.js';
import { AdminPage, STATUS_KIND, initials } from './_admin.js';

export const title = 'Utente · Admin';
// Past entries can still be approve / request_changes / reject, from before profiles went online without review
const ACTION_LABEL = { approve: 'Approvato', request_changes: 'Modifiche richieste', reject: 'Rifiutato', suspend: 'Sospeso', unsuspend: 'Riattivato', hide: 'Profilo nascosto', show: 'Profilo di nuovo visibile' };
const REASON = { fake_profile: 'Profilo falso', harassment: 'Messaggi molesti', spam: 'Spam', other: 'Altro' };
// job_seeking only appears in the history of choices made before the option was removed
const PREF = { job_seeking: 'Cerca lavoro in Italia', marketing_email: 'Email marketing' };

export default class extends AdminPage {
  async loadAdmin() {
    this.state.cat = await getCatalog();
    this.state.tab = 'profilo';
    this.state.note = '';
    await this.fetch();
  }

  async fetch() { this.state.d = await api('GET', `/api/admin/users/${encodeURIComponent(this.props.params.id)}`); }

  review(action) {
    return this.act(async () => {
      if (action === 'suspend' && !confirm('Sospendere l’account? L’utente verrà disconnesso e il profilo nascosto.')) return;
      await api('POST', `/api/admin/users/${this.props.params.id}/review`, { action });
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
    // Everything onboarding asks, in its order, worded as the site shows it
    const L = d.labels;
    const STEP = { benvenuto: 'Benvenuto', luogo: 'Dove vivi', residenza: 'Dove vivi (città)', arrivo: 'Dove vivevi prima', dove: 'Dove vorresti vivere', obiettivo: 'Obiettivo', idea: 'Idea', presentati: 'Presentati', video: 'Video', background: 'Background', formazione: 'Formazione', esperienze: 'Esperienze', link: 'Link', risultato: 'Risultato', settori: 'Interessi', chi: 'Chi stai cercando', manca: 'Cosa ti manca di casa', invito: 'Invito', fonte: 'Come hai conosciuto Rientro', anteprima: 'Anteprima' };
    const back = p.lives_in === 'italy';
    const years = e => [e.start_month?.slice(0, 4), e.current ? 'oggi' : e.end_month?.slice(0, 4)].filter(Boolean).join('–');
    const rows = [
      ['Accesso', (() => {
        const M = { email: 'Email e codice', google: 'Google', linkedin: 'LinkedIn' };
        const used = (u.login_methods || []).map(m => `${M[m.method] ?? m.method} · ultimo uso ${fmtDate(m.last_used_at)}`);
        return used.length ? [...(u.signup_method ? [`Iscritto con ${M[u.signup_method]}`] : []), ...used].join('\n') : 'Non registrato (iscritto prima che lo salvassimo)';
      })()],
      ['Fermo al passo', u.status === 'onboarding' ? STEP[p.onboarding_step] ?? p.onboarding_step ?? 'Benvenuto' : ''],
      ['Manca', (L.missing || []).join(', ')],
      ['Da completare', (L.gaps || []).join('\n')],
      ['Situazione', p.lives_in ? (back ? 'Già rientrato/a' : 'Vive fuori') : ''],
      ['Vive a', [p.lives_in_city, p.lives_in_country].filter(Boolean).join(', ')],
      ['Rientrato/a da', back ? L.arrived : ''],
      ['Vuole vivere a', back ? '' : p.desired_comuni.join(', ') || (p.desired_unknown ? 'Non lo sa ancora' : '')],
      ['Si trasferisce', back ? '' : L.move],
      ['Obiettivo', L.intent],
      ['Idea', p.primary_intent === 'has_idea' ? [p.idea_title, lab(cat.ideaStages, p.idea_stage)].filter(Boolean).join(' · ') : ''],
      ['Descrizione idea', p.primary_intent === 'has_idea' ? p.idea_description : ''],
      ['Su di me', p.bio],
      ['Video', p.video_url ? 'Caricato' : ''],
      ['Background', [p.background_area, lab(cat.years, p.years_experience) && `${lab(cat.years, p.years_experience)} anni`].filter(Boolean).join(' · ')],
      ['Lavoro attuale', [p.current_role, p.current_company].filter(Boolean).join(' presso ')],
      ['Esperienze', (p.experiences || []).map(e => [[e.role, e.company].filter(Boolean).join(' presso '), e.city, years(e)].filter(Boolean).join(' · ')).join('\n')],
      ['Formazione', (p.education || []).map(e => [e.school, e.degree, e.years].filter(Boolean).join(' · ')).join('\n')],
      ['LinkedIn', p.linkedin_url], ['Sito', p.website_url], ['Instagram', p.instagram_handle], ['X', p.x_handle], ['Calendario', p.calendar_url],
      ['Risultato', p.achievement],
      ['Interessi', p.sectors.join(', ')],
      ['Cerca', p.seeking_backgrounds.length ? (p.seeking_backgrounds.length >= cat.areas.length ? 'Indifferente' : p.seeking_backgrounds.join(', ')) : ''],
      ['Descrizione di chi cerca', p.seeking_description],
      ['Dove dovrebbe vivere', p.seeking_backgrounds.length ? L.seeking_where : ''],
      ['Cosa gli manca di casa', p.misses_italy],
      ['Invitato da', L.invited_by ? `${L.invited_by.name || L.invited_by.email}${p.invite_connect ? ' · ha chiesto di connettersi' : p.invite_connect === false ? ' · non vuole connettersi' : ''}` : ''],
      ['Nota per chi l’ha invitato', p.invite_note],
      ['Il suo link d’invito', L.invite_code ? `?${L.invite_code}` : ''],
      ['Come ha conosciuto Rientro', p.source],
    ].filter(([, v]) => v).map(([k, v], i) => ({ k, v, bt: i ? '1px solid #ECE8F7' : 'none' }));
    const tab = k => ({ tone: s.tab === k ? 'selected' : 'default', on: s.tab === k ? 'true' : 'false', fn: () => this.setState({ tab: k }) });
    const st = u.status;
    return {
      loading: false, side: this.side('utenti'), name, photo: p.photo_url, ini: initials(name), kind: STATUS_KIND[st], statusLabel: u.status_label,
      sub: `${u.email} · iscritto ${fmtDate(u.created_at)}`,
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
      canSuspend: st !== 'suspended', canUnsuspend: st === 'suspended', canView: st === 'approved',
      canImpersonate: st !== 'suspended' && u.id !== this.me?.user.id, impersonateLabel: `Accedi come ${p.first_name || name}`,
      impersonate: this.act(async () => { const r = await api('POST', `/api/admin/users/${u.id}/impersonate`); go(r.go); }),
      // Hiding takes the profile out of Discover and profile pages; the account keeps working
      canHide: p.visible !== false && st === 'approved', canShow: p.visible === false, hidden: p.visible === false,
      hide: () => this.review('hide'), show: () => this.review('show'),
      suspend: () => this.review('suspend'), unsuspend: () => this.review('unsuspend'),
      // a suspended account erased for good: the admin types its email to confirm
      erase: this.act(async () => {
        const typed = prompt(`Eliminare per sempre l’account ${u.email}? Profilo, connessioni, messaggi, post e file vengono cancellati subito e non si possono recuperare.\n\nPer confermare scrivi l’email dell’account:`);
        if (typed === null) return;
        await api('POST', `/api/admin/users/${u.id}/erase`, { confirm_email: typed });
        toast('Account eliminato definitivamente.');
        await this.refreshCounts();
        go('/admin/utenti');
      }), viewAsMember: () => go(`/persone/${u.id}`),
    };
  }
}

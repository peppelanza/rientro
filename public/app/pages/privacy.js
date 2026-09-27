// Settings · privacy (design 05 · 39a chi vede cosa). The job-seeking choice and its details
// (spec §10) are managed here; unticking deletes the details (data minimisation).
import { api, fmtDate, getCatalog, getMe, toast } from '../lib.js';
import { Page } from './_base.js';
import { settingsMenu } from './_settings.js';

export const title = 'Privacy';
export const tabbar = true;

const JOB_FIELDS = ['roles', 'skills', 'sectors', 'preferred_locations', 'work_arrangement', 'employment_type', 'availability'];
const PREF_LABEL = { job_seeking: 'Cerco anche lavoro in Italia', marketing_email: 'Novità di Rientro via email' };
const SOURCE_LABEL = { onboarding: 'durante la registrazione', settings: 'dalle impostazioni', signup: 'alla registrazione' };

export default class extends Page {
  async load() {
    const [me, cat, blocks, history] = await Promise.all([getMe(true), getCatalog(), api('GET', '/api/me/blocks'), api('GET', '/api/me/preference-history')]);
    Object.assign(this.state, { me, cat, blocks, history, j: structuredClone(me.job_seeking), dirty: false });
  }

  toggleJob = this.act(async () => {
    const s = this.state;
    const off = s.j.looking_for_italian_job;
    const hasDetails = JOB_FIELDS.some(k => (Array.isArray(s.j[k]) ? s.j[k].length : s.j[k]));
    if (off && hasDetails && !confirm('Togliendo questa scelta cancelliamo anche i dettagli sul lavoro che cerchi. Continuare?')) return;
    s.j = await api('PUT', '/api/me/job-seeking?source=settings', { looking_for_italian_job: !off });
    s.dirty = false;
    s.history = await api('GET', '/api/me/preference-history');
    toast(off ? (hasDetails ? 'Scelta tolta e dettagli cancellati.' : 'Scelta tolta dal profilo.') : 'Sul profilo ora compare “Sta anche cercando lavoro in Italia”.');
  });

  saveJob = this.act(async () => {
    const s = this.state;
    s.j = await api('PATCH', '/api/me/job-preferences', Object.fromEntries(JOB_FIELDS.map(k => [k, s.j[k]])));
    s.dirty = false;
    toast('Dettagli salvati.');
  });

  toggleVideo = this.act(async () => {
    const p = this.state.me.profile;
    const saved = await api('PATCH', '/api/me/profile', { video_connections_only: !p.video_connections_only });
    p.video_connections_only = saved.video_connections_only;
    toast(p.video_connections_only ? 'Il video ora è visibile solo alle connessioni.' : 'Il video è visibile a tutti i membri.');
  });

  renderVals() {
    const s = this.state;
    if (!s.me) return { loading: true, me: {}, menu: settingsMenu };
    const { j, cat, me } = s;
    const n = s.blocks.length;
    return {
      loading: false, me, menu: settingsMenu, cat, j,
      publicFields: ['Nome e foto', "Fascia d'età", 'Luoghi', 'Percorso', 'Formazione', 'Idea', 'Video', 'Interessi', 'LinkedIn', 'Sito', 'Cosa ti manca'],
      privateFields: ['Instagram', 'X / Twitter', 'Link calendario', 'Chat'],
      jobOn: j.looking_for_italian_job, toggleJob: this.toggleJob,
      jobText: j.looking_for_italian_job
        ? `Attivo dal ${fmtDate(j.selected_at)}: sul profilo compare “Sta anche cercando lavoro in Italia”. È l'indicazione che sei interessato a opportunità da aziende italiane.`
        : 'Non attivo. Se lo attivi, sul profilo comparirà “Sta anche cercando lavoro in Italia”. I dettagli qui sotto restano privati.',
      desired: me.profile.desired_comuni, jobProps: { onChange: patch => { Object.assign(j, patch); s.dirty = true; this.__rerender(); } },
      dirty: s.dirty, saveJob: this.saveJob, saveVariant: s.dirty ? 'primary' : 'secondary',
      hasVideo: !!me.profile.video_url, videoOnly: me.profile.video_connections_only, toggleVideo: this.toggleVideo,
      blockedLabel: n ? `${n} ${n === 1 ? 'persona' : 'persone'}` : 'Nessuna',
      history: s.history.slice(0, 8).map(h => ({ t: `${PREF_LABEL[h.preference] ?? h.preference}: ${h.value ? 'attivato' : 'disattivato'}`, d: `${fmtDate(h.created_at)} · ${SOURCE_LABEL[h.source] ?? h.source} · informativa ${h.notice_version ?? h.privacy_policy_version}` })),
      hasHistory: s.history.length > 0,
    };
  }
}

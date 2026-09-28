// Settings · privacy (design 05 · 39a chi vede cosa).
import { api, fmtDate, getCatalog, getMe, toast } from '../lib.js';
import { Page } from './_base.js';
import { settingsMenu } from './_settings.js';

export const title = 'Privacy';
export const tabbar = true;

// job_seeking only appears in the history of choices made before the option was removed
const PREF_LABEL = { job_seeking: 'Cerco anche lavoro in Italia', marketing_email: 'Novità di Rientro via email' };
const SOURCE_LABEL = { onboarding: 'durante la registrazione', settings: 'dalle impostazioni', signup: 'alla registrazione' };

export default class extends Page {
  async load() {
    const [me, cat, blocks, history] = await Promise.all([getMe(true), getCatalog(), api('GET', '/api/me/blocks'), api('GET', '/api/me/preference-history')]);
    Object.assign(this.state, { me, cat, blocks, history });
  }

  toggleVideo = this.act(async () => {
    const p = this.state.me.profile;
    const saved = await api('PATCH', '/api/me/profile', { video_connections_only: !p.video_connections_only });
    p.video_connections_only = saved.video_connections_only;
    toast(p.video_connections_only ? 'Il video ora è visibile solo alle connessioni.' : 'Il video è visibile a tutti i membri.');
  });

  renderVals() {
    const s = this.state;
    if (!s.me) return { loading: true, me: {}, menu: settingsMenu };
    const { cat, me } = s;
    const n = s.blocks.length;
    return {
      loading: false, me, menu: settingsMenu, cat,
      publicFields: ['Nome e foto', "Fascia d'età", 'Luoghi', 'Percorso', 'Formazione', 'Idea', 'Video', 'Interessi', 'LinkedIn', 'Sito', 'Cosa ti manca'],
      privateFields: ['Instagram', 'X / Twitter', 'Link calendario', 'Chat'],
      hasVideo: !!me.profile.video_url, blockedBorder: me.profile.video_url ? '1px solid #ECE8F7' : 'none', videoOnly: me.profile.video_connections_only, toggleVideo: this.toggleVideo,
      blockedLabel: n ? `${n} ${n === 1 ? 'persona' : 'persone'}` : 'Nessuna',
      history: s.history.slice(0, 8).map(h => ({ t: `${PREF_LABEL[h.preference] ?? h.preference}: ${h.value ? 'attivato' : 'disattivato'}`, d: `${fmtDate(h.created_at)} · ${SOURCE_LABEL[h.source] ?? h.source} · informativa ${h.notice_version ?? h.privacy_policy_version}` })),
      hasHistory: s.history.length > 0,
    };
  }
}

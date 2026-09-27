// Member profile (design 03 · 29a profilo completo, 29c mobile, 29d dopo l'accettazione; 05 · 42a/43a).
import { api, getMe, go, toast } from '../lib.js';
import { block, connect, report } from '../social.js';
import { Page } from './_base.js';

export const title = 'Profilo';
export const tabbar = true;

const handleUrl = (base, h) => (h ? `${base}${h.replace(/^@/, '')}` : null);

export default class extends Page {
  async load() {
    const me = await getMe();
    this.state.me = me;
    if (me.user.id === this.props.params.id) return go('/profilo');
    this.state.p = await api('GET', `/api/profiles/${encodeURIComponent(this.props.params.id)}`);
    document.title = `${this.state.p.first_name} ${this.state.p.last_name} · Rientro`;
  }

  async refresh() {
    this.state.p = await api('GET', `/api/profiles/${encodeURIComponent(this.props.params.id)}`);
    this.__rerender();
  }

  renderVals() {
    const s = this.state;
    if (!s.p) return { loading: !s.ready, me: s.me || {}, notFound: s.ready };
    const p = s.p;
    const c = p.connection.status;
    const name = `${p.first_name} ${p.last_name}`;
    const connected = c === 'connected';
    const L = p.links;
    const li = L.linkedin_url?.replace(/^https:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '');
    const facts = [
      ['Età', p.age_band], ['Vive a', [p.lives_in_city, p.lives_in_country].filter(Boolean).join(', ')],
      ['Tempo', [p.time.commitment, p.time.start?.toLowerCase()].filter(Boolean).join(' · ')],
      ...(connected ? [] : [['LinkedIn', li ? `${li} ↗` : null, L.linkedin_url], ['Sito', L.website_url ? `${L.website_url.replace(/^https:\/\//, '')} ↗` : null, L.website_url]]),
    ].filter(([, v]) => v).map(([k, v, href]) => ({ k, v, href, isLink: !!href, isText: !href, fg: '#1A1726' }));
    if (!connected) facts.push({ k: 'Instagram, X, calendario', v: '🔒 Dopo la connessione', isText: true, fg: '#8C84AE' });
    facts.forEach((f, i) => { f.bt = i ? '1px solid #ECE8F7' : 'none'; });
    const unlocked = connected ? [
      ['LinkedIn', li && `${li} ↗`, L.linkedin_url], ['Sito', L.website_url && `${L.website_url.replace(/^https:\/\//, '')} ↗`, L.website_url],
      ['Instagram', L.instagram_handle && `${L.instagram_handle} ↗`, handleUrl('https://instagram.com/', L.instagram_handle)],
      ['X', L.x_handle && `${L.x_handle} ↗`, handleUrl('https://x.com/', L.x_handle)], ['Calendario', L.calendar_url && 'Prenota una call ↗', L.calendar_url],
    ].filter(([, v]) => v).map(([k, v, href], i) => ({ k, v, href, bt: i ? '1px solid #ECE8F7' : 'none' })) : [];
    const seeksMe = p.viewer_background && p.seeking.backgrounds.includes(p.viewer_background);
    const person = { id: p.id, name, first_name: p.first_name, photo_url: p.photo_url, role: [p.current_role, p.current_company].filter(Boolean).join(' · '), from: p.lives_in_city, to: p.desired_comuni.join(', ') };
    return {
      loading: false, notFound: false, ready: true, me: s.me, name, first: p.first_name, photo: p.photo_url,
      role: [p.current_role, p.current_company].filter(Boolean).join(' · '),
      from: p.lives_in_city, places: p.places, hasPlaces: !p.desired_unknown && p.desired_comuni.length > 0, unknownPlaces: p.desired_unknown,
      badgeKind: p.primary_intent === 'has_idea' ? 'idea' : 'explore', badgeLabel: p.primary_intent === 'has_idea' ? "Ha già un'idea" : "Cerca un'idea insieme",
      job: p.is_looking_for_italian_job,
      seeks: p.seeking.backgrounds.join(', ') || '—', seeksEyebrow: `${p.first_name} cerca`,
      viewerBg: p.viewer_background ?? '', hasViewerBg: !!p.viewer_background,
      bgBoxBg: seeksMe ? '#EFEBFF' : '#FFFFFF', bgBoxFg: seeksMe ? '#3E2BA8' : '#1A1726', bgTone: seeksMe ? 'accent' : 'muted',
      complement: p.complement,
      facts, unlocked, hasUnlocked: unlocked.length > 0,
      // actions
      isNone: c === 'none', isSent: c === 'pending_sent', isReceived: c === 'pending_received', isConnected: connected,
      requestNote: p.connection.note,
      connect: async () => { if (await connect({ ...person, onChange: () => this.refresh() })) this.refresh(); },
      withdraw: this.act(async () => { await api('POST', `/api/connections/${p.connection.id}/withdraw`); toast('Richiesta annullata.'); await this.refresh(); }),
      respond: () => go(`/connessioni/${p.connection.id}`),
      chat: () => go(`/messaggi/${p.id}`),
      share: async () => {
        try { await navigator.clipboard.writeText(location.href); toast('Link copiato. Lo vedranno solo i membri di Rientro.'); } catch { toast(location.href); }
      },
      menuOpen: !!s.menuOpen, toggleMenu: () => this.setState({ menuOpen: !s.menuOpen }),
      doReport: async () => { this.setState({ menuOpen: false }); const r = await report(person); if (r?.blocked) go('/scopri'); },
      doBlock: async () => { this.setState({ menuOpen: false }); if (await block(person)) go('/scopri'); },
      // sections
      bio: p.bio, video: p.video_url, videoLocked: p.video_locked,
      idea: p.idea, ideaEyebrow: p.primary_intent === 'has_idea' ? 'Quello che sto costruendo' : 'Cosa mi piacerebbe costruire',
      ideaBadges: [p.idea?.stage && `Fase: ${p.idea.stage.toLowerCase()}`].filter(Boolean).map(l => ({ l })),
      seekDesc: p.seeking.description, seekLoc: p.seeking.location && p.seeking.location !== 'Indifferente' ? `Dove: ${p.seeking.location.toLowerCase()}` : '',
      hasSeekSection: !!(p.seeking.description || p.seeking.backgrounds.length),
      seekText: p.seeking.description || p.seeking.backgrounds.join(', '),
      career: p.experiences.map(e => ({ y: [e.start_month?.slice(0, 4), e.current ? 'OGGI' : e.end_month?.slice(0, 4)].filter(Boolean).join(' – '), r: e.role || e.company, o: [e.role ? e.company : null, e.city].filter(Boolean).join(' · ') })),
      hasCareer: p.experiences.length > 0,
      edu: p.education.map(e => ({ s: e.school, d: [e.degree, e.years].filter(Boolean).join(' · ') })), hasEdu: p.education.length > 0,
      sectors: p.sectors.map(l => ({ l })), hasSectors: p.sectors.length > 0,
      achievement: p.achievement, achEyebrow: 'Un risultato di cui vado fiero/a',
      misses: p.misses_italy ? `“${p.misses_italy}”` : '',
    };
  }
}

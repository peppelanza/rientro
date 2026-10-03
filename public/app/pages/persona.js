// Member profile (design 03 · 29a profilo completo, 29c mobile, 29d dopo l'accettazione; 05 · 42a/43a).
import { api, getMe, go, INTENT_BADGE, orList, timeAgo, toast } from '../lib.js';
import { block, connect, report } from '../social.js';
import { Page } from './_base.js';

export const title = 'Profilo';
export const tabbar = true;

const handleUrl = (base, h) => (h ? `${base}${h.replace(/^@/, '')}` : null);
// Opened from Connessioni (?da=<tab>): the way back goes there, to the same tab
const from = () => {
  const da = new URLSearchParams(location.search).get('da');
  // Opened from a chat: back to that chat
  if (da === 'messaggi') return { section: 'messaggi', backHref: `/messaggi/${location.pathname.split('/').pop()}`, backLabel: 'Messaggi' };
  return ['connessioni', 'ricevute', 'inviate'].includes(da)
    ? { section: 'connessioni', backHref: `/connessioni?tab=${da}`, backLabel: 'Connessioni' }
    : { section: 'scopri', backHref: '/scopri', backLabel: 'Scopri chi torna' };
};

// Scrolling turns the 4:5 photo into a square, cropped at the centre (object-fit: cover), one pixel
// of height per pixel scrolled; scrolling back brings it back. On a computer it starts once the left
// column sticks; on a phone (one column, nothing sticks) right from the top.
function shrinkPhoto() {
  const aside = document.querySelector('.persona-aside');
  const wrap = aside?.querySelector('.persona-photo');
  if (!wrap) return;
  const grid = aside.parentElement;
  const stuckAt = innerWidth <= 720 ? 0
    : grid.getBoundingClientRect().top + scrollY + parseFloat(getComputedStyle(grid).paddingTop) - (parseFloat(getComputedStyle(aside).top) || 0);
  const w = wrap.offsetWidth;
  const range = w * 5 / 4 - w;
  const t = Math.min(1, Math.max(0, (scrollY - stuckAt) / range));
  wrap.style.setProperty('--pr', (w / (w * 5 / 4 - t * range)).toFixed(4));
}

export default class extends Page {
  componentDidMount() {
    super.componentDidMount();
    this.onScroll = () => requestAnimationFrame(shrinkPhoto);
    addEventListener('scroll', this.onScroll, { passive: true });
    addEventListener('resize', this.onScroll);
    // The "···" menu closes on a click elsewhere
    this.closeMenu = e => { if (this.state.menuOpen && !e.target.closest('.persona-more')) this.setState({ menuOpen: false }); };
    addEventListener('click', this.closeMenu);
  }

  componentWillUnmount() {
    this.headWatch?.disconnect();
    document.body.classList.remove('persona-head-away');
    removeEventListener('click', this.closeMenu);
    removeEventListener('scroll', this.onScroll);
    removeEventListener('resize', this.onScroll);
  }

  didRender(el) {
    shrinkPhoto();
    // Computer: the short name/role/route in the left column shows once the full one is out of view
    this.headWatch?.disconnect();
    // (the last line of the header: where they live → where they want to go, or else the job)
    const head = [...el.querySelectorAll('.persona-head-end')].at(-1);
    if (!head) return;
    this.headWatch = new IntersectionObserver(([e]) => document.body.classList.toggle('persona-head-away', !e.isIntersecting && e.boundingClientRect.top < 0));
    this.headWatch.observe(head);
  }

  async load() {
    const me = await getMe();
    this.state.me = me;
    this.state.self = me.user.id === this.props.params.id;
    if (this.state.self && !new URLSearchParams(location.search).has('anteprima')) return go('/profilo');
    this.state.p = await api('GET', `/api/profiles/${encodeURIComponent(this.props.params.id)}${this.state.self ? '?anteprima=1' : ''}`);
    document.title = `${this.state.p.first_name} ${this.state.p.last_name} · Rientro`;
  }

  async refresh() {
    this.state.p = await api('GET', `/api/profiles/${encodeURIComponent(this.props.params.id)}${this.state.self ? '?anteprima=1' : ''}`);
    this.__rerender();
  }

  renderVals() {
    const s = this.state;
    if (!s.p) return { loading: !s.ready, me: s.me || {}, notFound: s.ready, ...from() };
    const p = s.p;
    const c = p.connection.status;
    const name = `${p.first_name} ${p.last_name}`;
    const connected = c === 'connected';
    const L = p.links;
    const li = L.linkedin_url?.replace(/^https:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '');
    const facts = [
      ['Età', p.age_band], ['Vive a', [p.lives_in_city, p.lives_in_country].filter(Boolean).join(', ')],
      ['Rientro', p.arrived],
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
    const person = { id: p.id, name, first_name: p.first_name, photo_url: p.photo_url, role: [p.current_role, p.current_company].filter(Boolean).join(' · '), from: p.lives_in_city, to: orList(p.desired_comuni, 3) };
    return {
      loading: false, notFound: false, ready: true, me: s.me, ...from(), name, self: !!s.self, notSelf: !s.self, first: p.first_name, photo: p.photo_url,
      role: [p.current_role, p.current_company].filter(Boolean).join(' · '),
      from: p.lives_in_city, places: p.places, hasPlaces: !p.desired_unknown && p.desired_comuni.length > 0, unknownPlaces: p.desired_unknown,
      badgeKind: (INTENT_BADGE[p.primary_intent] ?? INTENT_BADGE.seeking_idea)[1], badgeLabel: (INTENT_BADGE[p.primary_intent] ?? INTENT_BADGE.seeking_idea)[0],
      seeks: p.seeking.backgrounds.join(', ') || '—', seeksEyebrow: `${p.first_name} cerca`,
      viewerBg: p.viewer_background ?? '', hasViewerBg: !!p.viewer_background,
      bgBoxBg: seeksMe ? '#EFEBFF' : '#FFFFFF', bgBoxFg: seeksMe ? '#3E2BA8' : '#1A1726', bgTone: seeksMe ? 'accent' : 'muted',
      complement: p.complement,
      facts, unlocked, hasUnlocked: unlocked.length > 0,
      // actions
      isNone: c === 'none', isSent: c === 'pending_sent', isReceived: c === 'pending_received', isConnected: connected,
      requestNote: p.connection.note, requestEyebrow: `Richiesta di connessione${p.connection.created_at ? ` · ${timeAgo(p.connection.created_at)}` : ''}`,
      // In the preview the buttons are there, as others see them, but do nothing
      preview: !!s.self, previewClass: s.self ? 'preview-off' : '',
      connect: async () => { if (s.self) return; if (await connect({ ...person, onChange: () => this.refresh() })) this.refresh(); },
      withdraw: this.act(async () => { await api('POST', `/api/connections/${p.connection.id}/withdraw`); toast('Richiesta annullata.'); await this.refresh(); }),
      // A request is answered right here (declining is silent for the other person)
      accept: this.act(async () => {
        await api('POST', `/api/connections/${p.connection.id}/accept`);
        toast(`Ora sei connesso con ${p.first_name}.`, { action: 'Apri chat', onAction: () => go(`/messaggi/${p.id}`) });
        await this.refresh();
      }),
      decline: this.act(async () => { await api('POST', `/api/connections/${p.connection.id}/decline`); toast('Richiesta rifiutata.'); await this.refresh(); }),
      chat: () => go(`/messaggi/${p.id}`),
      menuOpen: !!s.menuOpen, toggleMenu: () => { if (!s.self) this.setState({ menuOpen: !s.menuOpen }); },
      doReport: async () => { if (s.self) return; this.setState({ menuOpen: false }); const r = await report(person); if (r?.blocked) go('/scopri'); },
      doBlock: async () => { if (s.self) return; this.setState({ menuOpen: false }); if (await block(person)) go('/scopri'); },
      // sections
      bio: p.bio, video: p.video_url, videoLocked: p.video_locked,
      // the badge ("Ha già un'idea"…) jumps to the idea below
      noIdea: !p.idea, toIdea: e => { e.preventDefault(); document.getElementById('idea')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
      idea: p.idea, ideaEyebrow: p.primary_intent === 'has_idea' ? 'Cosa voglio costruire' : 'Cosa mi piacerebbe costruire',
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

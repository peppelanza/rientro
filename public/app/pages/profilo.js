// Profile editor (design 05 · 37a editor a sezioni). Each section saves on its own; for approved
// members, changes to photo, name and idea go to review first (profiles.REVIEWED_FIELDS).
import { api, fmtMonth, getCatalog, getMe, go, qs, toast, upload } from '../lib.js';
import { ARRIVED_WHEN, loadCitta, loadPaesi, parseBirthYear } from '../places.js';
import { canRecord, confirmVideo, durationProblem, recordVideo, setPreview, videoDuration } from '../video.js';
import { preparePhoto } from '../face.js';
import { Page } from './_base.js';

export const title = 'Il tuo profilo';
export const tabbar = true;

const SECTIONS = [
  ['intestazione', 'Intestazione', ['first_name', 'last_name', 'current_role', 'current_company', 'birth_year', 'lives_in', 'lives_in_country', 'lives_in_city', 'arrived_from_country', 'arrived_from_city', 'arrived_when', 'always_in_italy', 'desired_comuni', 'desired_unknown']],
  ['su-di-me', 'Su di me e video', ['bio', 'achievement', 'video_connections_only']],
  ['obiettivo', 'Obiettivo e idea', ['primary_intent', 'idea_title', 'idea_description', 'idea_stage']],
  ['percorso', 'Percorso e formazione', ['background_area', 'years_experience']],
  ['chi-cerco', 'Chi cerco', ['seeking_backgrounds', 'seeking_description', 'seeking_location']],
  ['interessi', 'Interessi e tempo', ['sectors', 'time_commitment', 'start_when']],
  ['italia', "Cosa mi manca dell'Italia", ['misses_italy']],
  ['link', 'Link', ['linkedin_url', 'website_url', 'instagram_handle', 'x_handle', 'calendar_url']],
];
const REVIEWED = ['first_name', 'last_name', 'idea_title', 'idea_description'];
const nz = v => (typeof v === 'string' && !v.trim() ? null : v);
const opts = pairs => pairs.map(([v, l]) => ({ v, l }));

export default class extends Page {
  // A video uploaded here is confirmed when the member leaves the page (or closes the tab)
  componentDidMount() { super.componentDidMount?.(); addEventListener('pagehide', this.confirmNewVideo); }
  componentWillUnmount() {
    super.componentWillUnmount?.();
    removeEventListener('pagehide', this.confirmNewVideo);
    this.confirmNewVideo();
    setPreview(this.state, null);
  }
  confirmNewVideo = () => { if (this.state.newVideo) { this.state.newVideo = false; confirmVideo(); } };


  async load() {
    const [me, cat, paesi] = await Promise.all([getMe(true), getCatalog(), loadPaesi()]);
    if (me.user.status === 'onboarding') return go('/onboarding');
    const want = qs().get('sezione') || location.hash.slice(1);
    Object.assign(this.state, {
      me, cat, p: structuredClone(me.profile), section: SECTIONS.some(s => s[0] === want) ? want : want === 'video' ? 'su-di-me' : 'intestazione',
      dirty: false, edu: null, exp: null, up: null, paesi, citta: [], cittaFrom: [],
    });
    if (me.profile.lives_in === 'abroad' && me.profile.lives_in_country) this.loadCities();
    if (me.profile.arrived_from_country) this.loadFromCities();
  }

  async loadFromCities() {
    this.state.cittaFrom = this.state.p.arrived_from_country ? await loadCitta(this.state.p.arrived_from_country) : [];
    this.__rerender();
  }

  async loadCities() {
    this.state.citta = this.state.p.lives_in_country ? await loadCitta(this.state.p.lives_in_country) : [];
    this.__rerender();
  }

  get sec() { return SECTIONS.find(s => s[0] === this.state.section); }

  set(patch) { Object.assign(this.state.p, patch); this.state.dirty = true; this.__rerender(); }
  mark() { if (!this.state.dirty) { this.state.dirty = true; this.__rerender(); } }

  goSection(key) {
    const s = this.state;
    if (s.dirty && !confirm('Hai modifiche non salvate in questa sezione. Uscire senza salvare?')) return;
    s.p = structuredClone(s.me.profile);
    Object.assign(s, { section: key, dirty: false, edu: null, exp: null });
    history.replaceState(null, '', `/profilo?sezione=${key}`);
    this.__rerender();
    window.scrollTo(0, 0);
  }

  save = this.act(async () => {
    const s = this.state;
    const body = Object.fromEntries(this.sec[2].map(k => [k, nz(s.p[k])]));
    if (body.lives_in === 'italy') delete body.lives_in_country;
    const reviewedChanged = s.me.user.status === 'approved' && REVIEWED.some(k => (s.p[k] ?? null) !== (s.me.profile[k] ?? null));
    const saved = await api('PATCH', '/api/me/profile', body);
    s.me.profile = { ...s.me.profile, ...saved };
    s.p = structuredClone(s.me.profile);
    s.dirty = false;
    toast(reviewedChanged ? 'Salvato. Le modifiche a nome e idea saranno online dopo la revisione.' : 'Modifiche salvate.');
  });

  cancel() { const s = this.state; s.p = structuredClone(s.me.profile); s.dirty = false; this.__rerender(); }

  // Explicit image (nsfw.js): it goes to the admin's quarantine, the account is suspended and signed out
  async photoBlocked({ file, scores }) {
    await upload('/api/me/photo-blocked', file, null, { 'x-nsfw-scores': JSON.stringify(scores) }).catch(() => {});
    location.href = '/accedi?errore=contenuto_bloccato';
  }

  async uploadFile(kind, file, { recorded = false } = {}) {
    if (!file) return;
    const s = this.state;
    const video = kind === 'video';
    if (video && file.size > 200 * 1024 * 1024) { toast('Il video supera i 200 MB.', { tone: 'err' }); return; }
    const problem = video && !recorded && durationProblem(await videoDuration(file));
    if (problem) { toast(problem, { tone: 'err' }); return; }
    // Photos framed on the face and checked (see face.js)
    let photoCheck = null;
    if (kind === 'photo') {
      s.up = { kind, name: file.name, loaded: 0, total: 0, checking: true };
      this.__rerender();
      const out = await preparePhoto(file);
      s.up = null;
      if (out.blocked) return this.photoBlocked(out);
      if (out.problem) { this.__rerender(); toast(out.problem, { tone: 'err' }); return; }
      file = out.file;
      // A check that didn't pass never stops the member: the photo goes to the admin's checks
      if (out.flag) photoCheck = out.flag;
      if (file.size > 5 * 1024 * 1024) { this.__rerender(); toast('La foto supera 5 MB.', { tone: 'err' }); return; }
    }
    s.up = { kind, loaded: 0, total: file.size, name: file.name };
    this.__rerender();
    upload(`/api/me/${video ? 'video' : 'photo'}`, file, (loaded, total) => { s.up = { ...s.up, loaded, total }; this.__rerender(); }, photoCheck ? { 'x-photo-check': photoCheck } : {})
      .then(r => {
        if (video) { s.me.profile.video_url = r.url; s.p.video_url = r.url; setPreview(s, file); s.newVideo = true; } else { Object.assign(s.me.profile, { photo_url: r.url, photo_check: photoCheck }); Object.assign(s.p, { photo_url: r.url, photo_check: photoCheck }); }
        toast(r.pending_review ? 'Foto caricata. Sarà online dopo la revisione.' : video ? 'Video caricato.' : 'Foto aggiornata.');
      })
      .catch(err => { if (err.status !== 0) toast(err.message, { tone: 'err' }); })
      .finally(() => { s.up = null; this.__rerender(); });
  }

  listAction(kind, method, id, body) {
    return this.act(async () => {
      const s = this.state;
      const key = kind === 'edu' ? 'education' : 'experiences';
      const path = `/api/me/${key}${id ? `/${id}` : ''}`;
      const list = await api(method, path, body);
      s.me.profile[key] = list; s.p[key] = list;
      s[kind] = null;
    })();
  }

  renderVals() {
    const s = this.state;
    if (!s.p) return { loading: true, me: s.me || {} };
    const { p, cat, me } = s;
    const is = k => s.section === k;
    const pending = Object.keys(me.profile.pending_changes || {});
    const status = me.user.status;
    const card = (on, fn) => ({ on, fn, aria: on ? 'true' : 'false' });
    const toggleIn = (l, v, max) => (l.includes(v) ? l.filter(x => x !== v) : l.length >= max ? l : [...l, v]);
    const text = k => ({ value: p[k] ?? '', props: { onInput: v => { p[k] = v; this.mark(); } } });
    const pct = s.up?.total ? Math.round((s.up.loaded / s.up.total) * 100) : 0;
    const t = {};
    for (const k of ['first_name', 'last_name', 'current_role', 'current_company', 'lives_in_country', 'lives_in_city', 'bio', 'achievement', 'idea_title', 'idea_description', 'seeking_description', 'misses_italy', 'linkedin_url', 'website_url', 'instagram_handle', 'x_handle', 'calendar_url']) t[k] = text(k);
    return {
      loading: false, me, cat, t,
      menu: SECTIONS.map(([k, l]) => ({ l, href: `/profilo?sezione=${k}`, click: e => { e.preventDefault(); this.goSection(k); } })),
      activeLabel: this.sec[1], heading: this.sec[1],
      badgeKind: status === 'approved' ? (pending.length ? 'neutral' : 'success') : 'neutral',
      badgeLabel: status === 'approved' ? (pending.length ? 'Modifiche in revisione' : 'Online') : status === 'in_review' ? 'In revisione' : status === 'changes_requested' ? 'Modifiche richieste' : 'Non pubblicato',
      showReviewNote: status === 'approved' && ['intestazione', 'obiettivo'].includes(s.section),
      hasPending: pending.length > 0,
      dirty: s.dirty, saveVariant: s.dirty ? 'primary' : 'secondary', save: this.save, cancel: () => this.cancel(),
      isIntestazione: is('intestazione'), isSuDiMe: is('su-di-me'), isObiettivo: is('obiettivo'), isPercorso: is('percorso'),
      isChiCerco: is('chi-cerco'), isInteressi: is('interessi'), isItalia: is('italia'), isLink: is('link'),
      // intestazione
      photo: p.photo_url, photoPending: pending.includes('photo_file_id'), photoHint: !!p.photo_check && p.photo_check !== 'unchecked', photoPct: s.up?.kind === 'photo' ? (s.up.checking ? 'Controllo…' : `${pct}%`) : '',
      pickPhoto: e => { this.uploadFile('photo', e.target.files[0]); e.target.value = ''; },
      birthYear: p.birth_year ?? '', birthProps: { onInput: v => { p.birth_year = parseBirthYear(v); this.mark(); } },
      livesOpts: [{ v: 'abroad', l: 'Vivo fuori' }, { v: 'italy', l: 'Sono già rientrato' }], lives: p.lives_in,
      livesProps: { onSelect: v => this.set({ lives_in: v, lives_in_city: null, lives_in_country: v === 'italy' ? 'Italia' : '' }) },
      isAbroad: p.lives_in === 'abroad', isItaly: p.lives_in === 'italy', comuni: cat.comuni,
      paesi: s.paesi.map(x => [x[1]]), countrySel: p.lives_in === 'abroad' && p.lives_in_country ? [p.lives_in_country] : [],
      fromCountrySel: p.arrived_from_country ? [p.arrived_from_country] : [], hasFromCountry: !!p.arrived_from_country,
      fromCountryProps: { onChange: l => { this.set({ arrived_from_country: l[0] ?? null, arrived_from_city: null }); this.loadFromCities(); } },
      cittaFrom: s.cittaFrom.map(n => [n]), fromCitySel: p.arrived_from_city ? [p.arrived_from_city] : [],
      fromCityProps: { onChange: l => this.set({ arrived_from_city: l[0] ?? null }) },
      periodOpts: ARRIVED_WHEN, period: p.arrived_when ?? '', periodProps: { onSelect: v => this.set({ arrived_when: v || null }) },
      alwaysItaly: !!p.always_in_italy, notAlwaysItaly: !p.always_in_italy, toggleAlwaysItaly: () => this.set({ always_in_italy: !p.always_in_italy }),
      countryPickerProps: { onChange: l => { this.set({ lives_in_country: l[0] ?? '', lives_in_city: null }); this.loadCities(); } },
      citta: s.citta.map(n => [n]), citySel: p.lives_in === 'abroad' && p.lives_in_city ? [p.lives_in_city] : [],
      cityPlaceholder: p.lives_in_country ? 'Cerca la città' : 'Prima scegli il paese',
      cityAbroadProps: { onChange: l => this.set({ lives_in_city: l[0] ?? null }) },
      cityComune: p.lives_in === 'italy' && p.lives_in_city ? [p.lives_in_city] : [], cityProps: { onChange: l => this.set({ lives_in_city: l.at(-1) ?? null }) },
      desired: p.desired_comuni, desiredProps: { onChange: l => this.set({ desired_comuni: l, desired_unknown: l.length ? false : p.desired_unknown }) },
      unknown: p.desired_unknown, notUnknown: !p.desired_unknown, toggleUnknown: () => this.set({ desired_unknown: !p.desired_unknown, desired_comuni: p.desired_unknown ? p.desired_comuni : [] }),
      // su di me
      video: p.video_url ? s.videoPreview || p.video_url : null, noVideo: !p.video_url && s.up?.kind !== 'video', videoUploading: s.up?.kind === 'video', upPct: `${pct}%`, upLabel: `${pct}%`,
      pickVideo: e => { this.uploadFile('video', e.target.files[0]); e.target.value = ''; },
      canRecord: canRecord(), recordVideo: async () => { const f = await recordVideo(); if (f) this.uploadFile('video', f, { recorded: true }); }, cancelUpload: () => upload.abort?.(),
      removeVideo: this.act(async () => { await api('DELETE', '/api/me/video'); s.me.profile.video_url = null; p.video_url = null; setPreview(s, null); s.newVideo = false; toast('Video rimosso.'); }),
      videoOnly: p.video_connections_only, toggleVideoOnly: () => this.set({ video_connections_only: !p.video_connections_only }),
      // obiettivo
      intentA: card(p.primary_intent === 'has_idea', () => this.set({ primary_intent: 'has_idea' })),
      intentB: card(p.primary_intent === 'seeking_idea', () => this.set({ primary_intent: 'seeking_idea' })),
      intentC: card(p.primary_intent === 'networking', () => this.set({ primary_intent: 'networking' })),
      hasIdea: p.primary_intent === 'has_idea', stageOpts: opts(cat.ideaStages), stage: p.idea_stage, stageProps: { onSelect: v => this.set({ idea_stage: v || null }) },

      // percorso
      areas: cat.areas.map(a => ({ t: a, ...card(p.background_area === a, () => this.set({ background_area: a, seeking_backgrounds: p.seeking_backgrounds.filter(x => x !== a) })) })),
      yearOpts: opts(cat.years), years: p.years_experience, yearsProps: { onSelect: v => this.set({ years_experience: v || null }) },
      jobs: p.experiences.map(e => ({ t: [e.role, e.company].filter(Boolean).join(' · '), m: [[fmtMonth(e.start_month), e.current ? 'oggi' : fmtMonth(e.end_month)].filter(Boolean).join(' – '), e.city?.toUpperCase()].filter(Boolean).join(' · '), edit: () => { s.exp = { ...e }; this.__rerender(); } })),
      exp: s.exp ?? {}, expEditing: !!s.exp, expNotEditing: !s.exp, expIsEdit: !!s.exp?.id, expEnded: !s.exp?.current,
      expProps: Object.fromEntries(['company', 'role', 'city', 'start_month', 'end_month'].map(k => [k, { onInput: v => { s.exp[k] = v; } }])),
      expCurBg: s.exp?.current ? '#6C4DF5' : '#FFFFFF', expCurBd: s.exp?.current ? 'none' : '1.5px solid #CFC8E8', expCurMark: s.exp?.current ? '✓' : '',
      toggleExpCur: e => { s.exp.current = e.target.checked; this.__rerender(); },
      addExp: () => { s.exp = { company: '', role: '', city: '', start_month: '', end_month: '', current: false }; this.__rerender(); },
      cancelExp: () => { s.exp = null; this.__rerender(); },
      saveExp: () => { const e = s.exp; if (!nz(e.company)) return toast('Indica l’azienda.', { tone: 'err' }); this.listAction('exp', e.id ? 'PATCH' : 'POST', e.id, { company: e.company.trim(), role: nz(e.role), city: nz(e.city), start_month: nz(e.start_month), end_month: e.current ? null : nz(e.end_month), current: !!e.current }); },
      delExp: () => this.listAction('exp', 'DELETE', s.exp.id),
      edu: p.education.map((e, i) => ({ s: e.school, d: e.degree ?? '', y: e.years ?? '', bt: i ? '1px solid #ECE8F7' : 'none', edit: () => { s.edu = { ...e }; this.__rerender(); } })),
      eduForm: s.edu ?? {}, eduEditing: !!s.edu, eduNotEditing: !s.edu, eduIsEdit: !!s.edu?.id,
      eduProps: Object.fromEntries(['school', 'degree', 'years'].map(k => [k, { onInput: v => { s.edu[k] = v; } }])),
      addEdu: () => { s.edu = { school: '', degree: '', years: '' }; this.__rerender(); }, cancelEdu: () => { s.edu = null; this.__rerender(); },
      saveEdu: () => { const e = s.edu; if (!nz(e.school)) return toast('Indica l’istituto.', { tone: 'err' }); this.listAction('edu', e.id ? 'PATCH' : 'POST', e.id, { school: e.school.trim(), degree: nz(e.degree), years: nz(e.years) }); },
      delEdu: () => this.listAction('edu', 'DELETE', s.edu.id),
      // chi cerco
      seekAreas: cat.areas.map(a => { const mine = a === p.background_area; const on = p.seeking_backgrounds.includes(a); return { t: a, on, off: mine, desc: mine ? 'È il tuo background' : '', control: mine ? 'none' : 'check', aria: on ? 'true' : 'false', fn: () => !mine && this.set({ seeking_backgrounds: toggleIn(p.seeking_backgrounds, a, 2) }) }; }),
      locOpts: opts(cat.seekingLocation), loc: p.seeking_location, locProps: { onSelect: v => this.set({ seeking_location: v || null }) },
      // interessi
      sectorCount: `${p.sectors.length} / 5`,
      sectors: cat.sectors.map(l => { const on = p.sectors.includes(l); return { l: on ? `✓ ${l}` : l, tone: on ? 'tint' : p.sectors.length >= 5 ? 'off' : 'default', aria: on ? 'true' : 'false', fn: () => this.set({ sectors: toggleIn(p.sectors, l, 5) }) }; }),
      times: cat.time.map(([v, tt, d]) => ({ t: tt, d, ...card(p.time_commitment === v, () => this.set({ time_commitment: v })) })),
      startOpts: opts(cat.start), startWhen: p.start_when, startProps: { onSelect: v => this.set({ start_when: v || null }) },
      // preview (right column)
      pvName: [p.first_name, p.last_name].filter(Boolean).join(' '), pvRole: [p.current_role, p.current_company].filter(Boolean).join(' · '),
      pvPlaces: [p.lives_in_city, p.desired_comuni.join(', ')].filter(Boolean), pvFrom: p.lives_in_city ?? '', pvTo: p.desired_comuni.join(', '), hasTo: p.desired_comuni.length > 0,
      previewHref: status === 'approved' ? `/persone/${me.user.id}?anteprima=1` : '/onboarding?passo=anteprima',
    };
  }
}

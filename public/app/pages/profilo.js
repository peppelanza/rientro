// Profile editor (design 05 · 37a editor a sezioni). Each section saves on its own and is online at
// once (there's no review).
import { api, jobLine, pickSector, getCatalog, getMe, go, orList, placeToggle, qs, seekCards, seeksText, toast, upload } from '../lib.js';
import { entryVals, expBody } from '../entries.js';
import { ARRIVED_WHEN, loadCitta, loadPaesi, parseBirthYear } from '../places.js';
import { canRecord, confirmVideo, durationProblem, recordVideo, setPreview, videoDuration } from '../video.js';
import { canTakePhoto, takePhoto } from '../camera.js';
import { preparePhoto } from '../face.js';
import { Page } from './_base.js';

export const title = 'Il tuo profilo';
export const tabbar = true;

const SECTIONS = [
  ['intestazione', 'Intestazione', ['first_name', 'last_name', 'birth_year', 'lives_in', 'lives_in_country', 'lives_in_city', 'arrived_from_country', 'arrived_from_city', 'arrived_when', 'desired_comuni', 'desired_unknown']],
  ['su-di-me', 'Su di me e video', ['bio', 'achievement']],
  ['obiettivo', 'Obiettivo e idea', ['primary_intent', 'idea_title', 'idea_description', 'idea_stage']],
  ['percorso', 'Percorso e formazione', ['background_area', 'years_experience']],
  ['chi-cerco', 'Chi cerco', ['seeking_backgrounds', 'seeking_description', 'seeking_location']],
  ['interessi', 'Interessi', ['sectors']],
  ['italia', "Cosa mi manca di casa", ['misses_italy']],
  ['link', 'Links', ['linkedin_url', 'website_url', 'instagram_handle', 'x_handle', 'calendar_url']],
];
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
      // No section in the address: on phones the page is just the menu (on a computer, the first section)
      index: !want,
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

  // Pull to refresh: not over unsaved changes in the open section
  async refresh() { if (!this.state.dirty) await super.refresh(); }

  get sec() { return SECTIONS.find(s => s[0] === this.state.section); }

  set(patch) { Object.assign(this.state.p, patch); this.state.dirty = true; this.__rerender(); }
  mark() { if (!this.state.dirty) { this.state.dirty = true; this.__rerender(); } }

  goSection(key) {
    const s = this.state;
    if (s.dirty && !confirm('Hai modifiche non salvate in questa sezione. Uscire senza salvare?')) return;
    s.p = structuredClone(s.me.profile); s.bgOther = undefined;
    Object.assign(s, { section: key, index: false, dirty: false, edu: null, exp: null });
    history.replaceState(null, '', `/profilo?sezione=${key}`);
    this.__rerender();
    window.scrollTo(0, 0);
  }

  save = this.act(async () => {
    const s = this.state;
    const body = Object.fromEntries(this.sec[2].map(k => [k, nz(s.p[k])]));
    if (body.lives_in === 'italy') delete body.lives_in_country;
    const saved = await api('PATCH', '/api/me/profile', body);
    s.me.profile = { ...s.me.profile, ...saved };
    s.p = structuredClone(s.me.profile); s.bgOther = undefined;
    s.dirty = false;
    toast('Modifiche salvate.');
  });

  cancel() { const s = this.state; s.p = structuredClone(s.me.profile); s.bgOther = undefined; s.dirty = false; this.__rerender(); }

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
        toast(video ? 'Video caricato.' : 'Foto aggiornata.');
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
    const status = me.user.status;
    const card = (on, fn) => ({ on, fn, aria: on ? 'true' : 'false' });
    const bgOther = s.bgOther ?? (!!p.background_area && !cat.areas.includes(p.background_area));
    const toggleIn = (l, v, max) => (l.includes(v) ? l.filter(x => x !== v) : l.length >= max ? l : [...l, v]);
    const text = k => ({ value: p[k] ?? '', props: { onInput: v => { p[k] = v; this.mark(); } } });
    const pct = s.up?.total ? Math.round((s.up.loaded / s.up.total) * 100) : 0;
    const t = {};
    for (const k of ['first_name', 'last_name', 'lives_in_country', 'lives_in_city', 'bio', 'achievement', 'idea_title', 'idea_description', 'seeking_description', 'misses_italy', 'linkedin_url', 'website_url', 'instagram_handle', 'x_handle', 'calendar_url']) t[k] = text(k);
    return {
      loading: false, me, cat, t,
      menu: SECTIONS.map(([k, l]) => ({ l, href: `/profilo?sezione=${k}`, click: e => { if (s.index && matchMedia('(max-width: 720px)').matches) return; e.preventDefault(); this.goSection(k); } })),
      isIndex: s.index, mainCls: s.index ? 'r-hide-sm' : '',
      activeLabel: this.sec[1], heading: this.sec[1],
      notPublished: status !== 'approved', // (published: no label)
      dirty: s.dirty, saveVariant: s.dirty ? 'primary' : 'secondary', save: this.save, cancel: () => this.cancel(),
      isIntestazione: is('intestazione'), isSuDiMe: is('su-di-me'), isObiettivo: is('obiettivo'), isPercorso: is('percorso'),
      isChiCerco: is('chi-cerco'), isInteressi: is('interessi'), isItalia: is('italia'), isLink: is('link'),
      // intestazione
      photo: p.photo_url, photoHint: !!p.photo_check && p.photo_check !== 'unchecked', photoBusy: s.up?.kind === 'photo', spinDelay: `-${Math.round(performance.now() % 800)}ms`, // a spinner on the photo while it's checked and sent (it keeps turning across redraws)
      pickPhoto: e => { this.uploadFile('photo', e.target.files[0]); e.target.value = ''; },
      canShoot: canTakePhoto(), shootPhoto: async () => { const f = await takePhoto(); if (f) this.uploadFile('photo', f); },
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
      countryPickerProps: { onChange: l => { this.set({ lives_in_country: l[0] ?? '', lives_in_city: null }); this.loadCities(); } },
      citta: s.citta.map(n => [n]), citySel: p.lives_in === 'abroad' && p.lives_in_city ? [p.lives_in_city] : [],
      cityPlaceholder: p.lives_in_country ? 'Cerca la città' : 'Prima scegli il paese',
      cityAbroadProps: { onChange: l => this.set({ lives_in_city: l[0] ?? null }) },
      cityComune: p.lives_in === 'italy' && p.lives_in_city ? [p.lives_in_city] : [], cityProps: { onChange: l => this.set({ lives_in_city: l.at(-1) ?? null }) },
      // already back in Italy: not asked, it follows where they live (profiles.js isBack)
      askDesired: p.lives_in !== 'italy',
      desired: p.desired_comuni, desiredProps: { onChange: l => this.set({ desired_comuni: l, desired_unknown: l.length ? false : p.desired_unknown }) },
      unknown: p.desired_unknown, notUnknown: !p.desired_unknown, toggleUnknown: () => this.set({ desired_unknown: !p.desired_unknown, desired_comuni: p.desired_unknown ? p.desired_comuni : [] }),
      // su di me
      video: p.video_url ? s.videoPreview || p.video_url : null, noVideo: !p.video_url && s.up?.kind !== 'video', videoUploading: s.up?.kind === 'video', upPct: `${pct}%`, upLabel: `${pct}%`,
      pickVideo: e => { this.uploadFile('video', e.target.files[0]); e.target.value = ''; },
      canRecord: canRecord(), recordVideo: async () => { const f = await recordVideo(); if (f) this.uploadFile('video', f, { recorded: true }); }, cancelUpload: () => upload.abort?.(),
      removeVideo: this.act(async () => { await api('DELETE', '/api/me/video'); s.me.profile.video_url = null; p.video_url = null; setPreview(s, null); s.newVideo = false; toast('Video rimosso.'); }),
      // obiettivo
      intentA: card(p.primary_intent === 'has_idea', () => this.set({ primary_intent: 'has_idea' })),
      intentB: card(p.primary_intent === 'seeking_idea', () => this.set({ primary_intent: 'seeking_idea' })),
      intentC: card(p.primary_intent === 'networking', () => this.set({ primary_intent: 'networking' })),
      hasIdea: p.primary_intent === 'has_idea', stageOpts: opts(cat.ideaStages), stage: p.idea_stage, stageProps: { onSelect: v => this.set({ idea_stage: v || null }) },

      // percorso
      // "Altro": the member's own words, in the same field (see catalog.js AREAS)
      areas: [...cat.areas.map(a => ({ t: a, ...card(!bgOther && p.background_area === a, () => { s.bgOther = false; this.set({ background_area: a }); }) })),
        { t: cat.areaOther, ...card(bgOther, () => { if (bgOther) return; s.bgOther = true; this.set({ background_area: null }); }) }],
      bgOther, bgMax: cat.areaOtherMax, bgText: bgOther ? p.background_area ?? '' : '',
      bgTextProps: { onInput: v => { p.background_area = v.trim() || null; this.mark(); } },
      yearOpts: opts(cat.years), years: p.years_experience, yearsProps: { onSelect: v => this.set({ years_experience: v || null }) },
      // Formazione, Esperienze (entries.js)
      ...entryVals({
        state: s, profile: p, rerender: () => this.__rerender(),
        save: {
          edu: () => { const e = s.edu; if (!nz(e.school)) return toast('Indica l’istituto.', { tone: 'err' }); this.listAction('edu', e.id ? 'PATCH' : 'POST', e.id, { school: e.school.trim(), degree: nz(e.degree), years: nz(e.years) }); },
          exp: () => { const body = expBody(s.exp); if (body) this.listAction('exp', s.exp.id ? 'PATCH' : 'POST', s.exp.id, body); },
        },
        remove: { edu: id => this.listAction('edu', 'DELETE', id), exp: id => this.listAction('exp', 'DELETE', id) },
      }),
      // chi cerco
      seekAreas: seekCards(cat.areas, p.seeking_backgrounds, patch => this.set(patch)), // your own area too, or Indifferente
      ...placeToggle(p, patch => this.set(patch)),
      // interessi
      sectorCount: `${p.sectors.length} / 5`,
      sectors: cat.sectors.map(l => { const on = p.sectors.includes(l); return { l: on ? `✓ ${l}` : l, tone: on ? 'tint' : 'default', aria: on ? 'true' : 'false', fn: () => this.set({ sectors: pickSector(p.sectors, l) }) }; }),
      // preview (right column)
      pvName: [p.first_name, p.last_name].filter(Boolean).join(' '), pvRole: jobLine(p),
      // The card as others see it in Scopri chi torna (same as the server's profiles.js card())
      pvPerson: {
        id: me.user.id, name: [p.first_name, p.last_name].filter(Boolean).join(' '), first_name: p.first_name,
        role: jobLine(p), from: p.lives_in_city ?? '',
        back_from: p.lives_in === 'italy' ? (p.arrived_from_city || p.arrived_from_country || '') : '',
        to: orList(p.desired_comuni, 3) || (p.desired_unknown ? 'Non lo sa ancora' : ''),
        idea: p.primary_intent === 'has_idea', intent: p.primary_intent, idea_title: p.idea_title,
        seeks: seeksText(cat.areas, p.seeking_backgrounds), tags: p.sectors.slice(0, 3).join(' · '), comp: null,
        photo_url: p.photo_url, connection: null,
      },
      pvPlaces: [p.lives_in_city, orList(p.desired_comuni)].filter(Boolean), pvFrom: p.lives_in_city ?? '', pvTo: orList(p.desired_comuni), hasTo: p.desired_comuni.length > 0 && p.lives_in !== 'italy',
      previewHref: status === 'approved' ? `/persone/${me.user.id}?anteprima=1` : '/onboarding?passo=anteprima',
    };
  }
}

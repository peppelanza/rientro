// Onboarding (design 02 · 6a–23a). One page, one step at a time. Each "Continua" saves the
// step's answers and the resume point (profiles.onboarding_step), so members can leave and
// come back.
import { api, jobLine, limitNote, pickSector, fmtTime, getCatalog, getMe, go, orList, placeToggle, seekCards, seeksText, setMe, toast, upload } from '../lib.js';
import { entryVals, expBody } from '../entries.js';
import { flagBurst } from '../flags.js';
import { ARRIVED_WHEN, loadCitta, loadPaesi, parseBirthYear, validBirthYear } from '../places.js';
import { canRecord, confirmVideo, durationProblem, recordVideo, setPreview, videoDuration } from '../video.js';
import { canTakePhoto, takePhoto } from '../camera.js';
import { preparePhoto, warmUpFaceCheck } from '../face.js';
import { homeFor, Page } from './_base.js';

export const title = 'Il tuo profilo';


const STEPS = [
  ['luogo', 'Luogo'], ['residenza', 'Luogo'], ['arrivo', 'Luogo'], ['dove', 'Luogo'], ['obiettivo', 'Obiettivo'], ['idea', 'Obiettivo'],
  ['presentati', 'Su di te'], ['video', 'Su di te'], ['background', 'Su di te'], ['formazione', 'Su di te'], ['esperienze', 'Su di te'],
  ['link', 'Su di te'], ['risultato', 'Su di te'], ['settori', 'Cosa cerchi'], ['chi', 'Cosa cerchi'],
  ['manca', 'Ultimi dettagli'], ['invito', 'Ultimi dettagli'], ['fonte', 'Ultimi dettagli'],
];

// Profile fields saved by each step
const FIELDS = {
  luogo: ['lives_in', 'lives_in_country', 'lives_in_city'],
  residenza: ['lives_in', 'lives_in_country', 'lives_in_city'],
  arrivo: ['arrived_from_country', 'arrived_from_city', 'arrived_when'],
  dove: ['desired_comuni', 'desired_unknown', 'move_when'],
  obiettivo: ['primary_intent'],
  idea: ['idea_title', 'idea_description', 'idea_stage'],
  presentati: ['first_name', 'last_name', 'birth_year', 'bio'],
  background: ['background_area', 'years_experience'],
  risultato: ['achievement'],
  settori: ['sectors'],
  chi: ['seeking_backgrounds', 'seeking_description', 'seeking_location'],
  manca: ['misses_italy'],
  invito: ['invite_connect', 'invite_note'],
  link: ['linkedin_url', 'website_url', 'instagram_handle', 'x_handle', 'calendar_url'],
  fonte: ['source'],
};

const FREQUENT = ['Roma', 'Torino', 'Napoli', 'Firenze'];


const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k] ?? null]));
const opts = pairs => pairs.map(([v, l]) => ({ v, l }));
const nz = v => (typeof v === 'string' && !v.trim() ? null : v);
// Already back in Italy: where they live is where they wanted to be (profiles.js isBack)
const isBack = p => p?.lives_in === 'italy';

export const previewHref = me => `/persone/${me.user.id}?anteprima=1`;

export default class extends Page {
  async load() {
    const [me, cat, paesi] = await Promise.all([getMe(true), getCatalog(), loadPaesi()]);
    if (me.user.status !== 'onboarding') return go(homeFor(me));
    const p = structuredClone(me.profile);
    const want = new URLSearchParams(location.search).get('passo');
    const known = [...STEPS.map(s => s[0]), 'anteprima'];
    Object.assign(this.state, {
      me, cat, p, savedAt: null, sectorQuery: '',
      step: known.includes(want) ? want : known.includes(p.onboarding_step) ? p.onboarding_step : 'benvenuto',
      edu: null, exp: null, up: null, paesi, citta: [], cittaFrom: [],
    });
    // The preview is the real profile page, as others will see it (persona.js), with Pubblica on top
    if (this.state.step === 'anteprima') return go(previewHref(me));
    // Each step is a place in the history: the phone's back (or the browser's) goes to the step
    // before, not out of the onboarding (goTo adds them)
    history.replaceState(null, '', `/onboarding?passo=${this.state.step}`);
    addEventListener('popstate', () => {
      const back = new URLSearchParams(location.search).get('passo');
      if (STEPS.some(x => x[0] === back) || back === 'benvenuto') this.goTo(back, { push: false });
    });
    if (p.lives_in === 'abroad' && p.lives_in_country) this.loadCities();
    if (p.arrived_from_country) this.loadFromCities();
  }

  // Countries load with the page; a country's cities load when it is chosen
  async loadCities() {
    this.state.citta = this.state.p.lives_in_country ? await loadCitta(this.state.p.lives_in_country) : [];
    this.__rerender();
  }
  async loadFromCities() {
    this.state.cittaFrom = this.state.p.arrived_from_country ? await loadCitta(this.state.p.arrived_from_country) : [];
    this.__rerender();
  }

  async componentDidMount() {
    document.addEventListener('keydown', this.onKey);
    await super.componentDidMount();
  }
  componentWillUnmount() { document.removeEventListener('keydown', this.onKey); setPreview(this.state, null); }

  // Enter moves on, like Continua, unless something focused uses Enter itself
  onKey = e => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('textarea, button, a, select, [role=button], [role=radio], [role=checkbox], [role=option], [role=dialog]')) return;
    const s = this.state;
    if (!s.ready || s.edu || s.exp) return;
    if (s.step === 'benvenuto') { e.preventDefault(); this.goTo(this.steps[0][0]); return; }
    if (!this.steps.some(([k]) => k === s.step)) return;
    e.preventDefault();
    this.next();
  };

  // "Da dove sei arrivato" only for who lives in Italy, "Dove vorresti vivere" not for who already
  // came back (it's where they live); the idea step only for who has one
  get steps() {
    const p = this.state.p;
    return STEPS.filter(([k]) => (k !== 'arrivo' || p?.lives_in === 'italy') && (k !== 'dove' || !isBack(p)) && (k !== 'idea' || p?.primary_intent === 'has_idea')
      && (k !== 'invito' || !!this.state.me?.invite?.invited_by));
  }

  goTo(step, { push = true } = {}) {
    if (push && step !== this.state.step) history.pushState({ from: this.state.step }, '', `/onboarding?passo=${step}`);
    this.state.step = step;
    this.__rerender();
    window.scrollTo(0, 0);
    document.querySelector('h1, h2')?.focus?.();
  }

  // Re-render while typing only when it changes whether the step can continue (keeps the
  // footer's disabled state honest without redrawing on every keystroke).
  touch() { if (this.blocker(this.state.step) !== this.lastBlocker) this.__rerender(); }

  set(patch) { Object.assign(this.state.p, patch); this.__rerender(); }

  // Validation per step: null when the member can continue, else the footer message.
  blocker(step) {
    const p = this.state.p;
    switch (step) {
      case 'luogo': return p.lives_in ? null : 'Scegli dove vivi';
      case 'residenza': return !p.lives_in ? 'Scegli dove vivi' : p.lives_in === 'abroad' && !nz(p.lives_in_country) ? 'Indica il paese' : !nz(p.lives_in_city) ? (p.lives_in === 'italy' ? 'Scegli il comune' : 'Indica la città') : null;
      case 'arrivo': return !nz(p.arrived_from_country) ? 'Indica il paese' : !nz(p.arrived_from_city) ? 'Indica la città' : !p.arrived_when ? 'Indica quando è stato il rientro' : null;
      case 'dove': return !(p.desired_comuni.length || p.desired_unknown) ? 'Scegli almeno un comune' : !p.move_when ? 'Indica quando vorresti trasferirti' : null;
      case 'obiettivo': return p.primary_intent ? null : 'Scegli una delle tre opzioni';
      case 'invito': return p.invite_connect === null || p.invite_connect === undefined ? 'Scegli una delle due opzioni' : null;
      case 'idea': return p.primary_intent === 'has_idea' && !nz(p.idea_title) ? 'Descrivi l’idea in una frase' : null;
      case 'presentati': return !p.photo_url ? 'Aggiungi una foto per continuare' : !nz(p.first_name) || !nz(p.last_name) ? 'Inserisci nome e cognome' : !p.birth_year ? 'Indica il tuo anno di nascita' : !validBirthYear(p.birth_year) ? 'Indica un anno di nascita valido (almeno 18 anni)' : null;
      case 'background': return p.background_area ? null : this.state.bgOther ? 'Scrivi il tuo background' : 'Scegli la tua area';
      case 'chi': return p.seeking_backgrounds.length ? null : 'Scegli almeno un’area';
      default: return null;
    }
  }

  async save(step, nextStep) {
    const s = this.state;
    const body = pick(s.p, FIELDS[step] || []);
    for (const k of Object.keys(body)) body[k] = nz(body[k]);
    if ((step === 'luogo' || step === 'residenza') && s.p.lives_in === 'italy') delete body.lives_in_country;
    body.onboarding_step = nextStep;
    // What was written on other steps and not saved yet (Indietro, then Continua here) stays as written
    const shown = this.lastSaved || s.me.profile;
    const unsaved = Object.keys(s.p).filter(k => !(k in body) && JSON.stringify(s.p[k]) !== JSON.stringify(shown[k]));
    const keep = Object.fromEntries(unsaved.map(k => [k, s.p[k]]));
    const saved = await api('PATCH', '/api/me/profile', body);
    this.lastSaved = structuredClone(saved);
    Object.assign(s.p, saved, keep);
    s.savedAt = new Date().toISOString();
  }

  next(skip = false) {
    return this.act(async () => {
      const s = this.state;
      const keys = this.steps.map(x => x[0]);
      const i = keys.indexOf(s.step);
      if (!skip && this.blocker(s.step)) return;
      // a Formazione / Esperienze entry still open with something written: never thrown away silently
      const open = s.edu || s.exp;
      if (open && Object.entries(open).some(([k, v]) => k !== 'id' && typeof v === 'string' && v.trim())) {
        toast(s.edu ? 'Salva o annulla la formazione che stai scrivendo.' : 'Salva o annulla l’esperienza che stai scrivendo.', { tone: 'info' });
        document.querySelector('[data-key^="edu-"], [data-key^="exp-"]')?.focus();
        return;
      }
      const nextStep = keys[i + 1] ?? 'anteprima';
      if (skip) {
        // "Salta" keeps what was already saved but doesn't send half-typed answers
        await api('PATCH', '/api/me/profile', { onboarding_step: nextStep });
      } else await this.save(s.step, nextStep);
      // Leaving the video step with a video: that's the take, the server converts it now
      if (s.step === 'video' && s.p.video_url) confirmVideo();
      s.edu = null; s.exp = null;
      if (nextStep === 'anteprima') return go(previewHref(s.me));
      this.goTo(nextStep);
    })();
  }

  back() {
    const keys = this.steps.map(x => x[0]);
    const i = keys.indexOf(this.state.step);
    const prev = i > 0 ? keys[i - 1] : 'benvenuto';
    // came here from that step: the same as the phone's back (no step piling up in the history)
    if (history.state?.from === prev) history.back();
    else this.goTo(prev);
  }

  // Signed in with LinkedIn (or Google): their photo becomes the first profile photo, but only if it
  // shows a face. Otherwise nothing is said, the member just picks one.
  async trySuggestedPhoto() {
    const s = this.state;
    s.triedSuggested = true;
    try {
      const r = await fetch('/api/me/suggested-photo');
      if (!r.ok) return;
      const { file } = await preparePhoto(new File([await r.blob()], 'foto.jpg'), { strict: true }); // only if every check passes
      if (!file || s.p.photo_url) return;
      s.up = { kind: 'photo', name: file.name, loaded: 0, total: file.size };
      this.__rerender();
      const out = await upload('/api/me/photo', file, (loaded, total) => { s.up = { ...s.up, loaded, total }; this.__rerender(); });
      Object.assign(s.p, { photo_url: out.url, photo_check: null });
    } catch { /* silent: the member uploads a photo as usual */ } finally {
      s.up = null;
      s.p.suggested_photo_url = null;
      api('DELETE', '/api/me/suggested-photo').catch(() => {});
      this.__rerender();
    }
  }

  // Explicit image (nsfw.js): it goes to the admin's quarantine, the account is suspended and signed out
  async photoBlocked({ file, scores }) {
    await upload('/api/me/photo-blocked', file, null, { 'x-nsfw-scores': JSON.stringify(scores) }).catch(() => {});
    location.href = '/accedi?errore=contenuto_bloccato';
  }

  async uploadFile(kind, file, { recorded = false } = {}) {
    if (!file) return;
    const s = this.state;
    const isVideo = kind === 'video';
    if (isVideo && file.size > 200 * 1024 * 1024) { toast('Il video supera i 200 MB. Carica un file più leggero.', { tone: 'err' }); return; }
    // Recordings are already 15–60 s; for picked files check now instead of after the upload
    const problem = isVideo && !recorded && durationProblem(await videoDuration(file));
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
    s.up = { kind, name: file.name, loaded: 0, total: file.size, started: Date.now() };
    this.__rerender();
    upload(`/api/me/${kind === 'video' ? 'video' : 'photo'}`, file, (loaded, total) => { s.up = { ...s.up, loaded, total }; this.__rerender(); }, photoCheck ? { 'x-photo-check': photoCheck } : {})
      .then(r => {
        // Show the file just sent: the server converts it in the background
        if (isVideo) { s.p.video_url = r.url; setPreview(s, file); } else Object.assign(s.p, { photo_url: r.url, photo_check: photoCheck });
        toast(isVideo ? 'Video caricato.' : 'Foto caricata.');
      })
      .catch(err => { if (err.status !== 0) toast(err.message, { tone: 'err' }); })
      .finally(() => { s.up = null; this.__rerender(); });
  }

  saveEdu = this.act(async () => {
    const e = this.state.edu;
    if (!nz(e.school)) { toast('Indica l’istituto.', { tone: 'err' }); return; }
    const body = { school: e.school.trim(), degree: nz(e.degree), years: nz(e.years) };
    this.state.p.education = await api(e.id ? 'PATCH' : 'POST', `/api/me/education${e.id ? `/${e.id}` : ''}`, body);
    this.state.edu = null;
  });

  delEdu = id => this.act(async () => {
    this.state.p.education = await api('DELETE', `/api/me/education/${id}`);
    this.state.edu = null;
  })();

  saveExp = this.act(async () => {
    const e = this.state.exp;
    const body = expBody(e);
    if (!body) return;
    this.state.p.experiences = await api(e.id ? 'PATCH' : 'POST', `/api/me/experiences${e.id ? `/${e.id}` : ''}`, body);
    this.state.exp = null;
  });

  delExp = id => this.act(async () => {
    this.state.p.experiences = await api('DELETE', `/api/me/experiences/${id}`);
    this.state.exp = null;
  })();

  submit = this.act(async () => {
    // No review: the profile is online as soon as it's sent
    const me = await api('POST', '/api/me/submit');
    setMe(me);
    go(homeFor(me));
    toast('Il tuo profilo è online.');
  });


  renderVals() {
    const s = this.state;
    if (!s.ready || !s.p) return { loading: true };
    const { p, cat } = s;
    const steps = this.steps;
    const idx = steps.findIndex(x => x[0] === s.step);
    const is = k => s.step === k;
    const blocker = this.blocker(s.step);
    this.lastBlocker = blocker;
    if (s.step === 'presentati') {
      warmUpFaceCheck(); // the photo check needs its model: fetch it now
      if (!s.p.photo_url && s.p.suggested_photo_url && !s.triedSuggested) this.trySuggestedPhoto();
    }
    const card = (on, fn, role = 'radio') => ({ on, fn, role, aria: on ? 'true' : 'false' });
    const inviter = s.me?.invite?.invited_by || {};
    const bgOther = s.bgOther ?? (!!p.background_area && !cat.areas.includes(p.background_area));
    const toggleIn = (list, v, max) => (list.includes(v) ? list.filter(x => x !== v) : list.length >= max ? list : [...list, v]);
    const dark = false;
    const narrow = matchMedia('(max-width: 600px)').matches;
    const optional = ['formazione', 'esperienze', 'risultato', 'video', 'settori', 'manca', 'link', 'fonte'].includes(s.step) || (is('idea') && p.primary_intent !== 'has_idea');
    const up = s.up;
    const pct = up && up.total ? Math.round((up.loaded / up.total) * 100) : 0;
    const secs = up ? Math.max(0, Math.round(((Date.now() - up.started) / 1000) * (up.total / Math.max(up.loaded, 1) - 1))) : 0;
    const mb = n => Math.round(n / 1048576);
    const sq = s.sectorQuery.trim().toLowerCase();
    const first = p.first_name || '';
    const statusSaved = s.savedAt ? `Salvato · ${fmtTime(s.savedAt)}` : '';
    const stepStatus = {
      dove: p.desired_comuni.length ? `${p.desired_comuni.length} selezionat${p.desired_comuni.length === 1 ? 'o' : 'i'}` : '',
    }[s.step];

    // Preview (23a)
    const pvFacts = [
      ['Vive a', [p.lives_in_city, p.lives_in === 'abroad' ? p.lives_in_country : null].filter(Boolean).join(', ')],
      ['Rientro', p.lives_in !== 'italy' ? null : p.arrived_from_city ? [`Da ${p.arrived_from_city}, ${p.arrived_from_country}`, ARRIVED_WHEN.find(x => x.v === p.arrived_when)?.l.toLowerCase()].filter(Boolean).join(' · ') : null],
      ['Vuole vivere a', isBack(p) ? '' : orList(p.desired_comuni) || (p.desired_unknown ? 'Non lo sa ancora' : '')], ['LinkedIn', p.linkedin_url ? `${p.linkedin_url.replace(/^https:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '')} ↗` : ''],
    ].filter(([, v]) => v).map(([k, v], i) => ({ k, v, bt: i ? '1px solid #ECE8F7' : 'none' }));

    return {
      loading: false,
      // chrome
      isWelcome: is('benvenuto'), isPreview: is('anteprima'), inSteps: idx >= 0,
      pageBg: '#E9E6F5', pageFg: '#1A1726', dark,
      stepN: idx + 1, total: steps.length,
      footStatus: blocker && !optional ? blocker : (stepStatus || statusSaved), footError: !!blocker && !optional && ['presentati'].includes(s.step),
      // phones: short labels, so Indietro, Salta and the main button fit on one line
      footDisabled: !!blocker, footSkip: optional ? ((!narrow && { video: 'Lo aggiungo dopo' }[s.step]) || 'Salta') : null,
      footPrimary: is('fonte') ? (narrow ? 'Anteprima →' : 'Vedi l’anteprima del profilo →') : 'Continua', footAccent: is('fonte'),
      is_luogo: is('luogo'), is_residenza: is('residenza'), is_arrivo: is('arrivo'), is_dove: is('dove'), is_obiettivo: is('obiettivo'), is_idea: is('idea'),
      is_presentati: is('presentati'), is_background: is('background'), is_formazione: is('formazione'), is_esperienze: is('esperienze'),
      is_risultato: is('risultato'), is_video: is('video'), is_settori: is('settori'), is_chi: is('chi'),
      is_manca: is('manca'), is_link: is('link'), is_fonte: is('fonte'), is_invito: is('invito'),

      // Callback bundles for app components (functions reach components as props via dc-props)
      footProps: { onNext: () => this.next(), onSkip: () => this.next(true), onBack: () => this.back(), onBlocked: () => { const b = this.blocker(s.step); if (b) toast(b, { tone: 'info' }); } },
      cityPickerProps: { onChange: list => this.set({ lives_in_city: list.at(-1) ?? null }) },
      desiredProps: { onChange: list => this.set({ desired_comuni: list, desired_unknown: list.length ? false : p.desired_unknown }) },
      stageProps: { onSelect: v => this.set({ idea_stage: v || null }) },
      birthYear: p.birth_year ?? '', birthProps: { onInput: v => { p.birth_year = parseBirthYear(v); this.__rerender(); } },
      yearsProps: { onSelect: v => this.set({ years_experience: v || null }) },

      // 6a
      welcomeName: first ? `Benvenuto, ${first}` : 'Benvenuto', questions: 'Raccontaci di te rispondendo a qualche domanda.',
      start: () => this.goTo(steps[0][0]),

      // 7a
      // Choosing where you live selects it; Continua moves on to the country/city step
      livesItaly: card(p.lives_in === 'italy', () => { this.set({ lives_in: 'italy', lives_in_country: 'Italia', lives_in_city: p.lives_in === 'italy' ? p.lives_in_city : null }); }),
      livesAbroad: card(p.lives_in === 'abroad', () => { this.set({ lives_in: 'abroad', lives_in_country: p.lives_in === 'abroad' ? p.lives_in_country : '', lives_in_city: p.lives_in === 'abroad' ? p.lives_in_city : null }); }),
      isAbroad: p.lives_in === 'abroad', isItaly: p.lives_in === 'italy', noLives: !p.lives_in,
      abroadClass: `place-card place-abroad${p.lives_in === 'abroad' ? ' is-on' : ''}`, italyClass: `place-card place-italy${p.lives_in === 'italy' ? ' is-on' : ''}`,
      placeKey: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } },
      country: p.lives_in_country ?? '', city: p.lives_in_city ?? '', comuni: cat.comuni,
      paesi: (s.paesi || []).map(x => [x[1]]), countrySel: p.lives_in_country && p.lives_in === 'abroad' ? [p.lives_in_country] : [],
      countryPickerProps: { onChange: l => {
        this.set({ lives_in_country: l[0] ?? '', lives_in_city: null });
        this.loadCities();
        if (l[0]) setTimeout(() => {
          document.querySelector('[data-key="city"]')?.focus(); // straight on to the city
          const iso = (s.paesi || []).find(x => x[1] === l[0])?.[0];
          if (iso) flagBurst(iso, document.querySelector(`[aria-label="Rimuovi ${CSS.escape(l[0])}"]`)); // celebrate the new chip
        });
      } },
      citta: (s.citta || []).map(n => [n]), citySel: p.lives_in === 'abroad' && p.lives_in_city ? [p.lives_in_city] : [],
      hasCountry: !!p.lives_in_country, noCity: !p.lives_in_city,
      cityAbroadProps: { onChange: l => this.set({ lives_in_city: l[0] ?? null }) },
      // Arrivo
      fromCountrySel: p.arrived_from_country ? [p.arrived_from_country] : [], hasFromCountry: !!p.arrived_from_country,
      fromCountryProps: { onChange: l => {
        this.set({ arrived_from_country: l[0] ?? null, arrived_from_city: null });
        this.loadFromCities();
        if (l[0]) setTimeout(() => {
          document.querySelector('[data-key="from-city"]')?.focus();
          const iso = (s.paesi || []).find(x => x[1] === l[0])?.[0];
          if (iso) flagBurst(iso, document.querySelector(`[aria-label="Rimuovi ${CSS.escape(l[0])}"]`));
        });
      } },
      cittaFrom: (s.cittaFrom || []).map(n => [n]), fromCitySel: p.arrived_from_city ? [p.arrived_from_city] : [], noFromCity: !p.arrived_from_city,
      fromCityProps: { onChange: l => this.set({ arrived_from_city: l[0] ?? null }) },
      periodOpts: ARRIVED_WHEN, period: p.arrived_when ?? '',
      periodProps: { onSelect: v => this.set({ arrived_when: v || null }) },
      cityComune: p.lives_in === 'italy' && p.lives_in_city ? [p.lives_in_city] : [],

      // 8a
      desired: p.desired_comuni,
      frequent: FREQUENT.filter(c => !p.desired_comuni.includes(c)).map(c => ({ l: `+ ${c}`, add: () => (p.desired_comuni.length < 10 ? this.set({ desired_comuni: [...p.desired_comuni, c], desired_unknown: false }) : limitNote(10, 'comuni')) })),
      hasFrequent: p.desired_comuni.length < 10,
      unknown: p.desired_unknown, notUnknown: !p.desired_unknown, toggleUnknown: () => this.set({ desired_unknown: !p.desired_unknown, desired_comuni: !p.desired_unknown ? [] : p.desired_comuni }),

      // 9a / 10a
      // Choosing selects it; Continua moves on (to the idea step for A, straight to "Presentati" for B and C)
      intentA: card(p.primary_intent === 'has_idea', () => { this.set({ primary_intent: 'has_idea' }); }),
      intentB: card(p.primary_intent === 'seeking_idea', () => { this.set({ primary_intent: 'seeking_idea' }); }),
      intentC: card(p.primary_intent === 'networking', () => { this.set({ primary_intent: 'networking' }); }),

      cat,

      // 9b
      hasIdea: p.primary_intent === 'has_idea',
      ideaHeading: p.primary_intent === 'has_idea' ? 'Raccontaci la tua idea' : 'Cosa ti piacerebbe costruire?',
      ideaHint: p.primary_intent === 'has_idea' ? '' : 'Facoltativo. Un ambito, un problema che ti sta a cuore, un tipo di azienda.',
      ideaTitle: p.idea_title ?? '', ideaDesc: p.idea_description ?? '',
      ideaTitleProps: { onInput: v => { p.idea_title = v; this.touch(); } },
      ideaDescProps: { onInput: v => { p.idea_description = v; } },
      stageOpts: opts(cat.ideaStages), stage: p.idea_stage,

      // 11a
      photo: p.photo_url, noPhoto: !p.photo_url, photoUploading: up?.kind === 'photo', spinDelay: `-${Math.round(performance.now() % 800)}ms`, // a spinner on the photo while it's checked and sent (it keeps turning across redraws)
      photoBorder: p.photo_url ? '2px solid #FFFFFF' : blocker && is('presentati') ? '2px dashed #D92D20' : '2px dashed #B9B2D6',
      // A check that didn't pass (face.js): just a suggestion, the admin looks at it later
      photoHint: !!p.photo_url && !!p.photo_check && p.photo_check !== 'unchecked',
      pickPhoto: e => { this.uploadFile('photo', e.target.files[0]); e.target.value = ''; },
      canShoot: canTakePhoto(), shootPhoto: async () => { const f = await takePhoto(); if (f) this.uploadFile('photo', f); },
      firstName: p.first_name ?? '', lastName: p.last_name ?? '', bio: p.bio ?? '',
      firstProps: { onInput: v => { p.first_name = v; this.touch(); } },
      lastProps: { onInput: v => { p.last_name = v; this.touch(); } },
      bioProps: { onInput: v => { p.bio = v; } },

      // 12a
      // "Altro": the member's own words, in the same field (see catalog.js AREAS)
      areas: [...cat.areas.map(t => ({ t, ...card(!bgOther && p.background_area === t, () => { s.bgOther = false; this.set({ background_area: t }); }) })),
        { t: cat.areaOther, ...card(bgOther, () => { if (bgOther) return; s.bgOther = true; this.set({ background_area: null }); }) }],
      bgOther, bgMax: cat.areaOtherMax, bgText: bgOther ? p.background_area ?? '' : '',
      bgTextProps: { onInput: v => { p.background_area = v.trim() || null; this.touch(); } },
      yearOpts: opts(cat.years), years: p.years_experience,

      // 13a
      // Formazione, Esperienze (entries.js)
      ...entryVals({ state: s, profile: p, rerender: () => this.__rerender(), save: { edu: this.saveEdu, exp: this.saveExp }, remove: { edu: id => this.delEdu(id), exp: id => this.delExp(id) } }),

      // 15a
      achievement: p.achievement ?? '', achProps: { onInput: v => { p.achievement = v; } },

      // 16a
      video: p.video_url ? s.videoPreview || p.video_url : null, noVideo: !p.video_url && up?.kind !== 'video', videoUploading: up?.kind === 'video',
      upName: up?.name ?? '', upPct: `${pct}%`, upBar: `${pct}%`, upMeta: up ? (pct < 100 ? `${mb(up.loaded)} MB di ${mb(up.total)} MB · ${secs} s` : up.kind === 'video' ? 'Ancora un attimo…' : '') : '',
      cancelUpload: () => upload.abort?.(),
      pickVideo: e => { this.uploadFile('video', e.target.files[0]); e.target.value = ''; },
      canRecord: canRecord(), recordVideo: async () => { const f = await recordVideo(); if (f) this.uploadFile('video', f, { recorded: true }); },
      removeVideo: this.act(async () => { await api('DELETE', '/api/me/video'); p.video_url = null; setPreview(s, null); }),

      // 17a
      sectorCount: `${p.sectors.length} / 5`, sectorQuery: s.sectorQuery,
      sectorSearchProps: { onInput: v => { s.sectorQuery = v; this.__rerender(); } },
      sectors: cat.sectors.filter(l => !sq || l.toLowerCase().includes(sq)).map(l => { const on = p.sectors.includes(l); return { l: on ? `✓ ${l}` : l, tone: on ? 'tint' : 'default', aria: on ? 'true' : 'false', fn: () => this.set({ sectors: pickSector(p.sectors, l) }) }; }),
      noSectors: sq && !cat.sectors.some(l => l.toLowerCase().includes(sq)),

      // 18a
      // every area can be chosen, your own too; or Indifferente (lib.js seekCards)
      seekAreas: seekCards(cat.areas, p.seeking_backgrounds, patch => this.set(patch)),
      seekDesc: p.seeking_description ?? '', seekDescProps: { onInput: v => { p.seeking_description = v; } },
      ...placeToggle(p, patch => this.set(patch)),
      moveOpts: opts(cat.moveWhen), move: p.move_when, moveProps: { onSelect: v => this.set({ move_when: v || null }) },

      // 19a

      // 20a
      misses: p.misses_italy ?? '', missesInput: e => { p.misses_italy = e.target.value; },

      // 21a
      linkedin: p.linkedin_url ?? '', website: p.website_url ?? '', instagram: p.instagram_handle ?? '', xh: p.x_handle ?? '', calendar: p.calendar_url ?? '',
      linkedinProps: { onInput: v => { p.linkedin_url = v; } }, websiteProps: { onInput: v => { p.website_url = v; } },
      instagramProps: { onInput: v => { p.instagram_handle = v; } }, xProps: { onInput: v => { p.x_handle = v; } }, calendarProps: { onInput: v => { p.calendar_url = v; } },

      // 22a
      sources: cat.sources.map(t => ({ t, ...card(p.source === t, () => this.set({ source: t })) })),
      // Who came through an invite link (invites.js): the request leaves when the profile goes online
      inviter, inviterIni: `${(inviter.first_name || '?')[0]}${(inviter.last_name || '')[0] || ''}`.toUpperCase(),
      inviteHint: s.me.launched ? `Riceverà la tua richiesta appena il tuo profilo sarà online.` : `Riceverà la tua richiesta appena il tuo profilo sarà online: potrete scrivervi dal giorno del lancio, quando accetterà.`,
      inviteYes: card(p.invite_connect === true, () => this.set({ invite_connect: true })),
      inviteNo: card(p.invite_connect === false, () => this.set({ invite_connect: false })),
      inviteNoteLabel: `Due righe per ${inviter.first_name || 'chi ti ha invitato'}`, inviteNote: p.invite_note ?? '',
      inviteNoteProps: { onInput: v => { p.invite_note = v; } },

      // 23a
      pvName: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Il tuo nome', pvRole: jobLine(p),
      pvFacts, pvBio: p.bio, pvIdeaTitle: p.idea_title, pvIdeaDesc: p.idea_description,
      pvIdeaEyebrow: p.primary_intent === 'has_idea' ? 'Cosa voglio costruire' : 'Cosa mi piacerebbe costruire',
      pvStage: p.idea_stage ? `Fase: ${cat.ideaStages.find(x => x[0] === p.idea_stage)[1].toLowerCase()}` : '',
      pvSeeks: seeksText(cat.areas, p.seeking_backgrounds) || '—',
      pvNoVideo: !p.video_url,
      pvMissing: [
        !p.lives_in_city && 'Dove vivi', !isBack(p) && !p.desired_comuni.length && !p.desired_unknown && 'Dove vorresti vivere', !p.primary_intent && 'Obiettivo',
        !p.photo_url && 'Foto', (!p.first_name || !p.last_name) && 'Nome e cognome', !p.background_area && 'Background',
        !p.seeking_backgrounds.length && 'Chi stai cercando',
      ].filter(Boolean).join(', '),
      editBio: () => this.goTo('presentati'), editIdea: () => this.goTo('idea'), editSeek: () => this.goTo('chi'), addVideo: () => this.goTo('video'),
      backToQuestions: () => this.goTo(steps.at(-1)[0]), submit: this.submit,
    };
  }
}

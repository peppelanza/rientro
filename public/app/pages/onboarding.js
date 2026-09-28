// Onboarding (design 02 · 6a–23a). One page, one step at a time. Each "Continua" saves the
// step's answers and the resume point (profiles.onboarding_step), so members can leave and
// come back. The job-seeking step (spec §10) only appears when the optional box in step 3 is
// ticked; its answers live in job_preferences, never in the co-founder profile.
import { api, fmtMonth, fmtTime, getCatalog, getMe, go, setMe, toast, upload } from '../lib.js';
import { loadCitta, loadPaesi } from '../places.js';
import { Page } from './_base.js';

export const title = 'Il tuo profilo';

const STEPS = [
  ['luogo', 'Luogo'], ['residenza', 'Luogo'], ['dove', 'Luogo'], ['obiettivo', 'Obiettivo'], ['lavoro', 'Obiettivo'], ['idea', 'Obiettivo'],
  ['presentati', 'Su di te'], ['background', 'Su di te'], ['formazione', 'Su di te'], ['esperienze', 'Su di te'],
  ['risultato', 'Su di te'], ['video', 'Su di te'], ['settori', 'Cosa cerchi'], ['chi', 'Cosa cerchi'], ['tempo', 'Cosa cerchi'],
  ['manca', 'Ultimi dettagli'], ['link', 'Ultimi dettagli'], ['fonte', 'Ultimi dettagli'],
];

// Profile fields saved by each step
const FIELDS = {
  luogo: ['lives_in', 'lives_in_country', 'lives_in_city'],
  residenza: ['lives_in', 'lives_in_country', 'lives_in_city'],
  dove: ['desired_comuni', 'desired_unknown'],
  obiettivo: ['primary_intent'],
  idea: ['idea_title', 'idea_description', 'idea_stage'],
  presentati: ['first_name', 'last_name', 'age_band', 'bio'],
  background: ['background_area', 'current_role', 'current_company', 'years_experience'],
  risultato: ['achievement'],
  video: ['video_connections_only'],
  settori: ['sectors'],
  chi: ['seeking_backgrounds', 'seeking_description', 'seeking_location'],
  tempo: ['time_commitment', 'start_when'],
  manca: ['misses_italy'],
  link: ['linkedin_url', 'website_url', 'instagram_handle', 'x_handle', 'calendar_url'],
  fonte: ['source'],
};
const JOB_FIELDS = ['roles', 'skills', 'sectors', 'preferred_locations', 'work_arrangement', 'employment_type', 'availability'];

const FREQUENT = ['Roma', 'Torino', 'Napoli', 'Firenze'];

const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k] ?? null]));
const opts = pairs => pairs.map(([v, l]) => ({ v, l }));
const nz = v => (typeof v === 'string' && !v.trim() ? null : v);

export default class extends Page {
  async load() {
    const [me, cat, paesi] = await Promise.all([getMe(true), getCatalog(), loadPaesi()]);
    if (me.user.role === 'admin') return go('/admin');
    if (me.user.status === 'approved') return go('/profilo');
    if (me.user.status === 'in_review' || me.user.status === 'rejected') return go('/stato');
    const p = structuredClone(me.profile);
    const j = structuredClone(me.job_seeking);
    const want = new URLSearchParams(location.search).get('passo');
    const known = [...STEPS.map(s => s[0]), 'anteprima'];
    Object.assign(this.state, {
      me, cat, p, j, legalOk: !me.legal.needs.length, savedAt: null, sectorQuery: '',
      step: known.includes(want) ? want : known.includes(p.onboarding_step) ? p.onboarding_step : 'benvenuto',
      edu: null, exp: null, up: null, paesi, citta: [],
    });
    if (p.lives_in === 'abroad' && p.lives_in_country) this.loadCities();
  }

  // Countries load with the page; a country's cities load when it is chosen
  async loadCities() {
    this.state.citta = this.state.p.lives_in_country ? await loadCitta(this.state.p.lives_in_country) : [];
    this.__rerender();
  }

  get steps() { return STEPS.filter(([k]) => k !== 'lavoro' || this.state.j.looking_for_italian_job); }

  goTo(step) {
    this.state.step = step;
    this.__rerender();
    window.scrollTo(0, 0);
    document.querySelector('h1, h2')?.focus?.();
  }

  // Re-render while typing only when it changes whether the step can continue (keeps the
  // footer's disabled state honest without redrawing on every keystroke).
  touch() { if (this.blocker(this.state.step) !== this.lastBlocker) this.__rerender(); }

  set(patch) { Object.assign(this.state.p, patch); this.__rerender(); }
  setJob(patch) { Object.assign(this.state.j, patch); this.__rerender(); }

  // Validation per step: null when the member can continue, else the footer message.
  blocker(step) {
    const p = this.state.p;
    switch (step) {
      case 'luogo': return p.lives_in ? null : 'Scegli dove vivi';
      case 'residenza': return !p.lives_in ? 'Scegli dove vivi' : p.lives_in === 'abroad' && !nz(p.lives_in_country) ? 'Indica il paese' : !nz(p.lives_in_city) ? (p.lives_in === 'italy' ? 'Scegli il comune' : 'Indica la città') : null;
      case 'dove': return p.desired_comuni.length || p.desired_unknown ? null : 'Scegli almeno un comune';
      case 'obiettivo': return p.primary_intent ? null : 'Scegli una delle due opzioni';
      case 'idea': return p.primary_intent === 'has_idea' && !nz(p.idea_title) ? 'Descrivi l’idea in una frase' : null;
      case 'presentati': return !p.photo_url ? 'Aggiungi una foto per continuare' : !nz(p.first_name) || !nz(p.last_name) ? 'Inserisci nome e cognome' : null;
      case 'background': return p.background_area ? null : 'Scegli la tua area';
      case 'chi': return p.seeking_backgrounds.length ? null : 'Scegli almeno un’area';
      case 'tempo': return p.time_commitment ? null : 'Scegli quanto tempo vuoi dedicare';
      default: return null;
    }
  }

  async save(step, nextStep) {
    const s = this.state;
    if (step === 'lavoro') {
      s.j = await api('PATCH', '/api/me/job-preferences', pick(s.j, JOB_FIELDS));
    }
    const body = pick(s.p, FIELDS[step] || []);
    for (const k of Object.keys(body)) body[k] = nz(body[k]);
    if ((step === 'luogo' || step === 'residenza') && s.p.lives_in === 'italy') delete body.lives_in_country;
    body.onboarding_step = nextStep;
    const saved = await api('PATCH', '/api/me/profile', body);
    Object.assign(s.p, saved);
    s.savedAt = new Date().toISOString();
  }

  next(skip = false) {
    return this.act(async () => {
      const s = this.state;
      const keys = this.steps.map(x => x[0]);
      const i = keys.indexOf(s.step);
      if (!skip && this.blocker(s.step)) return;
      const nextStep = keys[i + 1] ?? 'anteprima';
      if (skip) {
        // "Salta" keeps what was already saved but doesn't send half-typed answers
        await api('PATCH', '/api/me/profile', { onboarding_step: nextStep });
      } else await this.save(s.step, nextStep);
      s.edu = null; s.exp = null;
      this.goTo(nextStep);
    })();
  }

  back() {
    const keys = this.steps.map(x => x[0]);
    const i = keys.indexOf(this.state.step);
    this.goTo(i > 0 ? keys[i - 1] : 'benvenuto');
  }

  toggleJob = this.act(async () => {
    const s = this.state;
    const turningOff = s.j.looking_for_italian_job;
    const hadDetails = JOB_FIELDS.some(k => (Array.isArray(s.j[k]) ? s.j[k].length : s.j[k]));
    if (turningOff && hadDetails && !confirm('Togliendo la spunta cancelliamo anche i dettagli sul lavoro che cerchi. Continuare?')) return;
    s.j = await api('PUT', '/api/me/job-seeking?source=onboarding', { looking_for_italian_job: !turningOff });
    if (turningOff && hadDetails) toast('Dettagli sul lavoro cancellati.');
  });

  uploadFile(kind, file) {
    if (!file) return;
    const s = this.state;
    const isVideo = kind === 'video';
    if (isVideo && file.size > 200 * 1024 * 1024) { toast('Il video supera i 200 MB. Carica un file più leggero.', { tone: 'err' }); return; }
    if (!isVideo && file.size > 5 * 1024 * 1024) { toast('La foto supera 5 MB.', { tone: 'err' }); return; }
    s.up = { kind, name: file.name, loaded: 0, total: file.size, started: Date.now() };
    this.__rerender();
    upload(`/api/me/${kind === 'video' ? 'video' : 'photo'}`, file, (loaded, total) => { s.up = { ...s.up, loaded, total }; this.__rerender(); })
      .then(r => {
        if (isVideo) s.p.video_url = r.url; else s.p.photo_url = r.url;
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
    if (!nz(e.company)) { toast('Indica l’azienda.', { tone: 'err' }); return; }
    const body = { company: e.company.trim(), role: nz(e.role), city: nz(e.city), start_month: nz(e.start_month), end_month: e.current ? null : nz(e.end_month), current: !!e.current };
    this.state.p.experiences = await api(e.id ? 'PATCH' : 'POST', `/api/me/experiences${e.id ? `/${e.id}` : ''}`, body);
    this.state.exp = null;
  });

  delExp = id => this.act(async () => {
    this.state.p.experiences = await api('DELETE', `/api/me/experiences/${id}`);
    this.state.exp = null;
  })();

  submit = this.act(async () => {
    const me = await api('POST', '/api/me/submit');
    setMe(me);
    go('/stato');
  });

  acceptLegal = this.act(async () => {
    await api('POST', '/api/me/legal', { accept: true });
    this.state.legalOk = true;
  });

  renderVals() {
    const s = this.state;
    if (!s.ready || !s.p) return { loading: true };
    const { p, j, cat } = s;
    const steps = this.steps;
    const idx = steps.findIndex(x => x[0] === s.step);
    const is = k => s.step === k;
    const blocker = this.blocker(s.step);
    this.lastBlocker = blocker;
    const card = (on, fn, role = 'radio') => ({ on, fn, role, aria: on ? 'true' : 'false' });
    const toggleIn = (list, v, max) => (list.includes(v) ? list.filter(x => x !== v) : list.length >= max ? list : [...list, v]);
    const dark = is('manca');
    const optional = ['lavoro', 'formazione', 'esperienze', 'risultato', 'video', 'settori', 'manca', 'link', 'fonte'].includes(s.step) || (is('idea') && p.primary_intent !== 'has_idea');
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
      ['Età', cat.ageBands.find(a => a[0] === p.age_band)?.[1]], ['Vive a', [p.lives_in_city, p.lives_in === 'abroad' ? p.lives_in_country : null].filter(Boolean).join(', ')],
      ['Vuole vivere a', p.desired_comuni.join(', ') || (p.desired_unknown ? 'Non lo sa ancora' : '')], ['LinkedIn', p.linkedin_url ? `${p.linkedin_url.replace(/^https:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '')} ↗` : ''],
    ].filter(([, v]) => v).map(([k, v], i) => ({ k, v, bt: i ? '1px solid #ECE8F7' : 'none' }));
    const timeLabel = [cat.time.find(t => t[0] === p.time_commitment)?.[1], cat.start.find(t => t[0] === p.start_when)?.[1]?.toLowerCase()].filter(Boolean).join(' · ');

    return {
      loading: false,
      // chrome
      isWelcome: is('benvenuto'), isPreview: is('anteprima'), inSteps: idx >= 0,
      pageBg: dark ? '#1A1726' : '#E9E6F5', pageFg: dark ? '#FFFFFF' : '#1A1726', dark,
      stepN: idx + 1, total: steps.length, section: steps[idx]?.[1] ?? '',
      footStatus: blocker && !optional ? blocker : (stepStatus || statusSaved), footError: !!blocker && !optional && ['presentati'].includes(s.step),
      footDisabled: !!blocker, footSkip: optional ? ({ risultato: 'Salta', video: 'Lo aggiungo dopo' }[s.step] ?? 'Salta') : null,
      footPrimary: is('fonte') ? 'Vedi l’anteprima del profilo →' : 'Continua', footAccent: is('fonte'),
      is_luogo: is('luogo'), is_residenza: is('residenza'), is_dove: is('dove'), is_obiettivo: is('obiettivo'), is_lavoro: is('lavoro'), is_idea: is('idea'),
      is_presentati: is('presentati'), is_background: is('background'), is_formazione: is('formazione'), is_esperienze: is('esperienze'),
      is_risultato: is('risultato'), is_video: is('video'), is_settori: is('settori'), is_chi: is('chi'), is_tempo: is('tempo'),
      is_manca: is('manca'), is_link: is('link'), is_fonte: is('fonte'),

      // Callback bundles for app components (functions reach components as props via dc-props)
      footProps: { onNext: () => this.next(), onSkip: () => this.next(true), onBack: () => this.back() },
      cityPickerProps: { onChange: list => this.set({ lives_in_city: list.at(-1) ?? null }) },
      desiredProps: { onChange: list => this.set({ desired_comuni: list, desired_unknown: list.length ? false : p.desired_unknown }) },
      stageProps: { onSelect: v => this.set({ idea_stage: v || null }) },
      ageProps: { onSelect: v => this.set({ age_band: v || null }) },
      yearsProps: { onSelect: v => this.set({ years_experience: v || null }) },
      locProps: { onSelect: v => this.set({ seeking_location: v || null }) },
      startProps: { onSelect: v => this.set({ start_when: v || null }) },
      jobKey: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggleJob(); } },

      // 6a
      welcomeName: first ? `Benvenuto, ${first}` : 'Benvenuto', questions: `Ti faremo ${steps.length} domande. Le risposte salvano da sole, puoi uscire e riprendere quando vuoi.`,
      chapters: [['01', 'Luogo', 'Dove sei, dove vuoi andare'], ['02', 'Obiettivo', 'Hai un\'idea o la cerchi insieme'], ['03', 'Su di te', 'Percorso, formazione, un video'], ['04', 'Cosa cerchi', 'Settori, persone, tempo'], ['05', 'Ultimi dettagli', 'Link e un pensiero sull\'Italia']].map(([n, t, d]) => ({ n, t, d })),
      needsLegal: !s.legalOk, acceptLegal: this.acceptLegal,
      start: () => { if (s.legalOk) this.goTo(steps[0][0]); },

      // 7a
      livesItaly: card(p.lives_in === 'italy', () => this.set({ lives_in: 'italy', lives_in_country: 'Italia', lives_in_city: p.lives_in === 'italy' ? p.lives_in_city : null })),
      livesAbroad: card(p.lives_in === 'abroad', () => this.set({ lives_in: 'abroad', lives_in_country: p.lives_in === 'abroad' ? p.lives_in_country : '', lives_in_city: p.lives_in === 'abroad' ? p.lives_in_city : null })),
      isAbroad: p.lives_in === 'abroad', isItaly: p.lives_in === 'italy', noLives: !p.lives_in,
      country: p.lives_in_country ?? '', city: p.lives_in_city ?? '', comuni: cat.comuni,
      paesi: (s.paesi || []).map(x => [x[1]]), countrySel: p.lives_in_country && p.lives_in === 'abroad' ? [p.lives_in_country] : [],
      countryPickerProps: { onChange: l => { this.set({ lives_in_country: l[0] ?? '', lives_in_city: null }); this.loadCities(); } },
      citta: (s.citta || []).map(n => [n]), citySel: p.lives_in === 'abroad' && p.lives_in_city ? [p.lives_in_city] : [],
      hasCountry: !!p.lives_in_country,
      cityAbroadProps: { onChange: l => this.set({ lives_in_city: l[0] ?? null }) },
      cityComune: p.lives_in === 'italy' && p.lives_in_city ? [p.lives_in_city] : [],

      // 8a
      desired: p.desired_comuni,
      frequent: FREQUENT.filter(c => !p.desired_comuni.includes(c)).map(c => ({ l: `+ ${c}`, add: () => p.desired_comuni.length < 10 && this.set({ desired_comuni: [...p.desired_comuni, c], desired_unknown: false }) })),
      hasFrequent: p.desired_comuni.length < 10,
      unknown: p.desired_unknown, toggleUnknown: () => this.set({ desired_unknown: !p.desired_unknown, desired_comuni: !p.desired_unknown ? [] : p.desired_comuni }),

      // 9a / 10a
      intentA: card(p.primary_intent === 'has_idea', () => this.set({ primary_intent: 'has_idea' })),
      intentB: card(p.primary_intent === 'seeking_idea', () => this.set({ primary_intent: 'seeking_idea' })),
      jobOn: j.looking_for_italian_job, jobOff: !j.looking_for_italian_job, toggleJob: this.toggleJob,
      jobAria: j.looking_for_italian_job ? 'true' : 'false',

      // Job details (§10) — rendered by App Job Details
      j, cat, jobProps: { onChange: patch => this.setJob(patch) },

      // 9b
      hasIdea: p.primary_intent === 'has_idea',
      ideaHeading: p.primary_intent === 'has_idea' ? 'Raccontaci la tua idea' : 'Cosa ti piacerebbe costruire?',
      ideaHint: p.primary_intent === 'has_idea' ? '' : 'Facoltativo. Un ambito, un problema che ti sta a cuore, un tipo di azienda.',
      ideaTitle: p.idea_title ?? '', ideaDesc: p.idea_description ?? '',
      ideaTitleProps: { onInput: v => { p.idea_title = v; this.touch(); } },
      ideaDescProps: { onInput: v => { p.idea_description = v; } },
      stageOpts: opts(cat.ideaStages), stage: p.idea_stage,

      // 11a
      photo: p.photo_url, noPhoto: !p.photo_url, photoUploading: up?.kind === 'photo', photoPct: `${pct}%`,
      photoBorder: p.photo_url ? '2px solid #FFFFFF' : blocker && is('presentati') ? '2px dashed #D92D20' : '2px dashed #B9B2D6',
      photoNoteColor: p.photo_url ? '#6B6680' : '#B42318', photoNote: p.photo_url ? 'Cambia foto' : 'Obbligatoria · si deve vedere il tuo volto',
      pickPhoto: e => { this.uploadFile('photo', e.target.files[0]); e.target.value = ''; },
      firstName: p.first_name ?? '', lastName: p.last_name ?? '', bio: p.bio ?? '',
      firstProps: { onInput: v => { p.first_name = v; this.touch(); } },
      lastProps: { onInput: v => { p.last_name = v; this.touch(); } },
      bioProps: { onInput: v => { p.bio = v; } },
      ageOpts: opts(cat.ageBands), age: p.age_band,

      // 12a
      areas: cat.areas.map(t => ({ t, ...card(p.background_area === t, () => this.set({ background_area: t, seeking_backgrounds: p.seeking_backgrounds.filter(x => x !== t) })) })),
      role: p.current_role ?? '', company: p.current_company ?? '',
      roleProps: { onInput: v => { p.current_role = v; } }, companyProps: { onInput: v => { p.current_company = v; } },
      yearOpts: opts(cat.years), years: p.years_experience,

      // 13a
      edu: p.education.map((e, i) => ({ s: e.school, d: e.degree ?? '', y: e.years ?? '', bt: i ? '1px solid #ECE8F7' : 'none', edit: () => { s.edu = { ...e }; this.__rerender(); } })),
      hasEdu: p.education.length > 0 || !!s.edu, eduEditing: !!s.edu, eduNotEditing: !s.edu,
      eduForm: s.edu ?? {}, eduIsEdit: !!s.edu?.id,
      eduSchoolProps: { onInput: v => { s.edu.school = v; } }, eduDegreeProps: { onInput: v => { s.edu.degree = v; } }, eduYearsProps: { onInput: v => { s.edu.years = v; } },
      addEdu: () => { s.edu = { school: '', degree: '', years: '' }; this.__rerender(); document.querySelector('[data-key="edu-school"]')?.focus(); },
      cancelEdu: () => { s.edu = null; this.__rerender(); }, saveEdu: this.saveEdu, delEdu: () => this.delEdu(s.edu.id),

      // 14a
      jobs: p.experiences.map(e => ({
        t: [e.role, e.company].filter(Boolean).join(' · '),
        m: [[fmtMonth(e.start_month), e.current ? 'oggi' : fmtMonth(e.end_month)].filter(Boolean).join(' – '), e.city?.toUpperCase()].filter(Boolean).join(' · '),
        edit: () => { s.exp = { ...e }; this.__rerender(); },
      })),
      expEditing: !!s.exp, expNotEditing: !s.exp, expForm: s.exp ?? {}, expIsEdit: !!s.exp?.id, expEnded: !s.exp?.current,
      expCompanyProps: { onInput: v => { s.exp.company = v; } }, expRoleProps: { onInput: v => { s.exp.role = v; } },
      expCityProps: { onInput: v => { s.exp.city = v; } }, expStartProps: { onInput: v => { s.exp.start_month = v; } }, expEndProps: { onInput: v => { s.exp.end_month = v; } },
      expCurrentBg: s.exp?.current ? '#6C4DF5' : '#FFFFFF', expCurrentBd: s.exp?.current ? 'none' : '1.5px solid #CFC8E8', expCurrentMark: s.exp?.current ? '✓' : '',
      toggleExpCurrent: e => { s.exp.current = e.target.checked; this.__rerender(); },
      addExp: () => { s.exp = { company: '', role: '', city: '', start_month: '', end_month: '', current: false }; this.__rerender(); document.querySelector('[data-key="exp-company"]')?.focus(); },
      cancelExp: () => { s.exp = null; this.__rerender(); }, saveExp: this.saveExp, delExp: () => this.delExp(s.exp.id),

      // 15a
      achievement: p.achievement ?? '', achProps: { onInput: v => { p.achievement = v; } },

      // 16a
      video: p.video_url, noVideo: !p.video_url && up?.kind !== 'video', videoUploading: up?.kind === 'video',
      upName: up?.name ?? '', upPct: `${pct}%`, upBar: `${pct}%`, upMeta: up ? `${mb(up.loaded)} MB di ${mb(up.total)} MB${pct < 100 ? ` · ${secs} s` : ''}` : '',
      cancelUpload: () => upload.abort?.(),
      pickVideo: e => { this.uploadFile('video', e.target.files[0]); e.target.value = ''; },
      removeVideo: this.act(async () => { await api('DELETE', '/api/me/video'); p.video_url = null; }),
      videoPrivate: p.video_connections_only, videoPrivBg: p.video_connections_only ? '#6C4DF5' : '#FFFFFF', videoPrivBd: p.video_connections_only ? 'none' : '1.5px solid #CFC8E8', videoPrivMark: p.video_connections_only ? '✓' : '',
      toggleVideoPrivate: e => this.set({ video_connections_only: e.target.checked }),

      // 17a
      sectorCount: `${p.sectors.length} / 5`, sectorQuery: s.sectorQuery,
      sectorSearchProps: { onInput: v => { s.sectorQuery = v; this.__rerender(); } },
      sectors: cat.sectors.filter(l => !sq || l.toLowerCase().includes(sq)).map(l => { const on = p.sectors.includes(l); return { l: on ? `✓ ${l}` : l, tone: on ? 'tint' : p.sectors.length >= 5 ? 'off' : 'default', aria: on ? 'true' : 'false', fn: () => this.set({ sectors: toggleIn(p.sectors, l, 5) }) }; }),
      noSectors: sq && !cat.sectors.some(l => l.toLowerCase().includes(sq)),

      // 18a
      seekAreas: cat.areas.map(t => {
        const mine = t === p.background_area;
        const on = p.seeking_backgrounds.includes(t);
        return { t, on, off: mine, desc: mine ? 'È il tuo background' : '', control: mine ? 'none' : 'check', aria: on ? 'true' : 'false', dis: mine ? 'true' : false, fn: () => !mine && this.set({ seeking_backgrounds: toggleIn(p.seeking_backgrounds, t, 2) }) };
      }),
      seekDesc: p.seeking_description ?? '', seekDescProps: { onInput: v => { p.seeking_description = v; } },
      locOpts: opts(cat.seekingLocation), loc: p.seeking_location,

      // 19a
      times: cat.time.map(([v, t, d]) => ({ t, d, ...card(p.time_commitment === v, () => this.set({ time_commitment: v })) })),
      startOpts: opts(cat.start), startWhen: p.start_when,

      // 20a
      misses: p.misses_italy ?? '', missesInput: e => { p.misses_italy = e.target.value; },

      // 21a
      linkedin: p.linkedin_url ?? '', website: p.website_url ?? '', instagram: p.instagram_handle ?? '', xh: p.x_handle ?? '', calendar: p.calendar_url ?? '',
      linkedinProps: { onInput: v => { p.linkedin_url = v; } }, websiteProps: { onInput: v => { p.website_url = v; } },
      instagramProps: { onInput: v => { p.instagram_handle = v; } }, xProps: { onInput: v => { p.x_handle = v; } }, calendarProps: { onInput: v => { p.calendar_url = v; } },

      // 22a
      sources: cat.sources.map(t => ({ t, ...card(p.source === t, () => this.set({ source: t })) })),

      // 23a
      pvName: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Il tuo nome', pvRole: [p.current_role, p.current_company].filter(Boolean).join(' · '),
      pvFacts, pvBio: p.bio, pvIdeaTitle: p.idea_title, pvIdeaDesc: p.idea_description,
      pvIdeaEyebrow: p.primary_intent === 'has_idea' ? 'Quello che sto costruendo' : 'Cosa mi piacerebbe costruire',
      pvStage: p.idea_stage ? `Fase: ${cat.ideaStages.find(x => x[0] === p.idea_stage)[1].toLowerCase()}` : '',
      pvSeeks: p.seeking_backgrounds.join(', ') || '—', pvTime: timeLabel || '—',
      pvJob: j.looking_for_italian_job, pvNoVideo: !p.video_url,
      pvMissing: [
        !p.lives_in_city && 'Dove vivi', !p.desired_comuni.length && !p.desired_unknown && 'Dove vorresti vivere', !p.primary_intent && 'Obiettivo',
        !p.photo_url && 'Foto', (!p.first_name || !p.last_name) && 'Nome e cognome', !p.background_area && 'Background',
        !p.seeking_backgrounds.length && 'Chi stai cercando', !p.time_commitment && 'Tempo',
      ].filter(Boolean).join(', '),
      editBio: () => this.goTo('presentati'), editIdea: () => this.goTo('idea'), editSeek: () => this.goTo('chi'), editTime: () => this.goTo('tempo'), addVideo: () => this.goTo('video'),
      backToQuestions: () => this.goTo(steps.at(-1)[0]), submit: this.submit,
    };
  }
}

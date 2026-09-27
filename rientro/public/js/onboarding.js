import { jobForm } from './job-form.js';
import { $, api, autosaver, h, nav } from './lib.js';

const INTENTS = [
  ['has_idea', 'A', 'Ho già un\'idea e cerco un co-founder', 'Racconterai il progetto e le competenze che ti mancano.'],
  ['seeking_idea', 'B', 'Non ho ancora un\'idea e voglio trovare qualcuno con cui crearne una', 'Racconterai cosa ti interessa e con chi vorresti lavorare.'],
];

let me;
let stepIndex = 0;
const root = $('#app');

function steps() {
  const s = [];
  if (me.legal.needs.length) s.push(legalStep);
  s.push(aboutStep, intentStep);
  // Conditional: only when the user explicitly ticked the job-seeking box.
  if (me.job_seeking.looking_for_italian_job) s.push(jobStep);
  s.push(reviewStep);
  return s;
}

async function reload() { me = await api('GET', '/api/me'); }

function frame({ section, title, lede, body, canContinue = true, primary = 'Continua', onNext, status }) {
  const all = steps();
  const n = stepIndex + 1;
  const statusEl = status || h('span', { class: 'status' });
  const next = h('button', { type: 'button', class: 'btn lg', disabled: !canContinue }, primary);
  next.addEventListener('click', async () => {
    next.disabled = true;
    try {
      if (onNext) await onNext();
      stepIndex = Math.min(stepIndex + 1, steps().length - 1);
      render();
    } catch (e) {
      statusEl.textContent = e.message; statusEl.classList.add('err'); next.disabled = false;
    }
  });
  const fill = h('div', { class: 'fill' });
  fill.style.width = `${(n / all.length) * 100}%`;
  return {
    next, statusEl,
    el: h('main', { class: 'page' },
      h('div', { class: 'obar' },
        h('div', { class: 'row between' }, h('span', { class: 'eyebrow accent' }, section), h('span', { class: 'mono muted' }, `${n} di ${all.length}`)),
        h('div', { class: 'track' }, fill)),
      h('div', { class: 'stack lg' },
        h('div', { class: 'stack' }, title, lede ? h('p', { class: 'lede' }, lede) : null),
        body),
      h('div', { class: 'footer' },
        stepIndex > 0 ? h('button', { type: 'button', class: 'btn lg light', 'aria-label': 'Indietro', onclick: () => { stepIndex--; render(); } }, '←') : null,
        statusEl, next)),
  };
}

// --- Step: Terms & privacy notice (contract + information; not a consent checkbox for everything) ---
function legalStep() {
  const terms = h('input', { type: 'checkbox', id: 'terms' });
  const privacy = h('input', { type: 'checkbox', id: 'privacy' });
  const f = frame({
    section: 'Prima di iniziare',
    title: h('h1', {}, 'Due cose ', h('span', { class: 'serif' }, 'veloci.')),
    lede: 'Servono per usare Rientro. Tutte le altre scelte sono facoltative e le trovi più avanti.',
    canContinue: false,
    body: h('div', { class: 'stack' },
      h('label', { class: 'check card', for: 'terms' }, terms, h('span', { class: 'box', 'aria-hidden': 'true' }),
        h('span', {}, 'Accetto i ', h('a', { href: '/legal/termini', target: '_blank' }, 'Termini e condizioni'), '.')),
      h('label', { class: 'check card', for: 'privacy' }, privacy, h('span', { class: 'box', 'aria-hidden': 'true' }),
        h('span', {}, 'Ho letto l’', h('a', { href: '/legal/privacy', target: '_blank' }, 'Informativa privacy'), '.')),
      h('p', { class: 'small muted' }, 'Le newsletter sono una scelta separata, che puoi attivare o no in Impostazioni → Privacy.')),
    onNext: async () => { await api('POST', '/api/me/legal', { accept_terms: true, read_privacy: true }); await reload(); stepIndex = -1; },
  });
  const sync = () => { f.next.disabled = !(terms.checked && privacy.checked); };
  terms.addEventListener('change', sync); privacy.addEventListener('change', sync);
  return f.el;
}

// --- Step: minimal "about you" ---
function aboutStep() {
  const status = h('span', { class: 'status' });
  const save = autosaver(status, patch => api('PATCH', '/api/me/profile', patch));
  const p = me.profile;
  const field = (label, key, attrs = {}) => h('label', { class: 'field' }, label,
    h('input', { class: 'input', value: p[key] ?? '', ...attrs, oninput: e => save({ [key]: e.target.value }) }));
  return frame({
    section: 'Su di te', status,
    title: h('h1', {}, 'Presentati.'),
    lede: 'Nome e città compaiono sul profilo. La tua email non è mai visibile agli altri membri.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid-2' }, field('Nome', 'first_name', { autocomplete: 'given-name' }), field('Cognome', 'last_name', { autocomplete: 'family-name' })),
      h('div', { class: 'grid-2' }, field('Paese in cui vivi', 'lives_in_country'), field('Città', 'lives_in_city'))),
    onNext: async () => { await save.flush(); await reload(); },
  }).el;
}

// --- Step 9a / 10a: primary intent + optional, independent job-seeking flag ---
function intentStep() {
  const status = h('span', { class: 'status' });
  let intent = me.profile.primary_intent;
  let looking = me.job_seeking.looking_for_italian_job;

  const cards = h('div', { class: 'grid-2', role: 'radiogroup', 'aria-label': 'Cosa stai cercando su Rientro?' });
  const renderCards = () => cards.querySelectorAll('.option').forEach(c => c.setAttribute('aria-checked', String(c.dataset.v === intent)));
  for (const [v, letter, title, desc] of INTENTS) {
    cards.append(h('button', {
      type: 'button', class: 'option', role: 'radio', 'data-v': v,
      onclick: async () => {
        intent = v; renderCards(); f.next.disabled = false;
        await api('PATCH', '/api/me/profile', { primary_intent: v });
        status.textContent = 'Salvato';
      },
    }, h('span', { class: 'letter' }, letter), h('span', { class: 'stack' }, h('span', { class: 'title' }, title), h('span', { class: 'desc' }, desc))));
  }
  renderCards();

  // The checkbox IS the explicit signal. No second "discoverable by companies" checkbox exists.
  const box = h('input', { type: 'checkbox', id: 'job', checked: looking });
  const notice = h('p', { class: 'small muted', id: 'job-notice' }, me.job_seeking_notice.text);
  const extra = h('div', { class: `extra${looking ? ' on' : ''}` },
    h('span', { class: 'eyebrow' }, 'In più, facoltativo'),
    h('span', { class: 'title' }, 'Stai cercando anche un’opportunità di lavoro?'),
    h('label', { class: 'check', for: 'job' }, box, h('span', { class: 'box', 'aria-hidden': 'true' }),
      h('span', {}, 'Sto anche cercando lavoro in Italia per un’azienda italiana')),
    notice);
  box.setAttribute('aria-describedby', 'job-notice');
  notice.hidden = !looking;
  box.addEventListener('change', async () => {
    box.disabled = true;
    try {
      const r = await api('PUT', '/api/me/job-seeking?source=onboarding', { looking_for_italian_job: box.checked });
      me.job_seeking = r;
      looking = r.looking_for_italian_job;
      extra.classList.toggle('on', looking);
      notice.hidden = !looking;
      status.textContent = looking ? 'Salvato · ti chiederemo qualche dettaglio al prossimo passo' : 'Salvato';
      renderProgress();
    } catch (e) {
      box.checked = !box.checked; status.textContent = e.message;
    } finally { box.disabled = false; }
  });

  const f = frame({
    section: 'Obiettivo', status,
    title: h('h1', {}, 'Cosa stai cercando ', h('span', { class: 'serif' }, 'su Rientro?')),
    lede: 'Scegline una. Potrai cambiarla in seguito.',
    canContinue: !!intent,
    body: h('div', { class: 'stack lg' }, cards, extra),
  });
  // Step count changes live when the conditional step appears or disappears.
  const counter = f.el.querySelector('.obar .mono');
  const fill = f.el.querySelector('.obar .fill');
  function renderProgress() {
    const total = steps().length;
    counter.textContent = `${stepIndex + 1} di ${total}`;
    fill.style.width = `${((stepIndex + 1) / total) * 100}%`;
  }
  return f.el;
}

// --- Step 10 (conditional): structured job preferences ---
function jobStep() {
  const status = h('span', { class: 'status' });
  const form = jobForm(me.job_seeking, status);
  return frame({
    section: 'Lavoro in Italia', status,
    title: h('h1', {}, 'Che tipo di opportunità ', h('span', { class: 'serif' }, 'cerchi in Italia?')),
    lede: 'Tutto facoltativo. Questi dettagli restano privati: sul profilo compare solo “Sta anche cercando lavoro in Italia”.',
    body: form,
    onNext: async () => { await form.flush(); await reload(); },
  }).el;
}

// --- Review & submit ---
function reviewStep() {
  const p = me.profile;
  const j = me.job_seeking;
  const intentLabel = INTENTS.find(i => i[0] === p.primary_intent)?.[2] ?? '—';
  const submitted = me.user.status !== 'onboarding';
  const rows = [
    ['Nome', [p.first_name, p.last_name].filter(Boolean).join(' ') || '—'],
    ['Vive a', [p.lives_in_city, p.lives_in_country].filter(Boolean).join(', ') || '—'],
    ['Obiettivo', intentLabel],
    ['Cerca anche lavoro in Italia', j.looking_for_italian_job ? 'Sì' : 'No'],
  ];
  return frame({
    section: 'Anteprima',
    title: h('h1', {}, submitted ? 'Profilo inviato.' : 'Tutto pronto?'),
    lede: submitted ? 'Il profilo è in revisione. Ti avviseremo quando sarà online.' : 'Il profilo non va online finché il team non lo rivede.',
    body: h('div', { class: 'list' }, rows.map(([k, v]) => h('div', { class: 'row between' }, h('span', { class: 'muted' }, k), h('span', {}, v)))),
    primary: submitted ? 'Vai alle impostazioni' : 'Invia per la revisione',
    canContinue: true,
    onNext: async () => {
      if (!submitted) { await api('POST', '/api/me/submit'); await reload(); stepIndex--; return; }
      location.href = '/settings';
    },
  }).el;
}

function render() {
  const all = steps();
  stepIndex = Math.max(0, Math.min(stepIndex, all.length - 1));
  root.replaceChildren(nav('onboarding', me.user), all[stepIndex]());
  window.scrollTo(0, 0);
}

await reload();
render();

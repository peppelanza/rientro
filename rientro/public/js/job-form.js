// "Che tipo di opportunità cerchi in Italia?" — shared by onboarding and settings.
import { api, autosaver, h, segmented, tagInput } from './lib.js';

const ROLE_SUGGESTIONS = ['Product Manager', 'Software Engineer', 'Data Scientist', 'Designer', 'Marketing Manager', 'Sales', 'Operations', 'Finance'];
const SKILL_SUGGESTIONS = ['Python', 'SQL', 'Leadership', 'UX Research', 'Go-to-market', 'Machine Learning', 'Project management'];
const SECTOR_SUGGESTIONS = ['Fintech', 'SaaS B2B', 'Turismo', 'Manifattura', 'Food & Agritech', 'Energia', 'Sanità', 'GovTech', 'Educazione', 'Moda'];
const CITY_SUGGESTIONS = ['Milano', 'Roma', 'Bologna', 'Torino', 'Napoli', 'Firenze', 'Bari', 'Catania'];

const ARRANGEMENTS = [
  ['on_site', 'In presenza', 'Tutti i giorni in ufficio'],
  ['hybrid', 'Ibrido', 'Un po’ in ufficio, un po’ da casa'],
  ['remote', 'Da remoto', 'Da qualsiasi città italiana'],
  ['any', 'Indifferente', 'Dipende dall’opportunità'],
];
const EMPLOYMENT = [['full_time', 'Full-time'], ['part_time', 'Part-time'], ['any', 'Indifferente']];
const AVAILABILITY = [
  ['now', 'Subito'], ['within_3_months', 'Entro 3 mesi'], ['within_6_months', 'Entro 6 mesi'],
  ['within_12_months', 'Entro un anno'], ['later', 'Più avanti'],
];

export function jobForm(prefs, statusEl) {
  const save = autosaver(statusEl, patch => api('PATCH', '/api/me/job-preferences', patch));

  const arrangementCards = h('div', { class: 'grid-4', role: 'radiogroup', 'aria-label': 'Modalità di lavoro' });
  const renderArrangement = v => arrangementCards.querySelectorAll('.option')
    .forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === v)));
  for (const [v, title, desc] of ARRANGEMENTS) {
    arrangementCards.append(h('button', {
      type: 'button', class: 'option', role: 'radio', 'data-v': v,
      onclick: () => { renderArrangement(v); save({ work_arrangement: v }); },
    }, h('span', { class: 'title' }, title), h('span', { class: 'desc' }, desc)));
  }
  renderArrangement(prefs.work_arrangement);
  arrangementCards.querySelectorAll('.option').forEach(o => o.classList.add('compact'));

  const form = h('div', { class: 'stack lg' },
    tagInput({ label: 'Ruoli / posizioni di interesse', placeholder: 'Es. Product Manager, poi Invio', values: prefs.roles, suggestions: ROLE_SUGGESTIONS, max: 8, onChange: v => save({ roles: v }) }),
    tagInput({ label: 'Competenze', placeholder: 'Es. SQL, poi Invio', values: prefs.skills, suggestions: SKILL_SUGGESTIONS, max: 20, onChange: v => save({ skills: v }) }),
    tagInput({ label: 'Settori di interesse', placeholder: 'Cerca un settore', values: prefs.sectors, suggestions: SECTOR_SUGGESTIONS, max: 5, onChange: v => save({ sectors: v }) }),
    tagInput({ label: 'Comuni / città preferiti', placeholder: 'Cerca tra i comuni italiani', values: prefs.preferred_locations, suggestions: CITY_SUGGESTIONS, max: 10, onChange: v => save({ preferred_locations: v }) }),
    h('div', { class: 'stack' }, h('span', { class: 'eyebrow' }, 'Modalità di lavoro'), arrangementCards),
    h('div', { class: 'stack' }, h('span', { class: 'eyebrow' }, 'Tipo di impiego'),
      segmented(EMPLOYMENT, prefs.employment_type, v => save({ employment_type: v }), 'Tipo di impiego')),
    h('div', { class: 'stack' }, h('span', { class: 'eyebrow' }, 'Disponibilità'),
      segmented(AVAILABILITY, prefs.availability, v => save({ availability: v }), 'Disponibilità')),
  );
  form.flush = save.flush;
  return form;
}

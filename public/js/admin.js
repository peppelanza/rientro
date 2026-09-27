// Internal tool (screens 44–50). No bulk export, no job-seeker search for companies:
// Rientro Talent is out of MVP scope. Every read here is written to the audit log server-side.
import { $, api, h, nav, time } from './lib.js';

const me = await api('GET', '/api/me');
const root = $('#app');
const main = h('main', { class: 'page wide stack lg' });
root.replaceChildren(nav('admin', me.user), main);

const STATUS_BADGE = { approved: 'ok', in_review: 'warn', onboarding: '', paused: '', suspended: 'warn' };
const INTENT = { has_idea: 'Ha già un’idea', seeking_idea: 'Cerca un’idea' };

function tabs(active) {
  return h('div', { class: 'seg', role: 'tablist' },
    [['users', 'Utenti'], ['audit', 'Registro accessi'], ['register', 'Registro trattamenti']].map(([k, label]) =>
      h('button', { type: 'button', role: 'tab', 'aria-checked': String(k === active), onclick: () => show(k) }, label)));
}

async function users() {
  const rows = await api('GET', '/api/admin/users');
  return h('div', { class: 'list scroll-x' }, h('table', {},
    h('thead', {}, h('tr', {}, ['Nome', 'Email', 'Intento', 'Lavoro', 'Stato', 'Iscritto'].map(t => h('th', {}, t)))),
    h('tbody', {}, rows.map(u => h('tr', { class: 'clickable', onclick: () => detail(u.id) },
      h('td', {}, [u.first_name, u.last_name].filter(Boolean).join(' ') || '—'),
      h('td', { class: 'muted' }, u.email),
      h('td', {}, INTENT[u.primary_intent] ?? '—'),
      h('td', {}, u.looking_for_italian_job ? h('span', { class: 'badge accent' }, 'Sì') : h('span', { class: 'muted' }, '—')),
      h('td', {}, h('span', { class: `badge ${STATUS_BADGE[u.status] ?? ''}` }, u.status)),
      h('td', { class: 'mono muted' }, time(u.created_at)))))));
}

async function detail(id) {
  const d = await api('GET', `/api/admin/users/${id}`);
  const j = d.job_seeking;
  const setStatus = status => async () => {
    await api('POST', `/api/admin/users/${id}/status`, { status });
    detail(id);
  };
  main.replaceChildren(
    h('button', { type: 'button', class: 'btn sm ghost', onclick: () => show('users') }, '← Utenti'),
    h('div', { class: 'row between' },
      h('h1', {}, [d.profile.first_name, d.profile.last_name].filter(Boolean).join(' ') || d.user.email),
      h('span', { class: `badge ${STATUS_BADGE[d.user.status] ?? ''}` }, d.user.status)),
    h('p', { class: 'small muted' }, 'Questa visualizzazione è stata registrata nel registro accessi.'),
    h('div', { class: 'grid-2' },
      h('div', { class: 'card stack' }, h('span', { class: 'eyebrow' }, 'Profilo'),
        ...[['Email', d.user.email], ['Vive a', [d.profile.lives_in_city, d.profile.lives_in_country].filter(Boolean).join(', ')],
          ['Intento', INTENT[d.profile.primary_intent]], ['Ruolo', d.profile.current_role]]
          .map(([k, v]) => h('div', { class: 'row between' }, h('span', { class: 'muted' }, k), h('span', {}, v || '—')))),
      h('div', { class: 'card stack' }, h('span', { class: 'eyebrow' }, 'Cerca lavoro in Italia'),
        h('div', { class: 'row between' }, h('span', { class: 'muted' }, 'Stato'), h('span', {}, j.looking_for_italian_job ? `Sì, dal ${time(j.selected_at)}` : 'No')),
        j.looking_for_italian_job ? [
          ['Ruoli', j.roles.join(', ')], ['Competenze', j.skills.join(', ')], ['Settori', j.sectors.join(', ')],
          ['Comuni', j.preferred_locations.join(', ')], ['Modalità', j.work_arrangement], ['Impiego', j.employment_type], ['Disponibilità', j.availability],
        ].map(([k, v]) => h('div', { class: 'row between' }, h('span', { class: 'muted' }, k), h('span', {}, v || '—'))) : null)),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn accent', onclick: setStatus('approved') }, 'Approva'),
      h('button', { type: 'button', class: 'btn secondary', onclick: setStatus('paused') }, 'Metti in pausa'),
      h('button', { type: 'button', class: 'btn danger', onclick: setStatus('suspended') }, 'Sospendi')),
    h('div', { class: 'stack' }, h('span', { class: 'eyebrow' }, 'Storico preferenze'),
      h('div', { class: 'list' }, d.preference_history.length ? d.preference_history.map(e =>
        h('div', { class: 'row between small' }, h('span', {}, `${e.preference} → ${e.value ? 'on' : 'off'}`),
          h('span', { class: 'mono muted' }, `${e.source} · ${e.notice_version ?? ''} · ${time(e.created_at)}`))) : h('div', { class: 'muted small' }, 'Nessuna'))));
}

async function audit() {
  const rows = await api('GET', '/api/admin/audit');
  return h('div', { class: 'list scroll-x' }, h('table', {},
    h('thead', {}, h('tr', {}, ['Quando', 'Admin', 'Azione', 'Utente (pseudonimo)', 'Dettagli'].map(t => h('th', {}, t)))),
    h('tbody', {}, rows.map(r => h('tr', {},
      h('td', { class: 'mono muted' }, time(r.created_at)), h('td', {}, r.admin_email ?? '—'),
      h('td', {}, h('span', { class: 'badge' }, r.action)), h('td', { class: 'mono' }, r.target_ref ?? '—'),
      h('td', { class: 'mono muted' }, Object.keys(r.details).length ? JSON.stringify(r.details) : ''))))));
}

async function register() {
  const legal = await api('GET', '/api/legal');
  return h('div', { class: 'stack' },
    h('div', { class: 'draft-banner' }, 'Basi giuridiche e tempi di conservazione sono proposte tecniche, non consulenza legale. Ogni riga resta “da rivedere” finché non è confermata da un professionista privacy UE/Italia.'),
    h('div', { class: 'list scroll-x' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Finalità', 'Dati', 'Base proposta', 'Conservazione', 'Destinatari', 'Stato'].map(t => h('th', {}, t)))),
      h('tbody', {}, legal.processing_register.map(p => h('tr', {},
        h('td', {}, h('strong', {}, p.purpose), h('br'), h('span', { class: 'small muted' }, p.description)),
        h('td', { class: 'small' }, p.data_categories), h('td', { class: 'small' }, p.proposed_basis),
        h('td', { class: 'small' }, p.retention), h('td', { class: 'small' }, p.recipients),
        h('td', {}, h('span', { class: 'badge warn' }, p.review_status))))))));
}

async function show(tab) {
  const body = await ({ users, audit, register })[tab]();
  main.replaceChildren(h('div', { class: 'row between' }, h('h1', {}, 'Admin'), tabs(tab)), body);
}

show('users');

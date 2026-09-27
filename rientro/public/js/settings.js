import { jobForm } from './job-form.js';
import { $, api, h, nav, time, toggle } from './lib.js';

const PREF_LABELS = { job_seeking: 'Cerco anche lavoro in Italia', marketing_email: 'Newsletter' };
const SOURCE_LABELS = { onboarding: 'Onboarding', settings: 'Impostazioni' };

let me = await api('GET', '/api/me');
const root = $('#app');

function confirmDialog({ title, body, confirm, variant = 'destructive' }) {
  return new Promise(resolve => {
    const close = v => { backdrop.remove(); resolve(v); };
    const backdrop = h('div', { class: 'dialog-backdrop', onclick: e => { if (e.target === backdrop) close(false); } },
      h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', {}, title), h('p', { class: 'muted' }, body),
        h('div', { class: 'row', }, h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn ghost', onclick: () => close(false) }, 'Annulla'),
          h('button', { type: 'button', class: `btn ${variant}`, onclick: () => close(true) }, confirm))));
    document.body.append(backdrop);
    backdrop.querySelector('.btn.ghost').focus();
  });
}

// ---------------------------------------------------------------------------------------------

function jobSection() {
  const status = h('span', { class: 'small muted' });
  const details = h('div', { class: 'stack' });
  const notice = h('p', { class: 'small muted' });
  const renderState = () => {
    const on = me.job_seeking.looking_for_italian_job;
    notice.textContent = on
      ? `Attivo dal ${time(me.job_seeking.selected_at)}. ${me.job_seeking_notice.text}`
      : 'Non attivo. Se lo attivi, sul profilo comparirà “Sta anche cercando lavoro in Italia”.';
    details.replaceChildren(...(on ? [
      h('h3', {}, 'Che tipo di opportunità cerchi in Italia?'),
      h('p', { class: 'small muted' }, 'Questi dettagli restano privati.'),
      jobForm(me.job_seeking, status), status,
    ] : []));
  };

  // Same single control as onboarding — not a second consent.
  const sw = toggle(me.job_seeking.looking_for_italian_job, async next => {
    if (!next && !(await confirmDialog({
      title: 'Disattivare la ricerca di lavoro?',
      body: 'Il badge sparirà dal profilo e cancelleremo ruoli, competenze, settori, luoghi e disponibilità che hai indicato. Resta traccia solo della data in cui l’hai disattivata.',
      confirm: 'Disattiva', variant: 'danger',
    }))) throw new Error('cancelled');
    me.job_seeking = await api('PUT', '/api/me/job-seeking?source=settings', { looking_for_italian_job: next });
    renderState();
    renderHistory();
  }, 'Sto anche cercando lavoro in Italia per un’azienda italiana');
  renderState();

  return h('section', { class: 'card stack' },
    h('div', { class: 'setting' },
      h('div', { class: 'text' }, h('span', { class: 'title' }, 'Sto anche cercando lavoro in Italia per un’azienda italiana'), notice),
      sw),
    details);
}

function communicationSection() {
  return h('section', { class: 'card stack' },
    h('span', { class: 'eyebrow' }, 'Comunicazioni'),
    h('div', { class: 'setting' },
      h('div', { class: 'text' },
        h('span', { class: 'title' }, 'Newsletter di Rientro'),
        h('span', { class: 'small muted' }, 'Novità, guide sul rientro ed eventi. È una scelta separata da tutte le altre: puoi revocarla quando vuoi.')),
      toggle(me.communication.marketing_email, async next => {
        me.communication = await api('PUT', '/api/me/communication', { preference: 'marketing_email', value: next });
        renderHistory();
      }, 'Newsletter di Rientro')));
}

const historyBody = h('tbody');
async function renderHistory() {
  const rows = await api('GET', '/api/me/preference-history');
  historyBody.replaceChildren(...(rows.length ? rows.map(r => h('tr', {},
    h('td', {}, time(r.created_at)),
    h('td', {}, PREF_LABELS[r.preference] ?? r.preference),
    h('td', {}, h('span', { class: `badge ${r.value ? 'ok' : ''}` }, r.value ? 'Attivato' : 'Disattivato')),
    h('td', { class: 'muted' }, SOURCE_LABELS[r.source] ?? r.source),
    h('td', { class: 'mono muted' }, [r.notice_version, r.privacy_policy_version].filter(Boolean).join(' · ')),
  )) : [h('tr', {}, h('td', { colspan: '5', class: 'muted' }, 'Nessuna scelta registrata finora.'))]));
}

function historySection() {
  return h('section', { class: 'stack' },
    h('span', { class: 'eyebrow' }, 'Storico delle tue scelte'),
    h('p', { class: 'small muted' }, 'Ogni volta che attivi o disattivi un’opzione facoltativa ne teniamo traccia, con la versione dei testi che avevi davanti.'),
    h('div', { class: 'list scroll-x' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Quando', 'Scelta', 'Valore', 'Dove', 'Versione testi'].map(t => h('th', {}, t)))),
      historyBody)));
}

function dataSection() {
  const exportStatus = h('span', { class: 'small muted' }, 'Puoi richiederne uno ogni 24 ore.');
  const exportBtn = h('button', { type: 'button', class: 'btn secondary' }, 'Scarica i miei dati');
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    const res = await fetch('/api/me/export');
    if (!res.ok) {
      exportStatus.textContent = (await res.json()).message;
    } else {
      const url = URL.createObjectURL(await res.blob());
      h('a', { href: url, download: 'rientro-i-miei-dati.json' }).click();
      URL.revokeObjectURL(url);
      exportStatus.textContent = 'Archivio scaricato: profilo, preferenze, storico delle scelte, connessioni, file.';
    }
    exportBtn.disabled = false;
  });

  return h('section', { class: 'card stack' },
    h('span', { class: 'eyebrow' }, 'I tuoi dati'),
    h('div', { class: 'setting' },
      h('div', { class: 'text' }, h('span', { class: 'title' }, 'Scarica i miei dati'), exportStatus), exportBtn),
    h('div', { class: 'setting' },
      h('div', { class: 'text' }, h('span', { class: 'title' }, 'Esci da tutti i dispositivi'), h('span', { class: 'small muted' }, 'Chiude tutte le sessioni attive.')),
      h('button', { type: 'button', class: 'btn secondary', onclick: async () => { await api('POST', '/api/auth/logout-all'); location.href = '/'; } }, 'Esci ovunque')),
    h('div', { class: 'setting' },
      h('div', { class: 'text' }, h('span', { class: 'title' }, 'Elimina il mio account'),
        h('span', { class: 'small muted' }, 'Cancella profilo, foto, preferenze, connessioni e sessioni.')),
      h('button', { type: 'button', class: 'btn danger', onclick: deleteFlow }, 'Elimina')));
}

async function deleteFlow() {
  if (!(await confirmDialog({
    title: 'Eliminare il tuo account?',
    body: 'Cancelleremo profilo, foto, preferenze lavoro, connessioni e sessioni. Per dimostrare le scelte fatte (es. quando hai attivato o disattivato un’opzione) conserviamo solo un registro pseudonimo, senza email né nome, che viene eliminato alla scadenza prevista. Vuoi prima scaricare i tuoi dati?',
    confirm: 'Continua', variant: 'danger',
  }))) return;
  const input = h('input', { class: 'input', 'aria-label': 'Scrivi ELIMINA per confermare', autocomplete: 'off' });
  const go = h('button', { type: 'button', class: 'btn destructive full', disabled: true }, 'Elimina definitivamente');
  input.addEventListener('input', () => { go.disabled = input.value !== 'ELIMINA'; });
  const backdrop = h('div', { class: 'dialog-backdrop' }, h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
    h('span', { class: 'mono muted' }, '2 DI 2'), h('h2', {}, 'Conferma l’eliminazione'),
    h('p', { class: 'muted' }, 'Scrivi ELIMINA per confermare.'), input, go,
    h('button', { type: 'button', class: 'btn ghost full', onclick: () => backdrop.remove() }, 'Annulla')));
  go.addEventListener('click', async () => {
    go.disabled = true;
    await api('DELETE', '/api/me', { confirm: input.value });
    location.href = '/?deleted=1';
  });
  document.body.append(backdrop);
  input.focus();
}

root.replaceChildren(
  nav('settings', me.user),
  h('main', { class: 'page stack lg' },
    h('div', { class: 'stack' },
      h('h1', {}, 'Privacy'),
      h('p', { class: 'lede' }, 'Il tuo profilo è visibile solo ai membri approvati di Rientro. Instagram, X e calendario si sbloccano solo con le tue connessioni. Email e dettagli sulla ricerca di lavoro non sono mai mostrati agli altri membri.')),
    jobSection(),
    communicationSection(),
    historySection(),
    dataSection(),
    h('div', { class: 'row small' },
      h('a', { href: '/legal/privacy' }, 'Privacy Policy'), h('span', { class: 'muted' }, '·'),
      h('a', { href: '/legal/cookie' }, 'Cookie Policy'), h('span', { class: 'muted' }, '·'),
      h('a', { href: '/legal/termini' }, 'Termini'))),
);
renderHistory();

import { $, api, h } from './lib.js';

const form = $('#login');
const status = $('#status');
const params = new URLSearchParams(location.search);
if (params.get('link') === 'expired') status.textContent = 'Il link non è valido o è scaduto. Richiedine un altro.';
if (params.get('deleted')) status.textContent = 'Il tuo account è stato eliminato.';

form.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = form.querySelector('button');
  btn.disabled = true;
  status.textContent = '';
  try {
    const r = await api('POST', '/api/auth/request-link', { email: form.email.value });
    status.replaceChildren('Ti abbiamo mandato un link di accesso. Vale 15 minuti.');
    if (r.dev_link) {
      status.append(h('br'), h('span', { class: 'mono' }, 'Solo in sviluppo: '), h('a', { href: r.dev_link }, 'apri il link'));
    }
  } catch (err) {
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

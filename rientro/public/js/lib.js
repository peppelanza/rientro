// Shared helpers. DOM is always built with textContent — never innerHTML with data.

export async function api(method, path, body) {
  const headers = { 'x-requested-with': 'rientro' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (res.status === 401) { location.href = '/'; throw new Error('unauthenticated'); }
  if (!res.ok) throw Object.assign(new Error(data?.message || 'Errore'), { status: res.status, code: data?.error });
  return data;
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export const time = iso => (iso ? new Date(iso).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const hhmm = () => new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

// Segmented control. options: [[value, label], ...]
export function segmented(options, value, onChange, label) {
  const root = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const render = v => root.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === v)));
  for (const [v, text] of options) {
    root.append(h('button', {
      type: 'button', role: 'radio', 'data-v': v,
      onclick: () => { render(v); onChange(v); },
    }, text));
  }
  render(value);
  return root;
}

// Free-text tag input with optional suggestions. Enter or comma adds a tag.
export function tagInput({ label, placeholder, values, suggestions = [], max = 10, onChange }) {
  let tags = [...values];
  const chips = h('div', { class: 'chips' });
  const sugg = h('div', { class: 'chips' });
  const input = h('input', { class: 'input', placeholder, 'aria-label': label, maxlength: '80' });
  const commit = () => { render(); onChange(tags); };
  const add = raw => {
    const v = raw.trim();
    if (!v || tags.length >= max || tags.some(t => t.toLowerCase() === v.toLowerCase())) return;
    tags.push(v);
    commit();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); input.value = ''; }
    if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); commit(); }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) { add(input.value); input.value = ''; } });
  function render() {
    chips.replaceChildren(...tags.map(t => h('button', {
      type: 'button', class: 'chip selected', 'aria-label': `Rimuovi ${t}`,
      onclick: () => { tags = tags.filter(x => x !== t); commit(); },
    }, t, h('span', { class: 'x', 'aria-hidden': 'true' }, '✕'))));
    sugg.replaceChildren(...suggestions.filter(s => !tags.some(t => t.toLowerCase() === s.toLowerCase())).slice(0, 8)
      .map(s => h('button', { type: 'button', class: 'chip suggest', onclick: () => add(s) }, `+ ${s}`)));
    input.disabled = tags.length >= max;
  }
  render();
  return h('div', { class: 'tag-input' },
    h('div', { class: 'row between' }, h('span', { class: 'eyebrow' }, label), h('span', { class: 'mono muted' }, `max ${max}`)),
    chips, input, suggestions.length ? sugg : null);
}

export function toggle(on, onChange, label) {
  const btn = h('button', { type: 'button', class: 'toggle', role: 'switch', 'aria-checked': String(on), 'aria-label': label });
  btn.addEventListener('click', async () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.disabled = true;
    try { await onChange(next); btn.setAttribute('aria-checked', String(next)); }
    catch (e) { if (e.message !== 'cancelled') alert(e.message); }
    finally { btn.disabled = false; }
  });
  return btn;
}

export function nav(active, user) {
  return h('nav', { class: 'nav' },
    h('a', { href: '/', class: 'logo', 'aria-label': 'Rientro' }, 'Rientro'),
    h('span', { class: 'spacer' }),
    h('a', { href: '/onboarding', class: active === 'onboarding' ? 'active hide-sm' : 'hide-sm' }, 'Il tuo profilo'),
    h('a', { href: '/settings', class: active === 'settings' ? 'active' : '' }, 'Impostazioni'),
    user?.role === 'admin' ? h('a', { href: '/admin', class: active === 'admin' ? 'active' : '' }, 'Admin') : null,
    h('button', { type: 'button', class: 'btn sm secondary', onclick: async () => { await api('POST', '/api/auth/logout'); location.href = '/'; } }, 'Esci'));
}

// Debounced autosave with a "Salvato · 14:32" status line, as in the design.
// Patches made within the debounce window are merged, so no field change is lost.
export function autosaver(statusEl, save, delay = 500) {
  let timer;
  let pending = {};
  const flush = async () => {
    const patch = pending;
    pending = {};
    try { await save(patch); statusEl.textContent = `Salvato · ${hhmm()}`; }
    catch (e) { statusEl.textContent = e.message; statusEl.classList.add('err'); }
  };
  const queue = patch => {
    Object.assign(pending, patch);
    clearTimeout(timer);
    statusEl.textContent = 'Salvataggio…';
    statusEl.classList.remove('err');
    timer = setTimeout(flush, delay);
  };
  queue.flush = () => { clearTimeout(timer); return Object.keys(pending).length ? flush() : Promise.resolve(); };
  return queue;
}

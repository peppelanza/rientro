// Shared client helpers: API calls, session, catalog, formatting, toasts and modals.
import { mountPage } from '../dc/runtime.js';

export async function api(method, path, body, { raw = false } = {}) {
  const headers = { 'x-requested-with': 'rientro' };
  let payload;
  if (body instanceof Blob || body instanceof ArrayBuffer) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(path, { method, headers, body: payload });
  if (raw && res.ok) return res;
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    location.href = `/accedi?next=${encodeURIComponent(location.pathname + location.search)}`;
    throw new Error('unauthenticated');
  }
  if (!res.ok) throw Object.assign(new Error(data?.message || 'Qualcosa è andato storto. Riprova.'), { status: res.status, code: data?.error });
  return data;
}

// Upload with progress (photo, video)
export function upload(path, file, onProgress, headers = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.setRequestHeader('x-requested-with', 'rientro');
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded, e.total);
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(Object.assign(new Error(data?.message || 'Caricamento non riuscito.'), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error('Caricamento non riuscito. Controlla la connessione.'));
    xhr.send(file);
    upload.abort = () => xhr.abort();
  });
}

let meCache = null;
export async function getMe(fresh = false) {
  if (!meCache || fresh) meCache = await api('GET', '/api/me');
  return meCache;
}
export const setMe = me => { meCache = me; };

let catalogCache = null;
// Intent (onboarding "Cosa stai cercando su Rientro?"): badge label and UI Badge kind
export const INTENT_BADGE = {
  has_idea: ["Ha già un'idea", 'idea'], seeking_idea: ["Cerca un'idea insieme", 'explore'], networking: ['Networking', 'neutral'],
};

export async function getCatalog() {
  catalogCache ??= await api('GET', '/api/catalog');
  return catalogCache;
}

export const qs = () => new URLSearchParams(location.search);
export const go = href => { location.href = href; };

// --- Formatting (Italian) --------------------------------------------------------------------

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const fmtDate = iso => { if (!iso) return '—'; const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtShort = iso => { if (!iso) return ''; const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtTime = iso => (iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '');
export const fmtMonth = ym => { if (!ym) return ''; const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; };

export function timeAgo(iso, { short = false } = {}) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'ora';
  if (s < 3600) return `${Math.floor(s / 60)} min${short ? '' : ' fa'}`;
  if (s < 86400) return short ? `${Math.floor(s / 3600)} h` : `${Math.floor(s / 3600)} ${Math.floor(s / 3600) === 1 ? 'ora' : 'ore'} fa`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'Ieri';
  if (d < 7) return short ? `${d} giorni` : `${d} giorni fa`;
  return fmtShort(iso);
}

// Thread list style: "10:42", "Ieri", "Lun", "28 ago"
export function threadTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return fmtTime(iso);
  const days = Math.floor((today - d) / 86400000);
  if (days < 2) return 'Ieri';
  if (days < 7) return ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'][d.getDay()];
  return fmtShort(iso);
}

export const initials = (first, last) => `${(first || '?')[0]}${(last || '')[0] || ''}`.toUpperCase();
export const fullName = p => [p?.first_name, p?.last_name].filter(Boolean).join(' ');

// --- Toasts (design 00 "Feedback · Toast") --------------------------------------------------

export function toast(message, { tone = 'ok', action, onAction, ms = 4000 } = {}) {
  let host = document.getElementById('toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.setAttribute('role', 'status');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  const icon = document.createElement('span');
  icon.className = `toast-icon ${tone}`;
  icon.textContent = tone === 'ok' ? '✓' : '!';
  const text = document.createElement('span');
  text.textContent = message;
  el.append(icon, text);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = action;
    b.onclick = () => { onAction?.(); el.remove(); };
    el.append(b);
  }
  host.append(el);
  setTimeout(() => el.remove(), ms);
}
export const toastError = err => toast(err?.message || 'Qualcosa è andato storto.', { tone: 'err' });

// --- Modals --------------------------------------------------------------------------------

// Mounts a dc template in an overlay. The Logic gets `this.close(result)`.
export function openModal({ template, Logic, props = {}, backdrop = 'rgba(26,23,38,.45)', sheet = false }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = `modal-overlay${sheet ? ' sheet' : ''}`;
    overlay.style.background = backdrop;
    const box = document.createElement('div');
    box.className = 'modal-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    overlay.append(box);
    const previous = document.activeElement;
    const close = result => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
      resolve(result);
    };
    const onKey = e => { if (e.key === 'Escape') close(undefined); };
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(undefined); });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    class Bound extends Logic { close(r) { close(r); } }
    mountPage(box, { template, Logic: Bound, props });
    box.querySelector('input,textarea,[tabindex="0"],button')?.focus();
  });
}

// Fetch a page template (HTML file next to the page module).
const tplCache = new Map();
export async function template(url) {
  if (!tplCache.has(url)) tplCache.set(url, fetch(url).then(r => r.text()));
  return tplCache.get(url);
}

export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A message to show once on the next page (after a redirect), e.g. "account ripristinato".
const FLASH = 'rientro-flash';
export function flash(message) { try { sessionStorage.setItem(FLASH, message); } catch {} }
export function showFlash() {
  let m = null;
  try { m = sessionStorage.getItem(FLASH); sessionStorage.removeItem(FLASH); } catch {}
  // The server can leave one too, after a redirect (LinkedIn sign-in)
  const c = document.cookie.match(/(?:^|; )rientro_flash=([^;]*)/);
  if (c) { m = decodeURIComponent(c[1]); document.cookie = 'rientro_flash=; Path=/; Max-Age=0'; }
  if (m) toast(m, { ms: 7000 });
}

// Search boxes: run once the member stops typing for a moment
export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// "Napoli", "Napoli o Torino", "Napoli, Torino o Palermo"; past max: "…, Palermo o altre 2 città"
export function orList(items, max = Infinity) {
  const list = items.filter(Boolean);
  if (list.length > max) return `${list.slice(0, max).join(', ')} o altre ${list.length - max} città`;
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} o ${list.at(-1)}` : (list[0] ?? '');
}

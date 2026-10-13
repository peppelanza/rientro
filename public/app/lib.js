// Shared client helpers: API calls, session, catalog, formatting, toasts and modals.
import { mountPage } from '../dc/runtime.js';
import { orList } from './card-fields.js'; // the same as the server's

export { orList };

export async function api(method, path, body, { raw = false } = {}) {
  const headers = { 'x-requested-with': 'rientro' };
  let payload;
  if (body instanceof Blob || body instanceof ArrayBuffer) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(path, { method, headers, body: payload });
  if (raw && res.ok) return res;
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  // The server restarting for a deploy (Render's own error page, not ours): reloading shows
  // "Il sistema è in aggiornamento" from the service worker (/sw.js), which comes back by itself
  if ([502, 503, 504].includes(res.status) && !data && navigator.serviceWorker?.controller) {
    location.reload();
    throw new Error('updating');
  }
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
// Who's signed in, if a page already knows (no request): the public pages' "Accedi a Rientro" and
// city picker read it (home.js sets it from the session)
export const knownMe = () => meCache;

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
// Scopri remembers the view you're on (filters, page: all in its address) for the way back
// from a profile (persona.js)
export const SCOPRI_BACK_KEY = 'rientro.scopri.back';
// The same for the search's results (cerca.js), the way back being "Torna ai risultati"
export const CERCA_BACK_KEY = 'rientro.cerca.back';

// A short, light vibration (a long press that opened something). Android: the Vibration API. iPhone
// Safari has none, but toggling a native switch (<input type="checkbox" switch>, iOS 18+) plays the
// system's light tick, so a hidden one is toggled; elsewhere nothing happens.
let hapticSwitch = null;
export function haptic() {
  if (navigator.vibrate) { navigator.vibrate(12); return; }
  try {
    if (!hapticSwitch) {
      hapticSwitch = document.createElement('label');
      hapticSwitch.setAttribute('aria-hidden', 'true');
      hapticSwitch.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none';
      hapticSwitch.innerHTML = '<input type="checkbox" switch tabindex="-1">';
      document.body.append(hapticSwitch);
    }
    hapticSwitch.click();
  } catch {}
}

// The back step that closes something laid over the page (photo viewer, phone search) isn't the
// page's: pages that reload on going back (gruppo.js, messaggi.js) leave that one alone. The
// overlay's class is still on while the page's own listener runs (it was added first).
export const overlayClosing = () => document.documentElement.matches('.pv-open, .search-sheet-open');

// --- Formatting (Italian) --------------------------------------------------------------------

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const fmtDate = iso => { if (!iso) return '—'; const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtShort = iso => { if (!iso) return ''; const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtTime = iso => (iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '');
// "Chi stai cercando › Dove": the member's own city: where they live once back, else where they'd
// like to move (null when they don't know yet). Same as profiles.js myPlace.
export const myPlace = p => (p.lives_in === 'italy' ? p.lives_in_city || null : p.desired_unknown ? null : orList(p.desired_comuni || []) || null);
export function placeToggle(p, set) {
  const place = myPlace(p);
  // two chips: Indifferente (the default) and the member's city
  return {
    hasMyPlace: !!place, loc: p.seeking_location === 'same_city' ? 'same_city' : 'any',
    locOpts: [{ v: 'any', l: 'Indifferente' }, { v: 'same_city', l: place ?? '' }],
    locProps: { onSelect: v => set({ seeking_location: v === 'same_city' ? 'same_city' : 'any' }) },
  };
}

// Chi stai cercando: the areas as cards (like Il tuo background), up to 3, plus "Indifferente", which
// clears the others and is stored as every area (catalog.js seeksAny)
export const SEEK_MAX = 3;
export function seekCards(areas, list, set) {
  const any = areas.every(a => list.includes(a));
  const card = (t, on, fn) => ({ t, on, off: false, desc: '', control: 'none', aria: on ? 'true' : 'false', dis: false, fn });
  return [
    ...areas.map(t => card(t, !any && list.includes(t), () => {
      const cur = any ? [] : list;
      if (!cur.includes(t) && cur.length >= SEEK_MAX) { limitNote(SEEK_MAX, 'aree (oppure Indifferente)'); return; }
      set({ seeking_backgrounds: cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t] });
    })),
    card('Indifferente', any, () => set({ seeking_backgrounds: any ? [] : [...areas] })),
  ];
}
export const seeksText = (areas, list) => (areas.every(a => list.includes(a)) ? 'Qualsiasi background' : list.join(', '));

// "Product Manager · Zalando": the job marked "Lavoro ancora qui" (as the server's profiles.js
// syncCurrentJob keeps it), else what the profile had
export function jobLine(p) {
  const e = (p.experiences || []).find(x => x.current);
  return (e ? [e.role, e.company] : [p.current_role, p.current_company]).filter(Boolean).join(' · ');
}

// Every capped choice says the same when you try one more: "Massimo 5 settori"
export const limitNote = (n, noun) => toast(`Massimo ${n} ${noun}: togline uno per sceglierne un altro.`, { tone: 'info' });

// Settori: up to five; a sixth isn't added (nothing greyed out), a note says why
export const SECTORS_MAX = 5;
export function pickSector(list, s) {
  if (list.includes(s)) return list.filter(x => x !== s);
  if (list.length >= SECTORS_MAX) { limitNote(SECTORS_MAX, 'settori'); return list; }
  return [...list, s];
}

// Job dates are typed as mm/aaaa (stored as aaaa-mm): the stored value as typed, and back. textToMonth
// gives null for an empty field and undefined for something it can't read.
export const monthToText = ym => (/^\d{4}-\d{2}$/.test(ym || '') ? `${ym.slice(5)}/${ym.slice(0, 4)}` : ym || '');
export function textToMonth(t) {
  const v = String(t ?? '').trim();
  if (!v) return null;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})\s*[/.\- ]\s*(\d{4})$/);
  if (!m || +m[1] < 1 || +m[1] > 12 || +m[2] < 1940 || +m[2] > new Date().getFullYear() + 1) return undefined;
  return `${m[2]}-${m[1].padStart(2, '0')}`;
}
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

// Where a person is going, in a line: "Berlino → Napoli"; already back in Italy, where they came
// back from: "Berlino → Bologna" (profiles.js card back_from)
export const routeOf = p => (p.back_from ? `${p.back_from} → ${p.from}` : p.from && p.to ? `${p.from} → ${p.to}` : p.from || '');

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
  // the same note already showing (a second tap on a full list): not twice
  if ([...host.children].some(c => c.dataset.msg === message)) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.msg = message;
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

// Mounts a dc template in an overlay, which opens and closes with a short animation (app.css). The
// Logic gets `this.close(result)`. dismissible: false keeps it open until the Logic closes it (no
// Escape, no click outside).
const MODAL_OUT_MS = 180;
export function openModal({ template, Logic, props = {}, backdrop = 'rgba(26,23,38,.45)', sheet = false, dismissible = true }) {
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
    // Phones: the dialog rises from the bottom of what's visible, so with the keyboard up it sits
    // right on it (and its white carries on below, app.css), instead of floating with a gap
    const vv = window.visualViewport;
    const fit = () => {
      overlay.style.top = `${vv.offsetTop}px`;
      overlay.style.bottom = 'auto';
      overlay.style.height = `${vv.height}px`;
    };
    const phone = vv && matchMedia('(max-width: 720px)').matches;
    if (phone) { fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
    // closing plays the opening backwards (app.css .modal-overlay.closing), then it goes
    const close = result => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) overlay.remove();
      else { overlay.classList.add('closing'); setTimeout(() => overlay.remove(), MODAL_OUT_MS); }
      if (phone) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
      resolve(result);
    };
    const onKey = e => { if (e.key === 'Escape' && dismissible) close(undefined); };
    overlay.addEventListener('mousedown', e => { if (e.target === overlay && dismissible) close(undefined); });
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

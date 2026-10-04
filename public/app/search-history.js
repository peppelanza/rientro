// The search in the top bar (App Nav): no browser suggestions (autocomplete off), but the member's
// own last 5 searches, under the empty field while it's in use, each with × to forget it. Kept in
// this browser only. Hooked to the page rather than the bar, so the bar can redraw at any time.
// Phones have a magnifying glass in the bar instead, opening the same search full screen
// (openSearchSheet), the recent searches under the field.
const KEY = 'rientro.recentSearches';
const MAX = 5;
const FIELD = 'form[role="search"] input[name="q"]';

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch {} };

let panel = null;
let field = null;

function close() {
  panel?.remove();
  panel = null;
}

function open(input) {
  field = input;
  const list = read();
  if (input.value.trim() || !list.length) return close();
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'recent-searches';
    // pressing on it mustn't take the focus from the field (it would close)
    panel.addEventListener('mousedown', e => e.preventDefault());
    panel.addEventListener('click', e => {
      const forget = e.target.closest('[data-forget]');
      if (forget) {
        write(read().filter(q => q !== forget.dataset.forget));
        return open(field);
      }
      const go = e.target.closest('[data-q]');
      if (go) { remember(go.dataset.q); location.href = searchUrl(go.dataset.q); }
    });
    document.body.append(panel);
  }
  panel.replaceChildren(Object.assign(document.createElement('span'), { className: 'recent-title', textContent: 'Ricerche recenti' }));
  for (const q of list) {
    const row = document.createElement('div');
    row.className = 'recent-row';
    const pick = Object.assign(document.createElement('button'), { type: 'button', className: 'recent-q', textContent: q });
    pick.dataset.q = q;
    const x = Object.assign(document.createElement('button'), { type: 'button', className: 'recent-x', textContent: '✕' });
    x.dataset.forget = q;
    x.setAttribute('aria-label', `Togli “${q}” dalle ricerche recenti`);
    row.append(pick, x);
    panel.append(row);
  }
  const r = input.closest('form').getBoundingClientRect();
  panel.style.left = `${r.left}px`;
  panel.style.top = `${r.bottom + 8}px`;
  panel.style.width = `${r.width}px`;
}

// Where a search goes: its own page (cerca.js). From there a new search keeps what's set: the tab
// (Persone or Gruppi), the people filters, the group; the list starts from page 1.
export function searchUrl(q) {
  const p = location.pathname === '/cerca' ? new URLSearchParams(location.search) : new URLSearchParams();
  p.set('q', q.trim());
  p.delete('page');
  return `/cerca?${p}`;
}

export function remember(q) {
  q = q.trim();
  if (q) write([q, ...read().filter(x => x.toLowerCase() !== q.toLowerCase())]);
}

export function searchHistory() {
  document.addEventListener('focusin', e => { if (e.target.matches?.(FIELD)) open(e.target); });
  document.addEventListener('input', e => { if (e.target.matches?.(FIELD)) open(e.target); });
  document.addEventListener('focusout', e => { if (e.target.matches?.(FIELD)) close(); });
  document.addEventListener('keydown', e => { if (panel && e.key === 'Escape') close(); });
  addEventListener('scroll', close, { passive: true });
  addEventListener('resize', close);
  // the bar's own submit then goes to Scopri
  document.addEventListener('submit', e => { if (e.target.matches?.('form[role="search"]')) remember(new FormData(e.target).get('q') || ''); }, true);
}

// Phones: the search over the whole screen, the field ready to type (the keyboard comes up: it's
// called inside the tap) and the recent searches under it; Invio opens the results in Scopri, with
// its Persone and Gruppi tabs (cerca.js). The phone's back button closes it.
export function openSearchSheet() {
  const sheet = document.createElement('div');
  sheet.className = 'search-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Cerca');
  sheet.innerHTML = `<form class="search-sheet-top" autocomplete="off">
<button type="button" class="search-sheet-back" aria-label="Chiudi"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
<label class="search-sheet-field"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" enterkeyhint="search" autocomplete="off" maxlength="80" placeholder="Cerca persone e gruppi" aria-label="Cerca"></label>
</form><div class="search-sheet-list"></div>`;
  const input = sheet.querySelector('input');
  const list = sheet.querySelector('.search-sheet-list');
  const go = q => { q = q.trim(); if (!q) return; remember(q); location.href = searchUrl(q); };
  const draw = () => {
    const recent = read();
    list.replaceChildren();
    if (!recent.length) return;
    list.append(Object.assign(document.createElement('span'), { className: 'recent-title', textContent: 'Ricerche recenti' }));
    for (const q of recent) {
      const row = document.createElement('div');
      row.className = 'recent-row';
      const pick = Object.assign(document.createElement('button'), { type: 'button', className: 'recent-q', textContent: q });
      pick.addEventListener('click', () => go(q));
      const x = Object.assign(document.createElement('button'), { type: 'button', className: 'recent-x', textContent: '✕' });
      x.setAttribute('aria-label', `Togli “${q}” dalle ricerche recenti`);
      x.addEventListener('click', () => { write(read().filter(r => r !== q)); draw(); });
      row.append(pick, x);
      list.append(row);
    }
  };
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    sheet.remove();
    document.documentElement.classList.remove('search-sheet-open');
    removeEventListener('popstate', finish);
  };
  const close = () => (history.state?.searchSheet ? history.back() : finish());
  sheet.querySelector('form').addEventListener('submit', e => { e.preventDefault(); go(input.value); });
  sheet.querySelector('.search-sheet-back').addEventListener('click', close);
  sheet.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  draw();
  document.body.append(sheet);
  document.documentElement.classList.add('search-sheet-open');
  history.pushState({ searchSheet: true }, '');
  addEventListener('popstate', finish);
  input.focus();
}


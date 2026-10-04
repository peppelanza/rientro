// The search in the top bar (App Nav): no browser suggestions (autocomplete off), but the member's
// own last 5 searches, under the empty field while it's in use, each with × to forget it. Kept in
// this browser only. Hooked to the page rather than the bar, so the bar can redraw at any time.
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
      if (go) { remember(go.dataset.q); location.href = `/scopri?q=${encodeURIComponent(go.dataset.q)}`; }
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

function remember(q) {
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

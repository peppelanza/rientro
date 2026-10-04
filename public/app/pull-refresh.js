// Phones, pages with the bottom menu: pulling down from the top refreshes the page's data in place
// (page.refresh(), _base.js) instead of Safari reloading the whole page, so nothing blanks out. Like
// the native one: the page slides down with the finger and an iOS-style spinner shows in the gap
// above; once far enough it says "Lascia per aggiornare", and after letting go it spins while the
// data loads. Safari's own pull-to-refresh is switched off on these pages.
const PULL = 64; // px of (damped) pull that triggers a refresh; the page waits there while loading
const MIN_SPIN = 1000; // ms the wheel turns at least, even when the data is back sooner

export function pullToRefresh(page) {
  if (!matchMedia('(max-width: 720px)').matches) return;
  const root = document.documentElement;
  root.style.overscrollBehaviorY = 'none';
  const spinner = Object.assign(document.createElement('div'), { className: 'pull-spinner' });
  spinner.setAttribute('aria-hidden', 'true');
  spinner.innerHTML = '<b class="pull-wheel"><i class="ios-spinner"></i></b><span>Lascia per aggiornare</span>'; // the wheel: app.css
  document.body.append(spinner);
  let startY = null, pull = 0, busy = false;
  // The page (everything but the fixed bottom menu, app.css) and the spinner follow the pull
  const place = y => {
    root.style.setProperty('--pull', `${y}px`);
    spinner.style.opacity = String(Math.min(1, y / PULL));
    spinner.classList.toggle('ready', !busy && y >= PULL);
  };
  const settle = () => {
    document.body.classList.remove('pull-dragging');
    place(0);
    spinner.classList.remove('spinning', 'ready');
    setTimeout(() => { if (!busy && startY === null) document.body.classList.remove('pull-active'); }, 250);
  };

  addEventListener('touchstart', e => {
    // Only from the very top of the page, and not inside something that scrolls by itself or a sheet
    const blocked = busy || scrollY > 0 || document.body.classList.contains('chat-open') || document.body.classList.contains('bell-open')
      || root.classList.contains('cj-locked') || e.target.closest('[data-keep-scroll], .bell-panel, dialog, [role=dialog]');
    startY = blocked ? null : e.touches[0].clientY;
    pull = 0;
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || scrollY > 0) { if (pull) { pull = 0; settle(); } return; }
    // rubber band, as iOS does: keeps following the finger, ever harder, never stops
    pull = (dy * 0.55 * innerHeight) / (innerHeight + 0.55 * dy);
    document.body.classList.add('pull-active', 'pull-dragging');
    place(pull);
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (startY === null) return;
    startY = null;
    if (pull < PULL) { settle(); return; }
    busy = true;
    document.body.classList.remove('pull-dragging');
    place(PULL);
    spinner.classList.remove('ready');
    spinner.classList.add('spinning');
    try { await Promise.all([page.refresh(), new Promise(r => setTimeout(r, MIN_SPIN))]); } finally {
      page.__rerender();
      busy = false;
      settle();
    }
  });
}

// Phones, pages with the bottom menu: pulling down from the top refreshes the page's data in place
// (page.refresh(), _base.js) instead of Safari reloading the whole page, so nothing blanks out.
// Safari's own pull-to-refresh is switched off on these pages (overscroll-behavior).
const PULL = 64; // px of (damped) pull that triggers a refresh

export function pullToRefresh(page) {
  if (!matchMedia('(max-width: 720px)').matches) return;
  document.documentElement.style.overscrollBehaviorY = 'none';
  const spinner = Object.assign(document.createElement('div'), { className: 'pull-spinner' });
  spinner.setAttribute('aria-hidden', 'true');
  spinner.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>';
  document.body.append(spinner);
  let startY = null, pull = 0, busy = false;
  const show = (y, turn) => { spinner.style.transform = `translate(-50%, ${y}px) rotate(${turn}deg)`; spinner.style.opacity = String(Math.min(1, y / PULL)); };
  const reset = () => { spinner.classList.remove('pulling', 'spinning'); spinner.style.transform = ''; spinner.style.opacity = ''; };

  addEventListener('touchstart', e => {
    // Only from the very top of the page, and not inside something that scrolls by itself or a sheet
    const blocked = busy || scrollY > 0 || document.body.classList.contains('chat-open') || document.body.classList.contains('bell-open')
      || document.documentElement.classList.contains('cj-locked') || e.target.closest('[data-keep-scroll], .bell-panel, dialog, [role=dialog]');
    startY = blocked ? null : e.touches[0].clientY;
    pull = 0;
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || scrollY > 0) { pull = 0; reset(); return; }
    pull = Math.min(dy * 0.5, PULL * 1.4);
    spinner.classList.add('pulling');
    show(pull, pull * 4);
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (startY === null) return;
    startY = null;
    if (pull < PULL) { reset(); return; }
    busy = true;
    spinner.classList.remove('pulling');
    spinner.classList.add('spinning');
    show(PULL, 0);
    try { await page.refresh(); } finally {
      page.__rerender();
      busy = false;
      reset();
    }
  });
}

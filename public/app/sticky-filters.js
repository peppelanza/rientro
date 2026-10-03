// Scopri on a computer: the filters panel stays in view while scrolling. When it's taller than the
// screen ("Tutti i filtri" open) it scrolls along with the page until one of its ends reaches the
// screen (the bottom while going down, the top while going up), and stays there. It only switches
// between pinned and scrolling at those moments; in between the browser moves it by itself.
const FILTERS_MARGIN = 16;
// At the bottom it stays higher: clear of the link preview Chrome shows in the bottom-left corner
const FILTERS_BOTTOM = 40;
let filtersObserver;
let filtersAside = null;
let lastY = 0;
export function stickFilters(aside) {
  filtersObserver?.disconnect();
  filtersAside = aside;
  if (!aside) return;
  lastY = scrollY;
  const reset = () => {
    Object.assign(aside.style, { position: innerWidth <= 720 ? '' : 'sticky', top: `${FILTERS_MARGIN}px`, marginTop: '' });
    placeFilters(0);
  };
  reset();
  filtersObserver = new ResizeObserver(reset); // opening "Tutti i filtri", the comune list…
  filtersObserver.observe(aside);
}

function placeFilters(dy) {
  const aside = filtersAside;
  if (!aside?.isConnected || innerWidth <= 720) return;
  const m = FILTERS_MARGIN;
  const r = aside.getBoundingClientRect();
  const bottomPin = innerHeight - r.height - FILTERS_BOTTOM; // the top that puts its bottom at the screen's
  if (bottomPin >= m) { aside.style.top = `${m}px`; aside.style.marginTop = ''; return; } // it fits
  const free = () => {
    // From pinned to scrolling with the page, as if it had let go when the direction changed: this
    // scroll step (dy) already moves it, so a big step (a mouse wheel notch) doesn't leave it behind
    const from = aside.parentElement.getBoundingClientRect().top + parseFloat(getComputedStyle(aside.parentElement).paddingTop);
    const top = Math.min(m, Math.max(bottomPin, r.top - dy));
    Object.assign(aside.style, { position: 'relative', top: '', marginTop: `${Math.max(0, top - from)}px` });
  };
  const pin = top => Object.assign(aside.style, { position: 'sticky', top: `${top}px`, marginTop: '' });
  const pinned = aside.style.position === 'sticky';
  if (dy > 0) { // going down
    if (r.bottom <= innerHeight - FILTERS_BOTTOM + 0.5) pin(bottomPin);
    else if (pinned && r.top <= m + 0.5) free();
  } else if (dy < 0) { // going up
    if (r.top >= m - 0.5) pin(m);
    else if (pinned) free();
  } else if (pinned) pin(m);
}

addEventListener('scroll', () => {
  const dy = scrollY - lastY;
  lastY = scrollY;
  placeFilters(dy);
}, { passive: true });
addEventListener('resize', () => filtersAside && stickFilters(filtersAside));

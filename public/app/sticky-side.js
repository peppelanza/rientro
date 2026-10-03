// On a computer, a side panel (Scopri's filters, the Gruppi menu) stays in view while scrolling. When
// it's taller than the screen it scrolls along with the page until one of its ends reaches the screen
// (the bottom while going down, the top while going up), and stays there. It only switches between
// pinned and scrolling at those moments; in between the browser moves it by itself.
const SIDE_MARGIN = 16;
// At the bottom it stays higher: clear of the link preview Chrome shows in the bottom-left corner
const SIDE_BOTTOM = 40;
let sideObserver;
let sideAside = null;
let lastY = 0;
export function stickSide(aside) {
  sideObserver?.disconnect();
  sideAside = aside;
  if (!aside) return;
  lastY = scrollY;
  const reset = () => {
    Object.assign(aside.style, { position: innerWidth <= 720 ? '' : 'sticky', top: `${SIDE_MARGIN}px`, marginTop: '' });
    placeSide(0);
  };
  reset();
  sideObserver = new ResizeObserver(reset); // opening "Tutti i filtri", the comune list…
  sideObserver.observe(aside);
}

function placeSide(dy) {
  const aside = sideAside;
  if (!aside?.isConnected || innerWidth <= 720) return;
  const m = SIDE_MARGIN;
  const r = aside.getBoundingClientRect();
  const bottomPin = innerHeight - r.height - SIDE_BOTTOM; // the top that puts its bottom at the screen's
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
    if (r.bottom <= innerHeight - SIDE_BOTTOM + 0.5) pin(bottomPin);
    else if (pinned && r.top <= m + 0.5) free();
  } else if (dy < 0) { // going up
    if (r.top >= m - 0.5) pin(m);
    else if (pinned) free();
  } else if (pinned) pin(m);
}

addEventListener('scroll', () => {
  const dy = scrollY - lastY;
  lastY = scrollY;
  placeSide(dy);
}, { passive: true });
addEventListener('resize', () => sideAside && stickSide(sideAside));

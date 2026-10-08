// Jumping to a part of the page (a "#…" link, or scrollIntoView) lands it below whatever stays on
// top while scrolling, not under it: the launch bar, the public header (sticky on phones), the
// home's compact bar, a group's bar. The browser reads html's scroll-padding-top (app.css) when it
// scrolls; this keeps --cover, the height those bars take at the top, measured.
const BARS = ['.site-header', '.home-bar', '.group-bar-fixed', '.group-bar'];

// How far down from the top of the screen the bar reaches once it's stuck (0 if it doesn't stick).
// Bars that show only after some scrolling (home, group) count as shown: that's where a jump lands.
function reach(el) {
  const cs = getComputedStyle(el);
  if (cs.display === 'none') return 0;
  const own = cs.position === 'sticky' || cs.position === 'fixed';
  const host = own ? el : el.offsetParent; // .group-bar rides in its sticky, 0-high wrap
  if (!host) return 0;
  const hs = own ? cs : getComputedStyle(host);
  if (hs.position !== 'sticky' && hs.position !== 'fixed') return 0;
  return (parseFloat(hs.top) || 0) + (own ? 0 : el.offsetTop) + el.offsetHeight;
}

export function measureCover() {
  let cover = 0;
  for (const el of document.querySelectorAll(BARS.join(','))) cover = Math.max(cover, reach(el));
  document.documentElement.style.setProperty('--cover', `${Math.round(cover)}px`);
}

export function anchorOffset() {
  let timer = 0;
  const soon = () => { clearTimeout(timer); timer = setTimeout(measureCover, 50); };
  // Pages redraw as they load and the bars change with the width: measured again on both, and
  // right before a link's jump (the click comes before the browser scrolls)
  new MutationObserver(soon).observe(document.getElementById('app') ?? document.body, { childList: true, subtree: true });
  addEventListener('resize', soon, { passive: true });
  addEventListener('click', e => { if (e.target.closest?.('a[href*="#"]')) measureCover(); }, true);
  measureCover();
}

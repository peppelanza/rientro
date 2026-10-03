// Phone: the bottom menu (App TabBar) fades away while you scroll down and comes back when you
// scroll up quickly, like the Facebook app: a slow scroll up (reading back) leaves it hidden.
// Near the top of the page it is always there.
const SHOW_SPEED = 1.2; // px per ms scrolling up (≈ a flick)

export function tabbarOnScroll() {
  let last = scrollY;
  let lastT = performance.now();
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = scrollY;
    const t = performance.now();
    if (y <= 80) { document.body.classList.remove('tabbar-away'); last = y; lastT = t; return; }
    const delta = y - last;
    if (Math.abs(delta) < 6) return; // ignore tiny moves (and iOS bounce)
    if (delta > 0) document.body.classList.add('tabbar-away');
    else if (-delta / Math.max(t - lastT, 1) > SHOW_SPEED) document.body.classList.remove('tabbar-away');
    last = y;
    lastT = t;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
}

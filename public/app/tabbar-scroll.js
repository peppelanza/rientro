// Phone: the bottom menu (App TabBar) fades away while you scroll down and comes back as soon as
// you scroll up, like the Facebook app. Near the top of the page it is always there.
export function tabbarOnScroll() {
  let last = scrollY;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = scrollY;
    const delta = y - last;
    if (Math.abs(delta) < 6) return; // ignore tiny moves (and iOS bounce)
    document.body.classList.toggle('tabbar-away', delta > 0 && y > 80);
    last = y;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
}

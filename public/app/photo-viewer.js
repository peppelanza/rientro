// Photos in group posts open in a viewer over the page instead of the bare file: every photo the
// page shows, in order, from the one clicked. Computers: arrows at the sides and ← → on the
// keyboard; phones: swipe sideways, swipe down to close. Esc, the ×, a click on the dark
// background or the phone's back button close it. (Ctrl/⌘-click still opens the file itself.)
const SWIPE = 50; // px sideways that turn the page
const CLOSE_DRAG = 110; // px down that close it

export function photoViewer(selector) {
  document.addEventListener('click', e => {
    const a = e.target.closest?.(`${selector} a`);
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const links = [...document.querySelectorAll(`${selector} a`)];
    open(links.map(l => l.getAttribute('href')), links.indexOf(a));
  });
}

function open(srcs, start) {
  let i = Math.max(0, start);
  const many = srcs.length > 1;
  const box = document.createElement('div');
  box.className = 'pv';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Foto');
  box.innerHTML = `<div class="pv-track"><img class="pv-img" alt=""></div>
<button type="button" class="pv-close" aria-label="Chiudi"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
${many ? `<button type="button" class="pv-nav pv-prev" aria-label="Foto precedente"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
<button type="button" class="pv-nav pv-next" aria-label="Foto successiva"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
<span class="pv-count" aria-live="polite"></span>` : ''}`;
  const img = box.querySelector('.pv-img');
  const track = box.querySelector('.pv-track');
  const count = box.querySelector('.pv-count');
  const previous = document.activeElement;

  const show = n => {
    i = (n + srcs.length) % srcs.length;
    img.src = srcs[i];
    if (count) count.textContent = `${i + 1} / ${srcs.length}`;
    for (const k of [i - 1, i + 1]) if (many) new Image().src = srcs[(k + srcs.length) % srcs.length]; // the neighbours, ready
  };
  const move = (x, y = 0, animate = false) => {
    track.style.transition = animate ? 'transform .22s ease' : 'none';
    track.style.transform = `translate(${x}px, ${y}px)`;
    box.style.setProperty('--pv-fade', String(1 - Math.min(Math.abs(y) / 400, 0.6)));
  };

  // Closing always goes through the history entry it added: the page underneath sees that back
  // step while html.pv-open is still on, so it knows it isn't for it (gruppo.js)
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    box.remove();
    document.documentElement.classList.remove('pv-open');
    document.removeEventListener('keydown', onKey);
    removeEventListener('popstate', onPop);
    previous?.focus?.();
  };
  const close = () => (history.state?.photoViewer ? history.back() : finish());
  const onKey = e => {
    if (e.key === 'Escape') close();
    else if (many && e.key === 'ArrowLeft') show(i - 1);
    else if (many && e.key === 'ArrowRight') show(i + 1);
  };
  const onPop = () => finish();

  box.addEventListener('click', e => {
    if (e.target.closest('.pv-close')) close();
    else if (e.target.closest('.pv-prev')) show(i - 1);
    else if (e.target.closest('.pv-next')) show(i + 1);
    else if (e.target !== img) close(); // the dark around the photo
  });

  // Phones: the photo follows the finger; sideways turns to the next, down closes
  let sx = 0, sy = 0, dir = null;
  box.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    ({ clientX: sx, clientY: sy } = e.touches[0]);
    dir = null;
  }, { passive: true });
  box.addEventListener('touchmove', e => {
    if (e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    dir ??= Math.abs(dx) > 8 || Math.abs(dy) > 8 ? (Math.abs(dx) > Math.abs(dy) ? 'x' : 'y') : null;
    if (dir === 'x' && many) move(dx);
    else if (dir === 'y' && dy > 0) move(0, dy);
    if (dir) e.preventDefault();
  }, { passive: false });
  box.addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (dir === 'x' && many && Math.abs(dx) > SWIPE) {
      const w = innerWidth * Math.sign(dx);
      move(w, 0, true); // out to the side, then the next one comes in from the other
      setTimeout(() => { show(dx < 0 ? i + 1 : i - 1); move(-w, 0); requestAnimationFrame(() => requestAnimationFrame(() => move(0, 0, true))); }, 200);
    } else if (dir === 'y' && dy > CLOSE_DRAG) close();
    else if (dir) move(0, 0, true);
    dir = null;
  });

  document.body.append(box);
  document.documentElement.classList.add('pv-open');
  document.addEventListener('keydown', onKey);
  history.pushState({ photoViewer: true }, '');
  addEventListener('popstate', onPop);
  show(i);
  box.querySelector('.pv-close').focus();
}

// Touch screens: whatever is tapped dims for a moment (app.css .tapped), like a phone app. Not as
// soon as the finger lands (that may be the start of a scroll): after a short wait with the finger
// still, or on lifting it for a quick tap. Any movement or scrolling first, and nothing lights up.
const CONTROL = 'a[href], button:not(:disabled), [role="button"], summary';
const HOLD_MS = 100; // finger still this long: a press, not a scroll
const QUICK_MS = 120; // a quick tap still shows briefly
const SLOP = 8; // px the finger may wander

export function tapFeedback() {
  let el = null; let x = 0; let y = 0; let timer = 0;
  const off = () => { clearTimeout(timer); timer = 0; el?.classList.remove('tapped'); el = null; };
  addEventListener('touchstart', e => {
    off();
    if (e.touches.length !== 1) return;
    el = e.target.closest?.(CONTROL) || null;
    if (!el) return;
    ({ clientX: x, clientY: y } = e.touches[0]);
    timer = setTimeout(() => { timer = 0; el?.classList.add('tapped'); }, HOLD_MS);
  }, { passive: true });
  addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (el && t && Math.hypot(t.clientX - x, t.clientY - y) > SLOP) off();
  }, { passive: true });
  addEventListener('scroll', () => el && off(), { passive: true, capture: true });
  addEventListener('touchcancel', off, { passive: true });
  addEventListener('touchend', () => {
    if (!el) return;
    const target = el;
    if (timer) { clearTimeout(timer); timer = 0; target.classList.add('tapped'); } // a quick tap
    el = null;
    setTimeout(() => target.classList.remove('tapped'), QUICK_MS);
  }, { passive: true });
}

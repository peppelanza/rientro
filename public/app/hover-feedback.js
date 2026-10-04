// Computers: everything clickable reacts to the mouse (app.css). Most controls carry their colours
// inline, so CSS alone can't tell a filled button from a text link: the first time the pointer
// reaches a control it's looked at once and tagged.
//   .hov-fill  something with a surface (a background, a border, a rounded shape, a photo): a faint veil in its own
//              text colour, darker on light buttons, lighter on dark ones
//   .hov-text  a text link or text button: purple, as in the design system
const CONTROL = 'a[href], button, [role="button"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], summary';
const BIG = 240 * 160; // a whole card that's a link: left alone (its buttons react instead)

const visible = c => c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c);

function classify(el) {
  // a design component draws itself in its first child: that's the surface to look at
  const surface = el.classList.contains('sc-host') && el.firstElementChild ? el.firstElementChild : el;
  const cs = getComputedStyle(surface);
  const r = surface.getBoundingClientRect();
  if (r.width * r.height > BIG) return;
  // rounded counts too: a menu item or option not selected has no background, but its pill shape
  const filled = visible(cs.backgroundColor) || cs.backgroundImage !== 'none' || parseFloat(cs.borderTopWidth) > 0
    || parseFloat(cs.borderTopLeftRadius) > 0
    || (!surface.textContent.trim() && surface.querySelector('img, svg, [style*="background"]'));
  // a ::after of its own (the FAQ "+"): no veil on top of it
  if (filled && getComputedStyle(surface, '::after').content === 'none') {
    surface.classList.add('hov-fill');
    if (cs.position === 'static') surface.classList.add('hov-rel');
  } else if (surface.textContent.trim()) surface.classList.add('hov-text');
}

export function hoverFeedback() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest?.(CONTROL);
    if (!el || el.hovSeen) return;
    el.hovSeen = true; // once per element (a redraw makes new ones)
    classify(el);
  }, { passive: true });
}

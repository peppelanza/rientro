// Flag burst: a country's flag emoji explode from a point on screen and fall away.
// Uses the Web Animations API (allowed by the CSP) and does nothing under reduced motion.

// ISO 3166 alpha-2 code → flag emoji (regional indicator letters)
export const flagEmoji = iso => String.fromCodePoint(...[...iso.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));

export function flagBurst(iso, origin) {
  if (!/^[A-Za-z]{2}$/.test(iso) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = origin?.getBoundingClientRect();
  const x0 = box ? box.left + box.width / 2 : innerWidth / 2;
  const y0 = box ? box.top + box.height / 2 : innerHeight / 3;
  const flag = flagEmoji(iso);
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9999', overflow: 'hidden' });
  document.body.append(layer);
  const count = innerWidth < 600 ? 28 : 44;
  const done = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.textContent = flag;
    Object.assign(el.style, { position: 'absolute', left: `${x0}px`, top: `${y0}px`, fontSize: `${20 + Math.random() * 22}px`, lineHeight: '1', willChange: 'transform, opacity' });
    layer.append(el);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6; // mostly upwards, fanned out
    const dist = 120 + Math.random() * Math.min(innerWidth, 900) * 0.45;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const spin = (Math.random() - 0.5) * 540;
    const fall = 260 + Math.random() * 260;
    const anim = el.animate([
      { transform: 'translate(-50%, -50%) scale(.4) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + fall}px)) scale(.9) rotate(${spin}deg)`, opacity: 0 },
    ], { duration: 1500 + Math.random() * 700, easing: 'cubic-bezier(.15,.7,.35,1)', fill: 'forwards' });
    done.push(anim.finished.catch(() => {}));
  }
  Promise.all(done).then(() => layer.remove());
}

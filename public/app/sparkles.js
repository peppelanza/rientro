// Twinkling sparkles around a piece of text (home headline), after Josh W. Comeau's technique:
// a steady trickle of four-point stars, each born at a random size and spot, growing from 0 to
// full size and back while turning 180°, some in front of the letters and some behind. A few
// live at a time; finished ones are removed. Paused when off-screen or in a background tab.
// With reduced motion: three still sparkles, no animation.

const PATH = 'M26.5 25.5C19.0043 33.3697 0 34 0 34C0 34 19.1013 35.3684 26.5 43.5C33.234 50.901 34 68 34 68C34 68 36.9884 50.7065 44.5 43.5C51.6431 36.647 68 34 68 34C68 34 51.6947 32.0939 44.5 25.5C36.5605 18.2235 34 0 34 0C34 0 33.6591 17.9837 26.5 25.5Z';
const LIFE = 700; // ms, must match .sparkle animation
const rand = (min, max) => min + Math.random() * (max - min);

function sparkle(layer, { size = rand(0.2, 0.42), left = rand(-4, 98), top = rand(-18, 80), still = false } = {}) {
  const s = document.createElement('span');
  s.className = still ? 'sparkle sparkle-still' : 'sparkle';
  s.style.cssText = `left:${left}%;top:${top}%;width:${size}em;height:${size}em;z-index:${Math.random() < 0.5 ? 0 : 2}`;
  s.innerHTML = `<svg viewBox="0 0 68 68" aria-hidden="true"><path d="${PATH}"/></svg>`;
  layer.append(s);
  if (!still) setTimeout(() => s.remove(), LIFE + 50);
}

export function startSparkles(selector = '.hero-sparks') {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = true, observed = null, timer = 0;
  const layerOf = () => {
    const host = document.querySelector(selector);
    if (!host) return null;
    if (host !== observed && 'IntersectionObserver' in window) {
      observed = host;
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(host);
    }
    return host.querySelector('.hs-layer');
  };
  if (reduced) {
    const put = () => { const l = layerOf(); if (l && !l.children.length) [[0.38, 99, -14], [0.22, 92, 62], [0.18, 32, -18]].forEach(([size, left, top]) => sparkle(l, { size, left, top, still: true })); };
    put(); setTimeout(put, 500);
    return;
  }
  const tick = () => {
    const layer = layerOf();
    if (layer && visible && !document.hidden) sparkle(layer);
    timer = setTimeout(tick, rand(60, 320)); // Comeau uses 50–450 ms; a little denser for a big headline
  };
  // Start with a few already twinkling, so the text never looks bare
  const first = () => { const l = layerOf(); if (l) for (let i = 0; i < 3; i++) setTimeout(() => sparkle(l), i * 140); };
  first();
  tick();
  return () => clearTimeout(timer);
}

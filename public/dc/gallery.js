// Dev-only gallery: renders the original Claude Design screens through the app runtime.
import { screens } from './gen/index.js';
import { renderComponent } from './runtime.js';

const root = document.getElementById('root');
const want = new URLSearchParams(location.search).get('s');
const screen = screens.find(s => s.slug === want);

if (screen) {
  document.title = `Rientro · ${screen.name}`;
  root.append(renderComponent(screen.name));
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
} else {
  root.append(renderComponent('Rientro v2'));
}
// Links between design files point at "<name>.dc.html"; route them through the gallery.
root.addEventListener('click', e => {
  const a = e.target.closest('a[href$=".dc.html"]');
  if (!a) return;
  e.preventDefault();
  const name = decodeURIComponent(a.getAttribute('href')).replace(/\.dc\.html$/, '');
  const s = screens.find(x => x.name === name);
  if (s) location.href = `/design?s=${s.slug}`;
});

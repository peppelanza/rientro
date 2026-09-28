// Pre-launch bar: until launch day every page (admin aside) shows a slim fixed bar at the top
// with the opening date and a live countdown. It sets --lb on <html> to its height, so the
// page is pushed down and sticky elements and #anchors stay clear of it.

const UNITS = [['g', 86400], ['h', 3600], ['m', 60], ['s', 1]];
const left = at => {
  let s = Math.max(0, Math.floor((at - Date.now()) / 1000));
  return UNITS.map(([u, size]) => { const v = Math.floor(s / size); s -= v * size; return `${String(v).padStart(2, '0')}${u}`; }).join(' ');
};

export async function launchBar() {
  if (location.pathname.startsWith('/admin')) return;
  const launch = await fetch('/api/public/launch').then(r => r.json()).catch(() => null);
  if (!launch || launch.launched) return;
  const at = Date.parse(launch.launch_at);
  const date = new Date(at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }).replace(/^1 /, '1° ');

  const bar = document.createElement('div');
  bar.className = 'launch-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Lancio di Rientro');
  bar.innerHTML = '<span class="live-dot"></span><b></b><span class="lb-clock" role="timer"></span><span class="lb-note">Iscriviti ora e assicurati il tuo posto: il tuo profilo sarà pronto dal primo giorno.</span>';
  bar.querySelector('b').textContent = `Apre il ${date}`;
  const clock = bar.querySelector('.lb-clock');
  clock.setAttribute('aria-label', 'Tempo che manca al lancio');
  const tick = () => {
    if (Date.now() >= at) { location.reload(); return; }
    clock.textContent = left(at);
  };
  tick();
  setInterval(tick, 1000);
  document.body.prepend(bar);
  const fit = () => document.documentElement.style.setProperty('--lb', `${bar.offsetHeight}px`);
  fit();
  addEventListener('resize', fit);
}

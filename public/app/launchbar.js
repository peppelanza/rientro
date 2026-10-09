// Pre-launch bar: until launch day every page (admin, onboarding, Press and signed-in members aside) shows a slim fixed
// bar at the top with the opening date. It sets --lb on <html> to its height, so the page is
// pushed down and sticky elements and #anchors stay clear of it.

export async function launchBar() {
  if (location.pathname.startsWith('/admin') || ['/onboarding', '/press'].includes(location.pathname)) return;
  const launch = await fetch('/api/public/launch').then(r => r.json()).catch(() => null);
  if (!launch || launch.launched) return;
  // Not for members already signed in: their pre-launch page says it (pages/benvenuto.js)
  if (await fetch('/api/session').then(r => (r.ok ? r.json() : null)).catch(() => null)) return;
  const at = Date.parse(launch.launch_at);
  const date = new Date(at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }).replace(/^1 /, '1° ');

  const bar = document.createElement('div');
  bar.className = 'launch-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Lancio di Rientro');
  bar.innerHTML = '<span class="live-dot"></span><b></b><span class="lb-note">Iscriviti ora e assicura il tuo posto.</span>';
  bar.querySelector('b').textContent = `Apre il ${date}`;
  // Gone on launch day, even for a page left open
  setTimeout(() => location.reload(), Math.min(at - Date.now(), 2 ** 31 - 1));
  document.body.prepend(bar);
  const fit = () => document.documentElement.style.setProperty('--lb', `${bar.offsetHeight}px`);
  fit();
  addEventListener('resize', fit);
}

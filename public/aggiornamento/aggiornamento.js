// Checks every few seconds whether the server is back, then reloads the page the member asked for
// (opened at its own address: the home). Offline (no network at all) it says so instead.
const back = () => (location.pathname.startsWith('/aggiornamento') ? location.replace('/') : location.reload());
const set = (k, html) => { const el = document.querySelector(`[data-up="${k}"]`); if (el) el.innerHTML = html; };
function offline() {
  set('code', 'Sei offline');
  set('title', 'Nessuna <em>connessione</em>');
  set('text', 'Controlla la rete: la pagina si ricarica da sola appena torni online.');
}
if (!navigator.onLine) offline();
addEventListener('offline', offline);
addEventListener('online', back);
setInterval(async () => {
  if (!navigator.onLine) return;
  const res = await fetch('/api/session', { cache: 'no-store' }).catch(() => null);
  if (res?.ok) back();
}, 5000);

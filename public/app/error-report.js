// What goes wrong in the browser goes to Admin › Errori (src/error-log.js): uncaught errors, failed
// promises, and what the pages report themselves (reportError: a server error, the robot check on
// the sign-in page). At most 10 a page, never the same twice, never in the way of the page.
// Only what's ours: not the scripts others add to the page (Facebook's in-app browser, extensions),
// not outside scripts that a blocker stopped (Cloudflare's visit counter), not a connection cut
// while the page was being left.
let sent = 0;
let leaving = false;
const seen = new Set();
// the address without tracking parameters (fbclid, utm_…): readable, and nobody's click id
const cleanPath = () => {
  const q = new URLSearchParams(location.search);
  for (const k of [...q.keys()]) if (/^(fbclid|gclid|msclkid|igshid|utm_)/i.test(k)) q.delete(k);
  const s = q.toString().replace(/=(?=&|$)/g, ''); // "?gius2091", not "?gius2091="
  return location.pathname + (s ? `?${s}` : '');
};

export function reportError(kind, message, stack = null) {
  try {
    if (kind === 'network' && leaving) return;
    const msg = String(message || '').slice(0, 500);
    if (!msg || sent >= 10 || seen.has(`${kind}|${msg}`)) return;
    seen.add(`${kind}|${msg}`);
    sent++;
    fetch('/api/client-error', {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'rientro' },
      body: JSON.stringify({ kind, message: msg, stack: stack ? String(stack).slice(0, 3000) : null, path: cleanPath(), ua: navigator.userAgent }),
    }).catch(() => {});
  } catch { /* never */ }
}

// (only in a browser: lib.js is also loaded by the server's tests and pages)
if (typeof window !== 'undefined') {
  const ours = url => !url || url.startsWith(location.origin) || url.startsWith('/');
  addEventListener('pagehide', () => { leaving = true; });
  addEventListener('error', e => {
    // a script, stylesheet or image that didn't load: only ours (an outside one stopped by a blocker is not a fault)
    if (e.target && e.target !== window) {
      const src = e.target.src || e.target.href;
      if (src && ours(src)) reportError('js', `Non caricato: ${src.replace(location.origin, '')}`);
      return;
    }
    // an error thrown by a script that isn't ours (in-app browsers, extensions)
    if (e.filename && !ours(e.filename)) return;
    if (!e.filename && /^(iabjs|chrome-extension|moz-extension|safari-(web-)?extension):/.test(e.error?.stack || '')) return;
    const where = e.filename ? ` (${e.filename.replace(location.origin, '')}:${e.lineno})` : '';
    reportError('js', `${e.message || 'errore'}${where}`, e.error?.stack);
  }, true);
  addEventListener('unhandledrejection', e => {
    const r = e.reason;
    // (the page already said these to the member: signed out, updating, a refusal with its message)
    if (r?.status !== undefined && r.status < 500) return;
    if (['unauthenticated', 'updating'].includes(r?.message)) return;
    reportError('promise', r?.message || String(r), r?.stack);
  });
}

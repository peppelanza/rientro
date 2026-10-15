// What goes wrong in the browser goes to Admin › Errori (src/error-log.js): uncaught errors, failed
// promises, and what the pages report themselves (reportError: a server error, the robot check on
// the sign-in page). At most 10 a page, never the same twice, never in the way of the page.
let sent = 0;
const seen = new Set();

export function reportError(kind, message, stack = null) {
  try {
    const msg = String(message || '').slice(0, 500);
    if (!msg || sent >= 10 || seen.has(`${kind}|${msg}`)) return;
    seen.add(`${kind}|${msg}`);
    sent++;
    fetch('/api/client-error', {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'rientro' },
      body: JSON.stringify({ kind, message: msg, stack: stack ? String(stack).slice(0, 3000) : null, path: location.pathname + location.search, ua: navigator.userAgent }),
    }).catch(() => {});
  } catch { /* never */ }
}

// (only in a browser: lib.js is also loaded by the server's tests and pages)
if (typeof window !== 'undefined') {
  addEventListener('error', e => {
    // a script or stylesheet that didn't load has no message: its address instead
    const where = e.filename ? ` (${e.filename.replace(location.origin, '')}:${e.lineno})` : '';
    reportError('js', `${e.message || e.target?.src || e.target?.href || 'errore'}${where}`, e.error?.stack);
  }, true);
  addEventListener('unhandledrejection', e => {
    const r = e.reason;
    // (the page already said these to the member: signed out, updating, a refusal with its message)
    if (r?.status && r.status < 500) return;
    if (['unauthenticated', 'updating'].includes(r?.message)) return;
    reportError('promise', r?.message || String(r), r?.stack);
  });
}

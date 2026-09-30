// Cloudflare Turnstile on sign-in (src/turnstile.js): a token for each code request. Invisible unless
// Cloudflare wants a click; then its box shows at the bottom of the screen. It lives on <body>, out
// of the page template, so re-renders never touch Cloudflare's iframe.
let script, widget, pending;

function load() {
  script ??= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: true });
    s.onload = resolve;
    s.onerror = () => { script = undefined; reject(new Error('turnstile')); };
    document.head.append(s);
  });
  return script;
}

export const warmUpTurnstile = siteKey => { if (siteKey) load().catch(() => {}); };

// null when the check is off; otherwise the token (throws if Cloudflare says no or can't be reached)
export async function turnstileToken(siteKey) {
  if (!siteKey) return null;
  await load();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('turnstile timeout')), 120_000);
    pending = { resolve: t => { clearTimeout(timer); resolve(t); }, reject: e => { clearTimeout(timer); reject(e); } };
    if (widget === undefined) {
      const box = Object.assign(document.createElement('div'), { className: 'ts-box' });
      document.body.append(box);
      widget = window.turnstile.render(box, {
        sitekey: siteKey, appearance: 'interaction-only', execution: 'execute', language: 'it',
        callback: t => pending?.resolve(t),
        'error-callback': () => { pending?.reject(new Error('turnstile error')); return true; },
      });
    } else window.turnstile.reset(widget); // a token is good for one request
    window.turnstile.execute(widget);
  });
}

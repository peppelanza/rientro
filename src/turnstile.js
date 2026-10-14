// Cloudflare Turnstile on the sign-in page: a bot check that is almost always invisible. It stops
// scripts before they make us send codes (and use up the email quota). Off until both keys are set
// (TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, from the Cloudflare dashboard → Turnstile).
//
// Every token goes to Cloudflare's Siteverify (no check of our own instead of it), and a "yes"
// counts only if it was made on our pages for this very request:
// - hostname: rientro.it or www.rientro.it (PRODUCTION_HOSTNAMES), nothing else;
// - action: "request_code", which the widget sets (public/app/turnstile.js).
// Cloudflare's official test keys (1x…AA, 2x…AA, 3x…AA): the docs say "localhost" / "test", but
// Siteverify answers (checked 2026-10-14) hostname "example.com", no action, and
// metadata.result_with_testing_key: true. With those keys, and only outside production, that answer
// (marked as a test one) is what's expected instead. The production list is never widened for tests.
// When Siteverify can't be asked or answers something unreadable, no code is sent: the visitor gets
// a temporary error and tries again with a new token (never let through unchecked).
import { config } from './config.js';
import { HttpError } from './validate.js';

export const TURNSTILE_ACTION = 'request_code';
export const PRODUCTION_HOSTNAMES = Object.freeze(['rientro.it', 'www.rientro.it']);
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
const TEST_SECRET = /^[123]x0{31}AA$/;
const TEST_HOSTNAMES = ['example.com', 'localhost'];
const TEST_ACTIONS = [undefined, '', 'test', 'request_code'];
const MAX_TOKEN = 2048;
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const turnstileEnabled = () => !!(config.turnstileSiteKey && config.turnstileSecret);
export const usingTestKeys = () => TEST_SECRET.test(config.turnstileSecret);

const robot = () => new HttpError(400, 'bot_check', 'Non siamo riusciti a verificare che tu non sia un robot. Riprova.');
const expired = () => new HttpError(400, 'bot_check_expired', 'La verifica anti-robot è scaduta. Riprova: ne facciamo una nuova.');
const unavailable = () => new HttpError(503, 'bot_check_unavailable', 'La verifica anti-robot non risponde in questo momento. Riprova tra qualche istante.');

export async function verifyTurnstile(token, ip, fetchImpl = fetch) {
  if (!turnstileEnabled()) return;
  if (typeof token !== 'string' || !token.trim() || token.length > MAX_TOKEN) throw robot();
  const test = usingTestKeys();
  // test keys accept anything: never on the real site
  if (test && config.production) {
    console.error('[turnstile] test keys in production: every sign-in is refused until real keys are set');
    throw unavailable();
  }
  let data;
  try {
    const res = await fetchImpl(SITEVERIFY, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: config.turnstileSecret, response: token, ...(ip ? { remoteip: ip } : {}) }).toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`siteverify HTTP ${res.status}`);
    data = await res.json();
    if (!data || typeof data !== 'object' || typeof data.success !== 'boolean') throw new Error('siteverify: unexpected answer');
  } catch (err) {
    // only the reason, never the token or the secret
    console.error('[turnstile]', err?.name === 'TimeoutError' ? 'siteverify timeout' : err?.message ?? 'siteverify error');
    throw unavailable();
  }
  const codes = Array.isArray(data['error-codes']) ? data['error-codes'] : [];
  if (!data.success) {
    if (codes.includes('timeout-or-duplicate')) throw expired(); // used already, or older than 5 minutes
    if (codes.includes('internal-error')) throw unavailable();
    if (codes.some(c => c.endsWith('-secret'))) { console.error('[turnstile] secret refused by Cloudflare:', codes.join(',')); throw unavailable(); }
    throw robot();
  }
  const hostname = String(data.hostname || '').toLowerCase();
  const fits = test
    ? data.metadata?.result_with_testing_key === true && TEST_HOSTNAMES.includes(hostname) && TEST_ACTIONS.includes(data.action)
    : PRODUCTION_HOSTNAMES.includes(hostname) && data.action === TURNSTILE_ACTION;
  if (!fits) {
    console.error('[turnstile] token for another page: hostname', JSON.stringify(data.hostname), 'action', JSON.stringify(data.action));
    throw robot();
  }
}

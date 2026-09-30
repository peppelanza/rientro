// Cloudflare Turnstile on the sign-in page: a bot check that is almost always invisible. It stops
// scripts before they make us send codes (and use up the email quota). Off until both keys are set
// (TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, from the Cloudflare dashboard → Turnstile).
import { config } from './config.js';
import { HttpError } from './validate.js';

export const turnstileEnabled = () => !!(config.turnstileSiteKey && config.turnstileSecret);

export async function verifyTurnstile(token, ip, fetchImpl = fetch) {
  if (!turnstileEnabled()) return;
  const fail = () => { throw new HttpError(400, 'bot_check', 'Non siamo riusciti a verificare che tu non sia un robot. Riprova.'); };
  if (typeof token !== 'string' || !token || token.length > 2048) fail();
  let data;
  try {
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: config.turnstileSecret, response: token, ...(ip ? { remoteip: ip } : {}) }).toString(),
      signal: AbortSignal.timeout(8000),
    });
    data = await res.json();
  } catch (err) {
    // Cloudflare unreachable: let people in rather than lock everyone out (the rate limits still apply)
    console.error('[turnstile]', err?.message ?? err);
    return;
  }
  if (!data?.success) fail();
}

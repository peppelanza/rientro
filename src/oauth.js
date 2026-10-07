// Sign in with LinkedIn or Google, both OpenID Connect (scopes openid, profile, email).
// https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
// https://developers.google.com/identity/openid-connect/openid-connect
// 1. /api/auth/<provider>/start: a random state in a short-lived signed cookie, then off to the provider.
// 2. The provider sends the browser back to /api/auth/<provider>/callback?code=…&state=…
// 3. We check the state, swap the code for an access token (server to server, with the client
//    secret) and read the member's name and email from the userinfo endpoint. Only an email that
//    the provider marks as verified is accepted: the account is matched by email, so this is what
//    keeps someone from signing in to another person's Rientro account.
import crypto from 'node:crypto';
import { config } from './config.js';

export const PROVIDERS = {
  linkedin: {
    name: 'LinkedIn',
    authorize: 'https://www.linkedin.com/oauth/v2/authorization',
    token: 'https://www.linkedin.com/oauth/v2/accessToken',
    userinfo: 'https://api.linkedin.com/v2/userinfo',
    cookie: 'rientro_li_state',
    id: () => config.linkedinClientId,
    secret: () => config.linkedinClientSecret,
    extra: {},
    picture: url => url,
  },
  google: {
    name: 'Google',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
    cookie: 'rientro_g_state',
    id: () => config.googleClientId,
    secret: () => config.googleClientSecret,
    // Whoever has more than one Google account picks which one
    extra: { prompt: 'select_account' },
    // Google sends a 96px thumbnail (…=s96-c): the same picture, large enough for a profile photo
    picture: url => url.replace(/=s\d+-c$/, '=s512-c'),
  },
};
const STATE_TTL_SECONDS = 10 * 60;

export const oauthEnabled = p => !!(PROVIDERS[p].id() && PROVIDERS[p].secret());
const redirectUri = p => `${config.baseUrl}/api/auth/${p}/callback`;
// The provider is part of what's signed, so one provider's state can't be replayed on the other
const sign = (p, v) => crypto.createHmac('sha256', config.pseudonymSecret).update(`${p === 'linkedin' ? 'li' : p}-state:${v}`).digest('base64url');

// The state cookie carries the random state and where to go after signing in, signed so it can't be forged.
export function startOauth(p, next) {
  const pr = PROVIDERS[p];
  const state = crypto.randomBytes(24).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ s: state, n: next || null, t: Date.now() })).toString('base64url');
  // Encoded by hand: LinkedIn wants the scopes separated by %20 (URLSearchParams would write "+")
  const q = { response_type: 'code', client_id: pr.id(), redirect_uri: redirectUri(p), state, scope: 'openid profile email', ...pr.extra };
  const url = `${pr.authorize}?${Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  return { url, cookieValue: `${payload}.${sign(p, payload)}`, maxAge: STATE_TTL_SECONDS };
}

// Returns { next } if the callback's state matches the cookie (and is fresh), else null.
export function checkOauthState(p, cookieValue, state) {
  if (!cookieValue || !state) return null;
  const [payload, mac] = cookieValue.split('.');
  if (!payload || !mac) return null;
  const expected = sign(p, payload);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!data || data.s !== state || Date.now() - data.t > STATE_TTL_SECONDS * 1000) return null;
  return { next: data.n };
}

// code → { email, emailVerified, firstName, lastName, picture }. Throws on any failure (network, rejected code…).
export async function oauthProfile(p, code, fetchImpl = fetch) {
  const pr = PROVIDERS[p];
  const tokenRes = await fetchImpl(pr.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: pr.id(), client_secret: pr.secret(), redirect_uri: redirectUri(p) }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) throw new Error(`token ${tokenRes.status} ${await tokenRes.text().catch(() => '')}`);
  const { access_token: accessToken } = await tokenRes.json();
  if (!accessToken) throw new Error('token: no access_token');
  const infoRes = await fetchImpl(pr.userinfo, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!infoRes.ok) throw new Error(`userinfo ${infoRes.status}`);
  const u = await infoRes.json();
  return {
    email: typeof u.email === 'string' ? u.email : null,
    emailVerified: u.email_verified === true || u.email_verified === 'true',
    firstName: typeof u.given_name === 'string' ? u.given_name.trim().slice(0, 60) : null,
    lastName: typeof u.family_name === 'string' ? u.family_name.trim().slice(0, 60) : null,
    picture: typeof u.picture === 'string' && u.picture.startsWith('https://') ? pr.picture(u.picture).slice(0, 2000) : null,
  };
}

// Sign In with LinkedIn using OpenID Connect (scopes openid, profile, email).
// https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
// 1. /api/auth/linkedin/start: a random state in a short-lived signed cookie, then off to LinkedIn.
// 2. LinkedIn sends the browser back to /api/auth/linkedin/callback?code=…&state=…
// 3. We check the state, swap the code for an access token (server to server, with the client
//    secret) and read the member's name and email from the userinfo endpoint. Only an email that
//    LinkedIn marks as verified is accepted: the account is matched by email, so this is what keeps
//    someone from signing in to another person's Rientro account.
import crypto from 'node:crypto';
import { config } from './config.js';

const AUTHORIZE = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO = 'https://api.linkedin.com/v2/userinfo';
export const STATE_COOKIE = 'rientro_li_state';
const STATE_TTL_SECONDS = 10 * 60;

export const linkedinEnabled = () => !!(config.linkedinClientId && config.linkedinClientSecret);
const redirectUri = () => `${config.baseUrl}/api/auth/linkedin/callback`;
const sign = v => crypto.createHmac('sha256', config.pseudonymSecret).update(`li-state:${v}`).digest('base64url');

// The state cookie carries the random state and where to go after signing in, signed so it can't be forged.
export function startLinkedin(next) {
  const state = crypto.randomBytes(24).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ s: state, n: next || null, t: Date.now() })).toString('base64url');
  // Encoded by hand: LinkedIn wants the scopes separated by %20 (URLSearchParams would write "+")
  const q = { response_type: 'code', client_id: config.linkedinClientId, redirect_uri: redirectUri(), state, scope: 'openid profile email' };
  const url = `${AUTHORIZE}?${Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  return { url, cookieValue: `${payload}.${sign(payload)}`, maxAge: STATE_TTL_SECONDS };
}

// Returns { next } if the callback's state matches the cookie (and is fresh), else null.
export function checkLinkedinState(cookieValue, state) {
  if (!cookieValue || !state) return null;
  const [payload, mac] = cookieValue.split('.');
  if (!payload || !mac) return null;
  const expected = sign(payload);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!data || data.s !== state || Date.now() - data.t > STATE_TTL_SECONDS * 1000) return null;
  return { next: data.n };
}

// code → { email, emailVerified, firstName, lastName, picture }. Throws on any failure (network, rejected code…).
export async function linkedinProfile(code, fetchImpl = fetch) {
  const tokenRes = await fetchImpl(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: config.linkedinClientId, client_secret: config.linkedinClientSecret, redirect_uri: redirectUri() }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) throw new Error(`token ${tokenRes.status} ${await tokenRes.text().catch(() => '')}`);
  const { access_token: accessToken } = await tokenRes.json();
  if (!accessToken) throw new Error('token: no access_token');
  const infoRes = await fetchImpl(USERINFO, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!infoRes.ok) throw new Error(`userinfo ${infoRes.status}`);
  const u = await infoRes.json();
  return {
    email: typeof u.email === 'string' ? u.email : null,
    emailVerified: u.email_verified === true || u.email_verified === 'true',
    firstName: typeof u.given_name === 'string' ? u.given_name.trim().slice(0, 60) : null,
    lastName: typeof u.family_name === 'string' ? u.family_name.trim().slice(0, 60) : null,
    picture: typeof u.picture === 'string' && u.picture.startsWith('https://') ? u.picture.slice(0, 2000) : null,
  };
}

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export const bad = (code, message) => new HttpError(400, code, message);

export function bool(value, field) {
  if (value === true || value === false) return value;
  throw bad('invalid_field', `${field} deve essere true o false`);
}

export function oneOf(value, allowed, field, { nullable = true } = {}) {
  if (value === undefined) return undefined;
  if (value === null && nullable) return null;
  if (allowed.includes(value)) return value;
  throw bad('invalid_field', `${field} non valido`);
}

export function text(value, field, { max = 200, nullable = true } = {}) {
  if (value === undefined) return undefined;
  if (value === null || value === '') {
    if (nullable) return null;
    throw bad('invalid_field', `${field} è obbligatorio`);
  }
  if (typeof value !== 'string') throw bad('invalid_field', `${field} deve essere testo`);
  const v = value.trim();
  // only spaces is nothing written
  if (!v) { if (nullable) return null; throw bad('invalid_field', `${field} è obbligatorio`); }
  if (v.length > max) throw bad('invalid_field', `${field} supera ${max} caratteri`);
  return v;
}

export function list(value, field, { maxItems = 10, maxLen = 80 } = {}) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw bad('invalid_field', `${field} deve essere un elenco`);
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') throw bad('invalid_field', `${field} contiene valori non validi`);
    const v = item.trim();
    if (!v) continue;
    if (v.length > maxLen) throw bad('invalid_field', `${field}: “${v.slice(0, 20)}…” è troppo lungo`);
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  if (out.length > maxItems) throw bad('invalid_field', `${field}: massimo ${maxItems} voci`);
  return out;
}

export function httpsUrl(value, field) {
  const v = text(value, field, { max: 300 });
  if (v == null) return v;
  let u;
  try {
    // "Https://…" from a phone's capital letter, "http://…" made https, a bare "sito.it" too
    const scheme = v.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
    if (scheme && scheme !== 'http' && scheme !== 'https') throw new Error('scheme');
    u = new URL(scheme ? v.replace(/^[a-z]+:/i, 'https:') : `https://${v}`);
  } catch {
    throw bad('invalid_field', `${field} non è un link valido`);
  }
  // a real site: a name with a dot and a 2+ letter ending ("https://martalopresti/", "https://.",
  // an IP address, a user:password@ in front are not)
  const host = u.hostname;
  if (u.username || u.password || !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(host) || host.split('.').some(l => !l || l.startsWith('-') || l.endsWith('-'))) {
    throw bad('invalid_field', `${field} non è un link valido`);
  }
  return u.toString();
}

// LinkedIn: the whole link, or just the name in it ("martalopresti" → linkedin.com/in/martalopresti)
export function linkedinUrl(value, field) {
  const v = text(value, field, { max: 300 });
  if (v == null) return v;
  if (/^[A-Za-z0-9-]{3,100}$/.test(v)) return `https://www.linkedin.com/in/${v}`;
  const url = httpsUrl(v, field);
  const u = new URL(url);
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) throw bad('invalid_field', `${field}: incolla il link del tuo profilo LinkedIn.`);
  return `${u.origin}${u.pathname}`; // without the tracking of a shared link (?utm_…)
}

export function handle(value, field) {
  const v = text(value, field, { max: 200 });
  if (v == null) return v;
  // the profile's link pasted whole ("https://x.com/martalp", "instagram.com/martalp/") is fine too
  const h = v.replace(/^(https?:\/\/)?(www\.)?(x|twitter|instagram)\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(h)) throw bad('invalid_field', `${field} non valido`);
  return `@${h}`;
}

// Reject unknown keys so clients can't smuggle fields (e.g. looking_for_italian_job via the profile endpoint).
export function only(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('invalid_body');
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) throw bad('unknown_field', `Campo non ammesso: ${key}`);
  }
  return body;
}

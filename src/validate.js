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
    u = new URL(v.startsWith('http') ? v : `https://${v}`);
  } catch {
    throw bad('invalid_field', `${field} non è un link valido`);
  }
  if (u.protocol !== 'https:') throw bad('invalid_field', `${field} deve usare https`);
  return u.toString();
}

export function handle(value, field) {
  const v = text(value, field, { max: 40 });
  if (v == null) return v;
  const h = v.replace(/^@/, '');
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

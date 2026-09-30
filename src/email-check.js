// Sign-up addresses, checked before a code is sent (the code itself proves the inbox is theirs):
// 1. not a throwaway address: the domains of disposable-email services (mailinator, 10minutemail…),
//    from github.com/disposable/disposable-email-domains (MIT, ~100,000 domains), in
//    src/data/disposable-domains.txt. Refresh it now and then with scripts/update-disposable.sh.
// 2. a domain that receives mail: it has MX records (or at least an address, which mail servers also
//    accept). A DNS failure or timeout lets the address through: better a code sent in vain than
//    someone turned away because of a hiccup.
import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './validate.js';

const LIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'disposable-domains.txt');
let disposable;
const disposableSet = () => (disposable ??= new Set(fs.readFileSync(LIST, 'utf8').split('\n').map(s => s.trim().toLowerCase()).filter(Boolean)));

// "a.b.mailinator.com" counts as mailinator.com too
export function isDisposable(domain) {
  const set = disposableSet();
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) if (set.has(parts.slice(i).join('.'))) return true;
  return false;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms))]);
const MISSING = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

// true: receives mail; false: the domain doesn't exist or has no mail setup; null: couldn't tell
export async function receivesMail(domain, resolver = dns) {
  try {
    const mx = await withTimeout(resolver.resolveMx(domain), 3000);
    // A "null MX" (RFC 7505: a single record pointing to ".") means: this domain takes no mail
    if (mx.length === 1 && (mx[0].exchange === '' || mx[0].exchange === '.')) return false;
    if (mx.length) return true;
  } catch (err) {
    if (!MISSING.has(err.code)) return null;
  }
  try {
    const a = await withTimeout(resolver.resolve4(domain), 3000);
    return a.length > 0;
  } catch (err) {
    return MISSING.has(err.code) ? false : null;
  }
}

const cache = new Map(); // domain → { ok, at }, an hour
export async function checkEmailDomain(email, resolver = dns) {
  const domain = email.split('@')[1];
  if (isDisposable(domain)) throw new HttpError(400, 'disposable_email', 'Usa un indirizzo email personale o di lavoro: quelli temporanei non sono accettati.');
  let hit = cache.get(domain);
  if (!hit || Date.now() - hit.at > 3600_000) {
    hit = { ok: await receivesMail(domain, resolver), at: Date.now() };
    if (hit.ok !== null) cache.set(domain, hit);
  }
  if (hit.ok === false) throw new HttpError(400, 'email_domain', 'Questo indirizzo non può ricevere email: controlla che sia scritto giusto.');
}

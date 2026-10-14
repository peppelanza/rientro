// Shared steps for the end-to-end tests: signing in by email (the code is on the page in this
// setup), and people made through the API, to start a test from a given point.
import zlib from 'node:zlib';
import { expect } from '@playwright/test';

export const BASE = 'http://localhost:3020';
let n = 0;
export const uniqueEmail = (tag = 'utente') => `e2e.${tag}.${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}@esempio.it`;

// Signs in through the API: the browser context gets the session cookie
export async function signIn(request, email) {
  const r = await request.post('/api/auth/request-code', { data: { email } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const { dev_code: code } = await r.json();
  const v = await request.post('/api/auth/verify-code', { data: { email, code } });
  expect(v.ok(), await v.text()).toBeTruthy();
  return code;
}

const api = async (request, method, url, data) => {
  const r = await request.fetch(url, { method, data });
  expect(r.ok(), `${method} ${url}: ${r.status()} ${await r.text()}`).toBeTruthy();
  return r.json();
};
export { api };

// A member with a complete, published profile (who lives abroad unless told otherwise)
export async function member(request, { email = uniqueEmail(), first = 'Test', last = 'Persona', ...extra } = {}) {
  await signIn(request, email);
  await api(request, 'PATCH', '/api/me/profile', {
    lives_in: 'abroad', lives_in_country: 'Regno Unito', lives_in_city: 'Londra', desired_comuni: ['Palermo', 'Catania'], move_when: '0_3m',
    primary_intent: 'networking', first_name: first, last_name: last, birth_year: 1990, bio: 'Profilo creato dai test automatici.',
    background_area: 'Tecnologia e ingegneria', years_experience: '4-7', sectors: ['Turismo & Ospitalità'], seeking_backgrounds: ['Design, arte e cultura'],
    misses_italy: 'Il mare', source: 'Passaparola, un amico o collega', ...extra,
  });
  await uploadPhoto(request);
  const me = await api(request, 'POST', '/api/me/submit');
  return { email, id: me.user.id, me };
}

// A plain 400×400 PNG, as a profile photo (the face check is the browser's, not the server's)
export function png(w = 400, h = 400, [r, g, b] = [108, 77, 245]) {
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export async function uploadPhoto(request) {
  const r = await request.post('/api/me/photo', { data: png(), headers: { 'content-type': 'image/png', 'x-photo-check': 'unchecked' } });
  expect(r.ok(), `photo: ${r.status()} ${await r.text()}`).toBeTruthy();
}

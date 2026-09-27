import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rientro-test-'));
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.ADMIN_EMAILS = 'admin@rientro.test';
process.env.LAUNCHED = '1';

const { createApp } = await import('../src/server.js');
const { openDb } = await import('../src/db.js');

export const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a90000000049454e44ae426082', 'hex');

export const COMPLETE_PROFILE = {
  lives_in: 'abroad', lives_in_country: 'Svezia', lives_in_city: 'Stoccolma',
  desired_comuni: ['Milano', 'Bologna'], primary_intent: 'has_idea',
  first_name: 'Test', last_name: 'Utente', age_band: '35-39', bio: 'x'.repeat(160),
  background_area: 'Prodotto', current_role: 'Product Manager', seeking_backgrounds: ['Tech / Engineering'],
  sectors: ['AI', 'Fintech'], time_commitment: 'full_time', start_when: '6_months',
};

export async function startApp(opts = {}) {
  const codes = new Map();
  const app = createApp({ db: openDb(':memory:'), sendLoginCode: async (email, code) => codes.set(email, code), loginLimits: { ip: 1000, email: 1000 }, ...opts });
  await new Promise(r => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  async function login(email, { marketing = false } = {}) {
    const h = { 'content-type': 'application/json', 'x-requested-with': 'rientro' };
    await fetch(`${base}/api/auth/request-code`, { method: 'POST', headers: h, body: JSON.stringify({ email, marketing_opt_in: marketing }) });
    const res = await fetch(`${base}/api/auth/verify-code`, { method: 'POST', headers: h, body: JSON.stringify({ email, code: codes.get(email) }) });
    if (res.status !== 200) throw new Error(`login failed: ${res.status} ${await res.text()}`);
    const client = makeClient(base, res.headers.get('set-cookie').split(';')[0]);
    const me = await client.get('/api/me');
    return { ...client, id: me.body.user.id, email };
  }

  // Signed in with a complete profile and photo (status: onboarding).
  async function member(email, profile = {}) {
    const c = await login(email);
    const r = await c.patch('/api/me/profile', { ...COMPLETE_PROFILE, first_name: email.split('@')[0], ...profile });
    if (r.status !== 200) throw new Error(`profile: ${JSON.stringify(r.body)}`);
    await c.raw('POST', '/api/me/photo', PNG);
    return c;
  }

  let adminClient;
  async function asAdmin() {
    adminClient ??= await login('admin@rientro.test');
    return adminClient;
  }

  async function approved(email, profile) {
    const u = await member(email, profile);
    const s = await u.post('/api/me/submit');
    if (s.status !== 200) throw new Error(`submit: ${JSON.stringify(s.body)}`);
    const a = await asAdmin();
    const r = await a.post(`/api/admin/users/${u.id}/review`, { action: 'approve' });
    if (r.status !== 200) throw new Error(`approve: ${JSON.stringify(r.body)}`);
    return u;
  }

  async function connect(a, b) {
    const r = await a.post('/api/connections', { to: b.id, note: 'Ciao!' });
    await b.post(`/api/connections/${r.body.id}/accept`);
    return r.body.id;
  }

  return { app, base, codes, login, member, approved, asAdmin, connect, close: () => app.server.close() };
}

export function makeClient(base, cookie) {
  const call = async (method, p, body, extraHeaders = {}) => {
    const headers = { cookie, 'x-requested-with': 'rientro', ...extraHeaders };
    if (body !== undefined && !Buffer.isBuffer(body)) headers['content-type'] = 'application/json';
    const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : type.startsWith('text/') ? await res.text() : await res.arrayBuffer() };
  };
  return {
    cookie,
    get: p => call('GET', p),
    post: (p, b, h) => call('POST', p, b ?? {}, h),
    put: (p, b) => call('PUT', p, b),
    patch: (p, b) => call('PATCH', p, b),
    del: (p, b) => call('DELETE', p, b),
    raw: call,
  };
}

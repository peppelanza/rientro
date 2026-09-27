import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rientro-test-'));
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.ADMIN_EMAILS = 'admin@rientro.test';

const { createApp } = await import('../src/server.js');
const { openDb } = await import('../src/db.js');

export async function startApp() {
  const links = new Map();
  const app = createApp({ db: openDb(':memory:'), sendLoginLink: async (email, link) => links.set(email, link), loginLimits: { ip: 1000, email: 1000 } });
  await new Promise(r => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  async function login(email) {
    await fetch(`${base}/api/auth/request-link`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'rientro' },
      body: JSON.stringify({ email }),
    });
    const link = new URL(links.get(email));
    const res = await fetch(`${base}${link.pathname}${link.search}`, { redirect: 'manual' });
    const cookie = res.headers.get('set-cookie').split(';')[0];
    const client = makeClient(base, cookie);
    const me = await client.get('/api/me');
    return { ...client, id: me.body.user.id, email };
  }

  // Signs in, accepts terms and fills a minimal profile.
  async function member(email, profile = {}) {
    const c = await login(email);
    await c.post('/api/me/legal', { accept_terms: true, read_privacy: true });
    await c.patch('/api/me/profile', { first_name: email.split('@')[0], primary_intent: 'has_idea', ...profile });
    return c;
  }

  return { app, base, login, member, close: () => app.server.close() };
}

export function makeClient(base, cookie) {
  const call = async (method, p, body, extraHeaders = {}) => {
    const headers = { cookie, 'x-requested-with': 'rientro', ...extraHeaders };
    if (body !== undefined && !Buffer.isBuffer(body)) headers['content-type'] = 'application/json';
    const res = await fetch(base + p, {
      method, headers, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
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

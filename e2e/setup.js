// Before the tests: the admin signs in and makes the test people (demo.js), to find in Scopri
import { request } from '@playwright/test';
import { BASE, signIn } from './helpers.js';

export default async function setup() {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { 'x-requested-with': 'rientro' } });
  await signIn(ctx, 'admin@rientro.local');
  const r = await ctx.post('/api/admin/demo');
  if (!r.ok()) throw new Error(`demo: ${r.status()} ${await r.text()}`);
  await ctx.dispose();
}

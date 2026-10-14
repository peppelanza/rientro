// Turnstile with Cloudflare's official test keys (npm run e2e:turnstile): the real widget and the
// real Siteverify answer for "localhost" / action "test"; no real email (the code is on the page),
// no production keys. Skipped on the usual e2e site, where Turnstile is off.
import { expect, test } from '@playwright/test';
import { uniqueEmail } from '../helpers.js';

test.beforeEach(async ({ request }) => {
  const launch = await (await request.get('/api/public/launch')).json();
  test.skip(!launch.turnstile, 'Turnstile off on this site (npm run e2e:turnstile turns it on with the test keys)');
});

test('con Turnstile: la richiesta del codice passa dal widget, poi accesso', async ({ page }) => {
  const asked = [];
  page.on('request', r => { if (r.url().endsWith('/api/auth/request-code')) asked.push(JSON.parse(r.postData() || '{}')); });
  await page.goto('/accedi');
  await page.getByRole('button', { name: 'Continua con email' }).click();
  await page.getByPlaceholder('nome@esempio.it').fill(uniqueEmail('ts'));
  // double click: one request, one token
  await page.getByRole('button', { name: 'Invia codice' }).last().dblclick();
  const shown = page.getByText(/IL TUO CODICE È \d{6}/);
  await expect(shown).toBeVisible({ timeout: 30_000 });
  expect(asked).toHaveLength(1);
  expect(asked[0].turnstile_token).toBeTruthy();
  const code = (await shown.textContent()).match(/\d{6}/)[0];
  await page.getByRole('group', { name: 'Codice di 6 cifre' }).locator('input').first().fill(code);
  await expect(page).toHaveURL(/\/onboarding/);
});

test('con Turnstile: senza token niente codice', async ({ request }) => {
  const r = await request.post('/api/auth/request-code', { data: { email: uniqueEmail('nots') }, headers: { 'x-requested-with': 'rientro' } });
  expect(r.status()).toBe(400);
  expect((await r.json()).error).toBe('bot_check');
});

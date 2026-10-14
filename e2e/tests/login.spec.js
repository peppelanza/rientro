// Signing in from the page: email, the 6-digit code; a new person lands in onboarding
import { expect, test } from '@playwright/test';
import { uniqueEmail } from '../helpers.js';

test('accesso con email e codice, poi onboarding', async ({ page }) => {
  await page.goto('/accedi');
  await page.getByRole('button', { name: 'Continua con email' }).click();
  await page.getByPlaceholder('nome@esempio.it').fill(uniqueEmail('login'));
  await page.getByRole('button', { name: 'Invia codice' }).last().click();
  const shown = page.getByText(/IL TUO CODICE È \d{6}/);
  await expect(shown).toBeVisible();
  const code = (await shown.textContent()).match(/\d{6}/)[0];
  // a wrong code first
  await page.getByRole('group', { name: 'Codice di 6 cifre' }).locator('input').first().fill(code === '000000' ? '111111' : '000000');
  // six digits send it by themselves
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('group', { name: 'Codice di 6 cifre' }).locator('input').first().fill(code);
  await expect(page).toHaveURL(/\/onboarding/);
});

test('chi non è entrato e apre /scopri va ad accedi senza "sessione scaduta"', async ({ page }) => {
  await page.goto('/scopri');
  await expect(page).toHaveURL(/\/accedi/);
  await expect(page.getByText('La sessione è scaduta')).toHaveCount(0);
});

test('link d’invito: la pagina di accesso mostra nome e foto di chi invita', async ({ page, browser }) => {
  const { member: mk, BASE } = await import('../helpers.js');
  const ctx = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { 'x-requested-with': 'rientro' } });
  const inviter = await ctx.newPage();
  await mk(inviter.request, { first: 'Invitante', last: 'Confoto' });
  const url = (await (await inviter.request.get('/api/me')).json()).invite.url;
  await page.goto(url.replace(/^https?:\/\/[^/]+/, ''));
  await expect(page).toHaveURL(/\/accedi/);
  const card = page.locator('.invite-card');
  await expect(card).toContainText('Invitante');
  await expect(card).not.toContainText('Confoto');
  await expect(card.locator('img')).toHaveAttribute('src', /invite-photo/);
  await expect.poll(() => card.locator('img').evaluate(i => i.complete && i.naturalWidth > 0)).toBeTruthy();
  await ctx.close();
});

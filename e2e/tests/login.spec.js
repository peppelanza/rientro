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

// Admin pages, as the admin uses them
import { expect, test } from '@playwright/test';
import { signIn } from '../helpers.js';

test('Esportazioni: Genera CSV scarica il file, con il numero di righe', async ({ page }, info) => {
  // (on the computer only: one admin, one sign-in code at a time)
  test.skip(info.project.name !== 'computer');
  await signIn(page.request, 'admin@rientro.local');
  await page.goto('/admin/esportazioni');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Genera CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^users_\d{4}-\d{2}-\d{2}\.csv$/);
  await expect(page.getByText(/righe esportate/)).toBeVisible();
});

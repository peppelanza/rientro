// Admin pages, as the admin uses them
import { expect, test } from '@playwright/test';
import { signIn } from '../helpers.js';

// one admin, one sign-in code at a time
test.describe.configure({ mode: 'serial' });

test('Esportazioni: Genera CSV scarica il file, con il numero di righe', async ({ page }, info) => {
  // (on the computer only: one admin, one sign-in code at a time)
  test.skip(info.project.name !== 'computer');
  await signIn(page.request, 'admin@rientro.local');
  await page.goto('/admin/esportazioni');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Genera CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^users_\d{4}-\d{2}-\d{2}\.csv$/);
  await expect(page.getByText(/righe esportate/)).toBeVisible();
});

test('Utenti: chi si è iscritto oggi ha l’orario, non la data', async ({ page }, info) => {
  test.skip(info.project.name !== 'computer');
  await signIn(page.request, 'admin@rientro.local');
  await page.goto('/admin/utenti');
  await expect(page.getByText(/^\d{2}:\d{2}$/).first()).toBeVisible();
});

test('Errori: un errore del browser arriva nella pagina dell’admin', async ({ page }, info) => {
  test.skip(info.project.name !== 'computer');
  await signIn(page.request, 'admin@rientro.local');
  // (an admin page: Scopri may send an admin still in onboarding to /onboarding meanwhile)
  await page.goto('/admin/registro');
  await expect(page.getByRole('heading', { name: 'Registro' })).toBeVisible();
  // an outside script that doesn't load (a blocker, Cloudflare's counter): not logged
  await page.evaluate(() => document.head.append(Object.assign(document.createElement('script'), { src: 'https://esterno.invalid/beacon.min.js' })));
  await page.evaluate(() => setTimeout(() => { throw new Error('prova e2e errore browser'); }));
  await page.waitForTimeout(500);
  await page.goto('/admin/errori');
  await expect(page.getByRole('heading', { name: 'Errori' })).toBeVisible();
  await expect(page.getByText(/prova e2e errore browser/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Browser', exact: true }).click();
  await expect(page.getByText(/prova e2e errore browser/).first()).toBeVisible();
  await expect(page.getByText(/esterno\.invalid/)).toHaveCount(0);
});

test('Analytics: traffico dal server, iscrizioni e community dal database, Cloudflare a parte', async ({ page }, info) => {
  test.skip(info.project.name !== 'computer');
  await signIn(page.request, 'admin@rientro.local');
  await page.goto('/admin/analytics');
  for (const h of ['Traffico', 'Iscrizioni', 'Community', 'Cloudflare Web Analytics']) await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
  await expect(page.getByText('Da dove arrivano', { exact: true })).toBeVisible();
  await expect(page.getByText('Dispositivi', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'data/analytics-aperture.png', fullPage: true });
});

// Every main page opens without errors in the console and, on a phone, without sideways scrolling
import { expect, test } from '@playwright/test';
import { member } from '../helpers.js';

const PAGES = ['/scopri', '/connessioni', '/messaggi', '/gruppi', '/profilo', '/cerca?q=Palermo', '/cerca?q=marketplace&tab=gruppi', '/impostazioni', '/benvenuto'];
const PUBLIC = ['/', '/accedi', '/legal/privacy', '/legal/termini', '/pagina-che-non-esiste'];

for (const path of PUBLIC) {
  test(`pubblica ${path}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && !/404|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('pagine del membro', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(`${page.url()}: ${e.message}`));
  page.on('console', m => m.type() === 'error' && errors.push(`${page.url()}: ${m.text()}`));
  page.on('response', r => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));
  await member(page.request, { first: 'Giro' });
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${path} scorre di lato`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

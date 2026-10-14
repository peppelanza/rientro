// Scopri chi torna: the cards, the filters, a profile, connecting
import { expect, test } from '@playwright/test';
import { member } from '../helpers.js';

test('Scopri: the test people as cards, a filter narrows them, a card opens the profile', async ({ page }) => {
  await member(page.request, { first: 'Scopri' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/scopri');
  const cards = page.locator('article');
  await expect(cards.filter({ hasText: 'Giulia Ferrara' })).toHaveCount(1); // loaded (the skeleton is one card)
  expect(await cards.count()).toBeGreaterThan(3);
  // the card: name, job, from → to, Background
  const giulia = cards.filter({ hasText: 'Giulia Ferrara' });
  await expect(giulia).toContainText('Senior Product Manager da Deliveroo');
  await expect(giulia).toContainText('Background');
  await giulia.getByRole('link', { name: 'Profilo' }).click();
  await expect(page).toHaveURL(/\/persone\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Giulia Ferrara' })).toBeVisible();
  await expect(page.getByText('Vorrei trasferirmi a')).toBeVisible();
  expect(errors).toEqual([]);
});

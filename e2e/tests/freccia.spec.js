// The route on the cards: "Amsterdam → Roma", a space after the arrow, which wraps with the city
import { expect, test } from '@playwright/test';
import { member } from '../helpers.js';

test('Scopri: la freccia ha lo spazio prima della città', async ({ page }) => {
  await member(page.request);
  await page.goto('/scopri');
  const card = page.locator('article').filter({ hasText: '→' }).first();
  await expect(card).toBeVisible();
  const text = await card.innerText();
  expect(text).toMatch(/→[  ]\S/);
  expect(text).not.toMatch(/→\S/);
});

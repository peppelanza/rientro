// Gruppi: a post and a comment; Cerca finds people and words of the groups
import { expect, test } from '@playwright/test';
import { member } from '../helpers.js';

test('post e commento in un gruppo, poi trovati da Cerca', async ({ page }) => {
  await member(page.request, { first: 'Gruppista' });
  const groups = (await (await page.request.get('/api/groups')).json()).groups;
  const g = groups[0];
  await page.goto(`/gruppi/${g.id}`);
  await expect(page.getByRole('heading', { name: g.name })).toBeVisible(); // loaded, not the skeleton
  const word = `zafferano${Date.now().toString(36)}`;
  await page.getByPlaceholder('Scrivi qualcosa al gruppo…').fill(`Chi conosce un buon ${word} a Palermo?`);
  await page.getByRole('button', { name: 'Pubblica' }).last().click();
  await expect(page.getByText(`Chi conosce un buon ${word} a Palermo?`)).toBeVisible();
  const post = page.locator('article, .group-post').filter({ hasText: word }).last();
  const reply = post.getByPlaceholder('Scrivi un commento…');
  await reply.fill(`Io sì, scrivimi! ${word}`);
  await post.getByRole('button', { name: 'Invia' }).click(); // Enter on a phone is a new line
  await expect(page.getByText(`Io sì, scrivimi! ${word}`)).toBeVisible();

  await page.goto(`/cerca?q=${word}&tab=gruppi`);
  await expect(page.locator('mark:visible', { hasText: word }).first()).toBeVisible();
  await page.goto('/cerca?q=Giulia');
  await expect(page.locator('a:visible', { hasText: 'Giulia Ferrara' }).first()).toBeVisible();
  // a typo is forgiven
  await page.goto('/cerca?q=Giula');
  await expect(page.locator('a:visible', { hasText: 'Giulia Ferrara' }).first()).toBeVisible();
});

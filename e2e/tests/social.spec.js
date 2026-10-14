// Two people: one asks to connect, the other accepts, they write to each other
import { expect, test } from '@playwright/test';
import { BASE, member } from '../helpers.js';

test('Connettiti → Accetta → Apri chat → the message arrives', async ({ page, browser }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const a = await member(page.request, { first: 'Anna', last: 'Richiedente' });
  const ctxB = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { 'x-requested-with': 'rientro' } });
  const pageB = await ctxB.newPage();
  pageB.on('pageerror', e => errors.push(e.message));
  const b = await member(pageB.request, { first: 'Bruno', last: 'Destinatario' });

  // Anna: on Bruno's profile, Connettiti and send the request
  await page.goto(`/persone/${b.id}`);
  await page.getByRole('button', { name: 'Connettiti' }).first().click();
  await page.getByRole('button', { name: 'Invia richiesta' }).click();
  await expect(page.getByText('Richiesta inviata').first()).toBeVisible();
  // links stay hidden before accepting
  await expect(page.locator('.pf-link')).toHaveCount(0);

  // Bruno: Ricevute → Accetta
  await pageB.goto('/connessioni?tab=ricevute');
  await expect(pageB.getByText('Anna Richiedente')).toBeVisible();
  await pageB.getByRole('button', { name: 'Accetta' }).first().click();
  await expect(pageB.getByRole('button', { name: 'Accetta' })).toHaveCount(0);

  // Bruno writes from Anna's profile
  await pageB.goto(`/persone/${a.id}`);
  await pageB.getByRole('button', { name: 'Apri chat' }).click();
  await expect(pageB).toHaveURL(new RegExp(`/messaggi/${a.id}`));
  const text = `Ciao Anna, test ${Date.now()}`;
  await pageB.locator('textarea[data-key="compose"]').fill(text);
  await pageB.keyboard.press('Enter');
  await expect(pageB.getByRole('region', { name: 'Chat' }).getByText(text, { exact: true })).toBeVisible();

  // Anna sees it in her chat with Bruno
  await page.goto(`/messaggi/${b.id}`);
  await expect(page.getByRole('region', { name: 'Chat' }).getByText(text, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await ctxB.close();
});

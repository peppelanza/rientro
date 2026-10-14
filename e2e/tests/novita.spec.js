// What was added after the first round of tests: read-only chat once disconnected, Invita, editing
// posts, links you can click, badges that update by themselves, Back through filters and sign-in
import { expect, test } from '@playwright/test';
import { api, member, signIn, uniqueEmail } from '../helpers.js';

const second = async browser => {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:3020', extraHTTPHeaders: { 'x-requested-with': 'rientro' } });
  return { ctx, page: await ctx.newPage() };
};

test('connessione rimossa: la chat resta da leggere, senza casella per scrivere; i link si cliccano', async ({ page, browser }) => {
  const a = await member(page.request, { first: 'Alba' });
  const { ctx, page: pb } = await second(browser);
  const b = await member(pb.request, { first: 'Bice' });
  const c = await api(page.request, 'POST', '/api/connections', { to: b.id });
  await api(pb.request, 'POST', `/api/connections/${c.id}/accept`);
  await api(pb.request, 'POST', `/api/threads/${a.id}`, { body: 'Guarda www.esempio.it e dimmi' });
  await page.goto(`/messaggi/${b.id}`);
  const chat = page.getByRole('region', { name: 'Chat' });
  await expect(chat.getByRole('link', { name: 'www.esempio.it' })).toHaveAttribute('href', 'https://www.esempio.it/');
  await expect(page.locator('textarea[data-key="compose"]')).toBeVisible();
  // Bice removes the connection: Alba's open chat turns read-only by itself (live)
  await api(pb.request, 'POST', `/api/connections/${c.id}/remove`);
  await expect(page.getByText('Non siete più connessi')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('textarea[data-key="compose"]')).toHaveCount(0);
  await expect(chat.getByText('dimmi', { exact: false })).toBeVisible();
  await ctx.close();
});

test('il badge di Connessioni si aggiorna da solo quando arriva una richiesta', async ({ page, browser }) => {
  const a = await member(page.request, { first: 'Live' });
  await page.goto('/scopri');
  await expect(page.locator('article').first()).toBeVisible();
  await page.waitForTimeout(500); // the live connection opens
  const { ctx, page: pb } = await second(browser);
  await member(pb.request, { first: 'Richiedente' });
  await api(pb.request, 'POST', '/api/connections', { to: a.id });
  // the bell's count or Connessioni's: a 1 shows up without reloading
  await expect.poll(async () => (await page.evaluate(() => document.querySelector('.nav-root, nav')?.innerText || '')).includes('1'), { timeout: 10_000 }).toBeTruthy();
  await ctx.close();
});

test('Connessioni: "Invita" apre il tuo link', async ({ page }) => {
  await member(page.request, { first: 'Invitante' });
  await page.goto('/connessioni');
  await page.getByRole('button', { name: 'Invita' }).first().click();
  await expect(page.getByRole('heading', { name: 'Invita chi vuoi' })).toBeVisible();
  await expect(page.locator('.invite-link')).toContainText(/\?[a-z]{1,4}\d{4}/);
});

test('un post si modifica dal menu ···', async ({ page }) => {
  await member(page.request, { first: 'Autore' });
  const word = `modifica${Date.now().toString(36)}`;
  const post = await api(page.request, 'POST', '/api/groups/generale/posts', { body: `Prima versione ${word}` });
  await page.goto(`/gruppi/generale?post=${post.id}`);
  const card = page.locator('article').filter({ hasText: word });
  await card.getByRole('button', { name: 'Altre azioni' }).click();
  await card.getByRole('menuitem', { name: 'Modifica' }).click();
  const box = page.locator(`[data-key="edit-p-${post.id}"]`);
  await box.fill(`Seconda versione ${word}`);
  const editing = page.locator(`#post-${post.id}`);
  await editing.getByRole('button', { name: 'Salva' }).click();
  await expect(editing.getByText(`Seconda versione ${word}`)).toBeVisible();
  await expect(editing.getByText('modificato')).toBeVisible();
});

test('Indietro: toglie l’ultimo filtro in Scopri; torna al passo prima nell’accesso', async ({ page }) => {
  await member(page.request, { first: 'Indietro' });
  await page.goto('/scopri?lives=italy');
  await page.goto(`/scopri?lives=italy&backgrounds=${encodeURIComponent('Business, finanza e diritto')}`);
  await expect(page.locator('article').first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/scopri\?lives=italy$/);

  const ctxPage = await page.context().browser().newPage();
  await ctxPage.goto('http://localhost:3020/accedi');
  await ctxPage.getByRole('button', { name: 'Continua con email' }).click();
  await expect(ctxPage.getByPlaceholder('nome@esempio.it')).toBeVisible();
  await ctxPage.goBack();
  await expect(ctxPage.getByRole('button', { name: 'Continua con email' })).toBeVisible();
  await ctxPage.close();
});

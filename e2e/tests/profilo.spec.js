// Il tuo profilo (Impostazioni): the preview card is what Scopri shows, "Altro" can't be saved empty
import { expect, test } from '@playwright/test';
import { api, member } from '../helpers.js';

test('anteprima "come ti vedono" = la tessera di Scopri vista da un altro', async ({ page, browser }, info) => {
  test.skip(info.project.name === 'telefono', 'sul telefono la colonna con l’anteprima non c’è (r-hide-md)');
  const me = await member(page.request, { first: 'Carla', last: 'Anteprima', background_area: 'Salute e benessere', years_experience: '8-12' });
  await api(page.request, 'POST', '/api/me/experiences', { role: 'Medica', company: 'Ospedale di Londra', start_month: '2019-01', current: true });
  await page.goto('/profilo');
  const preview = page.locator('article').last();
  await expect(preview).toContainText('Carla Anteprima');
  const flat = t => t.replace(/\u2060/g, '').replace(/\s+/g, ' ');
  const mine = flat(await preview.innerText());

  const other = await browser.newContext({ baseURL: 'http://localhost:3020', extraHTTPHeaders: { 'x-requested-with': 'rientro' } });
  const op = await other.newPage();
  await member(op.request, { first: 'Osservatore' });
  await op.goto('/cerca?q=Anteprima');
  await op.goto('/scopri?q=Carla');
  const r = await op.request.get('/api/profiles?q=Carla%20Anteprima');
  const card = (await r.json()).people.find(p => p.id === me.id);
  expect(card.job).toBe('Medica presso Ospedale di Londra');
  expect(card.background.replace(/[\u2060]/g, '').replace(/\u00a0/g, ' ')).toBe('Salute e benessere · 8–12 anni');
  for (const bit of [card.name, card.job, card.background, card.from, card.to]) expect(mine).toContain(flat(bit));
  // the Profilo button of the preview opens the full preview
  await preview.getByRole('link', { name: 'Profilo' }).click();
  await expect(page).toHaveURL(/anteprima=1/);
  await expect(page.getByText('non disponibile')).toHaveCount(0);
  await other.close();
});

test('"Altro" senza testo non si salva', async ({ page }) => {
  await member(page.request, { first: 'Altro' });
  await page.goto('/profilo?sezione=percorso');
  await page.getByText('Altro', { exact: true }).click();
  await page.getByRole('button', { name: 'Salva modifiche' }).click();
  await expect(page.getByText('Scrivi il tuo background')).toBeVisible();
  const me = await (await page.request.get('/api/me')).json();
  expect(me.profile.background_area).toBe('Tecnologia e ingegneria');
});

// The whole onboarding from the page, as someone who lives abroad: every step, then Pubblica.
import { expect, test } from '@playwright/test';
import { png, signIn, uniqueEmail } from '../helpers.js';

// A place picker (App Comune Picker): type, then pick the option
async function pick(page, placeholder, text, option = text) {
  const box = page.getByPlaceholder(placeholder);
  await box.fill(text);
  await page.getByRole('option', { name: new RegExp(`^${option}`) }).first().dispatchEvent('mousedown');
}
const next = page => page.getByRole('button', { name: /^Continua$|Anteprima|Vedi l’anteprima/ }).last().click();
const skip = page => page.getByRole('button', { name: /^Salta$|Lo aggiungo dopo/ }).last().click();
const heading = (page, name) => expect(page.getByRole('heading', { level: 2, name })).toBeVisible();

test('onboarding completo di chi vive all’estero, fino a Pubblica', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await signIn(page.request, uniqueEmail('onb'));
  await page.goto('/onboarding');
  await page.getByRole('button', { name: 'Iniziamo' }).click();

  await heading(page, 'Dove vivi attualmente?');
  await page.getByRole('radio', { name: /Vivo fuori/ }).click();
  await next(page);
  await heading(page, 'Dove vivi attualmente?');
  await pick(page, 'Cerca il paese', 'Regno Unito');
  await pick(page, 'Cerca la città', 'Londra');
  await next(page);

  await heading(page, 'Dove vorresti vivere in Italia?');
  await pick(page, 'Cerca un comune', 'Palermo');
  await page.getByRole('radio', { name: /0.3 mesi/ }).click();
  await next(page);

  await heading(page, 'Cosa stai cercando su Rientro?');
  await page.getByRole('radiogroup', { name: 'Obiettivo' }).getByRole('radio').first().click(); // ho un'idea
  await next(page);
  await page.getByLabel('Titolo dell’idea').fill('Agriturismo digitale');
  await page.getByLabel('Descrivi la tua idea').fill('Vendita diretta per piccoli produttori.');
  await page.getByRole('radiogroup').getByRole('radio').first().click(); // a che punto sei
  await next(page);

  await heading(page, 'Presentati');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png() });
  await page.getByLabel('Nome', { exact: true }).fill('Onboarding');
  await page.getByLabel('Cognome').fill('Completo');
  await page.getByLabel('Anno di nascita').fill('1991');
  await page.getByLabel('Su di me').fill('Vivo a Londra da dieci anni.');
  // the photo is checked in the browser (face.js) and uploaded: wait until the server has it
  await expect.poll(async () => (await (await page.request.get('/api/me')).json()).profile.photo_url, { timeout: 45_000 }).toBeTruthy();
  await next(page);

  await heading(page, 'Un video di presentazione');
  await skip(page);
  await heading(page, 'Qual è il tuo background?');
  await page.getByRole('radiogroup', { name: 'Background' }).getByRole('radio').first().click();
  await next(page);
  await heading(page, 'Formazione');
  await skip(page);
  await heading(page, 'Dove hai lavorato');
  await skip(page);
  await heading(page, 'Dove trovarti');
  await skip(page);
  await skip(page); // risultato
  await heading(page, 'Quali settori ti interessano?');
  const sectors = page.getByRole('checkbox');
  for (let i = 0; i < 6; i++) await sectors.nth(i).click(); // the sixth is refused
  await expect(page.getByText(/Massimo 5/)).toBeVisible();
  await next(page);
  await heading(page, 'Chi stai cercando?');
  await page.getByRole('checkbox').first().click();
  await next(page);
  await skip(page); // cosa ti manca di casa
  if (await page.getByRole('heading', { level: 2, name: /Vuoi connetterti/ }).isVisible().catch(() => false)) await skip(page);
  await heading(page, 'Come hai conosciuto Rientro?');
  await page.getByRole('radiogroup', { name: 'Come hai conosciuto Rientro' }).getByRole('radio').first().click();
  await next(page);

  // the preview is the real profile page, with Pubblica on top
  await expect(page.getByRole('heading', { level: 1, name: 'Onboarding Completo' })).toBeVisible();
  await page.getByRole('button', { name: /Pubblica/ }).first().click();
  await expect(page).toHaveURL(/\/(benvenuto|scopri)/);
  const me = await (await page.request.get('/api/me')).json();
  expect(me.user.status).toBe('approved');
  expect(me.profile.sectors).toHaveLength(5);
  expect(errors).toEqual([]);
});

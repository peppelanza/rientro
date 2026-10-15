// The whole onboarding from the page, as someone who lives abroad: every step, then Pubblica.
import { expect, test } from '@playwright/test';
import { png, signIn, uniqueEmail } from '../helpers.js';

// A place picker (App Comune Picker): type, then pick the option
async function pick(page, placeholder, text, option = text) {
  const box = page.getByPlaceholder(placeholder);
  await box.fill(text);
  await page.getByRole('option', { name: new RegExp(`^${option}`) }).first().dispatchEvent('mousedown');
}
const next = page => page.getByRole('button', { name: /^Continua$/ }).last().click();
const skip = page => page.getByRole('button', { name: /^Salta$|Lo aggiungo dopo/ }).last().click();
const heading = (page, name) => expect(page.getByRole('heading', { level: 2, name })).toBeVisible();

test('onboarding (fino a Presentati) di chi vive all’estero, Pubblica, poi Completa il tuo profilo', async ({ page }) => {
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
  // Presentati is the last step: "Pubblica il profilo", online at once (no preview)
  await page.getByRole('button', { name: 'Pubblica il profilo' }).last().click();
  await expect(page).toHaveURL(/\/(benvenuto|scopri)/);
  const me = await (await page.request.get('/api/me')).json();
  expect(me.user.status).toBe('approved');
  // the rest is "Completa il tuo profilo"
  expect(me.gaps.map(g => g.key)).toEqual(expect.arrayContaining(['background', 'interessi', 'chi', 'manca', 'fonte']));
  await page.goto('/profilo?sezione=completa');
  await expect(page.getByText('I settori che ti interessano')).toBeVisible();
  await page.getByRole('button', { name: 'LinkedIn' }).first().click(); // come hai conosciuto Rientro, right there
  await expect.poll(async () => (await (await page.request.get('/api/me')).json()).profile.source).toBe('LinkedIn');
  expect(errors).toEqual([]);
});

test('onboarding: il tasto indietro torna al passo prima, Continua disabilitato dice cosa manca', async ({ page }) => {
  await signIn(page.request, uniqueEmail('back'));
  await page.goto('/onboarding');
  await page.getByRole('button', { name: 'Iniziamo' }).click();
  await heading(page, 'Dove vivi attualmente?');
  await page.getByRole('button', { name: /^Continua$/ }).last().click({ force: true }); // disabled: nothing chosen yet
  await expect(page.getByText('Scegli dove vivi').last()).toBeVisible();
  await page.getByRole('radio', { name: /Vivo fuori/ }).click();
  await next(page);
  await expect(page.getByPlaceholder('Cerca il paese')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('radio', { name: /Vivo fuori/ })).toBeVisible();
  await expect(page).toHaveURL(/passo=luogo/);
});

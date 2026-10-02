// Transactional email through Brevo (EU). https://developers.brevo.com/reference/sendtransacemail
import { config } from './config.js';
import { HttpError } from './validate.js';

export const canSendEmail = () => !!config.brevoApiKey;

export async function sendEmail({ to, subject, text, html }) {
  // Test people (demo.js) have addresses that can't receive mail: never send to them
  if (to.toLowerCase().endsWith('@prova.rientro.invalid')) return;
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: config.mailFrom, name: 'Rientro' }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) {
    console.error('[email] Brevo error', res?.status, res ? await res.text().catch(() => '') : 'network');
    throw new HttpError(503, 'email_unavailable', 'Non riusciamo a inviare l’email in questo momento. Riprova tra poco.');
  }
}

export function sendLoginCodeEmail(email, code) {
  return sendEmail({
    to: email,
    subject: `${code} è il tuo codice Rientro`,
    text: `Il tuo codice di accesso a Rientro è ${code}.\n\nScade tra ${config.loginCodeTtlMinutes} minuti. Se non l'hai richiesto tu, ignora questa email.`,
    html: `<p>Il tuo codice di accesso a Rientro è</p><p style="font-size:28px;font-weight:600;letter-spacing:4px;font-family:monospace">${code}</p><p>Scade tra ${config.loginCodeTtlMinutes} minuti. Se non l'hai richiesto tu, ignora questa email.</p>`,
  }).catch(() => { throw new HttpError(503, 'email_unavailable', 'Non riusciamo a inviare il codice in questo momento. Riprova tra poco.'); });
}

// Sent when a member asks to delete their account (privacy policy §9): how to change their mind.
export function sendDeletionScheduledEmail(email, eraseOn) {
  const date = new Date(eraseOn).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
  const url = `${config.baseUrl}/accedi`;
  return sendEmail({
    to: email,
    subject: 'Abbiamo ricevuto la richiesta di eliminare il tuo account',
    text: `Ciao,\n\nabbiamo ricevuto la tua richiesta di eliminare l'account Rientro. Da ora il tuo profilo non è più visibile a nessuno.\n\nIl ${date} cancelleremo definitivamente l'account e tutti i dati collegati (profilo, foto, video, connessioni e messaggi).\n\nSe hai cambiato idea, ti basta accedere prima di quella data e ritroverai tutto com'era: ${url}\n\nIl team di Rientro`,
    html: `<p>Ciao,</p><p>abbiamo ricevuto la tua richiesta di eliminare l'account Rientro. Da ora il tuo profilo non è più visibile a nessuno.</p><p>Il <strong>${date}</strong> cancelleremo definitivamente l'account e tutti i dati collegati (profilo, foto, video, connessioni e messaggi).</p><p>Se hai cambiato idea, ti basta <a href="${url}">accedere</a> prima di quella data e ritroverai tutto com'era.</p><p>Il team di Rientro</p>`,
  });
}

// Sent when the admin lifts a suspension that followed a blocked image (moderation.js): it was a mistake
export function sendAccountRestoredEmail(email) {
  const url = `${config.baseUrl}/accedi`;
  return sendEmail({
    to: email,
    subject: 'Il tuo account Rientro è di nuovo attivo',
    text: `Ciao,\n\nabbiamo controllato l'immagine che avevi caricato: il blocco automatico era un errore e ci scusiamo per il disagio. Il tuo account è di nuovo attivo e puoi accedere come prima: ${url}\n\nIl team di Rientro`,
    html: `<p>Ciao,</p><p>abbiamo controllato l'immagine che avevi caricato: il blocco automatico era un errore e ci scusiamo per il disagio.</p><p>Il tuo account è di nuovo attivo e puoi <a href="${url}">accedere</a> come prima.</p><p>Il team di Rientro</p>`,
  });
}

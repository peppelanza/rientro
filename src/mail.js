// Transactional email through Brevo (EU). https://developers.brevo.com/reference/sendtransacemail
import { config } from './config.js';
import { HttpError } from './validate.js';

export const canSendEmail = () => !!config.brevoApiKey;

export async function sendEmail({ to, subject, text, html }) {
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

// Privacy policy §9: 24 months without signing in → this warning; 30 days later the account is deleted.
export function sendInactivityEmail(email, deleteOn) {
  const date = deleteOn.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
  const url = `${config.baseUrl}/accedi`;
  return sendEmail({
    to: email,
    subject: 'Il tuo account Rientro sta per essere eliminato',
    text: `Ciao,\n\nnon accedi a Rientro da due anni. Come indicato nella nostra privacy policy, il ${date} elimineremo il tuo account e tutti i dati collegati (profilo, foto, video, connessioni e messaggi).\n\nSe vuoi tenerlo, ti basta accedere prima di quella data: ${url}\n\nSe invece non ti serve più, non devi fare nulla.\n\nIl team di Rientro`,
    html: `<p>Ciao,</p><p>non accedi a Rientro da due anni. Come indicato nella nostra <a href="${config.baseUrl}/legal/privacy">privacy policy</a>, il <strong>${date}</strong> elimineremo il tuo account e tutti i dati collegati (profilo, foto, video, connessioni e messaggi).</p><p>Se vuoi tenerlo, ti basta <a href="${url}">accedere</a> prima di quella data.</p><p>Se invece non ti serve più, non devi fare nulla.</p><p>Il team di Rientro</p>`,
  });
}

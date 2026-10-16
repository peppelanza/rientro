// Transactional email through Brevo (EU). https://developers.brevo.com/reference/sendtransacemail
// Every email uses the branded layout in email-templates.js, with a plain-text twin.
import { config, isLaunched } from './config.js';
import { button, checklist, code, eyebrow, esc, h1, layout, note, p, row, rows, steps, textFooter, url } from './email-templates.js';
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

const launchDate = () => new Date(config.launchAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }).replace(/^1 /, '1° ');
const settingsFooter = `Ricevi questa email per le tue <a href="${url('/impostazioni/notifiche')}" style="color:#8C84AE">preferenze di notifica</a>: puoi cambiarle quando vuoi.`;

// --- Sign-in code -------------------------------------------------------------------------

export function loginCodeEmail(codeValue) {
  const min = config.loginCodeTtlMinutes;
  return {
    subject: `${codeValue} è il tuo codice Rientro`,
    text: `Il tuo codice di accesso a Rientro è ${codeValue}.\n\nScade tra ${min} minuti. Se non l'hai richiesto tu, ignora questa email.${textFooter}`,
    html: layout({
      preheader: `Il tuo codice è ${codeValue}. Scade tra ${min} minuti.`,
      body: h1('Il tuo codice di accesso') + p('Inseriscilo nella pagina di accesso per entrare in Rientro.') + code(codeValue)
        + p(`Scade tra ${min} minuti. Se non l’hai richiesto tu, ignora questa email: nessuno può entrare senza il codice.`, { size: 14, color: '#8C84AE', margin: '0' }),
    }),
  };
}

export function sendLoginCodeEmail(email, codeValue) {
  return sendEmail({ to: email, ...loginCodeEmail(codeValue) })
    .catch(() => { throw new HttpError(503, 'email_unavailable', 'Non riusciamo a inviare il codice in questo momento. Riprova tra poco.'); });
}

// A link to copy and pass on, not to click: plain text in a box, selected whole with a tap where the
// client allows it; the dots in their own spans keep mail apps from turning it into a link
const copyable = text => `<div style="margin:0 0 6px;padding:16px 18px;border-radius:16px;background:#F4F2FB;border:1px dashed #C9BEFA;text-align:center;font-family:'Geist Mono',ui-monospace,Menlo,monospace;font-size:18px;font-weight:600;letter-spacing:.01em;color:#1A1726;-webkit-user-select:all;user-select:all">${esc(text).replace(/\./g, '<span>.</span>')}</div>`
  + p('Copialo e mandalo a chi vuoi invitare.', { size: 13, color: '#8C84AE', margin: '0 0 22px' });

// --- Welcome (once, when the profile goes online): what happens next, and the member's invite link ---

export function welcomeEmail({ firstName = null, inviteUrl = null, launched = isLaunched() } = {}) {
  const date = launchDate();
  const hello = `Ciao${firstName ? ` ${firstName}` : ''}, ${launched ? 'il tuo profilo è online: da adesso gli altri possono trovarti.' : 'il tuo profilo è pronto.'}`;
  const how = [
    ['Scopri chi torna', launched ? 'Nella tua città o con competenze complementari alle tue.' : 'Filtrando per città, competenze e settori.'],
    ['Connettiti con una nota', 'Due righe su di te: se accetta, potete scrivervi e vedete i link l’uno dell’altro.'],
    [launched ? 'Segui i gruppi' : 'Entra nei gruppi', 'Della tua città e dei tuoi settori.'],
  ];
  const lead = launched ? '' : `Apriamo il ${date}. Quel giorno ti scriviamo e potrai:`;
  const invite = inviteUrl && `Invita chi conosci con il tuo link personale: chi si iscrive con il tuo link può chiederti ${launched ? 'subito di connettervi' : 'di connettervi già prima del lancio'}. Più persone inviti, più persone potranno trovarti.`;
  const cta = launched ? ['Scopri chi torna', url('/scopri')] : ['Vedi il tuo profilo', url('/profilo')];
  const privacy = 'Il tuo profilo è visibile solo agli altri membri di Rientro.';
  return {
    subject: launched ? 'Benvenuto su Rientro' : 'Benvenuto su Rientro, il tuo profilo è pronto',
    text: [hello, lead, how.map(([t, d], i) => `${i + 1}. ${t}: ${d}`).join('\n'), invite && `${invite}\n${inviteUrl}`, `${cta[0]}: ${cta[1]}`, privacy].filter(Boolean).join('\n\n') + textFooter,
    html: layout({
      preheader: launched ? 'Il tuo profilo è online.' : `Il tuo profilo è pronto. Apriamo il ${date}.`,
      body: h1('Benvenuto su Rientro') + p(esc(hello)) + (lead ? p(lead) : '') + steps(how)
        + (invite ? p(esc(invite)) + copyable(inviteUrl.replace(/^https?:\/\//, '')) : '')
        + button(...cta) + p(privacy, { size: 13, color: '#8C84AE', margin: '0' }),
    }),
  };
}

export const sendWelcomeEmail = (email, opts) => sendEmail({ to: email, ...welcomeEmail(opts) });

// --- Profile left halfway (onboarding-reminder.js): once, an hour after the last change ------------

// missing: what's still needed to go online (profiles.js missingForSubmit), as a short list
export function onboardingReminderEmail({ firstName = null, missing = [] } = {}) {
  const hello = `Ciao${firstName ? ` ${firstName}` : ''}, ${missing.length ? 'per pubblicare il profilo ti manca solo:' : 'la tua iscrizione è quasi finita.'}`;
  const cta = ['Completa l’iscrizione', url('/onboarding')];
  return {
    subject: 'Ti manca poco per entrare su Rientro',
    text: `${hello}\n${missing.map(m => `- ${m}`).join('\n')}\n\n${cta[0]}: ${cta[1]}${textFooter}`,
    html: layout({
      preheader: 'Bastano due minuti per pubblicare il profilo.',
      body: h1('Ti manca poco') + p(esc(hello)) + (missing.length ? checklist(missing.map(esc)) : '') + button(...cta),
    }),
  };
}

// --- Profile online but not complete (profile-reminder.js): once, 24 hours after signing up -------

export function profileReminderEmail({ firstName = null, gaps = [] } = {}) {
  const hello = `Ciao${firstName ? ` ${firstName}` : ''}, il tuo profilo su Rientro è online.`;
  const next = 'Ti mancano ancora queste cose: aggiungerle aiuta le persone giuste a trovarti.';
  const cta = ['Completa il profilo', url('/profilo?sezione=completa')];
  const list = gaps.map(g => g.label);
  return {
    subject: 'Completa il tuo profilo su Rientro',
    text: `${hello}\n\n${next}\n${list.map(l => `- ${l}`).join('\n')}\n\n${cta[0]}: ${cta[1]}${textFooter}`,
    html: layout({
      preheader: 'Bastano pochi minuti per completare il profilo.',
      body: h1('Completa il tuo profilo') + p(esc(hello)) + p(esc(next)) + p(list.map(l => `· ${esc(l)}`).join('<br>')) + button(...cta),
    }),
  };
}

// --- Notifications digest (email-digest.js): new requests and unread messages, grouped -------

// requests: [{ name, note }], messages: [{ name, count, preview, id }]
export function digestEmail({ requests = [], messages = [], groups = [] }) {
  const nMsg = messages.reduce((n, m) => n + m.count, 0);
  const people = messages.length;
  const parts = [];
  if (requests.length) parts.push(requests.length === 1 ? `${requests[0].name} vuole entrare in contatto con te` : `${requests.length} nuove richieste di connessione`);
  if (nMsg) parts.push(people === 1 ? `${nMsg === 1 ? 'un nuovo messaggio' : `${nMsg} nuovi messaggi`} da ${messages[0].name}` : `${nMsg} nuovi messaggi da ${people} persone`);
  if (groups.length) parts.push(groups.length === 1 && !parts.length ? groups[0].title : 'novità dai gruppi');
  const subject = parts.length ? parts.join(' e ').replace(/^./, c => c.toUpperCase()) : 'Novità su Rientro';
  const only = [requests.length, nMsg, groups.length].filter(Boolean).length === 1;
  let body = h1(!only ? 'Novità per te su Rientro' : requests.length ? 'Hai nuove richieste' : nMsg ? 'Hai nuovi messaggi' : 'Novità dai tuoi gruppi');
  let text = '';
  if (requests.length) {
    body += eyebrow(requests.length === 1 ? 'Richiesta di connessione' : `${requests.length} richieste di connessione`)
      + rows(requests.map(r => row({ title: `${esc(r.name)} vuole entrare in contatto con te`, text: r.note ? `“${esc(r.note)}”` : '', href: url('/connessioni?tab=ricevute') })))
      + button(requests.length === 1 ? 'Rispondi alla richiesta' : 'Rispondi alle richieste', url('/connessioni?tab=ricevute'));
    text += `Richieste di connessione:\n${requests.map(r => `- ${r.name}${r.note ? `: “${r.note}”` : ''}`).join('\n')}\nRispondi: ${url('/connessioni?tab=ricevute')}\n\n`;
  }
  if (nMsg) {
    body += eyebrow(`${nMsg === 1 ? 'Un messaggio' : `${nMsg} messaggi`} da leggere`)
      + rows(messages.map(m => row({ title: `${esc(m.name)}${m.count > 1 ? ` · ${m.count} messaggi` : ''}`, text: m.preview ? esc(m.preview) : '', href: url(`/messaggi/${m.id}`) })))
      + button(people === 1 ? `Rispondi a ${esc(messages[0].first || messages[0].name)}` : 'Apri i messaggi', url(people === 1 ? `/messaggi/${messages[0].id}` : '/messaggi'));
    text += `Messaggi da leggere:\n${messages.map(m => `- ${m.name}${m.count > 1 ? ` (${m.count})` : ''}${m.preview ? `: ${m.preview}` : ''}`).join('\n')}\nApri: ${url('/messaggi')}\n\n`;
  }
  if (groups.length) {
    body += eyebrow('Dai gruppi')
      + rows(groups.map(g => row({ title: esc(g.title), text: g.preview ? esc(g.preview) : '', href: url(g.href) })))
      + button(groups.length === 1 ? 'Apri il post' : 'Apri i gruppi', url(groups.length === 1 ? groups[0].href : '/gruppi'));
    text += `Dai gruppi:\n${groups.map(g => `- ${g.title}${g.preview ? `: ${g.preview}` : ''}`).join('\n')}\nApri: ${url('/gruppi')}\n\n`;
  }
  return {
    subject,
    text: `${text.trim()}\n\nPuoi cambiare queste email in Impostazioni → Notifiche: ${url('/impostazioni/notifiche')}${textFooter}`,
    html: layout({ preheader: subject, body, footer: settingsFooter }),
  };
}

// --- Account ------------------------------------------------------------------------------

// Sent when a member asks to delete their account (privacy policy §9): how to change their mind.
export function sendDeletionScheduledEmail(email, eraseOn) {
  const date = new Date(eraseOn).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
  const link = url('/accedi');
  return sendEmail({
    to: email,
    subject: 'Abbiamo ricevuto la richiesta di eliminare il tuo account',
    text: `Ciao,\n\nabbiamo ricevuto la tua richiesta di eliminare l'account Rientro. Da ora il tuo profilo non è più visibile a nessuno.\n\nIl ${date} cancelleremo definitivamente l'account e tutti i dati collegati (profilo, foto, video, connessioni e messaggi).\n\nSe hai cambiato idea, ti basta accedere prima di quella data e ritroverai tutto com'era: ${link}\n\nIl team di Rientro${textFooter}`,
    html: layout({
      preheader: `Il ${date} cancelleremo definitivamente l’account.`,
      body: h1('Richiesta di eliminazione ricevuta') + p('Da ora il tuo profilo non è più visibile a nessuno.')
        + note(`Il <strong>${date}</strong> cancelleremo definitivamente l’account e tutti i dati collegati: profilo, foto, video, connessioni e messaggi.`)
        + p('Se hai cambiato idea, ti basta accedere prima di quella data: ritroverai tutto com’era.') + button('Accedi e annulla', link),
    }),
  });
}

// Sent when the admin lifts a suspension that followed a blocked image (moderation.js): it was a mistake
export function sendAccountRestoredEmail(email) {
  const link = url('/accedi');
  return sendEmail({
    to: email,
    subject: 'Il tuo account Rientro è di nuovo attivo',
    text: `Ciao,\n\nabbiamo controllato l'immagine che avevi caricato: il blocco automatico era un errore e ci scusiamo per il disagio. Il tuo account è di nuovo attivo e puoi accedere come prima: ${link}\n\nIl team di Rientro${textFooter}`,
    html: layout({
      preheader: 'Il blocco automatico era un errore.',
      body: h1('Il tuo account è di nuovo attivo') + p('Abbiamo controllato l’immagine che avevi caricato: il blocco automatico era un errore e ci scusiamo per il disagio.')
        + button('Accedi a Rientro', link),
    }),
  });
}

// --- Supporto --------------------------------------------------------------------------------

// A ticket's update from the team (support.js): an answer, closed or reopened. Always sent (it's the
// answer to what the member asked), whatever the notification settings.
export function supportUpdateEmail({ code, subject, kind, body = '', ticketId }) {
  const link = url(`/supporto/${ticketId}`);
  const what = { reply: 'Nuova risposta dal supporto di Rientro', closed: 'Abbiamo chiuso il tuo ticket', open: 'Abbiamo riaperto il tuo ticket' }[kind];
  const title = `${what} · #${code}`;
  const preview = body.length > 600 ? `${body.slice(0, 599)}…` : body;
  return {
    subject: kind === 'reply' ? what : `${title}: ${subject}`, // an answer: just that
    text: `Ciao,\n\n${what} (#${code}, “${subject}”).${preview ? `\n\n“${preview}”` : ''}${kind === 'closed' ? '\n\nSe ti serve altro, rispondi nel ticket: si riapre.' : ''}\n\nApri il ticket: ${link}\n\nIl team di Rientro${textFooter}`,
    html: layout({
      preheader: preview || title,
      body: h1(what) + eyebrow(`Ticket #${esc(code)}`) + p(`“${esc(subject)}”`)
        + (preview ? note(esc(preview).replace(/\n/g, '<br>')) : '')
        + (kind === 'closed' ? p('Se ti serve altro, rispondi nel ticket: si riapre.') : '')
        + button('Apri il ticket', link),
    }),
  };
}


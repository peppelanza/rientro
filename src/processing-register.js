// Record of processing activities (art. 30 GDPR style), kept in code so it is versioned
// with the features it describes. Seeded into the processing_register table on boot.
//
// ⚠️ The "proposed_basis" and "retention" values are ENGINEERING PROPOSALS, not legal advice.
// Every row stays review_status = 'pending_legal_review' until a qualified EU/Italian privacy
// professional confirms or changes it.

export const PROCESSING_REGISTER = [
  {
    purpose: 'account',
    description: 'Creare e gestire l’account, autenticazione, sicurezza delle sessioni.',
    data_categories: 'email, sessioni (hash), user agent',
    proposed_basis: 'Esecuzione del contratto (art. 6.1.b) — DA CONFERMARE',
    retention: 'Fino alla cancellazione dell’account; sessioni scadono dopo 30 giorni',
    recipients: 'Nessuno oltre al titolare e ai responsabili tecnici (hosting)',
  },
  {
    purpose: 'cofounder_matching',
    description: 'Mostrare il profilo ad altri membri per trovare un co-founder o un’idea.',
    data_categories: 'nome, foto, fascia d’età, città, comuni desiderati, intento, background, bio, link',
    proposed_basis: 'Esecuzione del contratto (art. 6.1.b) — DA CONFERMARE',
    retention: 'Fino alla cancellazione dell’account',
    recipients: 'Membri approvati di Rientro; link Instagram/X/calendario solo alle connessioni',
  },
  {
    purpose: 'job_seeking_signal',
    description:
      'Registrare che l’utente sta anche cercando lavoro in Italia e raccogliere preferenze strutturate ' +
      '(ruoli, competenze, settori, luoghi, modalità, disponibilità) per un eventuale futuro servizio Rientro Talent.',
    data_categories: 'looking_for_italian_job, ruoli, competenze, settori, comuni preferiti, modalità, tipo contratto, disponibilità',
    proposed_basis:
      'Scelta esplicita e facoltativa dell’utente; base giuridica da definire (consenso art. 6.1.a o contratto art. 6.1.b) — DA DEFINIRE',
    retention: 'Finché l’opzione è attiva; i dettagli vengono cancellati quando l’utente la disattiva',
    recipients:
      'Oggi: nessuna azienda terza. Un futuro accesso da parte di aziende richiederà informativa aggiornata e revisione legale prima del lancio',
  },
  {
    purpose: 'preference_ledger',
    description: 'Conservare la prova di quando e come l’utente ha attivato o disattivato preferenze facoltative.',
    data_categories: 'riferimento pseudonimo, preferenza, valore, data, versione dei testi mostrati',
    proposed_basis: 'Obbligo di dimostrare il consenso (art. 7.1) / legittimo interesse — DA CONFERMARE',
    retention: 'Per la durata dell’account + 36 mesi dopo la cancellazione, in forma pseudonima — DA CONFERMARE',
    recipients: 'Nessuno',
  },
  {
    purpose: 'marketing_email',
    description: 'Newsletter e comunicazioni promozionali.',
    data_categories: 'email',
    proposed_basis: 'Consenso (art. 6.1.a) — separato da ogni altra scelta — DA CONFERMARE',
    retention: 'Fino alla revoca del consenso o alla cancellazione dell’account',
    recipients: 'Eventuale fornitore di invio email (responsabile del trattamento)',
  },
  {
    purpose: 'messaging',
    description: 'Richieste di connessione con nota, chat 1-a-1 tra connessioni, notifiche in app.',
    data_categories: 'note, messaggi, stato di lettura, notifiche',
    proposed_basis: 'Esecuzione del contratto (art. 6.1.b) — DA CONFERMARE',
    retention: 'Fino alla cancellazione di uno dei due account — DA CONFERMARE',
    recipients: 'Solo i due partecipanti; moderatori solo in caso di segnalazione (vedi moderation_and_admin)',
  },
  {
    purpose: 'safety_reports',
    description: 'Segnalazioni e blocchi. In caso di segnalazione, un moderatore può leggere la chat tra chi segnala e la persona segnalata; ogni accesso è registrato.',
    data_categories: 'motivo, dettagli, chat tra segnalante e segnalato',
    proposed_basis: 'Legittimo interesse alla sicurezza della community (art. 6.1.f) — DA CONFERMARE con bilanciamento documentato',
    retention: 'DA DEFINIRE (proposta: 24 mesi dalla chiusura)',
    recipients: 'Personale Rientro autorizzato con ruolo admin',
  },
  {
    purpose: 'moderation_and_admin',
    description: 'Revisione dei profili, gestione segnalazioni, sicurezza della community.',
    data_categories: 'dati del profilo, segnalazioni, note admin, registro accessi admin',
    proposed_basis: 'Legittimo interesse (art. 6.1.f) — DA CONFERMARE con bilanciamento documentato',
    retention: 'Registro accessi admin: DA DEFINIRE (proposta 24 mesi)',
    recipients: 'Personale Rientro autorizzato con ruolo admin',
  },
];

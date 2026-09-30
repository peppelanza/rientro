// Legal pages (design 05 · 43b "riassunto prima del testo"). The privacy and cookie policies are
// final texts (30 September 2026); the Terms are still a DRAFT, marked on the page.
// No cookie banner (43c): today only the technical session cookie is used.
import { Page } from './_base.js';

export const title = 'Informazioni legali';

const DOCS = {
  privacy: {
    title: 'Privacy Policy', updated: 'AGGIORNATA IL 30 SETTEMBRE 2026',
    summary: [
      ['Cosa raccogliamo', 'L’email per accedere, quello che scrivi nel tuo profilo, le connessioni e i messaggi, e pochi dati tecnici per la sicurezza. Non la data di nascita.'],
      ['Chi lo vede', 'Solo membri approvati e, quando attiveremo la funzione, aziende verificate dentro Rientro. Instagram, X e calendario solo le tue connessioni. Mai la tua email.'],
      ['Cosa non facciamo', 'Non vendiamo i tuoi dati e non li cediamo a terzi per il loro marketing. Nessun cookie di tracciamento o pubblicità.'],
      ['Il controllo è tuo', 'Scarica o elimina tutto dalle impostazioni quando vuoi. Newsletter e notifiche si gestiscono in un clic. Per tutto il resto: privacy@rientro.it.'],
    ],
    sections: [
      ['Chi è il titolare del trattamento', [
        'Il titolare del trattamento dei tuoi dati personali è Giuseppe Lanzafame, Via Curia 9, Catania (CT), Italia, che gestisce il servizio Rientro (di seguito “Rientro”, “noi”).',
        'Per qualsiasi domanda sulla privacy o per esercitare i tuoi diritti scrivi a privacy@rientro.it. Rispondiamo senza ritardo e comunque entro un mese.',
        'Non abbiamo nominato un Responsabile della protezione dei dati (DPO), perché per il tipo e la dimensione dei trattamenti di Rientro non è obbligatorio (art. 37 del Regolamento UE 2016/679, “GDPR”). L’indirizzo qui sopra è il punto di contatto per tutte le questioni privacy.',
      ]],
      ['A chi si rivolge questa informativa', [
        'Questa informativa, resa ai sensi degli artt. 13 e 14 del GDPR e del D.lgs. 196/2003 (Codice in materia di protezione dei dati personali), spiega come trattiamo i dati di chi visita il sito rientro.it e di chi si iscrive a Rientro, la community per chi rientra in Italia o al Sud e cerca persone con cui fare rete o costruire un progetto.',
        'Rientro è riservato a persone maggiorenni (vedi il punto 11).',
      ]],
      ['Quali dati trattiamo', [
        'Dati che ci dai tu quando ti iscrivi e compili il profilo:',
        '• Account: indirizzo email.',
        '• Profilo: nome e cognome, foto, video di presentazione (facoltativo), fascia d’età, paese e città in cui vivi, da dove sei rientrato e in quale periodo, comuni in cui vorresti vivere, obiettivo (per esempio avviare un progetto o fare rete) e l’eventuale idea che vuoi sviluppare, area professionale, ruolo e azienda attuali, anni di esperienza, formazione ed esperienze lavorative, un risultato di cui vai fiero, settori di interesse, le persone e le competenze che cerchi, tempo che puoi dedicare e quando vuoi iniziare, cosa ti manca dell’Italia, link facoltativi (LinkedIn, sito, Instagram, X, calendario) e come hai conosciuto Rientro.',
        '• Comunicazioni: le note che accompagnano le richieste di connessione, i messaggi che scambi con le tue connessioni, le segnalazioni che invii e il motivo, facoltativo, per cui cancelli l’account.',
        '• Preferenze: le tue scelte su newsletter e notifiche, e le conferme di presa visione dei nostri documenti legali.',
        'Dati che riceviamo se accedi con LinkedIn o Google: se scegli di accedere tramite uno di questi servizi, riceviamo da loro soltanto i dati che autorizzi nella schermata del fornitore, di norma nome, cognome, indirizzo email e foto del profilo. Non riceviamo mai la tua password e non pubblichiamo nulla sui tuoi account.',
        'Dati tecnici raccolti automaticamente: indirizzo IP (usato per la sicurezza, per esempio per limitare i tentativi di accesso ripetuti), tipo di browser e dispositivo, data e ora degli accessi, cookie tecnico di sessione. L’indirizzo IP non viene salvato nel nostro database; compare nei registri tecnici del nostro fornitore di hosting.',
        'Dati che non chiediamo: non chiediamo la data di nascita né dati “particolari” come salute, religione, orientamento sessuale, opinioni politiche o appartenenza sindacale (art. 9 GDPR). Ti chiediamo di non inserirli nel profilo o nei messaggi.',
      ]],
      ['Perché usiamo i dati e su quale base giuridica', [
        'Trattiamo i tuoi dati solo per le finalità qui sotto, ciascuna con la propria base giuridica ai sensi dell’art. 6 del GDPR.',
      ], 'purposes'],
      ['Quali dati sono obbligatori', [
        'Per usare Rientro sono necessari l’indirizzo email e i dati del profilo segnati come obbligatori durante l’iscrizione: senza di essi non possiamo creare il tuo account, rivedere il profilo e mostrarlo agli altri membri.',
        'Tutti gli altri dati sono facoltativi: se non li inserisci il tuo profilo sarà semplicemente meno completo. Anche il consenso alla newsletter è facoltativo e negarlo non ha alcuna conseguenza sull’uso di Rientro.',
      ]],
      ['Chi può vedere i tuoi dati', [
        '• Gli altri membri approvati di Rientro vedono il tuo profilo. Instagram, X e il link al calendario sono visibili solo alle persone con cui sei connesso. La tua email non viene mai mostrata a nessuno.',
        '• Le tue connessioni vedono i messaggi che vi scambiate: i messaggi sono visibili solo a chi partecipa alla conversazione.',
        '• Aziende verificate: stiamo preparando la possibilità per le aziende di registrarsi a Rientro e contattare i membri dentro la piattaforma, come avviene su LinkedIn. Quando la attiveremo, le aziende verificate vedranno il tuo profilo come lo vedono i membri e potranno scriverti tramite Rientro; non riceveranno la tua email né altri dati fuori dalla piattaforma. Prima dell’attivazione ti avviseremo e troverai nelle impostazioni un interruttore per non essere visibile alle aziende.',
        '• Il pubblico non vede il tuo profilo: le pagine pubbliche del sito, come quelle dedicate alle città, mostrano solo numeri aggregati, e mai gruppi di meno di 5 persone.',
        '• Il titolare e le persone autorizzate che lo aiutano a gestire Rientro, vincolate alla riservatezza, accedono ai dati solo quando serve: per rivedere i profili prima della pubblicazione, gestire le segnalazioni e dare assistenza. Ogni accesso dell’area di amministrazione ai dati personali viene registrato. In caso di segnalazione, un moderatore può leggere la conversazione tra chi segnala e la persona segnalata.',
        '• I fornitori che ci aiutano a far funzionare il servizio, indicati al punto 7, nominati responsabili del trattamento (art. 28 GDPR).',
        '• Autorità pubbliche e giudiziarie, solo quando la legge ci obbliga.',
        'Non vendiamo i tuoi dati personali e non li cediamo a terzi per loro finalità di marketing.',
      ]],
      ['Fornitori e trasferimenti fuori dall’Unione europea', [
        'Ci affidiamo a pochi fornitori, scelti per le garanzie che offrono e vincolati da un accordo sul trattamento dei dati:',
        '• Render Services, Inc. (Stati Uniti): hosting del sito e del database. I server che usiamo si trovano a Francoforte, in Germania, quindi i dati sono conservati nell’Unione europea.',
        '• Brevo (Sendinblue SAS, Francia): invio delle email di servizio (per esempio il codice di accesso e le notifiche) e, se ci hai dato il consenso, della newsletter.',
        'Se accedi con LinkedIn o Google, LinkedIn Ireland Unlimited Company e Google Ireland Limited trattano i dati relativi al tuo accesso come titolari autonomi, secondo le rispettive informative privacy.',
        'Alcuni fornitori hanno sede o sub-fornitori fuori dallo Spazio economico europeo, in particolare negli Stati Uniti. In questi casi il trasferimento avviene solo con le garanzie previste dal GDPR: la decisione di adeguatezza della Commissione europea per le aziende aderenti all’EU-U.S. Data Privacy Framework oppure le Clausole contrattuali standard approvate dalla Commissione (artt. 45 e 46 GDPR). Puoi chiederci copia delle garanzie scrivendo a privacy@rientro.it.',
      ]],
      ['Cookie', [
        'Usiamo un solo cookie tecnico, necessario a tenerti connesso. Non usiamo cookie di analisi, di profilazione o pubblicitari, e i caratteri tipografici del sito sono ospitati sui nostri server: visitare Rientro non comunica il tuo indirizzo IP a servizi di terze parti. Trovi i dettagli nella Cookie Policy.',
      ]],
      ['Per quanto tempo conserviamo i dati', [
        'Conserviamo i dati solo per il tempo necessario alle finalità per cui li raccogliamo. Le cancellazioni indicate qui sotto avvengono automaticamente, ogni giorno:',
        '• Account e profilo: finché non cancelli l’account, che puoi fare in qualsiasi momento da Impostazioni. Dalla richiesta il tuo profilo non è più visibile a nessuno e vieni disconnesso; per 30 giorni puoi ripensarci semplicemente accedendo di nuovo, e ritrovi tutto com’era. Trascorsi i 30 giorni cancelliamo definitivamente l’account e tutti i dati collegati. Se preferisci la cancellazione immediata, scrivici a privacy@rientro.it.',
        '• Messaggi e connessioni: finché l’account di uno dei due partecipanti non viene cancellato definitivamente.',
        '• Codici di accesso: 10 minuti. Sessioni di accesso: 30 giorni dall’ultimo accesso, poi scadono e vengono cancellate.',
        '• Segnalazioni chiuse: 24 mesi dalla chiusura, per gestire eventuali abusi ripetuti.',
        '• Registro degli accessi dell’area di amministrazione e registro delle richieste di esportazione dei dati: 24 mesi.',
        '• Prova delle tue scelte sulla newsletter: per tutta la durata dell’account e per 36 mesi dopo la sua cancellazione, in forma pseudonima (senza nome né email), per poter dimostrare di aver rispettato le tue scelte.',
        '• Motivo facoltativo della cancellazione dell’account: conservato insieme alla richiesta per 30 giorni e poi, in forma anonima, per 24 mesi.',
        '• Registri tecnici del fornitore di hosting (che includono l’indirizzo IP): per il periodo breve stabilito dal fornitore.',
        'Possiamo conservare alcuni dati più a lungo solo se la legge lo impone o se servono per difendere un nostro diritto in giudizio, e solo per il tempo strettamente necessario.',
      ]],
      ['I tuoi diritti', [
        'Hai il diritto di:',
        '• accedere ai tuoi dati e riceverne copia (art. 15 GDPR);',
        '• farli correggere o completare (art. 16);',
        '• farli cancellare (art. 17);',
        '• chiedere di limitarne il trattamento (art. 18);',
        '• riceverli in un formato strutturato e leggibile da un dispositivo, e trasmetterli a un altro titolare (portabilità, art. 20);',
        '• opporti in qualsiasi momento ai trattamenti basati sul nostro legittimo interesse, per motivi legati alla tua situazione particolare (art. 21);',
        '• revocare il consenso alla newsletter in qualsiasi momento, senza che ciò pregiudichi la liceità del trattamento fatto prima della revoca (art. 7).',
        'Molti di questi diritti puoi esercitarli da solo in Impostazioni: modificare il profilo, scaricare tutti i tuoi dati, cancellare l’account (con 30 giorni per ripensarci, vedi il punto 9), gestire newsletter e notifiche. Per tutto il resto scrivi a privacy@rientro.it. L’esercizio dei diritti è gratuito; potremmo chiederti di confermare la tua identità, per esempio scrivendoci dall’email del tuo account. Rispondiamo entro un mese, prorogabile di due mesi nei casi più complessi, e in quel caso ti avvisiamo.',
        'Se ritieni che il trattamento dei tuoi dati violi il GDPR, puoi proporre reclamo al Garante per la protezione dei dati personali (Piazza Venezia 11, 00187 Roma, www.garanteprivacy.it) o all’autorità di controllo del Paese in cui vivi o lavori.',
      ]],
      ['Minori', [
        'Rientro è riservato a persone che hanno compiuto 18 anni. Non raccogliamo consapevolmente dati di minori: se scopriamo che un account appartiene a un minore, lo cancelliamo insieme ai dati collegati. Se hai motivo di credere che un minore si sia iscritto, scrivici a privacy@rientro.it.',
      ]],
      ['Come proteggiamo i dati', [
        'Adottiamo misure tecniche e organizzative adeguate al rischio (art. 32 GDPR), tra cui: connessione cifrata (HTTPS) su tutto il sito, accesso senza password tramite codici monouso che conserviamo solo in forma cifrata (hash), sessioni conservate anch’esse in forma cifrata, limiti ai tentativi di accesso, accesso ai dati da parte del personale limitato a chi ne ha bisogno e registrato, dati ospitati nell’Unione europea.',
        'Nessun sistema è sicuro al 100%. Se dovesse verificarsi una violazione dei dati che presenta un rischio per te, la notificheremo al Garante entro 72 ore e, quando il rischio è elevato, ti informeremo senza ritardo (artt. 33 e 34 GDPR).',
      ]],
      ['Decisioni automatizzate', [
        'Non prendiamo decisioni basate unicamente su trattamenti automatizzati che producano effetti giuridici o incidano in modo analogo su di te (art. 22 GDPR). Ogni profilo viene letto da una persona prima di essere pubblicato, e le decisioni di moderazione sono prese da persone.',
      ]],
      ['Modifiche a questa informativa', [
        'Potremo aggiornare questa informativa, per esempio quando attiveremo nuove funzioni come l’accesso delle aziende. In cima alla pagina trovi sempre la data dell’ultimo aggiornamento e la versione. Se le modifiche sono rilevanti te lo comunicheremo prima via email o dentro Rientro, e ti chiederemo di prenderne visione al primo accesso successivo.',
      ]],
    ],
    purposes: [
      ['Creare e gestire il tuo account', 'Registrazione, accesso con codice via email o con LinkedIn e Google, sessioni, assistenza.', 'Email, dati ricevuti da LinkedIn o Google, dati tecnici di sessione.', 'Esecuzione del contratto, cioè dei Termini che accetti iscrivendoti (art. 6.1.b).'],
      ['Farti conoscere e far funzionare la community', 'Mostrare il tuo profilo agli altri membri, suggerirti persone affini, gestire richieste di connessione, messaggi e notifiche in app.', 'Dati del profilo, connessioni, messaggi.', 'Esecuzione del contratto (art. 6.1.b).'],
      ['Email di servizio', 'Codice di accesso, avvisi su nuove richieste, messaggi e stato del profilo, conferma della richiesta di cancellazione dell’account, comunicazioni importanti sul servizio e sui tuoi dati. Dalle impostazioni scegli quali notifiche ricevere via email.', 'Email, dati necessari al singolo avviso.', 'Esecuzione del contratto (art. 6.1.b).'],
      ['Newsletter e comunicazioni promozionali', 'Novità su Rientro, eventi e iniziative. Solo se ci dai il consenso; puoi revocarlo quando vuoi dalle impostazioni o dal link in ogni email.', 'Email, nome.', 'Consenso (art. 6.1.a), separato e facoltativo.'],
      ['Visibilità alle aziende verificate (in arrivo)', 'Permettere alle aziende registrate e verificate di trovare il tuo profilo e contattarti dentro Rientro. Prima dell’attivazione ti avviseremo e potrai scegliere di non essere visibile.', 'Dati del profilo visibili ai membri.', 'Esecuzione del contratto (art. 6.1.b): è parte del servizio descritto nei Termini.'],
      ['Sicurezza, moderazione e prevenzione degli abusi', 'Rivedere i profili prima della pubblicazione, gestire segnalazioni e blocchi, prevenire accessi abusivi, spam e profili falsi.', 'Dati del profilo, segnalazioni, conversazioni oggetto di segnalazione, dati tecnici (incluso l’indirizzo IP).', 'Legittimo interesse a garantire una community sicura e affidabile (art. 6.1.f). Puoi opporti scrivendo a privacy@rientro.it.'],
      ['Statistiche anonime', 'Contare iscritti e attività in forma aggregata per migliorare il servizio e mostrare nelle pagine pubbliche quante persone rientrano in una città (mai gruppi sotto le 5 persone).', 'Dati aggregati, che non identificano nessuno.', 'Legittimo interesse a migliorare e far conoscere il servizio (art. 6.1.f).'],
      ['Dimostrare di aver rispettato le tue scelte e la legge', 'Registrare quando hai dato o revocato il consenso alla newsletter e preso visione dei documenti legali; rispondere a richieste delle autorità; difendere i nostri diritti.', 'Registro pseudonimo delle scelte, versioni dei documenti, dati strettamente necessari.', 'Obbligo di legge (art. 6.1.c, in relazione agli artt. 5.2 e 7.1 GDPR) e legittimo interesse alla difesa in giudizio (art. 6.1.f).'],
    ],
  },
  termini: {
    title: 'Termini e condizioni', updated: 'AGGIORNATI IL [DATA]', draft: true,
    summary: [
      ['A cosa serve', 'Trovare co-founder e persone con cui creare un progetto in Italia.'],
      ['Profili rivisti', 'Ogni profilo viene letto da una persona del team prima di andare online.'],
      ['Rispetto', 'Messaggi solo dopo l’accettazione. Segnalazioni e blocchi sempre disponibili.'],
      ['Gratuito', 'Al lancio, per tutti.'],
    ],
    sections: [
      ['Oggetto del servizio', ['[TESTO LEGALE DA FORNIRE]']], ['Iscrizione', ['[REQUISITI DI ISCRIZIONE]']], ['Regole di condotta', ['[REGOLE, MODERAZIONE E SOSPENSIONE]']],
      ['Contenuti', ['[PROPRIETÀ DEI CONTENUTI E LICENZA D’USO]']], ['Responsabilità', ['[LIMITAZIONI DI RESPONSABILITÀ]']], ['Legge applicabile', ['[LEGGE APPLICABILE, FORO COMPETENTE, MODIFICHE AI TERMINI]']],
    ],
  },
  cookie: {
    title: 'Cookie Policy', updated: 'AGGIORNATA IL 30 SETTEMBRE 2026',
    summary: [
      ['Solo un cookie tecnico', 'Usiamo solo il cookie necessario a tenerti connesso dopo l’accesso.'],
      ['Nessun tracciamento', 'Niente cookie di analisi, profilazione o pubblicità, e nessun servizio di terze parti caricato dalle pagine. Per questo non ti mostriamo un banner.'],
    ],
    sections: [
      ['Cosa sono i cookie', ['I cookie sono piccoli file di testo che un sito salva nel tuo browser. Alcuni sono tecnici, cioè necessari al funzionamento del sito; altri servono a misurare le visite o a mostrare pubblicità e richiedono il tuo consenso (art. 122 del D.lgs. 196/2003 e Linee guida del Garante del 10 giugno 2021).']],
      ['Cookie che usiamo', [
        '• Nome: __Host-rientro_session. Tipo: tecnico, di prima parte. Finalità: mantenere la sessione dopo l’accesso. Durata: 30 giorni, oppure fino a quando esci da Rientro. Il cookie è protetto (HttpOnly, Secure, SameSite=Lax) e contiene solo un codice casuale: non contiene dati personali leggibili.',
        'Essendo strettamente necessario, questo cookie non richiede il tuo consenso. Se lo blocchi dalle impostazioni del browser non potrai accedere all’area riservata.',
      ]],
      ['Servizi di terze parti', ['Le pagine di Rientro non caricano risorse da servizi esterni: anche i caratteri tipografici sono ospitati sui nostri server. Visitare il sito non comunica quindi il tuo indirizzo IP a terzi. Se accedi con LinkedIn o Google verrai indirizzato alle loro pagine, dove si applicano le rispettive cookie policy.']],
      ['Memoria locale del browser', ['Per alcune comodità, come ricordare una scelta dell’interfaccia, il sito può usare la memoria locale del tuo browser. Questi dati restano sul tuo dispositivo, non ci vengono inviati e non servono a tracciarti.']],
      ['Modifiche', ['Se in futuro aggiungeremo strumenti di analisi o altri cookie non tecnici, te lo chiederemo prima con un banner in cui “Rifiuta” e “Accetta” avranno la stessa evidenza, e registreremo la tua scelta. Per domande: privacy@rientro.it.']],
    ],
  },
};

export default class extends Page {
  async load() {
    this.state.legal = await fetch('/api/legal').then(r => r.json()).catch(() => null);
    const doc = DOCS[this.props.params.doc];
    document.title = `${doc.title} · Rientro`;
    if (location.hash) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
  }

  renderVals() {
    const key = this.props.params.doc;
    const doc = DOCS[key];
    const tabs = [['privacy', 'Privacy Policy'], ['termini', 'Termini'], ['cookie', 'Cookie Policy']]
      .map(([k, l]) => ({ l, href: `/legal/${k}`, cur: k === key ? 'page' : false, bg: k === key ? '#1A1726' : 'transparent', fg: k === key ? '#FFFFFF' : '#6B6680' }));
    // Paragraphs starting with "• " are list items; a section marked 'purposes' shows the purpose cards
    const sections = doc.sections.map(([t, ps, extra], i) => ({
      id: `s${i + 1}`, t: `${i + 1}. ${t}`,
      ps: ps.map(p => p.startsWith('• ') ? { p: p.slice(2), cls: 'legal-li' } : { p, cls: 'legal-p' }),
      isPurposes: extra === 'purposes',
    }));
    return {
      tabs, title: doc.title, updated: doc.updated, version: this.state.legal?.versions?.[key === 'termini' ? 'terms' : key === 'cookie' ? 'cookies' : 'privacy'] ?? '',
      summary: doc.summary.map(([t, d]) => ({ t, d })), sections,
      menu: [{ l: 'In breve', href: '#in-breve' }, ...sections.map(s => ({ l: s.t, href: `#${s.id}` }))],
      purposes: (doc.purposes ?? []).map(([t, what, data, basis]) => ({ t, what, data, basis })),
      draft: !!doc.draft,
    };
  }
}

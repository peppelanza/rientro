// Legal pages (design 05 · 43b "riassunto prima del testo"): Privacy Policy, Termini e condizioni and
// Cookie Policy: Privacy of 4 October 2026 (the age stays private; no review before publishing), Termini of 4 October 2026 (no review before publishing), Cookie of 7 October 2026 (the Google sign-in cookie).
// Changing one: bump its LEGAL_VERSIONS entry (before launch, as for the groups, not needed: nobody to ask).
// No cookie banner (43c): only technical cookies; visit statistics without cookies (Cloudflare Web Analytics).
import { Page } from './_base.js';

export const title = 'Informazioni legali';

// Also read by the server (src/seo.js): the text written into the page for search engines
export const DOCS = {
  privacy: {
    title: 'Privacy Policy', updated: 'AGGIORNATA IL 4 OTTOBRE 2026',
    summary: [
      ['Cosa raccogliamo', 'L’email per accedere, quello che scrivi nel tuo profilo, le connessioni e i messaggi, e pochi dati tecnici per la sicurezza. Non la data di nascita.'],
      ['Chi lo vede', 'Il tuo profilo, solo gli altri membri di Rientro e, quando attiveremo la funzione, aziende verificate dentro Rientro. Instagram, X e calendario solo le tue connessioni. Mai la tua email. Quello che scrivi nei gruppi invece è pubblico, con il tuo nome, cognome e foto, e può comparire sui motori di ricerca.'],
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
        '• Profilo: nome e cognome, foto, video di presentazione (facoltativo), anno di nascita (non lo mostriamo agli altri utenti), paese e città in cui vivi, da dove sei rientrato e in quale periodo, comuni in cui vorresti vivere, obiettivo (per esempio avviare un progetto o fare rete) e l’eventuale idea che vuoi sviluppare, area professionale, ruolo e azienda attuali, anni di esperienza, formazione ed esperienze lavorative, un risultato di cui vai fiero, settori di interesse, le persone e le competenze che cerchi, tempo che puoi dedicare e quando vuoi iniziare, cosa ti manca dell’Italia, link facoltativi (LinkedIn, sito, Instagram, X, calendario) e come hai conosciuto Rientro.',
        '• Comunicazioni: le note che accompagnano le richieste di connessione, i messaggi che scambi con le tue connessioni, i post (testi e foto) e i commenti che pubblichi nei gruppi, le segnalazioni che invii e il motivo, facoltativo, per cui cancelli l’account.',
        '• Preferenze: le tue scelte su newsletter e notifiche, e le conferme di presa visione dei nostri documenti legali.',
        'Dati che riceviamo se accedi con LinkedIn o Google: se scegli di accedere tramite uno di questi servizi, riceviamo da loro soltanto i dati che autorizzi nella schermata del fornitore, di norma nome, cognome, indirizzo email e foto del profilo. Non riceviamo mai la tua password e non pubblichiamo nulla sui tuoi account. Se non hai ancora una foto su Rientro, usiamo la foto del tuo account come foto profilo iniziale solo se mostra un volto; puoi cambiarla quando vuoi.',
        'Controllo del volto: quando carichi una foto profilo verifichiamo che mostri un volto. Il controllo avviene soltanto nel tuo browser, con un modello ospitato sui nostri server: la foto non viene inviata a terzi e non ricaviamo né conserviamo dati biometrici.',
        'Contenuti espliciti: sempre nel tuo browser, un secondo controllo automatico verifica che la foto non sia un contenuto esplicito (nudo o pornografia). Se lo è, la foto non viene pubblicata, l’account viene sospeso e l’immagine arriva soltanto a noi per una verifica manuale: se il blocco era un errore diventa la tua foto profilo, riattiviamo l’account e te lo comunichiamo via email; altrimenti la cancelliamo appena verificata e comunque entro 30 giorni. Base giuridica: il nostro legittimo interesse a proteggere gli utenti e la piattaforma (art. 6.1.f).',
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
        '• Gli altri membri di Rientro vedono il tuo profilo da quando lo pubblichi. Instagram, X e il link al calendario sono visibili solo alle persone con cui sei connesso. La tua email non viene mai mostrata a nessuno.',
        '• Le tue connessioni vedono i messaggi che vi scambiate: i messaggi sono visibili solo a chi partecipa alla conversazione.',
        '• Gruppi: i post (testi e foto) e i commenti che pubblichi nei gruppi sono pubblici. Chiunque, anche senza essere iscritto a Rientro, può leggerli insieme al tuo nome, cognome e foto, e le pagine dei gruppi possono essere indicizzate dai motori di ricerca (per esempio Google). Il resto del tuo profilo resta riservato ai membri: per vederlo bisogna iscriversi. Puoi eliminare i tuoi post e commenti in qualsiasi momento; scrivere nei gruppi è facoltativo.',
        '• Aziende verificate: stiamo preparando la possibilità per le aziende di registrarsi a Rientro e contattare i membri dentro la piattaforma, come avviene su LinkedIn. Quando la attiveremo, le aziende verificate vedranno il tuo profilo come lo vedono i membri e potranno scriverti tramite Rientro; non riceveranno la tua email né altri dati fuori dalla piattaforma. Prima dell’attivazione ti avviseremo e troverai nelle impostazioni un interruttore per non essere visibile alle aziende.',
        '• Il pubblico non vede il tuo profilo: fuori da Rientro compaiono soltanto il tuo nome, cognome e foto accanto a quello che scrivi nei gruppi. Le altre pagine pubbliche del sito, come quelle dedicate alle città, mostrano solo numeri aggregati, e mai gruppi di meno di 5 persone.',
        '• Il titolare e le persone autorizzate che lo aiutano a gestire Rientro, vincolate alla riservatezza, accedono ai dati solo quando serve: per rivedere i profili prima della pubblicazione, gestire le segnalazioni e dare assistenza. Ogni accesso dell’area di amministrazione ai dati personali viene registrato. In caso di segnalazione, un moderatore può leggere la conversazione tra chi segnala e la persona segnalata.',
        '• I fornitori che ci aiutano a far funzionare il servizio, indicati al punto 7, nominati responsabili del trattamento (art. 28 GDPR).',
        '• Autorità pubbliche e giudiziarie, solo quando la legge ci obbliga.',
        'Non vendiamo i tuoi dati personali e non li cediamo a terzi per loro finalità di marketing.',
      ]],
      ['Fornitori e trasferimenti fuori dall’Unione europea', [
        'Ci affidiamo a pochi fornitori, scelti per le garanzie che offrono e vincolati da un accordo sul trattamento dei dati:',
        '• Render Services, Inc. (Stati Uniti): hosting del sito e del database. I server che usiamo si trovano a Francoforte, in Germania, quindi i dati sono conservati nell’Unione europea.',
        '• Brevo (Sendinblue SAS, Francia): invio delle email di servizio (per esempio il codice di accesso e le notifiche) e, se ci hai dato il consenso, della newsletter.',
        '• Cloudflare, Inc. (Stati Uniti): verifica anti-bot (Turnstile) quando chiedi il codice di accesso, per proteggere il servizio da iscrizioni automatiche, e statistiche aggregate delle visite senza cookie (Web Analytics). Il trasferimento verso gli Stati Uniti è coperto dal Data Privacy Framework UE-USA e dalle clausole contrattuali standard.',
        'Se accedi con LinkedIn o Google, LinkedIn Ireland Unlimited Company e Google Ireland Limited trattano i dati relativi al tuo accesso come titolari autonomi, secondo le rispettive informative privacy.',
        'Alcuni fornitori hanno sede o sub-fornitori fuori dallo Spazio economico europeo, in particolare negli Stati Uniti. In questi casi il trasferimento avviene solo con le garanzie previste dal GDPR: la decisione di adeguatezza della Commissione europea per le aziende aderenti all’EU-U.S. Data Privacy Framework oppure le Clausole contrattuali standard approvate dalla Commissione (artt. 45 e 46 GDPR). Puoi chiederci copia delle garanzie scrivendo a privacy@rientro.it.',
      ]],
      ['Cookie', [
        'Usiamo solo cookie tecnici, necessari a tenerti connesso e a far funzionare l’accesso. Non usiamo cookie di analisi, di profilazione o pubblicitari, e i caratteri tipografici del sito sono ospitati sui nostri server.',
        'Statistiche delle visite: per sapere quante persone visitano il sito, da dove arrivano (per esempio da LinkedIn o da Google) e quali pagine guardano, usiamo Cloudflare Web Analytics. Non usa cookie né altri identificativi salvati sul tuo dispositivo e non ti segue su altri siti: Cloudflare riceve il tuo indirizzo IP e informazioni tecniche sulla visita (pagina, provenienza, paese, tipo di dispositivo e browser) e ci restituisce solo numeri aggregati. Non la usiamo nelle pagine di amministrazione. Base giuridica: il nostro legittimo interesse a capire come viene usato il sito e a migliorarlo (art. 6.1.f). Trovi i dettagli nella Cookie Policy.',
      ]],
      ['Per quanto tempo conserviamo i dati', [
        'Conserviamo i dati solo per il tempo necessario alle finalità per cui li raccogliamo. Le cancellazioni indicate qui sotto avvengono automaticamente, ogni giorno:',
        '• Account e profilo: finché non cancelli l’account, che puoi fare in qualsiasi momento da Impostazioni. Dalla richiesta il tuo profilo non è più visibile a nessuno e vieni disconnesso; per 30 giorni puoi ripensarci semplicemente accedendo di nuovo, e ritrovi tutto com’era. Trascorsi i 30 giorni cancelliamo definitivamente l’account e tutti i dati collegati. Se preferisci la cancellazione immediata, scrivici a privacy@rientro.it.',
        '• Messaggi e connessioni: finché l’account di uno dei due partecipanti non viene cancellato definitivamente.',
        '• Post e commenti nei gruppi, con le loro foto: finché non li elimini tu o finché il tuo account non viene cancellato definitivamente. Dalla richiesta di cancellazione non sono più visibili a nessuno. Le foto caricate per un post mai pubblicato vengono cancellate il giorno dopo.',
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
        'Non prendiamo decisioni basate unicamente su trattamenti automatizzati che producano effetti giuridici o incidano in modo analogo su di te (art. 22 GDPR). L’unico controllo automatico riguarda le foto: un’immagine esplicita viene bloccata prima di essere pubblicata e, se era la foto del profilo, l’account viene sospeso in via cautelativa; una persona del team rivede ogni caso e può annullare la sospensione. Le altre decisioni di moderazione, come quelle sulle segnalazioni, sono prese da persone.',
      ]],
      ['Modifiche a questa informativa', [
        'Potremo aggiornare questa informativa. In cima alla pagina trovi sempre la data dell’ultimo aggiornamento. Se le modifiche sono rilevanti te lo comunicheremo prima via email o dentro Rientro, e ti chiederemo di prenderne visione al primo accesso successivo.',
      ]],
    ],
    purposes: [
      ['Creare e gestire il tuo account', 'Registrazione, accesso con codice via email o con LinkedIn e Google, sessioni, assistenza.', 'Email, dati ricevuti da LinkedIn o Google, dati tecnici di sessione.', 'Esecuzione del contratto, cioè dei Termini che accetti iscrivendoti (art. 6.1.b).'],
      ['Farti conoscere e far funzionare la community', 'Mostrare il tuo profilo agli altri membri, suggerirti persone affini, gestire richieste di connessione, messaggi e notifiche in app.', 'Dati del profilo, connessioni, messaggi.', 'Esecuzione del contratto (art. 6.1.b).'],
      ['Gruppi', 'Pubblicare i post (testi e foto) e i commenti che scrivi nei gruppi, visibili a chiunque anche fuori da Rientro e indicizzabili dai motori di ricerca, insieme al tuo nome, cognome e foto.', 'Post con le loro foto, commenti, nome, cognome e foto profilo.', 'Esecuzione del contratto (art. 6.1.b): sei tu a scegliere di scrivere in un gruppo.'],
      ['Email di servizio', 'Codice di accesso, avvisi su nuove richieste e messaggi, conferma della richiesta di cancellazione dell’account, comunicazioni importanti sul servizio e sui tuoi dati. Dalle impostazioni scegli quali notifiche ricevere via email.', 'Email, dati necessari al singolo avviso.', 'Esecuzione del contratto (art. 6.1.b).'],
      ['Newsletter e comunicazioni promozionali', 'Novità su Rientro, eventi e iniziative. Solo se ci dai il consenso; puoi revocarlo quando vuoi dalle impostazioni o dal link in ogni email.', 'Email, nome.', 'Consenso (art. 6.1.a), separato e facoltativo.'],
      ['Visibilità alle aziende verificate (in arrivo)', 'Permettere alle aziende registrate e verificate di trovare il tuo profilo e contattarti dentro Rientro. Prima dell’attivazione ti avviseremo e potrai scegliere di non essere visibile.', 'Dati del profilo visibili ai membri.', 'Esecuzione del contratto (art. 6.1.b): è parte del servizio descritto nei Termini.'],
      ['Sicurezza, moderazione e prevenzione degli abusi', 'Rivedere i profili prima della pubblicazione, gestire segnalazioni e blocchi, prevenire accessi abusivi, spam e profili falsi.', 'Dati del profilo, segnalazioni, conversazioni oggetto di segnalazione, dati tecnici (incluso l’indirizzo IP).', 'Legittimo interesse a garantire una community sicura e affidabile (art. 6.1.f). Puoi opporti scrivendo a privacy@rientro.it.'],
      ['Statistiche anonime', 'Contare iscritti e attività in forma aggregata per migliorare il servizio e mostrare nelle pagine pubbliche quante persone rientrano in una città (mai gruppi sotto le 5 persone).', 'Dati aggregati, che non identificano nessuno.', 'Legittimo interesse a migliorare e far conoscere il servizio (art. 6.1.f).'],
      ['Dimostrare di aver rispettato le tue scelte e la legge', 'Registrare quando hai dato o revocato il consenso alla newsletter e preso visione dei documenti legali; rispondere a richieste delle autorità; difendere i nostri diritti.', 'Registro pseudonimo delle scelte, versioni dei documenti, dati strettamente necessari.', 'Obbligo di legge (art. 6.1.c, in relazione agli artt. 5.2 e 7.1 GDPR) e legittimo interesse alla difesa in giudizio (art. 6.1.f).'],
    ],
  },
  termini: {
    title: 'Termini e condizioni', updated: 'AGGIORNATI IL 4 OTTOBRE 2026',
    summary: [
      ['A cosa serve', 'Conoscere persone che rientrano in Italia o al Sud, per fare rete o costruire un progetto insieme.'],
      ['Profili veri', 'Un account a testa, con dati veri. Il profilo è visibile agli altri membri appena lo pubblichi; segnalazioni e moderazione sono gestite da persone del team.'],
      ['Rispetto', 'Messaggi solo dopo che una richiesta di connessione è stata accettata. Segnalazioni e blocchi sempre disponibili.'],
      ['Gratuito', 'Iscriversi e usare Rientro è gratuito. Puoi cancellare il tuo account quando vuoi.'],
    ],
    sections: [
      ['Chi siamo e a cosa servono questi Termini', [
        'Rientro è un servizio gestito da Giuseppe Lanzafame, Via Curia 9, Catania (CT), Italia (di seguito “Rientro”, “noi”). Per qualsiasi comunicazione scrivi a privacy@rientro.it.',
        'Questi Termini regolano l’uso del sito rientro.it e dei servizi di Rientro. Iscrivendoti dichiari di averli letti e di accettarli. Il modo in cui trattiamo i tuoi dati personali è descritto nella Privacy Policy, che fa parte di questo accordo insieme alla Cookie Policy.',
      ]],
      ['Il servizio', [
        'Rientro è una community online per chi è rientrato, sta per rientrare o pensa di rientrare in Italia o al Sud. Permette di creare un profilo, scoprire altre persone, inviare richieste di connessione e, una volta accettate, scambiarsi messaggi.',
        'Fino alla data di lancio indicata sul sito (1° gennaio 2027) puoi iscriverti e preparare il tuo profilo; la ricerca delle persone, le connessioni e i messaggi si attivano dal lancio.',
        'In futuro potremo permettere ad aziende registrate e verificate di trovare i profili e contattare i membri dentro Rientro, secondo quanto descritto nella Privacy Policy. Te lo comunicheremo prima e potrai scegliere di non essere visibile alle aziende.',
        'Rientro mette in contatto le persone ma non partecipa ai rapporti che nascono tra loro: non è un’agenzia per il lavoro, non fa intermediazione, non offre consulenza legale, fiscale o finanziaria e non garantisce che troverai un socio, un progetto o un lavoro. Le guide pubblicate sul sito, come quella sul rientro dei cervelli, hanno scopo informativo e non sostituiscono il parere di un professionista.',
      ]],
      ['Chi può iscriversi', [
        '• Devi avere almeno 18 anni.',
        '• Puoi avere un solo account, personale: non puoi crearlo per conto di altri né cederlo.',
        '• Le informazioni che inserisci devono essere vere, aggiornate e riferite a te, a partire da nome, foto e video.',
        '• Accedi con un codice monouso inviato alla tua email oppure con LinkedIn o Google. Sei responsabile di custodire l’accesso alla tua email e ai tuoi account collegati: tutto ciò che avviene con il tuo account si presume fatto da te. Se sospetti un accesso non autorizzato, esci da tutti i dispositivi dalle impostazioni e scrivici.',
      ]],
      ['Pubblicazione e controllo dei profili', [
        'Il tuo profilo è visibile agli altri membri appena lo pubblichi alla fine dell’iscrizione, e le modifiche successive compaiono subito. Dopo la pubblicazione possiamo controllare i profili, anche con l’aiuto di controlli automatici sulle foto, e in base alle segnalazioni: se un profilo non rispetta questi Termini, sembra falso o non è in linea con lo scopo di Rientro, possiamo chiederti di correggerlo, nasconderlo o sospendere l’account, spiegandoti il motivo.',
      ]],
      ['Regole di condotta', [
        'Rientro funziona se ci si può fidare delle persone che si incontrano. Per questo, usando il servizio, ti impegni a non:',
        '• creare profili falsi, usare foto o dati di altre persone o spacciarti per qualcun altro;',
        '• molestare, minacciare, insultare o discriminare altri membri, anche per origine, genere, orientamento sessuale, religione, disabilità o opinioni;',
        '• inviare spam, catene, pubblicità o offerte commerciali non richieste, o usare Rientro per vendere servizi;',
        '• pubblicare o inviare contenuti illegali, sessualmente espliciti, violenti o che violino diritti di terzi, compresi diritto d’autore e marchi;',
        '• diffondere dati personali di altre persone, comprese le conversazioni private, senza il loro consenso;',
        '• raccogliere dati dal servizio con strumenti automatici (scraping, bot), aggirare le misure di sicurezza o interferire con il funzionamento del sito;',
        '• usare Rientro per scopi illeciti o in modo contrario allo scopo della community.',
        'Una richiesta di connessione rifiutata va rispettata: non insistere e non contattare la persona in altri modi usando dati ottenuti su Rientro.',
      ]],
      ['I contenuti che pubblichi', [
        'Testi, foto, video e messaggi che pubblichi restano tuoi. Ci concedi soltanto il permesso, gratuito e non esclusivo, di conservarli, adattarli tecnicamente (per esempio ridimensionare una foto o convertire un video) e mostrarli dentro Rientro alle persone che possono vederli secondo le tue impostazioni, per il solo scopo di far funzionare il servizio. I post e i commenti che scrivi nei gruppi, insieme al tuo nome, cognome e foto, sono invece pubblici: ci permetti di mostrarli a chiunque visiti il sito, anche senza account, e di farli indicizzare dai motori di ricerca. Il permesso termina quando cancelli il contenuto o l’account, salvo i tempi tecnici di cancellazione indicati nella Privacy Policy.',
        'Dichiari di avere il diritto di pubblicare ciò che carichi e che foto e video ritraggono te o persone che hanno acconsentito. Sei responsabile dei contenuti che pubblichi e dei messaggi che invii.',
      ]],
      ['Segnalazioni, moderazione e sospensione', [
        'Puoi segnalare un profilo o un messaggio e bloccare una persona in qualsiasi momento. Chiunque, anche senza account, può segnalarci contenuti che ritiene illegali scrivendo a privacy@rientro.it, indicando dove si trovano e perché li considera illegali: esaminiamo ogni segnalazione in modo diligente e obiettivo e informiamo chi l’ha fatta dell’esito, come previsto dal Regolamento UE 2022/2065 sui servizi digitali (Digital Services Act). L’indirizzo privacy@rientro.it è anche il punto di contatto per le autorità e per i destinatari del servizio ai sensi degli artt. 11 e 12 dello stesso Regolamento; puoi scriverci in italiano o in inglese.',
        'Se un contenuto o un comportamento viola questi Termini o la legge possiamo, in modo proporzionato alla gravità: rimuovere il contenuto, limitarne la visibilità, sospendere l’account o, nei casi gravi o ripetuti, chiuderlo. Salvo urgenze o obblighi di legge, ti informiamo della decisione spiegandone i motivi, e puoi chiederne il riesame scrivendo a privacy@rientro.it.',
        'Per gestire una segnalazione un moderatore può leggere la conversazione tra chi segnala e la persona segnalata, come descritto nella Privacy Policy.',
      ]],
      ['Proprietà intellettuale di Rientro', [
        'Il nome e il logo Rientro, il design del sito, i testi redazionali, le illustrazioni e il software sono di Rientro o dei rispettivi titolari e sono protetti dalla legge. Non puoi copiarli, modificarli o usarli al di fuori del normale uso del servizio senza il nostro permesso scritto.',
      ]],
      ['Gratuità del servizio', [
        'Iscriversi e usare Rientro è gratuito. Se in futuro introdurremo funzioni a pagamento te lo comunicheremo in anticipo con condizioni chiare e separate, e nessun addebito avverrà senza il tuo consenso esplicito. Le funzioni oggi gratuite descritte in questi Termini non diventeranno a pagamento per chi è già iscritto senza un preavviso e la possibilità di cancellare l’account.',
      ]],
      ['Disponibilità del servizio', [
        'Facciamo del nostro meglio perché Rientro sia sempre disponibile e sicuro, ma il servizio può avere interruzioni per manutenzione, aggiornamenti o cause che non dipendono da noi. Possiamo modificare, migliorare o togliere funzioni; se una modifica riduce in modo rilevante il servizio te lo comunichiamo per tempo.',
      ]],
      ['Responsabilità', [
        'Ogni membro è responsabile di ciò che pubblica e dei rapporti che instaura con gli altri. Rientro rivede i profili ma non può verificare tutto ciò che le persone dichiarano: usa prudenza prima di condividere dati personali, investire denaro o incontrare qualcuno di persona, e segnalaci ogni comportamento sospetto.',
        'Rientro risponde dei danni causati con dolo o colpa grave e negli altri casi in cui la legge non consente di limitare la responsabilità. Negli altri casi, trattandosi di un servizio gratuito, non rispondiamo di danni indiretti o di perdite legate all’uso che i membri fanno delle informazioni e dei contatti ottenuti tramite Rientro. Nulla in questi Termini limita i diritti che ti riconosce la legge come consumatore, in particolare il Codice del Consumo (D.lgs. 206/2005).',
      ]],
      ['Durata e cancellazione dell’account', [
        'Questo accordo dura finché hai un account. Puoi cancellarlo in qualsiasi momento da Impostazioni: il profilo sparisce subito e hai 30 giorni per ripensarci accedendo di nuovo, poi i dati vengono cancellati definitivamente, come descritto nella Privacy Policy.',
        'Possiamo chiudere un account in caso di violazioni gravi o ripetute di questi Termini, come indicato al punto 7. Se dovessimo interrompere del tutto il servizio, ti avviseremo con almeno 30 giorni di anticipo e potrai scaricare i tuoi dati prima della chiusura.',
      ]],
      ['Modifiche ai Termini', [
        'Possiamo aggiornare questi Termini, per esempio per nuove funzioni o nuove norme. Se le modifiche sono rilevanti te le comunichiamo via email o dentro Rientro almeno 15 giorni prima che si applichino, e ti chiederemo di prenderne visione al primo accesso successivo; se non sei d’accordo puoi cancellare l’account in qualsiasi momento. Le modifiche imposte dalla legge o necessarie per la sicurezza possono applicarsi subito.',
      ]],
      ['Legge applicabile e controversie', [
        'Questi Termini sono regolati dalla legge italiana. Se sei un consumatore restano salve le tutele inderogabili previste dalla legge del Paese in cui risiedi, e per qualsiasi controversia è competente il giudice del luogo in cui risiedi o hai il domicilio. Se usi Rientro per la tua attività professionale, è competente in via esclusiva il Foro di Catania.',
        'Prima di rivolgerti al giudice ti invitiamo a scriverci a privacy@rientro.it: la maggior parte dei problemi si risolve così. Resta ferma la possibilità di ricorrere agli strumenti di risoluzione extragiudiziale delle controversie previsti dalla legge, come la mediazione.',
      ]],
      ['Disposizioni finali', [
        'Se una clausola di questi Termini risultasse invalida, le altre restano valide. Il fatto che non facciamo valere un diritto in un determinato momento non significa che vi rinunciamo. Questi Termini sono redatti in italiano, che prevale su eventuali traduzioni.',
      ]],
    ],
  },
  cookie: {
    title: 'Cookie Policy', updated: 'AGGIORNATA IL 7 OTTOBRE 2026',
    summary: [
      ['Solo cookie tecnici', 'Usiamo solo i cookie necessari a tenerti connesso e a far funzionare l’accesso.'],
      ['Nessun tracciamento', 'Niente cookie di analisi, profilazione o pubblicità. Contiamo le visite con uno strumento che non usa cookie. Per questo non ti mostriamo un banner.'],
    ],
    sections: [
      ['Cosa sono i cookie', ['I cookie sono piccoli file di testo che un sito salva nel tuo browser. Alcuni sono tecnici, cioè necessari al funzionamento del sito; altri servono a misurare le visite o a mostrare pubblicità e richiedono il tuo consenso (art. 122 del D.lgs. 196/2003 e Linee guida del Garante del 10 giugno 2021).']],
      ['Cookie che usiamo', [
        '• Nome: __Secure-rientro_session. Tipo: tecnico, di prima parte (valido su rientro.it e sui suoi sottodomini). Finalità: mantenere la sessione dopo l’accesso. Durata: 30 giorni, oppure fino a quando esci da Rientro. Il cookie è protetto (HttpOnly, Secure, SameSite=Lax) e contiene solo un codice casuale: non contiene dati personali leggibili.',
        '• Nome: rientro_li_state. Tipo: tecnico, di prima parte. Finalità: proteggere l’accesso con LinkedIn da richieste contraffatte. Durata: 10 minuti, solo durante l’accesso con LinkedIn.',
        '• Nome: rientro_g_state. Tipo: tecnico, di prima parte. Finalità: proteggere l’accesso con Google da richieste contraffatte. Durata: 10 minuti, solo durante l’accesso con Google.',
        '• Nome: rientro_flash. Tipo: tecnico, di prima parte. Finalità: mostrarti una sola volta un messaggio dopo l’accesso (per esempio quando un account viene ripristinato). Durata: 2 minuti.',
        'Essendo strettamente necessari, questi cookie non richiedono il tuo consenso. Se li blocchi dalle impostazioni del browser non potrai accedere all’area riservata.',
      ]],
      ['Servizi di terze parti', ['I caratteri tipografici e le librerie del sito sono ospitati sui nostri server. Le pagine caricano un solo servizio esterno, Cloudflare Web Analytics, che conta le visite senza usare cookie né altri identificativi salvati sul tuo dispositivo: Cloudflare riceve il tuo indirizzo IP e informazioni tecniche sulla visita, e a noi restituisce solo numeri aggregati. Nel passaggio in cui chiedi il codice di accesso via email usiamo anche Cloudflare Turnstile per verificare che non sia un programma automatico: anche in questo caso Cloudflare riceve il tuo indirizzo IP e alcune informazioni tecniche sul browser, senza cookie di profilazione. Se accedi con LinkedIn o Google verrai indirizzato alle loro pagine, dove si applicano le rispettive cookie policy.']],
      ['Memoria locale del browser', ['Per alcune comodità, come ricordare una scelta dell’interfaccia, il sito può usare la memoria locale del tuo browser. Questi dati restano sul tuo dispositivo, non ci vengono inviati e non servono a tracciarti.']],
      ['Modifiche', ['Se in futuro aggiungeremo strumenti di analisi o altri cookie non tecnici, te lo chiederemo prima con un banner in cui “Rifiuta” e “Accetta” avranno la stessa evidenza, e registreremo la tua scelta. Per domande: privacy@rientro.it.']],
    ],
  },
};

export default class extends Page {
  async load() {
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
      tabs, title: doc.title, updated: doc.updated,
      summary: doc.summary.map(([t, d]) => ({ t, d })), sections,
      tocProps: { items: [{ label: 'In breve', href: '#in-breve' }, ...sections.map(s => ({ label: s.t, href: `#${s.id}` }))] },
      purposes: (doc.purposes ?? []).map(([t, what, data, basis]) => ({ t, what, data, basis })),
    };
  }
}

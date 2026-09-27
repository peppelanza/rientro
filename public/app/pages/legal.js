// Legal pages (design 05 · 43b "riassunto prima del testo"). Texts are DRAFTS pending review by a
// qualified EU/Italian privacy professional; [BRACKETS] mark parts still to be provided.
// No cookie banner (43c): today only the technical session cookie is used.
import { Page } from './_base.js';

export const title = 'Informazioni legali';

const DOCS = {
  privacy: {
    title: 'Privacy Policy', updated: 'AGGIORNATA IL [DATA]',
    summary: [
      ['Cosa raccogliamo', 'Quello che scrivi nel profilo, i messaggi, e dati tecnici minimi. Non la data di nascita.'],
      ['Chi lo vede', 'Solo membri approvati. Instagram, X e calendario solo le tue connessioni. Mai la tua email.'],
      ['Cosa non facciamo', 'Non vendiamo i tuoi dati. Nessuna azienda ha accesso alla tua ricerca di lavoro. Non pubblichiamo nulla sui tuoi social.'],
      ['Il controllo è tuo', 'Scarica o elimina tutto dalle impostazioni, quando vuoi. Newsletter e ricerca di lavoro sono scelte separate e revocabili.'],
    ],
    sections: [
      ['Titolare del trattamento', ['[RAGIONE SOCIALE, SEDE, P.IVA, EMAIL DI CONTATTO] · DPO/referente privacy: [SE NOMINATO]']],
      ['Dati che raccogliamo', ['Account (email), profilo (nome, foto, fascia d’età, città, comuni desiderati, obiettivo, background, bio, link), preferenza facoltativa di ricerca lavoro e relativi dettagli, preferenza newsletter, connessioni e messaggi, dati tecnici di sessione.']],
      ['Perché li usiamo', ['Il dettaglio per finalità è qui sotto, generato dal registro dei trattamenti del sistema. Le basi giuridiche indicate sono proposte da confermare.'], 'register'],
      ['Chi li vede', ['Membri approvati (profilo interno), connessioni (link riservati), personale Rientro autorizzato (ogni accesso è registrato), fornitori tecnici nominati responsabili: [HOSTING, EMAIL — CON REGIONE UE E DPA].']],
      ['Per quanto tempo', ['Fino alla cancellazione dell’account. I dettagli della ricerca di lavoro vengono cancellati quando disattivi l’opzione. Il registro pseudonimo delle scelte è conservato per [36 MESI — DA CONFERMARE] dopo la cancellazione.']],
      ['I tuoi diritti', ['Accesso, rettifica, cancellazione, limitazione, portabilità, opposizione, revoca del consenso, reclamo al Garante per la protezione dei dati personali. Puoi esercitarne la maggior parte direttamente da Impostazioni → Privacy e I tuoi dati. [TESTO COMPLETO DA FORNIRE]']],
      ['Contatti', ['[EMAIL PRIVACY]']],
    ],
  },
  termini: {
    title: 'Termini e condizioni', updated: 'AGGIORNATI IL [DATA]',
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
    title: 'Cookie Policy', updated: 'AGGIORNATA IL [DATA]',
    summary: [
      ['Solo cookie tecnici', 'Oggi usiamo solo il cookie necessario a tenerti connesso.'],
      ['Nessun tracciamento', 'Niente cookie di analisi, profilazione o pubblicità. Per questo non ti mostriamo un banner.'],
    ],
    sections: [
      ['Cookie usati', ['rientro_session · tecnico · sessione di accesso · 30 giorni · HttpOnly']],
      ['Servizi di terze parti', ['I font sono caricati da Google Fonts. [VALUTARE CON IL CONSULENTE L’HOSTING LOCALE DEI FONT]']],
      ['Modifiche', ['Se in futuro aggiungeremo strumenti di analisi, chiederemo il tuo permesso con “Rifiuta” e “Accetta” equivalenti e registreremo la scelta.']],
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
    const reg = this.state.legal?.processing_register ?? [];
    const tabs = [['privacy', 'Privacy Policy'], ['termini', 'Termini'], ['cookie', 'Cookie Policy']]
      .map(([k, l]) => ({ l, href: `/legal/${k}`, cur: k === key ? 'page' : false, bg: k === key ? '#1A1726' : 'transparent', fg: k === key ? '#FFFFFF' : '#6B6680' }));
    const sections = doc.sections.map(([t, ps, extra], i) => ({ id: `s${i + 1}`, t: `${i + 1}. ${t}`, ps: ps.map(p => ({ p })), isRegister: extra === 'register' }));
    return {
      tabs, title: doc.title, updated: doc.updated, version: this.state.legal?.versions?.[key === 'termini' ? 'terms' : key === 'cookie' ? 'cookies' : 'privacy'] ?? '',
      summary: doc.summary.map(([t, d]) => ({ t, d })), sections,
      menu: [{ l: 'In breve', href: '#in-breve' }, ...sections.map(s => ({ l: s.t, href: `#${s.id}` }))],
      register: reg.map(r => ({ ...r })),
    };
  }
}

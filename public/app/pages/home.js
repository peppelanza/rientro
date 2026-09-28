import { Page, homeFor, peekMe } from './_base.js';

export const title = 'Rientra in Italia o al Sud e trova persone con cui costruire';

// Content copied from the design logic (Rientro 01 Landing e Accesso v2).
export const forWho = [
  { torna: true, t: 'Chi sta tornando', d: "Anni all'estero, competenze da riportare. Vuoi tornare con un progetto, non solo con un trasloco." },
  { pensa: true, t: 'Chi ci sta pensando', d: 'Non hai ancora deciso. Conoscere le persone giuste può essere il motivo per farlo.' },
  { tornato: true, t: 'Chi è già tornato', d: 'Sei rientrato da poco o da anni. Cerchi persone con un percorso come il tuo con cui costruire qualcosa qui.' },
];
// Homepage questions and answers (#domande), collapsed by default
const faq = [
  ['Cos’è Rientro?', 'Una community per chi torna in Italia, o al sud, e cerca persone con cui fondare un’azienda o un progetto.'],
  ['Quanto costa?', 'Niente. Rientro è gratuito.'],
  ['A chi è rivolto?', 'A chi sta tornando, a chi ci sta pensando e a chi è già tornato. Anche a chi non è italiano ma ha scelto l’Italia.'],
  ['Devo avere già un’idea?', 'No. Puoi avere un’idea e cercare un socio, oppure non averla ancora e cercare qualcuno con cui trovarla.'],
  ['Perché il mio profilo viene rivisto?', 'Ogni profilo viene letto da una persona prima di andare online. Così su Rientro non ci sono account vuoti o anonimi.'],
  ['Come trovo le persone?', 'Nella sezione Scopri filtri per città, settori, competenze e tempo a disposizione. Nessun punteggio: vedi le persone, non percentuali.'],
  ['Come funzionano i messaggi?', 'Invii una richiesta di connessione con una nota. La chat si apre solo se l’altra persona accetta.'],
  ['Chi può vedere il mio profilo?', 'Solo i membri di Rientro. Instagram, X e il link al calendario si vedono solo dopo che vi siete connessi.'],
  ['Posso cercare anche lavoro?', 'Sì, se vuoi. Nel profilo puoi indicare che cerchi lavoro in un’azienda italiana. È facoltativo e puoi toglierlo quando vuoi.'],
  ['Posso cancellare il mio account?', 'Sì, in qualsiasi momento, da Impostazioni › I tuoi dati. Da lì puoi anche scaricare una copia dei tuoi dati.'],
].map(([q, a]) => ({ q, a }));
const steps = [
  { n: '01', t: 'Crea il tuo profilo', d: 'Percorso, idea, dove vivi e dove vuoi vivere. Con LinkedIn si compila quasi da solo.' },
  { n: '02', t: 'Scopri persone', d: 'Filtra per città, settori, competenze e tempo. Nessun punteggio, solo persone.' },
  { n: '03', t: 'Connettiti e parla', d: 'Invii una richiesta. Se viene accettata, si apre la chat.' },
];
// Illustrative example profiles from the design (not real members).
const heroPeople = [['Giulia', 'Product Strategist', 'LONDRA', 'MILANO'], ['Marco', 'Software Engineer', 'BERLINO', 'CAGLIARI'], ['Sara', 'Product Designer', 'AMSTERDAM', 'TORINO'], ['Luca', 'Ex consulente strategico', 'NEW YORK', 'NAPOLI']]
  .map(([n, r, a, b], i) => ({ n, r, a, b, mt: i % 2 ? '36px' : '0' }));

// Time left until launch, as the four countdown tiles
const UNITS = [['d', 'Giorni', 86400], ['h', 'Ore', 3600], ['m', 'Minuti', 60], ['s', 'Secondi', 1]];
function timeLeft(at) {
  let s = Math.max(0, Math.floor((at - Date.now()) / 1000));
  return UNITS.map(([k, l, size]) => { const v = Math.floor(s / size); s -= v * size; return { k, l, v: String(v).padStart(2, '0') }; });
}

// One landing page. Before launch (LAUNCHED flag off and launch date ahead) the example
// profiles give way to a live countdown to the launch date.
export default class extends Page {
  async load() {
    const [me, launch] = await Promise.all([peekMe(), fetch('/api/public/launch').then(r => r.json()).catch(() => ({ launched: true }))]);
    Object.assign(this.state, { me, launched: launch.launched, launchAt: Date.parse(launch.launch_at) });
    if (!launch.launched) this.timer = setInterval(() => this.tick(), 1000);
  }
  componentWillUnmount() { clearInterval(this.timer); }

  // Updates the digits in place every second; reloads when the countdown ends
  tick() {
    if (Date.now() >= this.state.launchAt) { clearInterval(this.timer); location.reload(); return; }
    for (const { k, v } of timeLeft(this.state.launchAt)) {
      const el = document.querySelector(`[data-cd="${k}"]`);
      if (el && el.textContent !== v) el.textContent = v;
    }
  }

  renderVals() {
    const me = this.state.me;
    const prelaunch = this.state.launched === false;
    return {
      launched: this.state.launched !== false, prelaunch, forWho, steps, faq, heroPeople,
      countdown: prelaunch ? timeLeft(this.state.launchAt) : [],
      launchText: prelaunch ? 'Apre il ' + new Date(this.state.launchAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }).replace(/^1 /, '1° ') : '',
      countdownLabel: 'Tempo che manca al lancio',
      loginLabel: me ? 'Il tuo spazio' : 'Accedi', loginHref: me ? homeFor(me) : '/accedi',
      enter: () => { location.href = me ? homeFor(me) : '/accedi'; },
      how: () => document.getElementById('come-funziona')?.scrollIntoView(),
    };
  }
}

import { Page, homeFor, peekMe } from './_base.js';

export const title = 'Non tornare in Italia da solo';

// Before launch day "/" shows the pre-launch landing (design 01 Landing Pre-lancio).
export async function resolve() {
  const r = await fetch('/api/public/launch').then(x => x.json()).catch(() => ({ launched: true }));
  return r.launched ? null : 'prelancio';
}

// Content copied from the design logic (Rientro 01 Landing e Accesso v2).
export const forWho = [
  { t: 'Chi sta tornando', d: "Anni all'estero, competenze da riportare. Vuoi tornare con un progetto, non solo con un trasloco." },
  { t: 'Chi si trasferisce', d: "Non sei italiano ma hai scelto l'Italia. Ti serve qualcuno che conosca il contesto." },
  { t: 'Chi ci sta pensando', d: 'Non hai ancora deciso. Conoscere le persone giuste può essere il motivo per farlo.' },
];
export const principles = [
  { t: 'Profili rivisti a mano', d: 'Niente account vuoti o anonimi.' },
  { t: 'Nessun punteggio', d: 'Ti mostriamo cosa si completa, non percentuali.' },
  { t: 'Messaggi solo con consenso', d: "La chat si apre dopo l'accettazione." },
  { t: 'Gratuito', d: 'Al lancio, per tutti.' },
];
const steps = [
  { n: '01', t: 'Crea il tuo profilo', d: 'Percorso, idea, dove vivi e dove vuoi vivere. Con LinkedIn si compila quasi da solo.' },
  { n: '02', t: 'Lo rivediamo', d: 'Ogni profilo viene letto da una persona prima di andare online.' },
  { n: '03', t: 'Scopri persone', d: 'Filtra per città, settori, competenze e tempo. Nessun punteggio, solo persone.' },
  { n: '04', t: 'Connettiti e parla', d: 'Invii una richiesta. Se viene accettata, si apre la chat.' },
];
// Illustrative example profiles from the design (not real members).
const heroPeople = [['Giulia', 'Product Strategist', 'LONDRA', 'MILANO'], ['Marco', 'Software Engineer', 'BERLINO', 'CAGLIARI'], ['Sara', 'Product Designer', 'AMSTERDAM', 'TORINO'], ['Luca', 'Ex consulente strategico', 'NEW YORK', 'NAPOLI']]
  .map(([n, r, a, b], i) => ({ n, r, a, b, mt: i % 2 ? '36px' : '0' }));

export default class extends Page {
  async load() { this.state.me = await peekMe(); }
  renderVals() {
    const me = this.state.me;
    return {
      heroPeople, forWho, steps, principles,
      loginLabel: me ? 'Il tuo spazio' : 'Accedi', loginHref: me ? homeFor(me) : '/accedi',
      enter: () => { location.href = me ? homeFor(me) : '/accedi'; },
      how: () => document.getElementById('come-funziona')?.scrollIntoView(),
    };
  }
}

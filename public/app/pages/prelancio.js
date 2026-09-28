import { Page, homeFor, peekMe } from './_base.js';
import { forWho, principles } from './home.js';

export const title = 'Fai rete con chi torna · Apre il 1° gennaio 2027';

// Content copied from the design logic (Rientro 01 Landing Pre-lancio v2).
const steps = [
  { n: '01', t: 'Crea il tuo profilo', d: 'Percorso, idea, dove vivi e dove vuoi vivere. Con LinkedIn si compila quasi da solo.' },
  { n: '02', t: 'Lo rivediamo', d: 'Ogni profilo viene letto da una persona prima di andare online.' },
  { n: '03', t: 'Scopri persone', d: 'Dal 1° gennaio 2027. Filtra per città, settori, competenze e tempo.' },
  { n: '04', t: 'Connettiti e parla', d: 'Dal 1° gennaio 2027. Se la richiesta viene accettata, si apre la chat.' },
];

export default class extends Page {
  async load() { this.state.me = await peekMe(); }
  renderVals() {
    const me = this.state.me;
    return {
      forWho, steps, principles,
      loginLabel: me ? 'Il tuo spazio' : 'Accedi', loginHref: me ? homeFor(me) : '/accedi',
      enter: () => { location.href = me ? homeFor(me) : '/accedi'; },
      how: () => document.getElementById('come-funziona')?.scrollIntoView(),
    };
  }
}

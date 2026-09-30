import { Page, homeFor, peekMe } from './_base.js';

export const title = 'Rientro dei cervelli 2027: come funziona il regime impatriati';

const TOC = [
  ['#cose', 'Cos\'è il rientro dei cervelli'], ['#novita', 'Cosa cambia nel 2027'], ['#requisiti', 'I cinque requisiti'],
  ['#estero', 'Quanti anni all\'estero'], ['#redditi', 'Quali redditi'], ['#quanto', 'Quanto si risparmia'],
  ['#richiesta', 'Come si richiede'], ['#decadenza', 'Quando si perde'], ['#ricercatori', 'Docenti e ricercatori'],
  ['#confronto', 'Vecchio e nuovo regime'], ['#faq', 'Domande frequenti'],
];

export default class extends Page {
  async load() {
    this.state.me = await peekMe();
    document.querySelector('meta[name=description]')?.setAttribute('content',
      "Guida al rientro dei cervelli nel 2027: detassazione del 50% (60% con figli), requisiti, anni all'estero, limite di 600.000 euro, docenti e ricercatori e novità dal 2027.");
  }
  renderVals() {
    const me = this.state.me;
    return {
      enter: () => { location.href = me ? homeFor(me) : '/accedi'; },
      tocProps: { items: TOC.map(([href, label]) => ({ href, label })) },
      headerProps: { onEnter: () => { location.href = me ? homeFor(me) : '/accedi'; } },
    };
  }
}

import { Page, homeFor, peekMe } from './_base.js';

export const title = 'Rientro dei cervelli 2027: come funziona il regime impatriati';

export default class extends Page {
  async load() {
    this.state.me = await peekMe();
    document.querySelector('meta[name=description]')?.setAttribute('content',
      "Guida al rientro dei cervelli nel 2027: detassazione del 50% (60% con figli), requisiti, anni all'estero, limite di 600.000 euro, docenti e ricercatori e novità dal 2027.");
  }
  renderVals() {
    const me = this.state.me;
    return {
      loginLabel: me ? 'Il tuo spazio' : 'Accedi', loginHref: me ? homeFor(me) : '/accedi',
      enter: () => { location.href = me ? homeFor(me) : '/accedi'; },
    };
  }
}

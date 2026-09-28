import { Page, homeFor, peekMe } from './_base.js';

export const title = 'Rientro dei cervelli 2027: come funziona il regime impatriati';

export default class extends Page {
  async load() {
    this.state.me = await peekMe();
    document.querySelector('meta[name=description]')?.setAttribute('content',
      "Guida al rientro dei cervelli nel 2027: detassazione del 50% (60% con figli), requisiti, anni all'estero, limite di 600.000 euro, docenti e ricercatori e novità dal 2027.");
  }
  async componentDidMount() {
    addEventListener('scroll', this.onScroll, { passive: true });
    await super.componentDidMount();
    this.onScroll();
  }
  componentWillUnmount() { removeEventListener('scroll', this.onScroll); }

  // Highlights the guide link of the last section whose heading has reached the top
  onScroll = () => {
    const links = [...document.querySelectorAll('.toc-link')];
    let current = links[0];
    for (const a of links) {
      const section = document.querySelector(a.getAttribute('href'));
      if (section && section.getBoundingClientRect().top <= 140) current = a;
    }
    for (const a of links) a.setAttribute('aria-current', a === current ? 'true' : 'false');
  };

  renderVals() {
    const me = this.state.me;
    return {
      enter: () => { location.href = me ? homeFor(me) : '/accedi'; },
      headerProps: { onEnter: () => { location.href = me ? homeFor(me) : '/accedi'; } },
    };
  }
}

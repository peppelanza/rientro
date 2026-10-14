import { DCLogic } from '../../dc/runtime.js';
import { measureCover } from '../anchor-offset.js';
import { getMe, startLive, toastError } from '../lib.js';

// Base for pages: runs async load() after the first render, then re-renders.
export class Page extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { ready: false, error: null };
    // While a page shows its skeleton (see skeleton()), #app says so: app.css greys it out
    const own = this.renderVals.bind(this);
    this.renderVals = () => {
      const vals = own();
      document.getElementById('app')?.classList.toggle('skeleton', !!vals?.skeleton);
      return vals;
    };
  }

  // Loading: the page draws itself as it will be, from placeholder data shaped like the real one
  // (fake: the state it would have), and app.css turns every text into a bar of its size, every
  // photo and button into a grey shape of theirs. So the skeleton is exactly the page to come, and
  // nothing moves when the data arrives. Nothing in it can be used meanwhile.
  skeleton(fake) {
    const real = this.state;
    this.state = { ...real, ...fake };
    try { return { ...this.renderVals(), skeleton: true }; } finally { this.state = real; }
  }
  async componentDidMount() {
    try { await this.load?.(); } catch (err) {
      if (err.message !== 'unauthenticated') { this.state.error = err.message; toastError(err); }
    }
    this.state.ready = true;
    this.__rerender();
    // A member's page: the badges and the bell follow what happens, live (lib.js startLive)
    if (this.state.me?.user?.status === 'approved') {
      startLive();
      addEventListener('rientro:me', e => { if (this.state.me) { this.state.me = e.detail; this.__rerender(); } });
    }
    // Links like /#domande: the section only exists once the page has rendered its content
    if (location.hash.length > 1) setTimeout(() => { measureCover(); document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); });
  }
  // Pull to refresh (pull-refresh.js): fresh data, drawn over what's there. Pages whose load() does
  // more than fetching override it.
  async refresh() {
    try {
      await getMe(true); // fresh counts for the menus (load() reads the cached copy)
      await this.load?.();
    } catch (err) { toastError(err); }
  }
  // Wraps an async action: disables re-entry, shows errors as toasts, re-renders at the end.
  // For lists that follow the filters (Scopri, Cerca): the latest choice wins. A new one never waits
  // for the previous to finish (act would drop it); a reply that arrives after a newer request is
  // thrown away. fn gets current(): false once a newer request started.
  latest(fn) {
    return async (...args) => {
      const seq = (this.__seq = (this.__seq || 0) + 1);
      const current = () => seq === this.__seq;
      try { await fn(current, ...args); } catch (err) { if (current()) toastError(err); } finally { if (current()) this.__rerender(); }
    };
  }

  act(fn) {
    return async (...args) => {
      if (this.__busy) return;
      this.__busy = true;
      try { await fn(...args); } catch (err) { toastError(err); } finally { this.__busy = false; this.__rerender(); }
    };
  }
}

// Session probe that doesn't redirect (public pages).
export async function peekMe() {
  const r = await fetch('/api/session');
  return r.ok ? r.json() : null;
}

export const homeFor = me => (!me ? '/accedi'
  : me.user.status === 'onboarding' ? '/onboarding' : me.launched ? '/scopri' : '/benvenuto');

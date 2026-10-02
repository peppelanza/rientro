import { DCLogic } from '../../dc/runtime.js';
import { toastError } from '../lib.js';

// Base for pages: runs async load() after the first render, then re-renders.
export class Page extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { ready: false, error: null };
  }
  async componentDidMount() {
    try { await this.load?.(); } catch (err) {
      if (err.message !== 'unauthenticated') { this.state.error = err.message; toastError(err); }
    }
    this.state.ready = true;
    this.__rerender();
    // Links like /#domande: the section only exists once the page has rendered its content
    if (location.hash.length > 1) setTimeout(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView());
  }
  // Wraps an async action: disables re-entry, shows errors as toasts, re-renders at the end.
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

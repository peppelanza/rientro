import { api, qs } from '../lib.js';
import { Page } from './_base.js';

export const title = 'Accedi a Rientro';

export default class extends Page {
  constructor(props) {
    super(props);
    Object.assign(this.state, {
      step: 'choose', email: '', marketing: false, code: ['', '', '', '', '', ''], codeError: null,
      emailError: null, busy: false, devCode: null, oauthNote: null, resendAt: 0,
    });
    this.timer = setInterval(() => { if (this.state.step === 'code') this.__rerender?.(); }, 1000);
  }

  async sendCode(e) {
    e?.preventDefault?.();
    const email = this.state.email.trim();
    if (!/^\S+@\S+\.\S{2,}$/.test(email)) { this.state.emailError = 'Inserisci un indirizzo email valido.'; this.__rerender(); return; }
    this.state.busy = true; this.state.emailError = null; this.__rerender();
    try {
      const r = await api('POST', '/api/auth/request-code', { email, marketing_opt_in: this.state.marketing });
      Object.assign(this.state, { step: 'code', devCode: r.dev_code ?? null, code: ['', '', '', '', '', ''], codeError: null, resendAt: Date.now() + 45_000 });
    } catch (err) { this.state.emailError = err.message; }
    this.state.busy = false;
    this.__rerender();
    document.querySelector('[data-key="code-0"]')?.focus();
  }

  async verify() {
    const code = this.state.code.join('');
    if (code.length !== 6 || this.state.busy) return;
    this.state.busy = true; this.__rerender();
    try {
      const r = await api('POST', '/api/auth/verify-code', { email: this.state.email.trim(), code });
      const next = qs().get('next');
      location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : r.next;
      return;
    } catch (err) {
      this.state.codeError = err.code === 'invalid_code' ? 'Codice non valido. Controlla l’ultima email ricevuta.' : err.message;
    }
    this.state.busy = false;
    this.__rerender();
  }

  setDigits(from, text) {
    const chars = text.replace(/\D/g, '').split('');
    chars.forEach((c, i) => { if (from + i < 6) this.state.code[from + i] = c; });
    this.state.codeError = null;
    this.__rerender();
    const next = Math.min(from + chars.length, 5);
    document.querySelector(`[data-key="code-${next}"]`)?.focus();
    if (this.state.code.every(Boolean)) this.verify();
  }

  renderVals() {
    const s = this.state;
    const oauth = provider => () => {
      this.state.oauthNote = `L’accesso con ${provider} non è ancora attivo. Per ora continua con email: ci vuole un minuto.`;
      this.__rerender();
    };
    const wait = Math.max(0, Math.ceil((s.resendAt - Date.now()) / 1000));
    const error = !!s.codeError;
    return {
      stepChoose: s.step === 'choose', stepEmail: s.step === 'email', stepCode: s.step === 'code',
      // One way in: a new email creates the account, a known one signs in
      title: 'Accedi a Rientro',
      subtitle: 'Se è la prima volta, creiamo il tuo profilo. Se hai già un account, entri.',
      expired: !!qs().get('next'),
      linkedin: oauth('LinkedIn'), google: oauth('Google'), oauthNote: s.oauthNote,
      toEmail: () => { this.state.step = 'email'; this.state.oauthNote = null; this.__rerender(); document.querySelector('[data-key="email"]')?.focus(); },
      toChoose: () => { this.state.step = 'choose'; this.__rerender(); },
      email: s.email, emailError: s.emailError,
      emailProps: { onInput: v => { this.state.email = v; }, onEnter: () => this.sendCode() },
      marketing: s.marketing, mBorder: s.marketing ? 'none' : '1.5px solid #CFC8E8', mBg: s.marketing ? '#6C4DF5' : '#FFFFFF', mMark: s.marketing ? '✓' : '',
      toggleMarketing: e => { this.state.marketing = e.target.checked; this.__rerender(); },
      sendCode: e => this.sendCode(e), sendLabel: s.busy ? 'Invio…' : 'Invia codice', busy: s.busy,
      digits: s.code.map((v, i) => ({
        key: `code-${i}`, v, aria: `Cifra ${i + 1} di 6`, ac: i === 0 ? 'one-time-code' : 'off',
        bd: error ? '1.5px solid #D92D20' : v ? '1.5px solid #CFC8E8' : '1px solid #E4E0F2', sh: 'none',
        input: e => { const t = e.target.value; if (t.length > 1) this.setDigits(i, t); else { this.state.code[i] = t.replace(/\D/g, ''); this.setDigits(i, this.state.code[i]); } },
        keydown: e => {
          if (e.key === 'Backspace' && !this.state.code[i] && i > 0) { this.state.code[i - 1] = ''; this.__rerender(); document.querySelector(`[data-key="code-${i - 1}"]`)?.focus(); }
          if (e.key === 'Enter') this.verify();
        },
        paste: e => { e.preventDefault(); this.setDigits(0, e.clipboardData.getData('text')); },
      })),
      codeError: s.codeError, devCode: s.devCode,
      countdown: wait ? `0:${String(wait).padStart(2, '0')}` : '', cantResend: wait > 0, resendColor: wait ? '#8C84AE' : '#1A1726',
      resend: () => this.sendCode(),
      verify: () => this.verify(), cantVerify: s.busy || s.code.join('').length !== 6,
      verifyLabel: s.busy ? 'Verifica…' : 'Continua', verifyVariant: s.code.join('').length === 6 ? 'accent' : 'secondary',
    };
  }
}

import { api, flash, qs } from '../lib.js';
import { turnstileToken, warmUpTurnstile } from '../turnstile.js';
import { Page } from './_base.js';

// Coming back from LinkedIn or Google with a problem (see /api/auth/<provider>/callback)
const providerErrors = (p, name) => ({
  [`${p}_annullato`]: `Accesso con ${name} annullato. Puoi riprovare o continuare con email.`,
  [`${p}_scaduto`]: `La richiesta a ${name} è scaduta. Riprova.`,
  [`${p}_errore`]: `${name} non ha risposto come previsto. Riprova tra poco o continua con email.`,
  [`${p}_email`]: `Il tuo account ${name} non ha un’email verificata. Verificala su ${name} oppure continua con email.`,
  [`${p}_non_attivo`]: `L’accesso con ${name} non è ancora attivo. Per ora continua con email: ci vuole un minuto.`,
});
const OAUTH_ERRORS = {
  ...providerErrors('linkedin', 'LinkedIn'),
  ...providerErrors('google', 'Google'),
  sospeso: 'Questo account è sospeso. Scrivici se pensi sia un errore.',
  contenuto_bloccato: 'Account bloccato. Il nostro team sta verificando la tua iscrizione.',
};

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

  async load() {
    const launch = await fetch('/api/public/launch').then(r => r.json()).catch(() => null);
    const date = launch && new Date(launch.launch_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }).replace(/^1 /, '1°\u00a0');
    const city = (qs().get('citta') ?? '').trim().slice(0, 80);
    Object.assign(this.state, { launch, launchDate: date, city });
    // A city with its own territory page shows that page's photo as a postcard
    if (city) {
      const t = await fetch(`/api/public/territory/${encodeURIComponent(city)}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
      if (t?.kind === 'city' && t.photo && t.cities.includes(t.name)) this.state.postcard = { src: t.photo, name: t.name };
    }
    const err = OAUTH_ERRORS[qs().get('errore')];
    if (err) this.state.oauthNote = err;
  }

  async sendCode(e) {
    e?.preventDefault?.();
    const email = this.state.email.trim();
    if (!/^\S+@\S+\.\S{2,}$/.test(email)) { this.state.emailError = 'Inserisci un indirizzo email valido.'; this.__rerender(); return; }
    this.state.busy = true; this.state.emailError = null; this.__rerender();
    try {
      // Bot check (Cloudflare Turnstile), when it's on
      let token = null;
      try { token = await turnstileToken(this.state.launch?.turnstile); } catch { throw new Error('Non siamo riusciti a verificare che tu non sia un robot. Ricarica la pagina e riprova.'); }
      const r = await api('POST', '/api/auth/request-code', { email, marketing_opt_in: this.state.marketing, ...(token ? { turnstile_token: token } : {}) });
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
      if (r.restored) flash('Bentornato! Il tuo account è stato ripristinato e l’eliminazione annullata.');
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
    const oauth = (p, provider) => () => {
      if (this.state.launch?.[p]) {
        const next = qs().get('next');
        location.href = `/api/auth/${p}/start${next ? `?next=${encodeURIComponent(next)}` : ''}`;
        return;
      }
      this.state.oauthNote = `L’accesso con ${provider} non è ancora attivo. Per ora continua con email: ci vuole un minuto.`;
      this.__rerender();
    };
    const wait = Math.max(0, Math.ceil((s.resendAt - Date.now()) / 1000));
    const error = !!s.codeError;
    return {
      stepChoose: s.step === 'choose', stepEmail: s.step === 'email', stepCode: s.step === 'code',
      // One way in: a new email creates the account, a known one signs in
      title: 'Accedi a Rientro',
      // Left panel: before launch it speaks to who came from "Scopri chi rientra a [città]"
      panelTitle: !s.ready ? '' : s.launch?.launched === false
        ? `Registrati per esplorare chi rientra ${s.city ? `${/^a/i.test(s.city) ? 'ad' : 'a'} ${s.city}` : 'nella tua città'}`
        : 'Il tuo profilo è la tua presentazione.',
      panelText: s.launchDate ? `Assicura il tuo posto prima del lancio di Rientro il ${s.launchDate}.` : '',
      postcard: s.postcard?.src ?? null,
      postcardAlt: s.postcard ? `Cartolina da ${s.postcard.name}` : '',
      expired: !!qs().get('next'),
      linkedin: oauth('linkedin', 'LinkedIn'), google: oauth('google', 'Google'), oauthNote: s.oauthNote,
      toEmail: () => { this.state.step = 'email'; this.state.oauthNote = null; warmUpTurnstile(this.state.launch?.turnstile); this.__rerender(); document.querySelector('[data-key="email"]')?.focus(); },
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

// Settings · account (design 05 · 38a account, 39b mobile).
import { api, getMe, go } from '../lib.js';
import { Page } from './_base.js';
import { openDeleteAccount, settingsMenu } from './_settings.js';

export const title = 'Impostazioni';
export const tabbar = true;

export default class extends Page {
  async load() {
    // Notifications and security have their own pages now (old links: /impostazioni#notifiche, #sicurezza)
    if (['#notifiche', '#sicurezza'].includes(location.hash)) return go(`/impostazioni/${location.hash.slice(1)}`);
    if (location.hash === '#elimina' && location.pathname === '/impostazioni') return go('/impostazioni/account#elimina');
    const [me, launch] = await Promise.all([getMe(true), api('GET', '/api/public/launch').catch(() => null)]);
    Object.assign(this.state, { me, linkedin: !!launch?.linkedin, google: !!launch?.google });
    if (location.hash) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
  }


  logout = this.act(async () => { await api('POST', '/api/auth/logout'); go('/'); });

  renderVals() {
    const s = this.state;
    // On phones /impostazioni is just the list of sections; Account opens at /impostazioni/account.
    // On a computer both show the side menu with Account open.
    const isAccount = location.pathname === '/impostazioni/account';
    const nav = { isIndex: !isAccount, isAccount, accountCls: isAccount ? '' : 'r-hide-sm', mobileMenu: settingsMenu.map(m => m.href === '/impostazioni' ? { ...m, href: '/impostazioni/account' } : m) };
    if (!s.me) return { loading: true, me: {}, menu: settingsMenu, ...nav };
    return {
      ...nav,
      // Email, LinkedIn and Google all sign in with the account's email: any of them opens the same account
      hasLinkedin: !!s.linkedin, hasGoogle: !!s.google,
      loading: false, me: s.me, menu: settingsMenu, email: s.me.user.email,
      logout: this.logout,
      startDelete: () => openDeleteAccount({ onExport: () => go('/impostazioni/dati') }),
    };
  }
}

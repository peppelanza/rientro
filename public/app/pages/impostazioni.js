// Settings · account (design 05 · 38a account, 39b mobile).
import { api, getMe, go, timeAgo, toast } from '../lib.js';
import { Page } from './_base.js';
import { settingsMenu } from './_settings.js';

export const title = 'Impostazioni';
export const tabbar = true;

const NOTIF = [
  ['Nuove richieste di connessione', 'notify_requests'],
  ['Nuovi messaggi', 'notify_messages'],
  ['Stato del profilo', 'notify_status'],
];

export default class extends Page {
  async load() {
    const [me, sessions] = await Promise.all([getMe(true), api('GET', '/api/me/sessions')]);
    Object.assign(this.state, { me, sessions, comm: me.communication });
    if (location.hash) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
  }

  setNotif(field, value) {
    return this.act(async () => { this.state.comm = await api('PATCH', '/api/me/notifications', { [field]: value }); toast('Preferenze salvate.'); })();
  }

  setMarketing = this.act(async () => {
    const v = !this.state.comm.marketing_email;
    this.state.comm = await api('PUT', '/api/me/communication', { preference: 'marketing_email', value: v });
    toast(v ? 'Riceverai le novità di Rientro via email.' : 'Non riceverai più email di novità.');
  });

  setVisible = this.act(async () => {
    const p = this.state.me.profile;
    const saved = await api('PATCH', '/api/me/profile', { visible: !p.visible });
    p.visible = saved.visible;
    toast(p.visible ? 'Il tuo profilo è di nuovo visibile.' : 'Profilo in pausa: nessuno lo vede finché non lo riattivi.');
  });

  logoutAll = this.act(async () => {
    if (!confirm('Uscire da tutti i dispositivi, compreso questo?')) return;
    await api('POST', '/api/auth/logout-all');
    go('/accedi');
  });

  logout = this.act(async () => { await api('POST', '/api/auth/logout'); go('/'); });

  renderVals() {
    const s = this.state;
    if (!s.me) return { loading: true, me: {}, menu: settingsMenu };
    const c = s.comm;
    const approved = s.me.user.status === 'approved';
    return {
      loading: false, me: s.me, menu: settingsMenu, email: s.me.user.email,
      approved, visible: s.me.profile.visible, visibleLabel: s.me.profile.visible ? 'Visibile' : 'In pausa', setVisible: this.setVisible,
      notif: [
        ...NOTIF.map(([t, k]) => ({
          t, hasD: false, e: c[`${k}_email`], a: c[`${k}_app`], hasApp: true, noApp: false,
          eAria: `${t}: email`, aAria: `${t}: app`,
          toggleE: () => this.setNotif(`${k}_email`, !c[`${k}_email`]), toggleA: () => this.setNotif(`${k}_app`, !c[`${k}_app`]),
        })),
        { t: 'Novità e comunicazioni di Rientro', d: 'Consenso marketing, separato e facoltativo', hasD: true, e: c.marketing_email, hasApp: false, noApp: true, eAria: 'Novità di Rientro: email', toggleE: this.setMarketing },
      ],
      sessions: s.sessions.map(x => ({ l: `${x.device} · ${x.current ? 'questo dispositivo' : timeAgo(x.last_used_at)}`, fg: x.current ? '#1A1726' : '#8C84AE', fs: x.current ? 15 : 13 })),
      logoutAll: this.logoutAll, logout: this.logout,
    };
  }
}

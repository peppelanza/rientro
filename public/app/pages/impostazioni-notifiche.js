// Settings · email notifications (design 05 · 38a "Notifiche"). In the app they always arrive.
import { api, getMe, toast } from '../lib.js';
import { Page } from './_base.js';
import { settingsMenu } from './_settings.js';

export const title = 'Notifiche mail';
export const tabbar = true;

const NOTIF = [
  ['Nuove richieste di connessione', 'notify_requests'],
  ['Nuovi messaggi', 'notify_messages'],
  ['Gruppi: nuovi post nei gruppi che segui e risposte ai tuoi post', 'notify_groups'],
];

export default class extends Page {
  async load() {
    const me = await getMe(true);
    Object.assign(this.state, { me, comm: me.communication });
  }

  setNotif(field, value) {
    return this.act(async () => { this.state.comm = await api('PATCH', '/api/me/notifications', { [field]: value }); toast('Preferenze salvate.'); })();
  }

  setMarketing = this.act(async () => {
    const v = !this.state.comm.marketing_email;
    this.state.comm = await api('PUT', '/api/me/communication', { preference: 'marketing_email', value: v });
    toast(v ? 'Riceverai le novità di Rientro via email.' : 'Non riceverai più email di novità.');
  });

  renderVals() {
    const s = this.state;
    if (!s.me) return { loading: true, me: {}, menu: settingsMenu };
    const c = s.comm;
    return {
      loading: false, me: s.me, menu: settingsMenu,
      notif: [
        ...NOTIF.map(([t, k]) => ({
          t, hasD: false, e: c[`${k}_email`], eAria: `${t}: email`,
          toggleE: () => this.setNotif(`${k}_email`, !c[`${k}_email`]),
        })),
        { t: 'Novità e comunicazioni di Rientro', d: 'Consenso marketing, separato e facoltativo', hasD: true, e: c.marketing_email, eAria: 'Novità di Rientro: email', toggleE: this.setMarketing },
      ],
    };
  }
}

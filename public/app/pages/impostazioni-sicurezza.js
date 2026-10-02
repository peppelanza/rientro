// Settings · security (design 05 · 38a "Sicurezza"): where you're signed in, sign out everywhere.
import { api, getMe, go, timeAgo } from '../lib.js';
import { Page } from './_base.js';
import { settingsMenu } from './_settings.js';

export const title = 'Sicurezza';
export const tabbar = true;

export default class extends Page {
  async load() {
    const [me, sessions] = await Promise.all([getMe(), api('GET', '/api/me/sessions')]);
    Object.assign(this.state, { me, sessions });
  }

  logoutAll = this.act(async () => {
    if (!confirm('Uscire da tutti i dispositivi, compreso questo?')) return;
    await api('POST', '/api/auth/logout-all');
    go('/accedi');
  });

  renderVals() {
    const s = this.state;
    if (!s.me) return { loading: true, me: {}, menu: settingsMenu };
    return {
      loading: false, me: s.me, menu: settingsMenu,
      sessions: s.sessions.map(x => ({ l: `${x.device} · ${x.current ? 'questo dispositivo' : timeAgo(x.last_used_at)}`, fg: x.current ? '#1A1726' : '#8C84AE', fs: x.current ? 15 : 13 })),
      logoutAll: this.logoutAll,
    };
  }
}

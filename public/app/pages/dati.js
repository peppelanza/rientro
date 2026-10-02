// Settings · your data (design 05 · 40a export). Deleting the account is in Impostazioni → Account.
import { api, download, getMe, go, toast } from '../lib.js';
import { Page } from './_base.js';
import { settingsMenu } from './_settings.js';

export const title = 'I tuoi dati';
export const tabbar = true;

export default class extends Page {
  async load() {
    this.state.me = await getMe(true);
    // Deleting the account moved to Impostazioni → Account (old links: /impostazioni/dati#elimina)
    if (location.hash === '#elimina') return go('/impostazioni#elimina');
  }

  exportData = this.act(async () => {
    const res = await api('GET', '/api/me/export', undefined, { raw: true });
    download(`rientro-i-miei-dati-${new Date().toISOString().slice(0, 10)}.json`, await res.blob());
    this.state.exportedAt = new Date();
    toast('Archivio scaricato.');
  });



  renderVals() {
    const s = this.state;
    if (!s.me) return { loading: true, me: {}, menu: settingsMenu };
    return {
      loading: false, me: s.me, menu: settingsMenu,
      exportItems: [["Profilo e risposte all'onboarding", 'JSON'], ['Scelte sul lavoro e storico dei consensi', 'JSON'], ['Connessioni, richieste e messaggi', 'JSON'], ['Elenco di foto e video, con i link per scaricarli', 'JSON']].map(([l, f], i) => ({ l, f, bt: i ? '1px solid #ECE8F7' : 'none' })),
      exportData: this.exportData, exported: !!s.exportedAt,
      startDelete: () => this.startDelete(),
    };
  }
}

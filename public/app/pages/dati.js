// Settings · your data (design 05 · 40a export, 41a/41b delete account in two steps).
import { DCLogic } from '../../dc/runtime.js';
import { api, download, getMe, go, openModal, template, toast } from '../lib.js';
import { Page } from './_base.js';
import { settingsMenu } from './_settings.js';

export const title = 'I tuoi dati';
export const tabbar = true;

const REASONS = ['Ho trovato un co-founder', 'Ho trovato lavoro', 'Non ho trovato persone adatte', 'Non voglio più tornare in Italia', 'Preoccupazioni sulla privacy', 'Altro'];

export default class extends Page {
  async load() {
    this.state.me = await getMe(true);
    if (location.hash === '#elimina') requestAnimationFrame(() => this.startDelete());
  }

  exportData = this.act(async () => {
    const res = await api('GET', '/api/me/export', undefined, { raw: true });
    download(`rientro-i-miei-dati-${new Date().toISOString().slice(0, 10)}.json`, await res.blob());
    this.state.exportedAt = new Date();
    toast('Archivio scaricato.');
  });

  pause = this.act(async () => {
    await api('PATCH', '/api/me/profile', { visible: false });
    this.state.me.profile.visible = false;
    toast('Profilo in pausa: nessuno lo vede finché non lo riattivi da Impostazioni → Account.');
  });

  async startDelete() {
    const tpl = await template('/app/pages/dati-elimina.html');
    const page = this;
    const result = await openModal({
      template: tpl,
      Logic: class extends DCLogic {
        state = { step: 1, reason: '', confirm: '', busy: false, error: null };
        renderVals() {
          const s = this.state;
          return {
            step1: s.step === 1, step2: s.step === 2,
            delEffects: ['Il profilo sparisce subito da Rientro.', 'Connessioni e conversazioni vengono eliminate anche per gli altri.', 'Foto, video e dati vengono cancellati subito dai nostri sistemi; le copie di backup entro 30 giorni.'],
            canPause: page.state.me.profile.visible && page.state.me.user.status === 'approved',
            pause: () => { this.close(); page.pause(); },
            exportFirst: () => { this.close(); page.exportData(); },
            cancel: () => this.close(), next: () => this.setState({ step: 2 }),
            reasons: REASONS.map(r => ({ v: r, l: r })), reason: s.reason, reasonProps: { onChange: v => { s.reason = v; } },
            confirm: s.confirm, confirmProps: { onInput: v => { const was = s.confirm === 'ELIMINA'; s.confirm = v; if (was !== (v === 'ELIMINA')) this.__rerender(); } },
            cantDelete: s.confirm !== 'ELIMINA' || s.busy, error: s.error,
            doDelete: async () => {
              this.setState({ busy: true, error: null });
              try { this.close(await api('DELETE', '/api/me', { confirm: s.confirm, reason: s.reason || null })); } catch (err) { this.setState({ busy: false, error: err.message }); }
            },
          };
        }
      },
    });
    if (result?.deleted) go('/?account=eliminato');
  }

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

// Side menu shared by the settings pages (design 05 · UI Side Menu "Impostazioni"), and the
// two-step "Elimina account" dialog (design 05 · 41a/41b), at the bottom of Impostazioni → Account.
import { DCLogic } from '../../dc/runtime.js';
import { api, flash, go, openModal, template } from '../lib.js';

const REASONS = ['Ho trovato un co-founder', 'Ho trovato lavoro', 'Non ho trovato persone adatte', 'Non voglio più tornare in Italia', 'Preoccupazioni sulla privacy', 'Altro'];

export const settingsMenu = [
  { l: 'Account', href: '/impostazioni' },
  { l: 'Privacy', href: '/impostazioni/privacy' },
  { l: 'Notifiche', href: '/impostazioni/notifiche' },
  { l: 'Sicurezza', href: '/impostazioni/sicurezza' },
  { l: 'I tuoi dati', href: '/impostazioni/dati' },
];

export async function openDeleteAccount({ onExport }) {
  const tpl = await template('/app/pages/dati-elimina.html');
  const result = await openModal({
    template: tpl,
    Logic: class extends DCLogic {
      state = { step: 1, reason: '', confirm: '', busy: false, error: null };
      renderVals() {
        const s = this.state;
        return {
          step1: s.step === 1, step2: s.step === 2,
          delEffects: ['Il profilo sparisce subito da Rientro e vieni disconnesso.', 'Hai 30 giorni per ripensarci: se accedi di nuovo ritrovi tutto com’era.', 'Dopo 30 giorni cancelliamo definitivamente profilo, foto, video, connessioni e messaggi, anche per gli altri.'],
          exportFirst: () => { this.close(); onExport(); },
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
  if (result?.deleted) { flash('Account in eliminazione. Hai 30 giorni per ripensarci: ti basta accedere di nuovo.'); go('/'); }
}

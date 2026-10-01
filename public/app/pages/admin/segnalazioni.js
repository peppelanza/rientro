// Admin · reports (design 06 · 48a). "Vedi chat" shows only the reporter↔reported conversation, audited.
import { DCLogic } from '../../../dc/runtime.js';
import { api, fmtTime, fmtShort, go, openModal, toast } from '../../lib.js';
import { AdminPage } from './_admin.js';

export const title = 'Segnalazioni · Admin';
const REASON_COLORS = { harassment: ['#FDE8E8', '#B42318'], spam: ['#FFF4DC', '#7A4E00'], fake_profile: ['#F1EFF8', '#4A4560'], other: ['#F1EFF8', '#4A4560'] };
const RESOLUTION = { dismiss: 'Ignorata', suspend: 'Account sospeso', request_changes: 'Modifiche richieste' };

const CHAT = `
<div style="width:560px;max-width:100%;background:#FFFFFF;border-radius:32px;padding:24px;box-sizing:border-box;display:flex;flex-direction:column;gap:14px">
<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 style="margin:0;font-family:'Unbounded',sans-serif;font-size:18px;font-weight:600;letter-spacing:-.03em">Chat segnalata</h2><button type="button" onClick="{{ close }}" aria-label="Chiudi" style="width:36px;height:36px;border-radius:50%;border:none;background:#F1EFF8;color:#6B6680;cursor:pointer">×</button></div>
<span style="font-size:12px;color:#8C84AE">Solo i messaggi tra chi ha segnalato e l'account segnalato. L'accesso è registrato.</span>
<div style="max-height:60vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:20px;background:#F6F4FC">
<sc-if value="{{ empty }}"><span style="font-size:14px;color:#8C84AE">Nessun messaggio tra i due account.</span></sc-if>
<sc-for list="{{ msgs }}" as="m"><dc-import name="UI Bubble" from="{{ m.from }}" text="{{ m.body }}"></dc-import><span style="align-self:{{ m.align }};font-size:11px;color:#8C84AE">{{ m.who }} · {{ m.when }}</span></sc-for>
</div></div>`;

export default class extends AdminPage {
  async loadAdmin() {
    this.state.tab = 'open';
    await this.fetch();
  }

  async fetch() { this.state.d = await api('GET', `/api/admin/reports?status=${this.state.tab}`); }

  resolve(r, action) {
    return this.act(async () => {
      if (action === 'suspend' && !confirm(`Sospendere ${r.who}?`)) return;
      await api('POST', `/api/admin/reports/${r.id}`, { action });
      toast(RESOLUTION[action]);
      await Promise.all([this.fetch(), this.refreshCounts()]);
    })();
  }

  async chat(r) {
    const msgs = await api('GET', `/api/admin/reports/${r.id}/chat`);
    openModal({
      template: CHAT,
      Logic: class extends DCLogic {
        renderVals() {
          return {
            close: () => this.close(), empty: !msgs.length,
            msgs: msgs.map(m => ({ from: m.from === 'reported' ? 'them' : 'me', body: m.body, align: m.from === 'reported' ? 'flex-start' : 'flex-end', who: m.from === 'reported' ? r.who : 'Chi ha segnalato', when: `${fmtShort(m.created_at)} ${fmtTime(m.created_at)}` })),
          };
        }
      },
    });
  }

  renderVals() {
    const s = this.state;
    if (!s.d) return { loading: true, side: this.side('segnalazioni') };
    const { d } = s;
    const tab = (k, l) => ({ l, tone: s.tab === k ? 'selected' : 'default', on: s.tab === k ? 'true' : 'false', fn: () => this.act(async () => { s.tab = k; await this.fetch(); })() });
    return {
      loading: false, side: this.side('segnalazioni'),
      tOpen: tab('open', `Aperte · ${d.counts.open}`), tClosed: tab('closed', `Risolte · ${d.counts.closed}`), isOpen: s.tab === 'open',
      empty: !d.reports.length, emptyText: s.tab === 'open' ? 'Nessuna segnalazione aperta.' : 'Nessuna segnalazione risolta.',
      reports: d.reports.map(r => {
        const [rbg, rfg] = REASON_COLORS[r.reason] ?? REASON_COLORS.other;
        return {
          ...r, rbg, rfg, d: r.details || '—', age: r.age_h >= 24 ? `${Math.floor(r.age_h / 24)} G` : `${r.age_h} H`, ac: r.age_h >= 24 ? '#B42318' : '#6B6680',
          profile: () => go(`/admin/utenti/${r.reported_id}`), resolution: RESOLUTION[r.resolution] ?? r.status,
          isHarass: r.reason === 'harassment', notHarass: r.reason !== 'harassment', hasChat: !!r.reporter_id,
          chat: () => this.chat(r), dismiss: () => this.resolve(r, 'dismiss'), suspend: () => this.resolve(r, 'suspend'),
          isFake: r.reason === 'fake_profile',
        };
      }),
    };
  }
}

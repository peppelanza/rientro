// Admin · images stopped as explicit in the browser (nsfw.js → src/moderation.js). The account was
// suspended on the spot; "Era un errore" gives it back with the image as profile photo and emails
// the member, "Confermo" keeps it suspended and deletes the image (visible only here, audited).
import { api, fmtDate, fmtTime, toast } from '../../lib.js';
import { AdminPage } from './_admin.js';

export const title = 'Contenuti bloccati · Admin';
const pct = v => `${Math.round((v || 0) * 100)}%`;

export default class extends AdminPage {
  listPath = '/api/admin/blocked';
  async loadAdmin() { await this.fetchList(); this.state.rows = this.state.list.items; }

  async resolve(r, action) {
    await api('POST', `/api/admin/blocked/${r.id}`, { action });
    await this.fetchList();
    this.state.rows = this.state.list.items;
    this.counts = await api('GET', '/api/admin/sidebar');
    toast(action === 'restore' ? 'Account riattivato, con la foto come foto profilo. Gli abbiamo scritto via email.' : 'Sospensione confermata.');
    this.__rerender();
  }

  renderVals() {
    const s = this.state;
    if (!s.rows) return { loading: true, side: this.side('bloccati') };
    return {
      loading: false, side: this.side('bloccati'), empty: !s.rows.length, ...this.listVals(),
      emptyText: s.q ? `Nessun risultato per “${s.q}”.` : 'Nessun contenuto bloccato.',
      rows: s.rows.map(r => ({
        ...r, name: r.name || '—', when: `${fmtDate(r.created_at)} ${fmtTime(r.created_at)}`, href: `/admin/utenti/${r.user_id}`,
        score: `Esplicito ${pct((r.scores.Porn || 0) + (r.scores.Hentai || 0))} · Sexy ${pct(r.scores.Sexy)} · Neutro ${pct(r.scores.Neutral)}`,
        open: !r.resolved_at, hasImage: !!r.image_url, noImage: !r.image_url,
        outcome: r.resolution === 'restored' ? 'Riattivato · è la sua foto profilo' : r.resolution === 'confirmed' ? 'Sospensione confermata' : '',
        restore: () => this.resolve(r, 'restore'), confirm: () => this.resolve(r, 'confirm'),
      })),
    };
  }
}

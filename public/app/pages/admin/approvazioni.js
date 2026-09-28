// Admin · approvals queue (design 06 · 47a). Oldest first; "A" approves the open profile.
import { api, fmtDate, fmtTime, toast } from '../../lib.js';
import { AdminPage, initials } from './_admin.js';

export const title = 'Approvazioni · Admin';
const CHECK_COLORS = { ok: ['#E3F5EC', '#1F7A4F'], warn: ['#FFF4DC', '#7A4E00'], none: ['#F1EFF8', '#4A4560'] };
const PENDING_LABEL = { first_name: 'Nome', last_name: 'Cognome', idea_title: 'Idea', idea_description: 'Descrizione idea', photo_file_id: 'Foto' };

// Same rules as admin.reviewChecks on the server
function checks(p) {
  const bio = (p.bio || '').length;
  return [
    p.photo_url ? ['✓ Foto', 'Caricata · verifica il volto', 'ok'] : ['! Foto', 'Mancante', 'warn'],
    p.linkedin_url ? ['✓ LinkedIn', 'Indicato', 'ok'] : ['— LinkedIn', 'Non indicato', 'none'],
    bio >= 150 ? ['✓ Su di me', `${bio} caratteri`, 'ok'] : ['! Su di me', `Solo ${bio} caratteri`, 'warn'],
    p.video_url ? ['✓ Video', 'Caricato', 'ok'] : ['— Video', 'Non caricato', 'none'],
  ].map(([t, d, tone]) => ({ t, d, bg: CHECK_COLORS[tone][0], fg: CHECK_COLORS[tone][1] }));
}

export default class extends AdminPage {
  async loadAdmin() {
    this.state.note = '';
    await this.fetchQueue();
    this.onKey = e => {
      if (e.key.toLowerCase() === 'a' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) this.decide('approve');
    };
    document.addEventListener('keydown', this.onKey);
  }

  async fetchQueue(keep) {
    const s = this.state;
    s.q = await api('GET', '/api/admin/approvals');
    const next = s.q.queue.find(x => x.id === keep) ?? s.q.queue[0];
    s.sel = null;
    if (next) await this.select(next.id, false);
  }

  async select(id, render = true) {
    const s = this.state;
    s.selId = id;
    s.sel = await api('GET', `/api/admin/users/${id}`);
    s.note = '';
    if (render) this.__rerender();
  }

  decide(action) {
    return this.act(async () => {
      const s = this.state;
      if (!s.sel) return;
      if (['request_changes', 'reject'].includes(action) && !s.note.trim()) { toast('Scrivi una nota per l’utente.', { tone: 'err' }); document.querySelector('[data-key="review-note"]')?.focus(); return; }
      if (action === 'suspend' && !confirm('Sospendere questo account?')) return;
      await api('POST', `/api/admin/users/${s.selId}/review`, { action, note: s.note.trim() || null });
      toast({ approve: 'Approvato.', request_changes: 'Modifiche richieste.', reject: 'Rifiutato.', suspend: 'Sospeso.' }[action]);
      await Promise.all([this.fetchQueue(), this.refreshCounts()]);
    })();
  }

  componentWillUnmount() { document.removeEventListener('keydown', this.onKey); }

  renderVals() {
    const s = this.state;
    if (!s.q) return { loading: true, side: this.side('approvazioni') };
    const d = s.sel;
    const p = d?.profile;
    const name = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') || d.user.email : '';
    const answers = p ? [
      ['Su di me', p.bio], [p.primary_intent === 'has_idea' ? "L'idea" : 'Vorrebbe costruire', [p.idea_title, p.idea_description].filter(Boolean).join(' — ')],
      ['Percorso', p.experiences.map(e => `${e.company}${e.start_month ? ` (${e.start_month.slice(0, 4)}–${e.current ? 'oggi' : e.end_month?.slice(0, 4) ?? ''})` : ''}`).join(', ')],
      ['Formazione', p.education.map(e => e.school).join(', ')], ['Cerca', p.seeking_backgrounds.join(', ')], ['Cosa gli manca', p.misses_italy],
      ['Link', [p.linkedin_url, p.website_url].filter(Boolean).join(' · ')],
    ].map(([k, v]) => ({ k, v: v || '—' })) : [];
    return {
      loading: false, side: this.side('approvazioni'),
      count: String(s.q.queue.length), sub: `Più vecchi in alto · attesa media ${s.q.avg_wait_h} h`,
      queue: s.q.queue.map(x => ({
        ...x, ini: initials(x.name), wait: `${x.wait_h} H`, tc: x.wait_h > s.q.sla_h ? '#B42318' : '#8C84AE', kindLabel: x.kind === 'changes' ? 'Modifiche' : '',
        bg: x.id === s.selId ? '#FFFFFF' : 'transparent', sh: x.id === s.selId ? '0 8px 24px rgba(80,60,160,.10)' : 'none', cur: x.id === s.selId ? 'true' : 'false',
        open: () => this.select(x.id),
      })),
      empty: !s.q.queue.length, hasSel: !!d,
      name, photo: p?.photo_url, role: p ? [p.current_role, p.current_company, d.labels.age].filter(Boolean).join(' · ') : '',
      from: p?.lives_in_city ?? '—', to: p?.desired_comuni.join(', ') || (p?.desired_unknown ? 'Non lo sa ancora' : '—'),
      badgeKind: p?.primary_intent === 'has_idea' ? 'idea' : 'explore', badgeLabel: p?.primary_intent === 'has_idea' ? "Ha già un'idea" : "Cerca un'idea insieme",
      time: d?.labels.time,
      meta: d ? `${d.user.email} · ${p.submitted_at ? `inviato ${fmtDate(p.submitted_at)} ${fmtTime(p.submitted_at)}` : ''} · ${d.reviews.length ? `${d.reviews.length + 1}ª revisione` : 'prima revisione'}` : '',
      isChanges: d?.user.status === 'approved', pendingKeys: d ? d.pending_keys.map(k => PENDING_LABEL[k] ?? k).join(', ') : '',
      checks: p ? checks(p) : [], answers,
      note: s.note, noteProps: { onInput: v => { s.note = v; } },
      approve: () => this.decide('approve'), changes: () => this.decide('request_changes'), reject: () => this.decide('reject'), suspend: () => this.decide('suspend'),
      canReject: d?.user.status !== 'approved', detailHref: d ? `/admin/utenti/${d.user.id}` : '#',
    };
  }
}

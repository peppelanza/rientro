// Profile status (design 02 · 24a in revisione, 24b modifiche richieste, 25a approvato).
import { api, fmtTime, fmtShort, getMe, go } from '../lib.js';
import { Page } from './_base.js';

export const title = 'Il tuo profilo';

export default class extends Page {
  async load() {
    const me = await getMe(true);
    this.state.me = me;
    if (me.user.status === 'approved' && me.launched) {
      // 25a: three people whose background is one of those the member is looking for
      const seek = me.profile.seeking_backgrounds;
      const r = await api('GET', `/api/profiles?backgrounds=${encodeURIComponent(seek.join(','))}`).catch(() => null);
      this.state.suggested = r?.people.slice(0, 3) ?? [];
    }
  }

  renderVals() {
    const s = this.state;
    if (!s.me) return { loading: true };
    const { user, profile: p, launched } = s.me;
    const st = user.status;
    const sent = p.submitted_at ? new Date(p.submitted_at) : null;
    const sentLabel = sent ? (sent.toDateString() === new Date().toDateString() ? `OGGI ${fmtTime(p.submitted_at)}` : fmtShort(p.submitted_at).toUpperCase()) : '';
    return {
      loading: false, me: s.me,
      isOnboarding: st === 'onboarding', isReview: st === 'in_review', isChanges: st === 'changes_requested', isRejected: st === 'rejected',
      isApproved: st === 'approved',
      sentLabel, note: p.review_note, hasNote: !!p.review_note,
      noVideo: !p.video_url,
      first: p.first_name || '', firstDot: `${p.first_name || ''}.`,
      launched, notLaunched: !launched,
      suggested: (s.suggested || []).map(x => ({ n: x.name, d: [x.role, x.from && x.to ? `${x.from} → ${x.to}` : x.from].filter(Boolean).join(' · '), href: `/persone/${x.id}`, photo: x.photo_url, ini: x.name.split(' ').map(w => w[0]).join('').slice(0, 2) })),
      hasSuggested: (s.suggested || []).length > 0,
      seekLabel: p.seeking_backgrounds.length ? `Hanno il background che cerchi: ${p.seeking_backgrounds.join(' o ')}` : 'Persone da conoscere',
      resume: () => go('/onboarding'), fix: () => go('/onboarding?passo=anteprima'), discover: () => go('/scopri'), profile: () => go('/profilo'),
    };
  }
}

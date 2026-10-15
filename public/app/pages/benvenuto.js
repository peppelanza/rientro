// Before launch: where a member lands once their profile is online. A big "your profile is ready"
// box with a countdown to launch, and a small preview of their profile that opens the editor (/profilo).
import { cardFields } from '../card-fields.js';
import { api, getMe, go, toast } from '../lib.js';
import { homeFor, Page } from './_base.js';

export const title = 'Il tuo profilo è pronto';
export const tabbar = true;

// Time to launch as days, hours, minutes, seconds (null once it's there)
function parts(at) {
  const ms = at - Date.now();
  if (!(ms > 0)) return null;
  const s = Math.floor(ms / 1000);
  const two = n => String(n).padStart(2, '0');
  return [
    { k: 'd', v: String(Math.floor(s / 86400)), l: Math.floor(s / 86400) === 1 ? 'giorno' : 'giorni' },
    { k: 'h', v: two(Math.floor(s / 3600) % 24), l: 'ore' },
    { k: 'm', v: two(Math.floor(s / 60) % 60), l: 'minuti' },
    { k: 's', v: two(s % 60), l: 'secondi' },
  ];
}

const ini = (a, b) => `${(a || '?')[0]}${(b || '')[0] || ''}`.toUpperCase();

export default class extends Page {
  async load() {
    const me = await getMe();
    // After launch, or still filling the profile in: the usual home
    if (me.launched || me.user.status !== 'approved') return go(homeFor(me));
    const launch = await api('GET', '/api/public/launch').catch(() => null);
    const at = launch ? Date.parse(launch.launch_at) : NaN;
    const date = launch && new Date(at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }).replace(/^1 /, '1° ');
    Object.assign(this.state, { me, date, at });
    // The countdown ticks by writing its numbers, not by redrawing the page; at zero, the launch
    clearInterval(this.tick);
    this.tick = setInterval(() => {
      const left = parts(this.state.at);
      if (!left) { clearInterval(this.tick); location.reload(); return; }
      for (const c of left) { const b = document.querySelector(`[data-cd="${c.k}"]`); if (b && b.textContent !== c.v) b.textContent = c.v; }
    }, 1000);
  }

  componentWillUnmount() { clearInterval(this.tick); clearTimeout(this.copiedTimer); }

  renderVals() {
    const s = this.state;
    if (!s.me) return { loading: true, me: {} };
    const p = s.me.profile || {};
    // as on the Scopri card (card-fields.js): back already "Sofia → Catania", else "Londra → Palermo o Catania"
    const job = (p.experiences || []).find(x => x.current);
    const c = cardFields({ ...p, desired_comuni: p.desired_comuni || [], sectors: [], current_role: job?.role ?? p.current_role, current_company: job?.company ?? p.current_company }, []);
    const route = c.back_from ? [c.back_from, c.from] : [c.from, c.to];
    return {
      loading: false, me: s.me,
      cd: parts(s.at) ?? [], hasCountdown: !!parts(s.at), cdLabel: s.date ? `Mancano al lancio di Rientro, il ${s.date}` : 'Mancano al lancio di Rientro',
      name: [p.first_name, p.last_name].filter(Boolean).join(' '), photo: p.photo_url, ini: ini(p.first_name, p.last_name),
      role: c.job,
      from: route[0], to: route[1], hasRoute: !!(route[0] && route[1]),
      open: () => go('/profilo'),
      // what's left to fill in now that the profile is online (components.js App Complete Profile)
      gaps: s.me.gaps || [], completeProps: { onChange: async () => { s.me = await getMe(true); this.__rerender(); } },
      // The member's invite link (invites.js)
      inviteUrl: s.me.invite?.url, inviteShort: (s.me.invite?.url || '').replace(/^https?:\/\/(www\.)?/, ''),
      copyLabel: s.copied ? 'Copiato ✓' : 'Copia link', canShare: !!navigator.share,
      copy: async () => {
        try { await navigator.clipboard.writeText(s.me.invite.url); } catch { toast('Non riusciamo a copiarlo: selezionalo e copialo a mano.', { tone: 'err' }); return; }
        s.copied = true; this.__rerender();
        clearTimeout(this.copiedTimer); this.copiedTimer = setTimeout(() => { s.copied = false; this.__rerender(); }, 2500);
      },
      share: () => navigator.share({ title: 'Rientro', text: 'Ti invito su Rientro, la community di chi torna in Italia o al Sud per costruire qualcosa.', url: s.me.invite.url }).catch(() => {}),
    };
  }
}

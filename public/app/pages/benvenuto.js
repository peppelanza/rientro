// Before launch: where a member lands once their profile is online. A big "your profile is ready"
// box with the launch date, and a small preview of their profile that opens the editor (/profilo).
import { api, getMe, go, orList } from '../lib.js';
import { homeFor, Page } from './_base.js';

export const title = 'Il tuo profilo è pronto';
export const tabbar = true;

const ini = (a, b) => `${(a || '?')[0]}${(b || '')[0] || ''}`.toUpperCase();

export default class extends Page {
  async load() {
    const me = await getMe();
    // After launch, or still filling the profile in: the usual home
    if (me.launched || me.user.status !== 'approved') return go(homeFor(me));
    const launch = await api('GET', '/api/public/launch').catch(() => null);
    const date = launch && new Date(launch.launch_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }).replace(/^1 /, '1° ');
    Object.assign(this.state, { me, date });
  }

  renderVals() {
    const s = this.state;
    if (!s.me) return { loading: true, me: {} };
    const p = s.me.profile || {};
    const places = p.desired_unknown ? 'Non lo so ancora' : orList(p.desired_comuni || [], 3);
    return {
      loading: false, me: s.me,
      text: `Ti invieremo una mail il giorno del lancio di Rientro, ${s.date ? `il ${s.date}` : 'appena apriamo'}.`,
      name: [p.first_name, p.last_name].filter(Boolean).join(' '), photo: p.photo_url, ini: ini(p.first_name, p.last_name),
      role: [p.current_role, p.current_company].filter(Boolean).join(' · '),
      from: p.lives_in_city || p.lives_in_country || '', to: places, hasRoute: !!((p.lives_in_city || p.lives_in_country) && places),
      open: () => go('/profilo'),
      preview: () => go(`/persone/${s.me.user.id}?anteprima`),
    };
  }
}

// Incoming connection request (design 04 · 31a richiesta in arrivo, 31c mobile, 31b dopo l'accettazione).
import { api, getMe, go, timeAgo, toast } from '../lib.js';
import { Page } from './_base.js';

export const title = 'Richiesta di connessione';
export const tabbar = true;

// publicProfile → the card shape App Person Card expects
const toCard = p => ({
  id: p.id, name: `${p.first_name} ${p.last_name}`, first_name: p.first_name, age: p.age_band ?? '',
  role: [p.current_role, p.current_company].filter(Boolean).join(' · '), from: p.lives_in_city ?? '', to: p.desired_comuni.slice(0, 2).join(', '),
  idea: p.primary_intent === 'has_idea', seeks: p.seeking.backgrounds.join(', '), tags: p.sectors.slice(0, 3).join(' · '),
  time: p.time.commitment ?? '', comp: p.complement, photo_url: p.photo_url, connection: p.connection,
});

export default class extends Page {
  async load() {
    const me = await getMe();
    this.state.me = me;
    const req = await api('GET', `/api/connections/${encodeURIComponent(this.props.params.id)}`);
    this.state.req = req;
    this.state.p = await api('GET', `/api/profiles/${req.from_id}`);
  }

  respond(action) {
    return this.act(async () => {
      await api('POST', `/api/connections/${this.state.req.id}/${action}`);
      if (action === 'accept') { this.state.accepted = true; return; }
      toast('Richiesta rifiutata.');
      go('/connessioni');
    })();
  }

  renderVals() {
    const s = this.state;
    if (!s.p) return { loading: !s.ready, gone: s.ready, me: s.me || {} };
    const p = s.p;
    const myP = s.me.profile;
    return {
      loading: false, gone: false, me: s.me,
      pending: s.req.status === 'pending' && !s.accepted, accepted: !!s.accepted, closed: s.req.status !== 'pending' && !s.accepted,
      eyebrow: `Nuova richiesta · ${timeAgo(s.req.created_at)}`,
      heading: `${p.first_name} vuole entrare in contatto con te.`,
      note: s.req.note ? `“${s.req.note}”` : '', first: p.first_name,
      person: toCard(p),
      accept: () => this.respond('accept'), decline: () => this.respond('decline'),
      photo: p.photo_url, myPhoto: myP.photo_url, myIni: `${(myP.first_name || '?')[0]}${(myP.last_name || '')[0] || ''}`,
      unlockText: `Puoi iniziare a parlare. Ora vedi anche Instagram, X e il calendario di ${p.first_name}.`,
      chat: () => go(`/messaggi/${p.id}`), later: () => go('/connessioni'), profile: () => go(`/persone/${p.id}`),
    };
  }
}

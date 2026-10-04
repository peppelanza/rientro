// Supporto (the account menu): your tickets to the Rientro team (src/support.js). /supporto lists
// them, /supporto/nuovo opens one (a subject and what you'd like to say), /supporto/<id> is its chat
// with the team. Open as many as you like; writing in a closed one reopens it.
import { clearTray, trayBusy, trayIds, trayVals } from '../image-tray.js';
import { api, fmtTime, getMe, go, timeAgo, toast, toastError } from '../lib.js';
import { photoViewer } from '../photo-viewer.js';
import { Page } from './_base.js';

export const title = 'Supporto';
export const tabbar = true;

const POLL_MS = 15000; // an open ticket checks for the team's answer
const STATUS = { open: ['Aperto', 'success'], closed: ['Chiuso', 'neutral'] };
const MAX_IMAGES = 5; // as the server (support.js)
const TRAY = { endpoint: '/api/support/images', max: MAX_IMAGES };
photoViewer('.support-images'); // the pictures in the chat open in the viewer

// A message's pictures, as a group post's (1 large, 2–5 in a grid)
export const messageImages = images => ({ hasImages: images.length > 0, images: images.map(src => ({ src })), gridCls: `group-images support-images n${Math.min(images.length, 5)}` });

export default class extends Page {
  async load() {
    this.state.me = await getMe();
    const id = this.props.params.id;
    Object.assign(this.state, { view: !id ? 'list' : id === 'nuovo' ? 'new' : 'ticket', subject: '', draft: '', images: [] });
    if (this.state.view === 'list') this.state.tickets = (await api('GET', '/api/support')).tickets;
    if (this.state.view === 'ticket') {
      this.state.ticket = await api('GET', `/api/support/${encodeURIComponent(id)}`);
      document.title = `${this.state.ticket.code} · Supporto · Rientro`;
      this.timer = setInterval(() => this.poll(), POLL_MS);
    }
  }

  componentWillUnmount() { clearInterval(this.timer); }

  async poll() {
    const t = this.state.ticket;
    if (!t || document.hidden) return;
    const fresh = await api('GET', `/api/support/${t.id}`).catch(() => null);
    if (fresh && fresh.messages.length !== t.messages.length) { this.state.ticket = fresh; this.scrollDown = true; this.__rerender(); }
  }

  create = this.act(async () => {
    const s = this.state;
    if (trayBusy(this)) return toast('Aspetta che le foto finiscano di caricarsi.');
    const t = await api('POST', '/api/support', { subject: s.subject.trim(), body: s.draft.trim(), images: trayIds(this) });
    clearTray(this);
    go(`/supporto/${t.id}`);
  });

  write = this.act(async () => {
    const s = this.state;
    if (!s.draft.trim() && !s.images.length) return;
    if (trayBusy(this)) return toast('Aspetta che le foto finiscano di caricarsi.');
    s.ticket = await api('POST', `/api/support/${s.ticket.id}`, { body: s.draft.trim(), images: trayIds(this) });
    s.draft = '';
    clearTray(this);
    this.scrollDown = true;
  });

  didRender(el) {
    if (this.state.view === 'ticket' && (this.scrollDown || !this.scrolled)) {
      this.scrollDown = false;
      this.scrolled = true;
      // the chat scrolls inside its own box, down to the latest
      const box = el.querySelector('.support-thread');
      if (box) box.scrollTop = box.scrollHeight;
    }
  }

  renderVals() {
    const s = this.state;
    if (!s.me) return { loading: true, me: {} };
    const t = s.ticket;
    return {
      loading: false, me: s.me,
      isList: s.view === 'list', isNew: s.view === 'new', isTicket: s.view === 'ticket' && !!t,
      // the list
      tickets: (s.tickets || []).map(x => ({
        href: `/supporto/${x.id}`, code: `#${x.code}`, subject: x.subject, last: x.last, when: timeAgo(x.updated_at),
        status: STATUS[x.status][0], kind: STATUS[x.status][1], unread: x.unread,
      })),
      noTickets: !!s.tickets && !s.tickets.length,
      newTicket: () => go('/supporto/nuovo'),
      // a new ticket
      subject: s.subject, subjectProps: { onInput: v => { s.subject = v; } },
      draft: s.draft, draftProps: { onInput: v => { s.draft = v; } },
      create: this.create, cancel: () => go('/supporto'),
      // a ticket: its chat with the team
      code: t ? `#${t.code}` : '', ticketSubject: t?.subject ?? '', status: t ? STATUS[t.status][0] : '', kind: t ? STATUS[t.status][1] : 'neutral',
      closed: t?.status === 'closed',
      messages: (t?.messages || []).map(m => ({ from: m.mine ? 'me' : 'them', body: m.body, hasBody: !!m.body, who: m.from_team ? 'Team Rientro' : 'Tu', at: fmtTime(m.created_at), align: m.mine ? 'flex-end' : 'flex-start', ...messageImages(m.images || []) })),
      tray: trayVals(this, TRAY),
      write: this.write, writeProps: { onInput: v => { s.draft = v; } },
      onError: toastError,
    };
  }
}

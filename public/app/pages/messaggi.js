// Messages (design 04 · 35a inbox + chat, 34a inbox vuota, 35b/35c mobile).
// New messages arrive by polling (every 5 s in an open chat, 20 s for the list).
import { api, debounce, fmtDate, fmtTime, getMe, go, threadTime } from '../lib.js';
import { block, report } from '../social.js';
import { homeFor, Page } from './_base.js';

export const title = 'Messaggi';
export const tabbar = true;

const ini = n => (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2);
const dayKey = iso => new Date(iso).toDateString();
function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'OGGI';
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'IERI';
  return fmtDate(iso).toUpperCase();
}
const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

export default class extends Page {
  async load() {
    const me = await getMe();
    if (me.user.status !== 'approved' || (!me.launched && me.user.role !== 'admin')) return go(homeFor(me));
    Object.assign(this.state, { me, query: '', page: 1, draft: '', menuOpen: false });
    await this.fetchList();
    // Whether there's any conversation at all (the search can empty the list)
    this.state.anyThreads = this.state.list.total > 0;
    const id = this.props.params.id;
    if (id) await this.openThread(id);
    this.timer = setInterval(() => this.poll(), 5000);
    this.listTimer = setInterval(() => this.refreshList(), 20000);
    window.addEventListener('popstate', () => location.reload());
  }

  async openThread(id) {
    const s = this.state;
    try {
      const [thread, person] = await Promise.all([api('GET', `/api/threads/${id}`), api('GET', `/api/profiles/${id}`)]);
      Object.assign(s, { active: id, thread, person, messages: thread.messages, draft: '', menuOpen: false, closed: false });
      const t = s.threads.find(x => x.id === id);
      if (t) t.unread = false;
      s.hasOlder = thread.has_older;
      // Opening the chat read it: the numbers in the nav go down right away
      this.syncCounts();
    } catch (err) {
      Object.assign(s, { active: id, closed: true, thread: null, person: null, messages: [] });
    }
    this.scrollDown = true;
  }

  async poll() {
    const s = this.state;
    if (!s.active || s.closed || document.hidden) return;
    const last = s.messages.at(-1)?.id ?? 0;
    const r = await api('GET', `/api/threads/${s.active}?after=${last}`).catch(() => null);
    if (r?.messages.length) {
      s.messages = [...s.messages, ...r.messages.filter(m => !s.messages.some(x => x.id === m.id))];
      this.scrollDown = true;
      this.__rerender();
    }
  }

  // Conversations: searchable on the server (?q=), 30 per page
  async fetchList() {
    const s = this.state;
    const q = new URLSearchParams({ page: String(s.page) });
    if (s.query.trim()) q.set('q', s.query.trim());
    s.list = await api('GET', `/api/threads?${q}`);
    s.threads = s.list.items;
    s.page = s.list.page;
  }

  async refreshList() {
    if (document.hidden) return;
    try { await Promise.all([this.fetchList(), this.syncCounts({ render: false })]); this.__rerender(); } catch {}
  }

  // Unread counts for the nav and tab bar (messages, requests, notifications), fresh from the server
  async syncCounts({ render = true } = {}) {
    const fresh = await getMe(true).catch(() => null);
    if (!fresh) return;
    this.state.me = fresh;
    if (render) this.__rerender();
  }

  listChange(patch) {
    Object.assign(this.state, patch);
    this.fetchList().then(() => this.__rerender()).catch(() => {});
  }

  searchTyped = debounce(v => this.listChange({ query: v, page: 1 }));

  // Older messages, 50 at a time, kept in place on screen
  loadOlder = this.act(async () => {
    const s = this.state;
    const first = s.messages[0]?.id;
    if (!first) return;
    const r = await api('GET', `/api/threads/${s.active}?before=${first}`);
    const box = document.getElementById('chat-scroll');
    const fromBottom = box ? box.scrollHeight - box.scrollTop : 0;
    s.messages = [...r.messages, ...s.messages];
    s.hasOlder = r.has_older;
    this.keepScroll = fromBottom;
  });

  send = this.act(async () => {
    const s = this.state;
    const body = s.draft.trim();
    if (!body) return;
    const m = await api('POST', `/api/threads/${s.active}`, { body });
    s.messages.push(m);
    s.draft = '';
    const t = s.threads.find(x => x.id === s.active);
    if (t) { t.last = `Tu: ${body}`; t.time = m.created_at; }
    this.scrollDown = true;
    requestAnimationFrame(() => document.querySelector('[data-key="compose"]')?.focus());
  });

  select(id) {
    history.pushState(null, '', `/messaggi/${id}`);
    this.openThread(id).then(() => this.__rerender());
  }

  didRender(el) {
    if (this.keepScroll) {
      const box = el.querySelector('#chat-scroll');
      if (box) box.scrollTop = box.scrollHeight - this.keepScroll;
      this.keepScroll = 0;
    }
    if (!this.scrollDown) return;
    this.scrollDown = false;
    const box = el.querySelector('#chat-scroll');
    if (box) box.scrollTop = box.scrollHeight;
  }

  componentWillUnmount() { clearInterval(this.timer); clearInterval(this.listTimer); }

  renderVals() {
    const s = this.state;
    if (!s.threads) return { loading: true, me: s.me || {} };
    const q = s.query.trim();
    const threads = s.threads.map(t => ({
      ...t, time: threadTime(t.time), photo: t.photo_url, ini: ini(t.name), // Where they live → where they want to go, instead of the job title
      route: t.from && t.to ? `${t.from} → ${t.to}` : t.from || t.role.split(' · ')[0],
      // Unread conversations are tinted, like unread notifications; the open one is white
      bg: t.id === s.active ? '#FFFFFF' : t.unread ? '#EFEBFF' : 'transparent', sh: t.id === s.active ? '0 8px 24px rgba(80,60,160,.10)' : 'none',
      w: t.unread ? 600 : 500, c: t.unread ? '#1A1726' : '#8C84AE', active: t.id === s.active ? 'page' : false,
      open: e => { e.preventDefault(); this.select(t.id); },
    }));
    const p = s.person;
    const name = p ? `${p.first_name} ${p.last_name}` : '';
    // Bubbles with day separators and a read receipt under my last message (35c)
    const items = [];
    let prevDay = null;
    s.messages?.forEach((m, i) => {
      const k = dayKey(m.created_at);
      if (k !== prevDay) { items.push({ sep: true, label: dayLabel(m.created_at) }); prevDay = k; }
      const next = s.messages[i + 1];
      const lastOfRun = !next || next.mine !== m.mine || dayKey(next.created_at) !== k;
      items.push({ msg: true, from: m.mine ? 'me' : 'them', text: m.body, time: lastOfRun ? (m.mine && m.read_at && !next ? `Letto · ${fmtTime(m.read_at)}` : fmtTime(m.created_at)) : '', align: m.mine ? 'flex-end' : 'flex-start' });
    });
    const since = s.thread?.connection.since;
    const L = p?.links || {};
    const links = [
      ['LinkedIn ↗', L.linkedin_url], ['Sito ↗', L.website_url], ['Instagram ↗', L.instagram_handle && `https://instagram.com/${L.instagram_handle.replace(/^@/, '')}`],
      ['X ↗', L.x_handle && `https://x.com/${L.x_handle.replace(/^@/, '')}`], ['Prenota una call ↗', L.calendar_url],
    ].filter(([, h]) => h).map(([l, href]) => ({ l, href }));
    const person = p && { id: p.id, name, first_name: p.first_name };
    return {
      loading: false, me: s.me,
      noThreads: !s.anyThreads, hasThreads: !!s.anyThreads,
      threads, noMatch: !!q && !threads.length, query: s.query,
      searchProps: { onInput: v => this.searchTyped(v) },
      page: s.list.page, pages: s.list.pages, total: s.list.total, perPage: s.list.per_page,
      pagerProps: { onPage: n => this.listChange({ page: n }) },
      hasOlder: !!s.hasOlder && !!s.messages?.length, loadOlder: this.loadOlder,
      hasActive: !!s.active && !!p, noActive: !s.active, closed: !!s.closed,
      listClass: s.active ? 'r-hide-sm' : '', chatClass: s.active ? '' : 'r-hide-sm',
      name, first: p?.first_name, photo: p?.photo_url, ini: ini(name),
      sub: p ? [p.current_role, p.lives_in_city && p.desired_comuni.length ? `${p.lives_in_city} → ${p.desired_comuni[0]}` : p.lives_in_city].filter(Boolean).join(' · ') : '',
      profileHref: p ? `/persone/${p.id}` : '#', goProfile: () => go(`/persone/${p.id}`),
      back: () => { history.pushState(null, '', '/messaggi'); s.active = null; this.__rerender(); },
      noteHeader: since ? `CONNESSI ${dayLabel(since) === 'OGGI' || dayLabel(since) === 'IERI' ? dayLabel(since) : `${WEEKDAYS[new Date(since).getDay()].toUpperCase()} ${fmtDate(since).toUpperCase()}`}` : '',
      note: s.thread?.connection.note, items, empty: s.messages && !s.messages.length,
      draft: s.draft, placeholder: p ? `Scrivi a ${p.first_name}…` : '',
      composeInput: e => { s.draft = e.target.value; },
      composeKey: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); } },
      submit: e => { e.preventDefault(); this.send(); },
      send: this.send,
      seeks: p?.seeking.backgrounds.join(', ') || '—', time: p?.time.commitment || '—', links, hasLinks: links.length > 0,
      menuOpen: s.menuOpen, toggleMenu: () => this.setState({ menuOpen: !s.menuOpen }),
      doReport: async () => { this.setState({ menuOpen: false }); const r = await report(person); if (r?.blocked) go('/messaggi'); },
      doBlock: async () => { this.setState({ menuOpen: false }); if (await block(person)) go('/messaggi'); },
      sentRequests: () => go('/connessioni?tab=inviate'),
    };
  }
}

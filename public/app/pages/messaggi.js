// Messages (design 04 · 35a inbox + chat, 34a inbox vuota, 35b/35c mobile).
// New messages arrive by polling (every 5 s in an open chat, 20 s for the list).
import { api, debounce, fmtDate, fmtTime, getMe, go, haptic, orList, overlayClosing, routeOf, threadTime, toast, toastError } from '../lib.js';
import { block, report } from '../social.js';
import { EMOJI, QUICK_REACTIONS, isEmojiOnly } from '../emoji.js';
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
// The message box grows with the text: up to 5 lines on a computer, 3 on a phone, then it scrolls
function fitCompose(ta) {
  if (!ta) return;
  const line = parseFloat(getComputedStyle(ta).lineHeight) || 22;
  const max = line * (innerWidth <= 720 ? 3 : 5);
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
}

// Phone, full-screen chat: follow the part of the screen that is actually visible. When the keyboard
// opens iOS shrinks the visual viewport and slides the page up; the chat sits exactly in what's left.
// The messages keep their place counted from the bottom, so the last ones stay in sight.
let glidingUntil = 0;
function fitViewport() {
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  const open = !!vv && document.body.classList.contains('chat-open');
  const box = document.getElementById('chat-scroll');
  const height = box?.clientHeight;
  const fromBottom = box ? box.scrollHeight - box.scrollTop - height : 0;
  root.setProperty('--vv-h', open ? `${vv.height}px` : '');
  root.setProperty('--vv-top', open ? `${vv.offsetTop}px` : '');
  document.body.classList.toggle('keyboard-open', open && innerHeight - vv.height > 120);
  // Only when the chat actually changed height (keyboard): otherwise leave the scroll alone. While
  // it's gliding to a new message, it keeps gliding to the end.
  if (!box || box.clientHeight === height) return;
  if (performance.now() < glidingUntil) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  else box.scrollTop = box.scrollHeight - box.clientHeight - fromBottom;
}
visualViewport?.addEventListener('resize', fitViewport);
visualViewport?.addEventListener('scroll', fitViewport);
// iOS reports the keyboard slide only at the end: follow it frame by frame for its duration
let followUntil = 0;
const follow = () => { fitViewport(); if (performance.now() < followUntil) requestAnimationFrame(follow); };
// The chat's scrollbar shows only while you scroll it yourself, never when it moves by itself
// (a message sent or received, older ones loaded, the keyboard): app.css
let userScrollTimer;
for (const type of ['wheel', 'touchmove']) {
  addEventListener(type, e => {
    if (!e.target.closest?.('#chat-scroll')) return;
    document.body.classList.add('chat-user-scroll');
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => document.body.classList.remove('chat-user-scroll'), 1200);
  }, { passive: true, capture: true });
}
for (const type of ['focusin', 'focusout']) {
  addEventListener(type, () => {
    if (!document.body.classList.contains('chat-open')) return;
    const running = performance.now() < followUntil;
    followUntil = performance.now() + 800;
    if (!running) requestAnimationFrame(follow);
  });
}

const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

// Loading: the conversation list as it will be (pages/_base.js skeleton()), one placeholder conversation
const FAKE_THREADS = Array.from({ length: 1 }, (_, i) => ({
  id: `sk${i}`, name: 'Nome Cognome', role: 'Ruolo · Azienda', from: 'Città', to: 'Città', photo_url: null,
  last: 'L’ultimo messaggio della conversazione', time: new Date().toISOString(), unread: false,
}));

const TO_HINT = 'Cerca tra le tue connessioni'; // the new message's "A:"
const SIDE_MS = 280; // app.css .chat-grid side-in / side-out

export default class extends Page {
  async load() {
    const me = await getMe();
    if (me.user.status !== 'approved' || (!me.launched && me.user.role !== 'admin')) return go(homeFor(me));
    Object.assign(this.state, { me, query: '', page: 1, draft: '', menuOpen: false });
    this.__rerender(); // the top bar for real, the list still a skeleton
    await this.fetchList();
    // Whether there's any conversation at all (the search can empty the list)
    this.state.anyThreads = this.state.list.total > 0;
    const id = this.props.params.id;
    // Opened from Connessioni (?da=connessioni): the back arrow goes back there, not to the list
    this.from = new URLSearchParams(location.search).get('da');
    if (id) await this.openThread(id);
    this.timer = setInterval(() => this.poll(), 5000);
    // Reaction bar, emoji pickers and the "···" menu close on a click elsewhere or Escape
    this.closePopups = e => {
      const s = this.state;
      if (!s.barFor && !s.menuFor && !s.pickerFor && !s.composePicker && !s.menuOpen) return;
      // the click that opened it re-rendered its own button: that's not a click outside
      if (e.type === 'click' && !e.target.isConnected) return;
      if (e.type === 'keydown' ? e.key !== 'Escape' : e.target.closest('.react-bar, .emoji-picker, .react-btn, .msg-more, .emoji-toggle, [role=menu], [aria-label="Altre azioni"]')) return;
      this.setState({ barFor: null, menuFor: null, pickerFor: null, composePicker: false, menuOpen: false });
    };
    document.addEventListener('click', this.closePopups);
    document.addEventListener('keydown', this.closePopups);
    // the chat box is redrawn often: listen at the document (scroll events don't bubble, so capture)
    document.addEventListener('scroll', this.onChatScroll, true);
    this.listTimer = setInterval(() => this.refreshList(), 20000);
    window.addEventListener('popstate', () => { if (!overlayClosing()) location.reload(); });
  }

  async openThread(id) {
    const s = this.state;
    try {
      const [thread, person] = await Promise.all([api('GET', `/api/threads/${id}`), api('GET', `/api/profiles/${id}`)]);
      Object.assign(s, { active: id, thread, person, messages: thread.messages, draft: '', replyTo: null, menuOpen: false, closed: false, reactAt: thread.at, barFor: null, menuFor: null, pickerFor: null, composePicker: false });
      this.known = new Set(thread.messages.map(m => m.id));
      const t = s.threads.find(x => x.id === id);
      if (t) t.unread = false;
      s.hasOlder = thread.has_older;
      // Opening the chat read it: the numbers in the nav go down right away
      this.syncCounts();
    } catch (err) {
      Object.assign(s, { active: id, closed: true, thread: null, person: null, messages: [] });
    }
    this.scrollDown = true;
    // however the chat was reached (the list, Connessioni, a notification, a profile, a new
    // message), the cursor waits in the box, ready to write (didRender)
    this.focusCompose = !s.closed;
    s.composeLeft = false; // no hint until the box is left (see composeHint)
  }

  async poll() {
    const s = this.state;
    if (!s.active || s.closed || document.hidden) return;
    const last = s.messages.at(-1)?.id ?? 0;
    const since = s.reactAt ? `&since=${encodeURIComponent(s.reactAt)}` : '';
    const r = await api('GET', `/api/threads/${s.active}?after=${last}${since}`).catch(() => null);
    if (!r) return;
    s.reactAt = r.at;
    let changed = false;
    // Reactions added or removed meanwhile (by the other person, or by me in another tab)
    for (const c of r.reactions_changed || []) {
      const m = s.messages.find(x => x.id === c.id);
      if (m && JSON.stringify(m.reactions) !== JSON.stringify(c.reactions)) { m.reactions = c.reactions; changed = true; }
    }
    if (r.messages.length) {
      s.messages = [...s.messages, ...r.messages.filter(m => !s.messages.some(x => x.id === m.id))];
      // Follow the conversation only if you were at the bottom; reading older messages isn't interrupted
      const box = document.getElementById('chat-scroll');
      if (!box || box.scrollHeight - box.scrollTop - box.clientHeight < 120) { this.scrollDown = true; this.smooth = true; }
      changed = true;
    }
    if (changed) this.__rerender();
  }

  // One reaction per message, on the other person's messages: the same emoji again removes it
  async react(m, emoji) {
    const s = this.state;
    const mine = m.reactions?.find(r => r.mine);
    const next = mine?.emoji === emoji ? null : emoji;
    const others = (m.reactions || []).filter(r => !r.mine);
    m.reactions = next ? [...others, { emoji: next, mine: true }] : others;
    Object.assign(s, { barFor: null, menuFor: null, pickerFor: null });
    this.__rerender();
    try {
      const res = await api('PUT', `/api/threads/${s.active}/messages/${m.id}/reaction`, { emoji: next });
      m.reactions = res.reactions;
    } catch (err) {
      m.reactions = [...others, ...(mine ? [mine] : [])];
      toastError(err);
    }
    this.__rerender();
  }

  // Long press on a message: reactions bar (theirs) and the Rispondi / Copia menu; double tap on
  // theirs = ❤️
  tapDown(e, m) {
    if (e.target.closest('button')) return;
    clearTimeout(this.pressTimer);
    this.pressed = false;
    this.pressTimer = setTimeout(() => { this.pressed = true; haptic(); this.setState({ barFor: m.mine ? null : m.id, menuFor: m.id, pickerFor: null }); }, 450);
  }
  tapUp(e, m) {
    clearTimeout(this.pressTimer);
    if (e.target.closest('button')) return;
    if (this.pressed) { this.pressed = false; return; }
    if (m.mine) return;
    const t = Date.now();
    if (this.lastTap?.id === m.id && t - this.lastTap.t < 320) {
      this.lastTap = null;
      getSelection()?.removeAllRanges();
      this.react(m, '❤️');
    } else this.lastTap = { id: m.id, t };
  }

  reply(m) {
    this.setState({ replyTo: { id: m.id, mine: m.mine, body: m.body }, barFor: null, menuFor: null, pickerFor: null });
    requestAnimationFrame(() => document.querySelector('[data-key="compose"]')?.focus());
  }

  async copy(m) {
    this.setState({ barFor: null, menuFor: null, pickerFor: null });
    try { await navigator.clipboard.writeText(m.body); toast('Messaggio copiato'); } catch { toast('Non siamo riusciti a copiare il messaggio.', { tone: 'err' }); }
  }

  // Tapping the quote in a reply shows the original message, if it's loaded
  jumpTo(id) {
    const el = document.querySelector(`#chat-scroll [data-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('msg-flash');
    void el.offsetWidth;
    el.classList.add('msg-flash');
  }

  // Composer: the emoji goes where the cursor is; the picker stays open for more
  insertEmoji(emoji) {
    const s = this.state;
    const ta = document.querySelector('[data-key="compose"]');
    const at = ta ? ta.selectionStart ?? s.draft.length : s.draft.length;
    const end = ta ? ta.selectionEnd ?? at : at;
    s.draft = s.draft.slice(0, at) + emoji + s.draft.slice(end);
    if (ta) {
      ta.value = s.draft;
      ta.focus();
      ta.setSelectionRange(at + emoji.length, at + emoji.length);
      fitCompose(ta);
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

  // Pull to refresh: the conversations and the open chat (load() also starts timers and listeners)
  async refresh() { await Promise.all([this.refreshList(), this.poll()]); }

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

  // Older messages, 50 at a time, loaded by themselves as you scroll near the top (onChatScroll);
  // what you were reading stays in place on screen
  async loadOlder() {
    const s = this.state;
    const first = s.messages?.[0]?.id;
    if (!first || !s.hasOlder || s.loadingOlder) return;
    const active = s.active;
    this.setState({ loadingOlder: true });
    try {
      const r = await api('GET', `/api/threads/${active}?before=${first}`);
      if (s.active !== active) return; // another chat was opened meanwhile
      const box = document.getElementById('chat-scroll');
      this.keepScroll = box ? box.scrollHeight - box.scrollTop : 0;
      s.messages = [...r.messages, ...s.messages];
      for (const o of r.messages) this.known?.add(o.id);
      s.hasOlder = r.has_older;
    } catch (err) {
      toastError(err);
    } finally {
      s.loadingOlder = false;
      this.__rerender();
    }
  }

  onChatScroll = e => {
    if (e.target.id === 'chat-scroll' && e.target.scrollTop < 300) this.loadOlder();
  };

  send = this.act(async () => {
    const s = this.state;
    const body = s.draft.trim();
    if (!body) return;
    const m = await api('POST', `/api/threads/${s.active}`, { body, ...(s.replyTo ? { reply_to: s.replyTo.id } : {}) });
    s.messages.push(m);
    s.draft = '';
    s.replyTo = null;
    this.smooth = true;
    const t = s.threads.find(x => x.id === s.active);
    if (t) { t.last = `Tu: ${body}`; t.time = m.created_at; }
    else { await this.fetchList(); s.anyThreads = true; } // the first message: the conversation joins the list
    this.scrollDown = true;
    requestAnimationFrame(() => document.querySelector('[data-key="compose"]')?.focus());
  });

  // The right column, with or without a person: the change plays a fade (side-in / side-out). The
  // page is redrawn anew meanwhile (new elements), so each redraw carries on from where it was
  // (sideDelay: a negative delay) instead of starting it again
  sideClass(side) {
    if (this.side !== undefined && this.side !== side) this.sideAnim = { cls: side ? ' side-in' : ' side-out', at: performance.now() };
    this.side = side;
    const t = this.sideAnim ? performance.now() - this.sideAnim.at : Infinity;
    if (t > SIDE_MS) this.sideAnim = null;
    return { cls: `${side ? '' : 'no-side'}${this.sideAnim?.cls ?? ''}`, delay: `${-Math.round(Math.min(t, SIDE_MS))}ms` };
  }

  // New message (the pencil by "Messaggi"): the middle column asks who to, among your connections;
  // picking one opens the chat, which joins the list with its first message
  startNew() {
    const s = this.state;
    history.pushState(null, '', '/messaggi');
    Object.assign(s, { composing: true, active: null, closed: false, toQuery: '', toLeft: false, menuOpen: false });
    this.__rerender();
    requestAnimationFrame(() => document.querySelector('[data-key="new-to"]')?.focus());
    this.findContacts('');
  }
  async findContacts(q) {
    const r = await api('GET', `/api/connections?${new URLSearchParams({ tab: 'connected', ...(q ? { q } : {}) })}`).catch(() => null);
    if (r && this.state.composing) { this.state.contacts = r.items; this.__rerender(); }
  }
  findTyped = debounce(v => this.findContacts(v.trim()));
  pickContact(id) {
    this.state.composing = false;
    this.select(id);
  }

  select(id) {
    this.state.composing = false;
    this.from = null;
    history.pushState(null, '', `/messaggi/${id}`);
    this.openThread(id).then(() => this.__rerender());
  }

  didRender(el) {
    // Phone: an open chat takes the whole screen (no top bar, no bottom menu); app.css
    document.body.classList.toggle('chat-open', (!!this.state.active && !this.state.closed) || !!this.state.composing);
    fitViewport();
    fitCompose(el.querySelector('[data-key="compose"]'));
    if (this.keepScroll) {
      const box = el.querySelector('#chat-scroll');
      if (box) box.scrollTop = box.scrollHeight - this.keepScroll;
      this.keepScroll = 0;
    }
    if (this.focusCompose) {
      const box = el.querySelector('[data-key="compose"]');
      if (box) { this.focusCompose = false; box.focus({ preventScroll: true }); }
    }
    // Messages drawn once are no longer new (the entrance animation plays once)
    for (const m of this.state.messages || []) this.known?.add(m.id);
    if (!this.scrollDown) return;
    this.scrollDown = false;
    const box = el.querySelector('#chat-scroll');
    if (!box) return;
    // A new message: the chat glides up to make room (like WhatsApp); opening a chat: straight to the end
    if (this.smooth) { glidingUntil = performance.now() + 700; box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' }); }
    else box.scrollTop = box.scrollHeight;
    this.smooth = false;
  }

  componentWillUnmount() {
    document.body.classList.remove('chat-open');
    fitViewport();
    clearInterval(this.timer); clearInterval(this.listTimer);
    document.removeEventListener('click', this.closePopups);
    document.removeEventListener('keydown', this.closePopups);
    document.removeEventListener('scroll', this.onChatScroll, true);
  }

  renderVals() {
    const s = this.state;
    if (!s.threads) return this.skeleton({ threads: FAKE_THREADS, list: { total: 1, page: 1, pages: 1, per_page: 30, items: FAKE_THREADS }, anyThreads: true, query: s.query ?? '', active: null });
    const q = s.query.trim();
    const threads = s.threads.map(t => ({
      ...t, time: threadTime(t.time), photo: t.photo_url, ini: ini(t.name), // Where they live → where they want to go, instead of the job title
      route: routeOf(t) || t.role.split(' · ')[0],
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
    const n = s.messages?.length || 0;
    s.messages?.forEach((m, i) => {
      const k = dayKey(m.created_at);
      if (k !== prevDay) { items.push({ sep: true, label: dayLabel(m.created_at) }); prevDay = k; }
      const next = s.messages[i + 1];
      const reaction = (m.reactions || [])[0];
      const big = isEmojiOnly(m.body);
      items.push({
        msg: true, from: m.mine ? 'me' : 'them', text: m.body, big, normal: !big,
        // the pointed corner only on the last of a run of messages from the same person (same day)
        tail: !next || next.mine !== m.mine || dayKey(next.created_at) !== k ? '1' : '', isNew: this.known && !this.known.has(m.id) ? '1' : '',
        // the time sits inside the bubble; under my last message, once read, "Letto · hh:mm"
        at: fmtTime(m.created_at), time: m.mine && m.read_at && !next ? `Letto · ${fmtTime(m.read_at)}` : '', align: m.mine ? 'flex-end' : 'flex-start',
        // reactions: only on the other person's messages (mine on theirs, theirs on mine)
        id: m.id, canReact: !m.mine, hasReaction: !!reaction, reaction: reaction?.emoji ?? '',
        // a reply shows the message it answers on top (tap: go to it)
        hasQuote: !!m.reply, quoteName: m.reply ? (m.reply.mine ? 'Tu' : p?.first_name || '') : '', quoteText: m.reply?.body ?? '',
        jump: e => { e.stopPropagation(); if (m.reply) this.jumpTo(m.reply.id); },
        chipAria: reaction ? (reaction.mine ? `La tua reazione ${reaction.emoji}: tocca per toglierla` : `Reazione ${reaction.emoji}`) : '',
        chip: () => { if (reaction?.mine) this.react(m, reaction.emoji); },
        pb: reaction ? '14px' : '0',
        down: e => this.tapDown(e, m), up: e => this.tapUp(e, m), cancel: () => clearTimeout(this.pressTimer),
        ctx: e => { if (matchMedia('(hover: none)').matches) e.preventDefault(); },
        openBar: () => this.setState({ barFor: s.barFor === m.id ? null : m.id, menuFor: null, pickerFor: null }),
        // computer: the ⌄ in the corner of the bubble on hover opens the menu, like WhatsApp Desktop
        openMenu: e => { e.stopPropagation(); this.setState({ menuFor: s.menuFor === m.id ? null : m.id, barFor: null, pickerFor: null }); },
        barOpen: s.barFor === m.id, actionsOpen: s.menuFor === m.id, pickerOpen: s.pickerFor === m.id,
        // Reactions above the message, menu below; near the top of the chat both below, near the end
        // both above, so nothing is cut off
        barPos: i < 2 ? 'top:calc(100% + 6px)' : i >= n - 2 && s.menuFor === m.id ? 'bottom:calc(100% + 112px)' : 'bottom:calc(100% + 6px)',
        actionsPos: i < 2 ? `top:calc(100% + ${s.barFor === m.id ? 58 : 6}px)` : i >= n - 2 ? 'bottom:calc(100% + 6px)' : 'top:calc(100% + 6px)',
        doReply: () => this.reply(m), doCopy: () => this.copy(m),
        quick: QUICK_REACTIONS.map(q => ({ e: q, on: reaction?.mine && reaction.emoji === q ? '#EFEBFF' : 'transparent', pick: () => this.react(m, q) })),
        more: () => this.setState({ pickerFor: m.id, barFor: null }),
        all: EMOJI.map(q => ({ e: q, pick: () => this.react(m, q) })),
      });
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
      // (a chat opened before its first message, from a profile or Connessioni, shows even with no conversation yet)
      noThreads: !s.anyThreads && !s.active && !s.composing, hasThreads: !!s.anyThreads || !!s.active || !!s.composing,
      threads, noMatch: !!q && !threads.length, query: s.query,
      similarOnly: !!q && !!s.list?.fuzzy && threads.length > 0, // a typo forgiven (src/search.js)
      searchProps: { onInput: v => this.searchTyped(v) },
      page: s.list.page, pages: s.list.pages, total: s.list.total, perPage: s.list.per_page,
      pagerProps: { onPage: n => this.listChange({ page: n }) },
      hasOlder: !!s.hasOlder && !!s.messages?.length, loadingOlder: !!s.loadingOlder,
      hasActive: !!s.active && !!p, noActive: !s.active && !s.composing, closed: !!s.closed,
      // the right column (the person) only with a chat open; it fades in and out (app.css)
      ...(side => ({ sideCls: side.cls, sideDelay: side.delay }))(this.sideClass(!!s.active && !!p)),
      listClass: s.active || s.composing ? 'r-hide-sm' : '', chatClass: s.active || s.composing ? '' : 'r-hide-sm',
      // new message: who to, among your connections
      startNew: () => this.startNew(), composing: !!s.composing, toQuery: s.toQuery ?? '',
      // the hint only once you've left the field (it opens focused: shown first, it would flash)
      // (set on the field itself, not by redrawing: the click that took the focus may be on a contact)
      toHint: s.toLeft ? TO_HINT : '',
      toProps: { onInput: v => { s.toQuery = v; this.findTyped(v); }, onBlur: () => {
        s.toLeft = true;
        const f = document.querySelector('[data-key="new-to"]');
        if (f) f.placeholder = TO_HINT;
      } },
      contacts: (s.contacts || []).map(c => ({ name: c.name, role: c.role.split(' · ')[0], photo: c.photo_url, ini: ini(c.name), pick: () => this.pickContact(c.id) })),
      noContacts: !!s.contacts && !s.contacts.length, noContactsLabel: s.toQuery ? `Nessuna connessione per “${s.toQuery}”.` : 'Non hai ancora connessioni a cui scrivere.',
      cancelNew: () => { s.composing = false; this.__rerender(); },
      name, first: p?.first_name, photo: p?.photo_url, ini: ini(name),
      // under the name: where they live → where they want to go (no job title), as in the list
      sub: p ? [p.lives_in_city, orList(p.desired_comuni, 3)].filter(Boolean).join(' → ') : '',
      profileHref: p ? `/persone/${p.id}?da=messaggi` : '#', goProfile: () => go(`/persone/${p.id}?da=messaggi`),
      back: () => {
        if (this.from === 'connessioni') return go('/connessioni');
        history.pushState(null, '', '/messaggi'); s.active = null; this.__rerender();
        // The keyboard may have left the page scrolled (iOS): the list starts from the top
        document.activeElement?.blur();
        window.scrollTo(0, 0);
      },
      noteHeader: since ? `CONNESSI ${dayLabel(since) === 'OGGI' || dayLabel(since) === 'IERI' ? dayLabel(since) : `${WEEKDAYS[new Date(since).getDay()].toUpperCase()} ${fmtDate(since).toUpperCase()}`}` : '',
      note: s.thread?.connection.note, items, empty: s.messages && !s.messages.length,
      draft: s.draft, placeholder: p ? `Scrivi a ${p.first_name}…` : '',
      // the chat opens with the cursor in the box: its hint only once you've left it (it would flash);
      // set on the box itself, not by redrawing (the click that took the focus may be on a message)
      composeHint: s.composeLeft && p ? `Scrivi a ${p.first_name}…` : '',
      composeBlur: e => { if (!p) return; s.composeLeft = true; e.target.placeholder = `Scrivi a ${p.first_name}…`; },
      replying: !!s.replyTo, replyName: s.replyTo ? (s.replyTo.mine ? 'Tu' : p?.first_name || '') : '', replyText: s.replyTo?.body ?? '',
      cancelReply: () => this.setState({ replyTo: null }),
      composeInput: e => { s.draft = e.target.value; fitCompose(e.target); },
      composePicker: !!s.composePicker, toggleComposePicker: () => this.setState({ composePicker: !s.composePicker, barFor: null, pickerFor: null }),
      composeEmoji: EMOJI.map(q => ({ e: q, pick: () => this.insertEmoji(q) })),
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

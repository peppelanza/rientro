// Gruppi, laid out like "Il tuo profilo": the groups in the side menu, the chosen one on the right
// (none at first; on phones the page is just the menu and a group opens on its own). Anyone with a
// profile can write a post and comment, delete their own (admins any), report someone else's. Newest posts first, 20 per page; under each post its last
// 3 comments. The page is public too: without an account (or before launch) it's read-only, with only
// the authors' names and photos, and an invitation to sign up (the server writes it into the HTML too).
import { EMOJI } from '../emoji.js';
import { shrinkImage } from '../image-shrink.js';
import { api, go, overlayClosing, setMe, timeAgo, toast, toastError, upload } from '../lib.js';
import { nsfwCheck, warmUpNsfwCheck } from '../nsfw.js';
import { photoViewer } from '../photo-viewer.js';
import { report } from '../social.js';
import { stickSide } from '../sticky-side.js';
import { homeFor, Page, peekMe } from './_base.js';

photoViewer('.group-images'); // the photos in posts open in the viewer

export const title = 'Gruppi';
export const tabbar = true;

const MAX_IMAGES = 5; // as the server (groups.js)
const ini = n => (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2);

// Loading: the group as it will be (pages/_base.js skeleton()); its name, cover and the menu are
// real as soon as the list of groups is in, one placeholder post
const FAKE_POST = i => ({
  id: -1 - i, body: 'Il testo di un post, abbastanza lungo da andare a capo come uno vero scritto nel gruppo.', images: [],
  created_at: new Date().toISOString(), author: { id: '', name: 'Nome Cognome', photo_url: null, role: 'Ruolo · Azienda' },
  mine: false, comments_count: 0, comments: [],
});
const skeletonState = s => {
  const known = s.groups?.find(g => g.id === s.id);
  return {
    member: s.member ?? true, id: s.id || 'sk', groups: s.groups || [],
    group: { name: 'Nome del gruppo', description: 'Una riga che racconta il gruppo.', posts: 3, following: false, ...known },
    feed: { items: [FAKE_POST(0)], page: 1, pages: 1, total: 1 },
  };
};

export default class extends Page {
  async load() {
    const me = await peekMe();
    if (me) setMe(me);
    const member = !!me && me.user.status === 'approved' && (me.launched || me.user.role === 'admin');
    const id = this.props.params.id || null;
    if (!member && !id) return go(homeFor(me)); // the list is for members (the server sends visitors to sign in)
    // ?post=: that one post on its own (opened from the search), under a fixed bar to the whole group
    const post = Number(new URLSearchParams(location.search).get('post')) || null;
    Object.assign(this.state, { me, member, id, post, draft: '', images: [], emojiOpen: false, drafts: {}, open: {}, menuFor: null, page: Math.max(1, Number(new URLSearchParams(location.search).get('page')) || 1) });
    this.__rerender(); // the top bar for real, the group still a skeleton
    if (member) { this.state.groups = (await api('GET', '/api/groups')).groups; this.__rerender(); }
    if (id) await this.fetchAll();
    addEventListener('popstate', () => { if (!overlayClosing()) location.reload(); });
  }

  // Another group from the menu, in place (the address follows)
  async select(id) {
    const s = this.state;
    if (id === s.id) return;
    history.pushState(null, '', id ? `/gruppi/${id}` : '/gruppi');
    Object.assign(s, { id, post: null, group: null, feed: null, page: 1, draft: '', images: [], emojiOpen: false, drafts: {}, open: {}, menuFor: null });
    this.__rerender();
    window.scrollTo(0, 0);
    if (id) { try { await this.fetchAll(); } catch (err) { toastError(err); } }
    this.__rerender();
  }

  didRender(el) {
    // The menu stays in view while scrolling, as Scopri's filters do
    stickSide(el.querySelector('.groups-aside'));
    // The bar at the top shows once the post box (or the sign-up box) has scrolled away above
    this.barWatch?.disconnect();
    const box = el.querySelector('.group-compose');
    if (!box) return document.body.classList.remove('group-bar-on'); // (otherwise the observer says, without a flicker on redraws)
    this.barWatch = new IntersectionObserver(([e]) => document.body.classList.toggle('group-bar-on', !e.isIntersecting && e.boundingClientRect.top < 0));
    this.barWatch.observe(box);
  }

  componentDidMount() {
    super.componentDidMount();
    // A post's "···" menu and the emoji picker close on a click elsewhere
    this.closeMenu = e => {
      const s = this.state;
      if (s.menuFor && !e.target.closest('.group-more, .group-menu')) this.setState({ menuFor: null });
      // (a click that redrew its own button isn't one outside: its target is gone from the page)
      if (s.emojiOpen && e.target.isConnected && !e.target.closest('.emoji-picker, .emoji-toggle')) this.setState({ emojiOpen: false });
    };
    addEventListener('click', this.closeMenu);
  }
  componentWillUnmount() {
    removeEventListener('click', this.closeMenu);
    this.barWatch?.disconnect();
    document.body.classList.remove('group-bar-on');
  }

  async fetchAll() {
    const s = this.state;
    const id = encodeURIComponent(s.id);
    document.title = `${s.groups?.find(g => g.id === s.id)?.name ?? 'Gruppi'} · Gruppi · Rientro`;
    if (!s.member) {
      const r = await api('GET', `/api/public/groups/${id}?page=${s.page}`);
      Object.assign(s, { group: r.group, feed: r.posts });
      return;
    }
    if (s.post) {
      const [group, post] = await Promise.all([api('GET', `/api/groups/${id}`), api('GET', `/api/groups/${id}/posts/${s.post}`)]);
      Object.assign(s, { group, feed: { items: [post], page: 1, pages: 1, total: 1 }, open: { [post.id]: true } });
      return;
    }
    [s.group, s.feed] = await Promise.all([api('GET', `/api/groups/${id}`), api('GET', `/api/groups/${id}/posts?page=${s.page}`)]);
  }

  async toggleFollow() {
    const g = this.state.group;
    if (!g) return;
    const on = !g.following;
    g.following = on; // at once; put back if the server says no
    this.__rerender();
    try {
      await api(on ? 'POST' : 'DELETE', `/api/groups/${encodeURIComponent(g.id)}/follow`);
      toast(on ? `Ti avviseremo dei nuovi post in ${g.name}.` : `Non riceverai più notifiche da ${g.name}.`);
    } catch (err) {
      g.following = !on;
      this.__rerender();
      toastError(err);
    }
  }

  // Pull to refresh (pull-refresh.js): the group and its posts, keeping what you're writing
  async refresh() {
    const s = this.state;
    if (s.member) s.groups = (await api('GET', '/api/groups')).groups;
    if (s.id) await this.fetchAll();
  }

  // The regions in the menu: as the member left them, otherwise open only while one is shown
  get regionsOpen() {
    const s = this.state;
    return s.regionsOpen ?? s.groups?.find(x => x.id === s.id)?.kind === 'region';
  }

  // Pictures for the post (up to 5), picked one or several at a time: all show at once, then each is
  // resized and converted (image-shrink.js), checked for explicit content and uploaded, side by side,
  // so publishing only has to send their ids
  async addImages(files) {
    const s = this.state;
    const room = MAX_IMAGES - s.images.length;
    if (files.length > room) toast(`Puoi aggiungere al massimo ${MAX_IMAGES} foto.`, { tone: 'err' });
    const added = [...files].slice(0, Math.max(0, room)).map(file => ({ file, key: Math.random().toString(36).slice(2), preview: URL.createObjectURL(file) }));
    s.images.push(...added);
    this.__rerender();
    await Promise.all(added.map(async img => {
      try {
        const blob = await shrinkImage(img.file);
        if ((await nsfwCheck(blob))?.blocked) throw new Error('Questa immagine non può essere pubblicata su Rientro.');
        const r = await upload('/api/groups/images', blob);
        img.id = r.id;
      } catch (err) {
        s.images = s.images.filter(x => x !== img);
        URL.revokeObjectURL(img.preview);
        toast(err.message, { tone: 'err' });
      }
      delete img.file;
      this.__rerender();
    }));
  }

  removeImage(img) {
    const s = this.state;
    s.images = s.images.filter(x => x !== img);
    URL.revokeObjectURL(img.preview);
    this.__rerender();
  }

  // The emoji goes where the cursor is in the post box (computer only: phones have it on the keyboard)
  insertEmoji(emoji) {
    const s = this.state;
    const ta = document.querySelector('[data-key="group-post"]');
    const at = ta?.selectionStart ?? s.draft.length;
    const end = ta?.selectionEnd ?? at;
    s.draft = s.draft.slice(0, at) + emoji + s.draft.slice(end);
    if (!ta) return this.__rerender();
    ta.value = s.draft;
    ta.focus();
    ta.setSelectionRange(at + emoji.length, at + emoji.length);
    ta.dispatchEvent(new Event('input', { bubbles: true })); // grows with the text
  }

  publish = this.act(async () => {
    const s = this.state;
    const body = s.draft.trim();
    if (s.images.some(i => !i.id)) return toast('Aspetta che le foto finiscano di caricarsi.');
    if (!body && !s.images.length) return;
    const post = await api('POST', `/api/groups/${encodeURIComponent(s.id)}/posts`, { body, images: s.images.map(i => i.id) });
    s.images.forEach(i => URL.revokeObjectURL(i.preview));
    Object.assign(s, { images: [], emojiOpen: false });
    s.draft = '';
    if (s.page === 1) s.feed.items.unshift(post);
    s.group.posts++;
  });

  async comment(p) {
    const s = this.state;
    const body = (s.drafts[p.id] || '').trim();
    if (!body) return;
    try {
      const c = await api('POST', `/api/groups/${encodeURIComponent(s.id)}/posts/${p.id}/comments`, { body });
      s.drafts[p.id] = '';
      p.comments.push(c);
      p.comments_count++;
      this.__rerender();
    } catch (err) { toastError(err); }
  }

  async allComments(p) {
    try {
      p.comments = (await api('GET', `/api/groups/${encodeURIComponent(this.state.id)}/posts/${p.id}/comments`)).comments;
      this.state.open[p.id] = true;
      this.__rerender();
    } catch (err) { toastError(err); }
  }

  async remove(p, c) {
    const s = this.state;
    if (!confirm(c ? 'Eliminare il commento?' : 'Eliminare il post e i suoi commenti?')) return;
    try {
      await api('DELETE', `/api/groups/${encodeURIComponent(s.id)}/posts/${p.id}${c ? `/comments/${c.id}` : ''}`);
      if (c) { p.comments = p.comments.filter(x => x.id !== c.id); p.comments_count--; }
      else { s.feed.items = s.feed.items.filter(x => x.id !== p.id); s.group.posts--; }
      s.menuFor = null;
      this.__rerender();
    } catch (err) { toastError(err); }
  }

  renderVals() {
    const s = this.state;
    if ((!s.me && !s.group) || (s.id && !s.group)) return this.skeleton(skeletonState(s));
    const g = s.group || {};
    const admin = s.me?.user.role === 'admin';
    // Outside Rientro the author is just a name and a photo; the profile is behind sign-up
    const person = a => ({ name: a.name, photo: a.photo_url, ini: ini(a.name), role: a.role || '', href: s.member ? `/persone/${a.id}` : '/accedi' });
    const comment = (p, c) => ({ ...c, who: person(c.author), when: timeAgo(c.created_at), canDelete: c.mine || admin, del: () => this.remove(p, c) });
    const phone = matchMedia('(max-width: 720px)').matches;
    const posts = (s.feed?.items || []).map(p => ({
      ...p, anchor: `post-${p.id}`, who: person(p.author), when: timeAgo(p.created_at),
      hasBody: !!p.body, images: (p.images || []).map(src => ({ src })), hasImages: !!p.images?.length, gridCls: `group-images n${Math.min(p.images?.length || 0, 5)}`,
      comments: p.comments.map(c => comment(p, c)),
      more: !s.open[p.id] && p.comments_count > p.comments.length, moreLabel: `Vedi tutti i ${p.comments_count} commenti`, showMore: () => this.allComments(p),
      menuOpen: s.menuFor === p.id, toggleMenu: () => this.setState({ menuFor: s.menuFor === p.id ? null : p.id }),
      canDelete: p.mine || admin, del: () => this.remove(p), canReport: !p.mine, hasMenu: s.member,
      doReport: async () => { this.setState({ menuFor: null }); await report({ id: p.author.id, name: p.author.name }, { postId: p.id }); },
      replyField: `reply-${p.id}`, draft: s.drafts[p.id] || '',
      // Invio sends on a computer (Shift+Invio: a new line); on a phone the keyboard's Invio is a new
      // line and "Invia" sends
      draftProps: { onInput: v => { s.drafts[p.id] = v; }, ...(phone ? {} : { onEnter: () => this.comment(p) }) },
      send: () => this.comment(p),
    }));
    return {
      loading: false, me: s.me || {}, g, member: s.member, visitor: !s.member,
      // the menu (members); on phones either the menu or the open group
      // Generale, then the regions under their own title, folded until opened (open by itself while
      // you're in one of them)
      menu: (s.groups || []).flatMap((x, i, all) => [
        ...(x.kind === 'region' && all[i - 1]?.kind !== 'region' ? [{ heading: 'Regioni', open: this.regionsOpen, toggle: () => { s.regionsOpen = !this.regionsOpen; this.__rerender(); } }] : []),
        ...(x.kind === 'region' && !this.regionsOpen ? [] : [{ l: x.name, href: `/gruppi/${x.id}`, click: e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); this.select(x.id); } }]),
      ]),
      activeLabel: s.groups?.find(x => x.id === s.id)?.name ?? '',
      layoutCls: s.member ? 'groups-layout' : 'groups-layout solo', asideCls: s.id ? 'groups-aside r-hide-sm' : 'groups-aside',
      mainCls: s.id ? 'groups-main' : 'groups-main r-hide-sm',
      hasGroup: !!s.group, choosing: !s.id, opening: !!s.id && !s.group,
      backToList: e => { e.preventDefault(); this.select(null); },
      // one post on its own (?post=): a fixed bar with the group's name and the way to all of it
      onePost: !!s.post, wholeGroup: !s.post, groupHref: `/gruppi/${s.id}`,
      openGroupClick: e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); const id = s.id; s.id = null; this.select(id); },
      postCls: s.post ? 'group-post group-post-found' : 'group-post', // the post found: a purple frame
      // "Pubblica" in the top bar: back to the post box, ready to type. On a computer all the way up to
      // the top of the page; on a phone just far enough for the box to reach the top of the screen
      toComposer: () => {
        const box = document.querySelector('[data-key="group-post"]');
        const phone = matchMedia('(max-width: 720px)').matches;
        const top = phone && box ? box.closest('.group-compose').getBoundingClientRect().top + scrollY - 12 : 0;
        scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        box?.focus({ preventScroll: true });
      },
      // The bell on the group: its new posts in the notifications (and by email, with "Gruppi" on)
      followPressed: s.group?.following ? 'true' : 'false',
      followLabel: s.group?.following ? 'Non ricevere più le notifiche di questo gruppo' : 'Ricevi una notifica per ogni nuovo post',
      toggleFollow: () => this.toggleFollow(),
      signUp: () => go('/accedi'), headerProps: { onEnter: () => go('/accedi') },
      stats: g.posts ? `${g.posts} post` : '', // nothing when there are none yet
      draft: s.draft, draftProps: { onInput: v => { s.draft = v; } }, publish: this.publish,
      // pictures and emoji in the post box
      // (a copy: emptying the field, so the same picture can be picked again, empties its list too)
      pick: e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) { warmUpNsfwCheck(); this.addImages(files); } },
      canAddImage: s.images.length < MAX_IMAGES,
      pending: s.images.map(img => ({ src: img.preview, uploading: !img.id, remove: () => this.removeImage(img) })),
      hasPending: s.images.length > 0,
      emojiOpen: s.emojiOpen, toggleEmoji: () => this.setState({ emojiOpen: !s.emojiOpen }),
      emoji: EMOJI.map(q => ({ e: q, pick: () => this.insertEmoji(q) })),
      posts, empty: !!s.feed && !posts.length,
      page: s.feed?.page ?? 1, pages: s.feed?.pages ?? 1, total: s.feed?.total ?? 0, perPage: s.feed?.per_page ?? 20,
      pagerProps: { onPage: n => { location.search = `?page=${n}`; } },
    };
  }
}

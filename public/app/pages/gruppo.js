// Gruppi, laid out like "Il tuo profilo": the groups in the side menu, the chosen one on the right
// (none at first; on phones the page is just the menu and a group opens on its own). Anyone with a
// profile can write a post and comment, delete their own (admins any), report someone else's. Newest posts first, 20 per page; under each post its last
// 3 comments. The page is public too: without an account (or before launch) it's read-only, with only
// the authors' names and photos, and an invitation to sign up (the server writes it into the HTML too).
import { api, go, setMe, timeAgo, toastError } from '../lib.js';
import { report } from '../social.js';
import { homeFor, Page, peekMe } from './_base.js';

export const title = 'Gruppi';
export const tabbar = true;

const ini = n => (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2);

export default class extends Page {
  async load() {
    const me = await peekMe();
    if (me) setMe(me);
    const member = !!me && me.user.status === 'approved' && (me.launched || me.user.role === 'admin');
    const id = this.props.params.id || null;
    if (!member && !id) return go(homeFor(me)); // the list is for members (the server sends visitors to sign in)
    Object.assign(this.state, { me, member, id, draft: '', drafts: {}, open: {}, menuFor: null, page: Math.max(1, Number(new URLSearchParams(location.search).get('page')) || 1) });
    if (member) this.state.groups = (await api('GET', '/api/groups')).groups;
    if (id) await this.fetchAll();
    addEventListener('popstate', () => location.reload());
  }

  // Another group from the menu, in place (the address follows)
  async select(id) {
    const s = this.state;
    if (id === s.id) return;
    history.pushState(null, '', id ? `/gruppi/${id}` : '/gruppi');
    Object.assign(s, { id, group: null, feed: null, page: 1, draft: '', drafts: {}, open: {}, menuFor: null });
    this.__rerender();
    window.scrollTo(0, 0);
    if (id) { try { await this.fetchAll(); } catch (err) { toastError(err); } }
    this.__rerender();
  }

  componentDidMount() {
    super.componentDidMount();
    // A post's "···" menu closes on a click elsewhere
    this.closeMenu = e => { if (this.state.menuFor && !e.target.closest('.group-more, .group-menu')) this.setState({ menuFor: null }); };
    addEventListener('click', this.closeMenu);
  }
  componentWillUnmount() { removeEventListener('click', this.closeMenu); }

  async fetchAll() {
    const s = this.state;
    const id = encodeURIComponent(s.id);
    document.title = `${s.groups?.find(g => g.id === s.id)?.name ?? 'Gruppi'} · Gruppi · Rientro`;
    if (!s.member) {
      const r = await api('GET', `/api/public/groups/${id}?page=${s.page}`);
      Object.assign(s, { group: r.group, feed: r.posts });
      return;
    }
    [s.group, s.feed] = await Promise.all([api('GET', `/api/groups/${id}`), api('GET', `/api/groups/${id}/posts?page=${s.page}`)]);
  }

  // Pull to refresh (pull-refresh.js): the group and its posts, keeping what you're writing
  async refresh() {
    const s = this.state;
    if (s.member) s.groups = (await api('GET', '/api/groups')).groups;
    if (s.id) await this.fetchAll();
  }

  publish = this.act(async () => {
    const s = this.state;
    const body = s.draft.trim();
    if (!body) return;
    const post = await api('POST', `/api/groups/${encodeURIComponent(s.id)}/posts`, { body });
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
    if (!s.me && !s.group) return { loading: true, me: {}, member: false, visitor: false };
    const g = s.group || {};
    const admin = s.me?.user.role === 'admin';
    // Outside Rientro the author is just a name and a photo; the profile is behind sign-up
    const person = a => ({ name: a.name, photo: a.photo_url, ini: ini(a.name), role: a.role || '', href: s.member ? `/persone/${a.id}` : '/accedi' });
    const comment = (p, c) => ({ ...c, who: person(c.author), when: timeAgo(c.created_at), canDelete: c.mine || admin, del: () => this.remove(p, c) });
    const posts = (s.feed?.items || []).map(p => ({
      ...p, anchor: `post-${p.id}`, who: person(p.author), when: timeAgo(p.created_at),
      comments: p.comments.map(c => comment(p, c)),
      more: !s.open[p.id] && p.comments_count > p.comments.length, moreLabel: `Vedi tutti i ${p.comments_count} commenti`, showMore: () => this.allComments(p),
      menuOpen: s.menuFor === p.id, toggleMenu: () => this.setState({ menuFor: s.menuFor === p.id ? null : p.id }),
      canDelete: p.mine || admin, del: () => this.remove(p), canReport: !p.mine, hasMenu: s.member,
      doReport: async () => { this.setState({ menuFor: null }); await report({ id: p.author.id, name: p.author.name }); },
      replyField: `reply-${p.id}`, draft: s.drafts[p.id] || '',
      draftProps: { onInput: v => { s.drafts[p.id] = v; }, onEnter: () => this.comment(p) },
      send: () => this.comment(p),
    }));
    return {
      loading: false, me: s.me || {}, g, member: s.member, visitor: !s.member,
      // the menu (members); on phones either the menu or the open group
      // Generale, then the regions under their own title
      menu: (s.groups || []).flatMap((x, i, all) => [
        ...(x.kind === 'region' && all[i - 1]?.kind !== 'region' ? [{ heading: 'Regioni' }] : []),
        { l: x.name, href: `/gruppi/${x.id}`, click: e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); this.select(x.id); } },
      ]),
      activeLabel: s.groups?.find(x => x.id === s.id)?.name ?? '',
      layoutCls: s.member ? 'groups-layout' : 'groups-layout solo', asideCls: s.id ? 'groups-aside r-hide-sm' : 'groups-aside',
      mainCls: s.id ? 'groups-main' : 'groups-main r-hide-sm',
      hasGroup: !!s.group, choosing: !s.id, opening: !!s.id && !s.group,
      backToList: e => { e.preventDefault(); this.select(null); },
      signUp: () => go('/accedi'), headerProps: { onEnter: () => go('/accedi') },
      stats: g.posts ? `${g.posts} post` : 'Nessun post ancora',
      draft: s.draft, draftProps: { onInput: v => { s.draft = v; } }, publish: this.publish,
      posts, empty: !!s.feed && !posts.length,
      page: s.feed?.page ?? 1, pages: s.feed?.pages ?? 1, total: s.feed?.total ?? 0, perPage: s.feed?.per_page ?? 20,
      pagerProps: { onPage: n => { location.search = `?page=${n}`; } },
    };
  }
}

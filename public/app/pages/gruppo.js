// One group (gruppi.js lists them): anyone can write a post and comment, delete their own (admins
// any), report someone else's. Newest posts first, 20 per page; under each post its last 3 comments.
import { api, getMe, go, timeAgo, toastError } from '../lib.js';
import { report } from '../social.js';
import { homeFor, Page } from './_base.js';

export const title = 'Gruppo';
export const tabbar = true;

const ini = n => (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2);

export default class extends Page {
  async load() {
    const me = await getMe();
    if (me.user.status !== 'approved' || (!me.launched && me.user.role !== 'admin')) return go(homeFor(me));
    const id = this.props.params.id;
    Object.assign(this.state, { me, id, draft: '', drafts: {}, open: {}, menuFor: null, page: Math.max(1, Number(new URLSearchParams(location.search).get('page')) || 1) });
    const [group] = await Promise.all([api('GET', `/api/groups/${encodeURIComponent(id)}`), this.fetchPosts()]);
    this.state.group = group;
    document.title = `${group.name} · Gruppi · Rientro`;
  }

  componentDidMount() {
    super.componentDidMount();
    // A post's "···" menu closes on a click elsewhere
    this.closeMenu = e => { if (this.state.menuFor && !e.target.closest('.group-more, .group-menu')) this.setState({ menuFor: null }); };
    addEventListener('click', this.closeMenu);
  }
  componentWillUnmount() { removeEventListener('click', this.closeMenu); }

  async fetchPosts() {
    const s = this.state;
    s.feed = await api('GET', `/api/groups/${encodeURIComponent(s.id)}/posts?page=${s.page}`);
  }

  // Pull to refresh (pull-refresh.js): the group and its posts, keeping what you're writing
  async refresh() {
    const s = this.state;
    const [group] = await Promise.all([api('GET', `/api/groups/${encodeURIComponent(s.id)}`), this.fetchPosts()]);
    s.group = group;
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
    if (!s.group) return { loading: true, me: s.me || {} };
    const g = s.group;
    const admin = s.me.user.role === 'admin';
    const person = a => ({ name: a.name, photo: a.photo_url, ini: ini(a.name), role: a.role, href: `/persone/${a.id}` });
    const comment = (p, c) => ({ ...c, who: person(c.author), when: timeAgo(c.created_at), canDelete: c.mine || admin, del: () => this.remove(p, c) });
    const posts = s.feed.items.map(p => ({
      ...p, who: person(p.author), when: timeAgo(p.created_at),
      comments: p.comments.map(c => comment(p, c)),
      more: !s.open[p.id] && p.comments_count > p.comments.length, moreLabel: `Vedi tutti i ${p.comments_count} commenti`, showMore: () => this.allComments(p),
      menuOpen: s.menuFor === p.id, toggleMenu: () => this.setState({ menuFor: s.menuFor === p.id ? null : p.id }),
      canDelete: p.mine || admin, del: () => this.remove(p), canReport: !p.mine,
      doReport: async () => { this.setState({ menuFor: null }); await report({ id: p.author.id, name: p.author.name }); },
      replyField: `reply-${p.id}`, draft: s.drafts[p.id] || '',
      draftProps: { onInput: v => { s.drafts[p.id] = v; }, onEnter: () => this.comment(p) },
      send: () => this.comment(p),
    }));
    return {
      loading: false, me: s.me, g,
      stats: g.posts ? `${g.posts} post` : 'Nessun post ancora',
      draft: s.draft, draftProps: { onInput: v => { s.draft = v; } }, publish: this.publish,
      posts, empty: !posts.length,
      page: s.feed.page, pages: s.feed.pages, total: s.feed.total, perPage: s.feed.per_page,
      pagerProps: { onPage: n => { location.search = `?page=${n}`; } },
    };
  }
}

// Gruppi: the community's groups, a bit like Facebook groups: Generale and the regions, each
// opening its page (gruppo.js). Anyone can post, no joining.
import { api, getMe, go, timeAgo } from '../lib.js';
import { homeFor, Page } from './_base.js';

export const title = 'Gruppi';
export const tabbar = true;

export default class extends Page {
  async load() {
    const me = await getMe();
    if (me.user.status !== 'approved' || (!me.launched && me.user.role !== 'admin')) return go(homeFor(me));
    this.state.me = me;
    this.state.groups = (await api('GET', '/api/groups')).groups;
  }

  renderVals() {
    const s = this.state;
    if (!s.groups) return { loading: true, me: s.me || {} };
    const view = g => ({
      ...g, href: `/gruppi/${g.id}`,
      stats: g.posts ? `${g.posts} ${g.posts === 1 ? 'post' : 'post'} · ultimo ${timeAgo(g.last_post_at)}` : 'Nessun post ancora',
    });
    const of = kinds => s.groups.filter(g => kinds.includes(g.kind)).map(view);
    return {
      loading: false, me: s.me,
      sections: [['Per tutti', of(['general'])], ['Regioni', of(['region'])]]
        .map(([title, groups]) => ({ title, groups })),
    };
  }
}

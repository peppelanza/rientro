// Settings · blocked people (reached from 39a "Persone bloccate · Gestisci").
import { api, fmtDate, getMe, toast } from '../lib.js';
import { Page } from './_base.js';
import { settingsMenu } from './_settings.js';

export const title = 'Persone bloccate';
export const tabbar = true;

export default class extends Page {
  async load() {
    const [me, blocks] = await Promise.all([getMe(), api('GET', '/api/me/blocks')]);
    Object.assign(this.state, { me, blocks });
  }

  unblock(b) {
    return this.act(async () => {
      await api('DELETE', `/api/blocks/${b.id}`);
      this.state.blocks = this.state.blocks.filter(x => x.id !== b.id);
      toast(`${b.name} sbloccato. Potrete di nuovo vedere i vostri profili.`);
    })();
  }

  renderVals() {
    const s = this.state;
    if (!s.blocks) return { loading: true, me: {}, menu: settingsMenu };
    return {
      loading: false, me: s.me, menu: settingsMenu, none: !s.blocks.length,
      blocks: s.blocks.map((b, i) => ({ n: b.name, d: `Bloccato il ${fmtDate(b.since)}`, bt: i ? '1px solid #ECE8F7' : 'none', unblock: () => this.unblock(b) })),
    };
  }
}

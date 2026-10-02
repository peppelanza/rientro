// Old links to a single request (/connessioni/<id>): requests are answered on the person's profile
// or in Connessioni → Ricevute, so this only forwards there.
import { api, go } from '../lib.js';
import { Page } from './_base.js';

export const title = 'Richiesta di connessione';

export default class extends Page {
  async load() {
    const req = await api('GET', `/api/connections/${encodeURIComponent(this.props.params.id)}`).catch(() => null);
    go(req ? `/persone/${req.from_id}` : '/connessioni?tab=ricevute');
  }

  renderVals() { return {}; }
}

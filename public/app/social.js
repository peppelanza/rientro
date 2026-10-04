// Shared dialogs: connection request (design 03 · 30a/30b), report (05 · 42a), block (05 · 43a).
import { DCLogic } from '../dc/runtime.js';
import { api, getCatalog, openModal, toast } from './lib.js';

const CLOSE = `<button type="button" onClick="{{ cancel }}" aria-label="Chiudi" style="width:40px;height:40px;border-radius:50%;border:none;background:#F1EFF8;display:flex;align-items:center;justify-content:center;font-size:18px;color:#6B6680;align-self:flex-start;cursor:pointer;flex:none">×</button>`;

const CONNECT = `
<div style="width:540px;max-width:100%;background:#FFFFFF;border-radius:32px;box-shadow:0 30px 80px rgba(26,23,38,.3);padding:28px;box-sizing:border-box;display:flex;flex-direction:column;gap:20px">
<div style="display:flex;gap:14px;align-items:center"><dc-import name="App Photo" size="56" src="{{ photo }}" initials="{{ ini }}"></dc-import><div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:0"><h2 style="margin:0;font-family:'Unbounded',sans-serif;font-size:21px;font-weight:600;letter-spacing:-.03em">Connettiti con {{ first }}</h2><span style="font-size:13px;color:#6B6680">{{ sub }}</span></div>${CLOSE}</div>
<div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between"><span style="font-size:14px;font-weight:500">Vuoi aggiungere una nota?</span><span style="font-size:13px;color:#8C84AE">Facoltativa</span></div>
<dc-import name="App Field" rows="4" field="note" maxlength="300" counter="{{ false }}" value="{{ note }}" placeholder="Scrivi un breve messaggio..." dc-props="{{ noteProps }}"></dc-import></div>
<div class="r-stack" style="display:flex;gap:8px;justify-content:flex-end"><dc-import name="UI Button" label="Annulla" variant="ghost" on-click="{{ cancel }}"></dc-import><dc-import name="UI Button" label="{{ sendLabel }}" variant="accent" on-click="{{ send }}" host-aria-disabled="{{ busy }}"></dc-import></div>
</div>`;

// Opens the request dialog; resolves to the new connection state or undefined if cancelled.
export async function connect(person) {
  const first = person.first_name || person.name?.split(' ')[0] || '';
  const result = await openModal({
    template: CONNECT,
    Logic: class extends DCLogic {
      state = { note: '', busy: false };
      renderVals() {
        return {
          first, photo: person.photo_url, ini: (person.name || first).split(' ').map(w => w[0]).join('').slice(0, 2),
          sub: [person.role?.split(' · ')[0], person.from && person.to ? `${person.from} → ${person.to.split(',')[0]}` : person.from].filter(Boolean).join(' · '),
          note: this.state.note, noteProps: { onInput: v => { this.state.note = v; } },
          busy: this.state.busy, sendLabel: this.state.busy ? 'Invio…' : 'Invia richiesta',
          cancel: () => this.close(),
          send: async () => {
            this.setState({ busy: true });
            try {
              const r = await api('POST', '/api/connections', { to: person.id, note: this.state.note.trim() || null });
              this.close(r);
            } catch (err) { this.setState({ busy: false }); toast(err.message, { tone: 'err' }); }
          },
        };
      }
    },
  });
  if (!result) return undefined;
  // 30b: confirmation with undo
  toast(`Richiesta inviata a ${first}`, {
    action: 'Annulla', ms: 6000,
    onAction: async () => { await api('POST', `/api/connections/${result.id}/withdraw`).catch(() => {}); toast('Richiesta annullata.'); person.onChange?.(); },
  });
  return result;
}

const REPORT = `
<div style="width:520px;max-width:100%;background:#FFFFFF;border-radius:32px;box-shadow:0 14px 40px rgba(80,60,160,.12);padding:28px;box-sizing:border-box;display:flex;flex-direction:column;gap:14px">
<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 style="margin:0;font-family:'Unbounded',sans-serif;font-size:19px;font-weight:600;letter-spacing:-.035em">Segnala {{ name }}</h2>${CLOSE}</div>
<span style="font-size:14px;color:#6B6680">La segnalazione è anonima. Il team la legge entro 24 ore.</span>
<div role="radiogroup" aria-label="Motivo" style="display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:24px;background:#F6F4FC"><sc-for list="{{ reasons }}" as="r"><dc-import name="UI Option Card" title="{{ r.t }}" selected="{{ r.on }}" size="sm" layout="row" on-click="{{ r.pick }}" host-role="radio" host-aria-checked="{{ r.aria }}"></dc-import></sc-for></div>
<dc-import name="App Field" rows="2" field="details" maxlength="1000" value="{{ details }}" placeholder="Aggiungi dettagli (facoltativo)" dc-props="{{ detailsProps }}"></dc-import>
<dc-import name="UI Checkbox" label="{{ blockLabel }}" checked="{{ alsoBlock }}" on-click="{{ toggleBlock }}" host-role="checkbox" host-aria-checked="{{ alsoBlock }}"></dc-import>
<div style="display:flex;justify-content:flex-end;gap:8px"><dc-import name="UI Button" label="Annulla" variant="ghost" on-click="{{ cancel }}"></dc-import><dc-import name="UI Button" label="Invia segnalazione" on-click="{{ send }}" host-aria-disabled="{{ cantSend }}"></dc-import></div>
</div>`;

// Resolves to { blocked } when sent. postId: reporting a group post (it reaches the admins with the report)
export async function report(person, { postId } = {}) {
  const cat = await getCatalog();
  const first = person.first_name || person.name.split(' ')[0];
  const r = await openModal({
    template: REPORT,
    Logic: class extends DCLogic {
      state = { reason: null, details: '', alsoBlock: true, busy: false };
      renderVals() {
        const s = this.state;
        return {
          name: person.name, blockLabel: `Blocca anche ${first}`,
          reasons: cat.reportReasons.map(([v, t]) => ({ t, on: s.reason === v, aria: s.reason === v ? 'true' : 'false', pick: () => this.setState({ reason: v }) })),
          details: s.details, detailsProps: { onInput: v => { s.details = v; } },
          alsoBlock: s.alsoBlock, toggleBlock: () => this.setState({ alsoBlock: !s.alsoBlock }),
          cantSend: !s.reason || s.busy, cancel: () => this.close(),
          send: async () => {
            this.setState({ busy: true });
            try {
              await api('POST', '/api/reports', { user_id: person.id, reason: s.reason, details: s.details.trim() || null, block: s.alsoBlock, ...(postId ? { post_id: postId } : {}) });
              this.close({ blocked: s.alsoBlock });
            } catch (err) { this.setState({ busy: false }); toast(err.message, { tone: 'err' }); }
          },
        };
      }
    },
  });
  if (r) toast(r.blocked ? `Segnalazione inviata. Hai bloccato ${first}.` : 'Segnalazione inviata. Grazie.');
  return r;
}

const BLOCK = `
<div style="width:440px;max-width:100%;background:#FFFFFF;border-radius:32px;box-shadow:0 14px 40px rgba(80,60,160,.12);padding:28px;box-sizing:border-box;display:flex;flex-direction:column;gap:14px">
<h2 style="margin:0;font-family:'Unbounded',sans-serif;font-size:20px;font-weight:600;letter-spacing:-.04em">Bloccare {{ first }}?</h2>
<div style="display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:1.5;color:#4A4560"><span>· Non vedrà più il tuo profilo e tu non vedrai il suo.</span><span>· La connessione e la chat vengono chiuse.</span><span>· Non riceverà alcuna notifica.</span></div>
<span style="font-size:13px;color:#8C84AE">Puoi sbloccarlo da <a href="/impostazioni/bloccati" style="color:#8C84AE">Impostazioni → Privacy</a>.</span>
<div style="display:flex;justify-content:flex-end;gap:8px;padding-top:6px"><dc-import name="UI Button" label="Annulla" variant="ghost" on-click="{{ cancel }}"></dc-import><dc-import name="UI Button" label="Blocca" variant="destructive" on-click="{{ confirm }}"></dc-import></div>
</div>`;

export async function block(person) {
  const first = person.first_name || person.name.split(' ')[0];
  const ok = await openModal({
    template: BLOCK,
    Logic: class extends DCLogic {
      renderVals() { return { first, cancel: () => this.close(false), confirm: () => this.close(true) }; }
    },
  });
  if (!ok) return false;
  await api('POST', `/api/blocks/${person.id}`);
  toast(`Hai bloccato ${first}.`);
  return true;
}

// App entry: registers the design components, then routes the URL to a page module.
// Each page is pages/<name>.js (Logic) + pages/<name>.html (template copied from design/).
import '../dc/gen/components.js';
import './components.js';
import { DCLogic, mountPage } from '../dc/runtime.js';
import { impersonationFrame } from './impersonation.js';
import { launchBar } from './launchbar.js';
import { pullToRefresh } from './pull-refresh.js';
import { tabbarOnScroll } from './tabbar-scroll.js';
import { searchHistory } from './search-history.js';
import { tapFeedback } from './tap-feedback.js';
import { anchorOffset } from './anchor-offset.js';
import { api, getMe, openModal, showFlash, template } from './lib.js';

const ROUTES = [
  [/^\/$/, 'home'],
  [/^\/prelancio$/, 'home'], // old pre-launch address
  [/^\/rientro-dei-cervelli$/, 'cervelli'],
  [/^\/territori\/(?<luogo>[^/]+)$/, 'territori'],
  [/^\/accedi$/, 'accedi'],
  [/^\/legal\/(?<doc>privacy|termini|cookie)$/, 'legal'],
  [/^\/press$/, 'press'],
  [/^\/onboarding$/, 'onboarding'],
  [/^\/scopri$/, 'scopri'],
  [/^\/cerca$/, 'cerca'],
  [/^\/supporto(\/(?<id>[^/]+))?$/, 'supporto'],
  [/^\/persone\/(?<id>[^/]+)$/, 'persona'],
  [/^\/gruppi(\/(?<id>[^/]+))?$/, 'gruppo'],
  [/^\/connessioni$/, 'connessioni'],
  [/^\/connessioni\/(?<id>[^/]+)$/, 'richiesta'],
  [/^\/messaggi(\/(?<id>[^/]+))?$/, 'messaggi'],
  [/^\/notifiche$/, 'notifiche'],
  [/^\/profilo$/, 'profilo'],
  [/^\/benvenuto$/, 'benvenuto'],
  [/^\/impostazioni(\/account)?$/, 'impostazioni'],
  [/^\/impostazioni\/notifiche$/, 'impostazioni-notifiche'],
  [/^\/impostazioni\/sicurezza$/, 'impostazioni-sicurezza'],
  [/^\/impostazioni\/privacy$/, 'privacy'],
  [/^\/impostazioni\/dati$/, 'dati'],
  [/^\/admin$/, 'admin/dashboard'],
  [/^\/admin\/utenti$/, 'admin/utenti'],
  [/^\/admin\/utenti\/(?<id>[^/]+)$/, 'admin/utente'],
  [/^\/admin\/foto$/, 'admin/foto'],
  [/^\/admin\/bloccati$/, 'admin/bloccati'],
  [/^\/admin\/segnalazioni$/, 'admin/segnalazioni'],
  [/^\/admin\/supporto(\/(?<id>\d+))?$/, 'admin/supporto'],
  [/^\/admin\/analytics$/, 'admin/analytics'],
  [/^\/admin\/esportazioni$/, 'admin/esportazioni'],
  [/^\/admin\/registro$/, 'admin/registro'],
];

async function boot() {
  const root = document.getElementById('app');
  const match = ROUTES.map(([re, page]) => [re.exec(location.pathname), page]).find(([m]) => m);
  if (!match) { root.textContent = 'Pagina non trovata.'; return; }
  const [m] = match;
  let [, page] = match;
  // A page may hand over to another (e.g. "/" shows the pre-launch landing before launch day).
  let mod = await import(`./pages/${page}.js`);
  const alt = await mod.resolve?.();
  if (alt) { page = alt; mod = await import(`./pages/${page}.js`); }
  const tpl = await template(`/app/pages/${page}.html`);
  if (mod.title) document.title = `${mod.title} · Rientro`;
  if (mod.tabbar) document.body.classList.add('has-tabbar');
  const logic = mountPage(root, { template: tpl, Logic: mod.default, props: { params: m.groups || {} } });
  if (mod.tabbar) pullToRefresh(logic);
  showFlash();
  if (!NO_LEGAL_PROMPT.has(page)) askLegalUpdate().catch(() => {});
}

// Terms or Privacy updated since the member last accepted them: a dialog on the member pages that
// stays until they accept (no Escape, no click outside). Only the dialog stands in the way: the
// server blocks nothing, so if it ever went away by a bug everything would still work, and it
// comes back on the next page. Not on public pages, sign-in, the legal pages or during onboarding.
const NO_LEGAL_PROMPT = new Set(['home', 'cervelli', 'territori', 'accedi', 'legal', 'onboarding', 'press']);
const DOC_NAMES = { terms: ['i nuovi', 'Termini', '/legal/termini'], privacy: ['la nuova', 'Privacy Policy', '/legal/privacy'] };
const day = v => new Date(`${v}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/^1 /, '1° ');
async function askLegalUpdate() {
  // the session without redirecting: public pages (a group) are open to visitors too
  const me = await fetch('/api/session').then(r => (r.ok ? r.json() : null)).catch(() => null);
  const needs = me?.legal?.needs ?? [];
  if (!needs.length || me.user.status === 'onboarding' || me.impersonated) return;
  const since = day(needs.map(d => me.legal.versions[d]).sort().at(-1));
  const docs = needs.map(d => `${DOC_NAMES[d][0]} <a href="${DOC_NAMES[d][2]}" target="_blank">${DOC_NAMES[d][1]}</a>`).join(' e ');
  const tpl = `<div class="legal-update"><h2>Abbiamo aggiornato i nostri documenti</h2>
<p>Dal ${since} sono in vigore ${docs}. Leggili e, se sei d’accordo, confermali.</p>
<sc-if value="{{ error }}"><p role="alert" class="legal-update-err">{{ error }}</p></sc-if>
<dc-import name="UI Button" label="Ho letto e accetto" variant="accent" size="lg" full="{{ true }}" on-click="{{ accept }}"></dc-import></div>`;
  await openModal({ dismissible: false, template: tpl, Logic: class extends DCLogic {
    state = { error: null };
    renderVals() {
      return { error: this.state.error, accept: async () => {
        try { await api('POST', '/api/me/legal', { accept: true }); await getMe(true); this.close(true); } catch (err) { this.setState({ error: err.message }); }
      } };
    }
  } });
}

// "Il sistema è in aggiornamento" instead of Render's error page during a deploy (/sw.js)
navigator.serviceWorker?.register('/sw.js').catch(() => {});
tapFeedback();
searchHistory();
launchBar();
impersonationFrame();
anchorOffset();
tabbarOnScroll();
boot().catch(err => {
  console.error(err);
  document.getElementById('app').textContent = 'Non siamo riusciti a caricare la pagina. Ricarica per riprovare.';
});

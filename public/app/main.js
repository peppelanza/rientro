// App entry: registers the design components, then routes the URL to a page module.
// Each page is pages/<name>.js (Logic) + pages/<name>.html (template copied from design/).
import '../dc/gen/components.js';
import './components.js';
import { DCLogic, mountPage } from '../dc/runtime.js';
import { launchBar } from './launchbar.js';
import { api, getMe, openModal, showFlash, template } from './lib.js';

const ROUTES = [
  [/^\/$/, 'home'],
  [/^\/prelancio$/, 'home'], // old pre-launch address
  [/^\/rientro-dei-cervelli$/, 'cervelli'],
  [/^\/territori\/(?<luogo>[^/]+)$/, 'territori'],
  [/^\/accedi$/, 'accedi'],
  [/^\/legal\/(?<doc>privacy|termini|cookie)$/, 'legal'],
  [/^\/onboarding$/, 'onboarding'],
  [/^\/stato$/, 'stato'],
  [/^\/scopri$/, 'scopri'],
  [/^\/persone\/(?<id>[^/]+)$/, 'persona'],
  [/^\/connessioni$/, 'connessioni'],
  [/^\/connessioni\/(?<id>[^/]+)$/, 'richiesta'],
  [/^\/messaggi(\/(?<id>[^/]+))?$/, 'messaggi'],
  [/^\/notifiche$/, 'notifiche'],
  [/^\/profilo$/, 'profilo'],
  [/^\/impostazioni$/, 'impostazioni'],
  [/^\/impostazioni\/privacy$/, 'privacy'],
  [/^\/impostazioni\/dati$/, 'dati'],
  [/^\/impostazioni\/bloccati$/, 'bloccati'],
  [/^\/admin$/, 'admin/dashboard'],
  [/^\/admin\/utenti$/, 'admin/utenti'],
  [/^\/admin\/utenti\/(?<id>[^/]+)$/, 'admin/utente'],
  [/^\/admin\/approvazioni$/, 'admin/approvazioni'],
  [/^\/admin\/foto$/, 'admin/foto'],
  [/^\/admin\/bloccati$/, 'admin/bloccati'],
  [/^\/admin\/segnalazioni$/, 'admin/segnalazioni'],
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
  mountPage(root, { template: tpl, Logic: mod.default, props: { params: m.groups || {} } });
  showFlash();
  if (!NO_LEGAL_PROMPT.has(page)) askLegalUpdate();
}

// Terms or Privacy updated since the member last confirmed them: a one-time dialog on the app pages.
// Not on public pages, sign-in, legal pages or onboarding (it's asked once the profile has been sent).
const NO_LEGAL_PROMPT = new Set(['home', 'cervelli', 'territori', 'accedi', 'legal', 'onboarding']);
async function askLegalUpdate() {
  const me = await getMe().catch(() => null);
  if (!me?.legal?.needs?.length || me.user.status === 'onboarding') return;
  const tpl = `<div class="legal-update"><h2>Abbiamo aggiornato i nostri documenti</h2>
<p>Dal 30 settembre 2026 sono in vigore i nuovi <a href="/legal/termini" target="_blank">Termini</a> e la nuova <a href="/legal/privacy" target="_blank">Privacy Policy</a>: tra le novità, 30 giorni per ripensarci quando cancelli l’account. Per continuare a usare Rientro, confermali.</p>
<sc-if value="{{ error }}"><p role="alert" class="legal-update-err">{{ error }}</p></sc-if>
<dc-import name="UI Button" label="Ho letto e accetto" variant="accent" size="lg" full="{{ true }}" on-click="{{ accept }}"></dc-import></div>`;
  await openModal({ template: tpl, Logic: class extends DCLogic {
    state = { error: null };
    renderVals() {
      return { error: this.state.error, accept: async () => {
        try { await api('POST', '/api/me/legal', { accept: true }); await getMe(true); this.close(true); } catch (err) { this.setState({ error: err.message }); }
      } };
    }
  } });
}

launchBar();
boot().catch(err => {
  console.error(err);
  document.getElementById('app').textContent = 'Non siamo riusciti a caricare la pagina. Ricarica per riprovare.';
});

// App entry: registers the design components, then routes the URL to a page module.
// Each page is pages/<name>.js (Logic) + pages/<name>.html (template copied from design/).
import '../dc/gen/components.js';
import './components.js';
import { mountPage } from '../dc/runtime.js';
import { template } from './lib.js';

const ROUTES = [
  [/^\/$/, 'home'],
  [/^\/prelancio$/, 'prelancio'],
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
}

boot().catch(err => {
  console.error(err);
  document.getElementById('app').textContent = 'Non siamo riusciti a caricare la pagina. Ricarica per riprovare.';
});

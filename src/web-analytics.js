// Visits to the site with Cloudflare Web Analytics: no cookies, so no consent banner needed.
// 1. The pages (not the admin panel) load Cloudflare's small beacon script (beaconTag below).
// 2. The admin's Analytics page reads the numbers back from Cloudflare's GraphQL Analytics API
//    (traffic below), so there's no need to open Cloudflare.
// Off until the keys are set on the host:
//   CF_ANALYTICS_TOKEN     the "token" in the snippet Cloudflare shows for the site (Web Analytics)
//   CLOUDFLARE_ACCOUNT_ID  the account id (Cloudflare dashboard, right-hand column)
//   CLOUDFLARE_API_TOKEN   an API token with only Account → Account Analytics → Read
//   CF_ANALYTICS_SITE_TAG  optional: the site tag, if it can't be looked up from the token
import { config } from './config.js';

export const beaconEnabled = () => !!config.cfAnalyticsToken;
export const trafficEnabled = () => !!(config.cfAnalyticsToken && config.cfAccountId && config.cfApiToken);

export function beaconTag() {
  if (!beaconEnabled()) return '';
  const data = JSON.stringify({ token: config.cfAnalyticsToken, spa: true }).replace(/'/g, '&#39;');
  return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${data}'></script>`;
}

const API = 'https://api.cloudflare.com/client/v4';
const auth = () => ({ authorization: `Bearer ${config.cfApiToken}`, 'content-type': 'application/json' });

// The GraphQL data is filtered by "site tag", which isn't the snippet's token: look it up once
let siteTag;
async function getSiteTag(fetchImpl) {
  if (config.cfAnalyticsSiteTag) return config.cfAnalyticsSiteTag;
  if (siteTag) return siteTag;
  try {
    const r = await fetchImpl(`${API}/accounts/${config.cfAccountId}/rum/site_info/list?per_page=100`, { headers: auth(), signal: AbortSignal.timeout(8000) });
    const site = (await r.json())?.result?.find(s => s.site_token === config.cfAnalyticsToken);
    if (site?.site_tag) return (siteTag = site.site_tag);
  } catch {}
  return config.cfAnalyticsToken; // for snippet sites they're often the same
}

const QUERY = `query($account: string!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject) {
  viewer { accounts(filter: { accountTag: $account }) {
    total: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 1) { count sum { visits } }
    days: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 400, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
    pages: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 10, orderBy: [count_DESC]) { count dimensions { requestPath } }
    referrers: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 10, orderBy: [count_DESC]) { count dimensions { refererHost } }
    countries: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 8, orderBy: [count_DESC]) { count dimensions { countryName } }
    devices: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 5, orderBy: [count_DESC]) { count dimensions { deviceType } }
  } }
}`;

const cache = new Map(); // period → { at, data }, 10 minutes
export async function traffic(days, fetchImpl = fetch) {
  if (!trafficEnabled()) return { enabled: false };
  const hit = cache.get(days);
  if (hit && Date.now() - hit.at < 600_000) return hit.data;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  let body;
  try {
    const filter = { AND: [{ datetime_geq: from.toISOString(), datetime_leq: to.toISOString() }, { siteTag: await getSiteTag(fetchImpl) }, { bot: 0 }] };
    const r = await fetchImpl(`${API}/graphql`, { method: 'POST', headers: auth(), body: JSON.stringify({ query: QUERY, variables: { account: config.cfAccountId, filter } }), signal: AbortSignal.timeout(10_000) });
    body = await r.json();
  } catch (err) {
    console.error('[web-analytics]', err?.message ?? err);
    return { enabled: true, error: 'Cloudflare non risponde in questo momento.' };
  }
  const a = body?.data?.viewer?.accounts?.[0];
  if (!a) {
    console.error('[web-analytics]', JSON.stringify(body?.errors ?? body).slice(0, 500));
    return { enabled: true, error: body?.errors?.[0]?.message ? `Cloudflare: ${body.errors[0].message}` : 'Cloudflare non ha restituito dati.' };
  }
  const list = (rows, key) => rows.map(r => ({ l: r.dimensions[key] || '(diretto)', v: r.count }));
  const data = {
    enabled: true,
    visits: a.total[0]?.sum?.visits ?? 0,
    pageviews: a.total[0]?.count ?? 0,
    days: a.days.map(r => ({ date: r.dimensions.date, visits: r.sum.visits, pageviews: r.count })),
    pages: list(a.pages, 'requestPath'),
    referrers: list(a.referrers, 'refererHost'),
    countries: list(a.countries, 'countryName'),
    devices: list(a.devices, 'deviceType'),
  };
  cache.set(days, { at: Date.now(), data });
  return data;
}

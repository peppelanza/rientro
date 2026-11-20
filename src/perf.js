// How busy the server is, in the logs (Render › Logs), to see it coming before it gets slow:
// - "[lento] GET /api/threads 812 ms": any request that took the server more than 300 ms, with
//   the route and no ids (whose page it was doesn't matter, which page does);
// - "[carico] …" every 10 minutes: the requests of those 10 minutes, how many were slow and the
//   slowest, and the event loop's delay — how long a request waited before the server could even
//   look at it, because something else was holding it. Under 50 ms at p99 is comfortable; a p99 in
//   the hundreds of ms means the server is near its limit (a slow query, a big file read whole).
// Uploads aren't timed: their time is the member's connection, not the server's work.
import { monitorEventLoopDelay } from 'node:perf_hooks';

const SLOW_MS = 300;
const EVERY_MS = 10 * 60_000;
let period = { requests: 0, slow: 0, slowest: null };

// "/persone/8c1f…" → "/persone/:id": member ids, numbers and long codes out
export const routeLabel = path => path.split('/').map(s => (/^\d+$|^[0-9a-f]{8}-[0-9a-f-]{27}$|^[\w-]{20,}$/i.test(s) ? ':id' : s)).join('/');

// Called once a request has been handled (server.js): label is the route ("GET /api/threads/:id")
export function recordRequest(label, ms) {
  period.requests++;
  if (ms < SLOW_MS) return;
  period.slow++;
  if (!period.slowest || ms > period.slowest.ms) period.slowest = { label, ms };
  console.log(`[lento] ${label} ${Math.round(ms)} ms`);
}

// The 10-minute summary (production start only, server.js)
export function startLoadLog() {
  const RESOLUTION = 20;
  const delay = monitorEventLoopDelay({ resolution: RESOLUTION });
  delay.enable();
  // (the histogram counts its own 20 ms tick too: only what's beyond it is delay)
  const ms = ns => Math.max(0, Math.round(ns / 1e6 - RESOLUTION));
  setInterval(() => {
    const { requests, slow, slowest } = period;
    period = { requests: 0, slow: 0, slowest: null };
    console.log(`[carico] ultimi 10 min: ${requests} richieste, ${slow} lente (oltre ${SLOW_MS} ms)${slowest ? `, la più lenta ${slowest.label} ${Math.round(slowest.ms)} ms` : ''}; `
      + `ritardo dell'event loop p50 ${ms(delay.percentile(50))} ms, p99 ${ms(delay.percentile(99))} ms, max ${ms(delay.max)} ms; `
      + `memoria ${Math.round(process.memoryUsage().rss / 1048576)} MB`);
    delay.reset();
  }, EVERY_MS).unref();
}

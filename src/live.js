// Live updates (Server-Sent Events, GET /api/live): each open page keeps one connection, and the
// server says only that something changed for that member ("counts": the badges and the bell;
// "message": who wrote; "connections"). The page then asks for what it needs, once. Nothing is
// polled: a quiet member costs an idle connection and a heartbeat every 25 seconds (proxies close
// silent ones), nothing else.
const clients = new Map(); // userId → Set of responses
const MAX_PER_USER = 6; // tabs and devices; the oldest goes beyond that

export function subscribe(req, res, userId) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // no buffering by a proxy in between
  });
  res.write('retry: 5000\n\n');
  let set = clients.get(userId);
  if (!set) clients.set(userId, (set = new Set()));
  if (set.size >= MAX_PER_USER) { const oldest = set.values().next().value; set.delete(oldest); oldest.end(); }
  set.add(res);
  const drop = () => { set.delete(res); if (!set.size) clients.delete(userId); };
  req.on('close', drop);
  res.on('error', drop);
}

// Something changed for this member: every page of theirs hears it
export function publish(userId, event, data = {}) {
  const set = clients.get(userId);
  if (!set) return;
  const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(line);
}

export const liveCount = () => [...clients.values()].reduce((n, s) => n + s.size, 0);

setInterval(() => {
  for (const set of clients.values()) for (const res of set) res.write(': ping\n\n');
}, 25_000).unref();

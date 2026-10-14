// The visitor's IP, for the per-IP rate limits (sign-in codes, OAuth) and Turnstile's remoteip.
//
// What we know of the chain in front of the app (2026-10-14) — NOT verified on production yet:
//   rientro.it, www.rientro.it: visitor → Cloudflare (proxied) → Render's proxy → app
//   admin.rientro.it and the wildcard: visitor → Render's proxy → app (Cloudflare DNS-only)
// - Render: a Render engineer writes "we set the first IP in the list to the real client IP";
//   a user reports that Render "does not clear or reset any passed-in X-Forwarded-For header
//   (it only appends to it)". The two don't agree, and Render documents no guarantee.
//   https://feedback.render.com/features/p/send-the-correct-xforwardedfor
// - Cloudflare (proxied hosts) adds the visitor to X-Forwarded-For and sets CF-Connecting-IP; on
//   the DNS-only hosts those headers come straight from the visitor, so they prove nothing.
// So no header can be trusted blindly yet. The rule stays the one in use (TRUST_PROXY=1: the first
// X-Forwarded-For entry), whose limit is known: a visitor who sends their own X-Forwarded-For can
// change the key of the per-IP limit. The per-email limit, the per-code attempt limit and the
// Turnstile check (which never lets a request through unchecked) don't depend on it.
// To decide a stricter rule, GET /api/me/rete shows a signed-in member the headers of their own
// request as the app receives them, on each host (see the deploy notes): with that, the hop Render
// adds can be told apart from what the visitor sent.
export function clientIp(headers, socketAddress, { trustProxy = false } = {}) {
  if (trustProxy) {
    const first = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (first) return first;
  }
  return socketAddress;
}

// For GET /api/me/rete: only the forwarding headers of this request (no cookies, no auth)
export function forwardingHeaders(req) {
  const pick = k => (req.headers[k] === undefined ? null : String(req.headers[k]));
  return {
    socket: req.socket.remoteAddress,
    host: pick('host'),
    x_forwarded_for: pick('x-forwarded-for'),
    x_forwarded_proto: pick('x-forwarded-proto'),
    x_real_ip: pick('x-real-ip'),
    cf_connecting_ip: pick('cf-connecting-ip'),
    true_client_ip: pick('true-client-ip'),
    cf_ray: pick('cf-ray'),
    cdn_loop: pick('cdn-loop'),
  };
}

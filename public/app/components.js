// App-specific variants of the design components. Each template is copied from the matching
// design/UI *.dc.html file; the only changes are real links, live data instead of the
// design's hard-coded placeholders (counts, "AR", "Chiara M."), and real form controls.
import { DCLogic, register } from '../dc/runtime.js';
import { api, getCatalog, INTENT_BADGE, timeAgo } from './lib.js';
import { describeNotification, notificationInitials } from './notifications.js';

const def = (name, template, Component) => register({ name, template, propsMeta: {}, Component });
const b = v => v === true || v === 'true';

// ---------------------------------------------------------------------------------------------
// App Nav — from UI Nav (+ links, live counts, search, avatar menu)

// Components are rebuilt on every redraw and get no mount/unmount calls, so what lives outside the
// nav talks to the one drawn last
let currentNav = null;
const BELL_OUT_MS = 120; // app.css .bell-out

// A click outside or Escape closes the bell dropdown and the account menu
for (const type of ['click', 'keydown']) document.addEventListener(type, e => currentNav?.closeOnOutside(e));

// Phone: the page dims behind the open bell dropdown, fading in and out (app.css). The dimmer lives
// outside the nav, so redrawing the nav doesn't cut the fade short; tapping it closes the dropdown.
// Returns whether the dropdown is open.
function dimBehindBell(nav) {
  currentNav = nav;
  let dim = document.querySelector('.bell-backdrop');
  if (!dim) {
    dim = Object.assign(document.createElement('div'), { className: 'bell-backdrop' });
    dim.setAttribute('aria-hidden', 'true');
    dim.addEventListener('click', () => currentNav?.closeBell());
    document.body.append(dim);
  }
  // It starts below the top bar: iPhone Safari tints the status bar (clock, signal) with whatever
  // covers the top of the page, and that must stay as it is. A soft edge rather than a hard line
  // Its first 200px fade in (app.css)
  if (nav.state.bellOpen) dim.style.top = `${Math.max(0, document.querySelector('.nav-root')?.getBoundingClientRect().bottom ?? 0)}px`;
  document.body.classList.toggle('bell-open', nav.state.bellOpen);
  return nav.state.bellOpen;
}

def('App Nav', String.raw`
<div class="nav-root" style="width:100%;padding:18px var(--gutter) 0;box-sizing:border-box;font-family:'Geist',sans-serif;position:relative;z-index:20">
<div style="height:64px;padding:0 10px 0 26px;border-radius:999px;background:rgba(255,255,255,.72);border:1px solid #FFFFFF;box-shadow:0 8px 30px rgba(80,60,160,.10);box-sizing:border-box;display:flex;align-items:center;gap:4px;font-size:14px;font-weight:500;color:#1A1726">
<a href="{{ home }}" aria-label="Rientro, home" style="display:flex;align-items:baseline;gap:3px;font-family:'Instrument Serif',serif;font-style:italic;font-size:28px;line-height:1;margin-right:22px;color:#1A1726;text-decoration:none">Rientro<span style="width:7px;height:7px;border-radius:50%;background:#6C4DF5;display:inline-block"></span></a>
<sc-for list="{{ items }}" as="it">
<a href="{{ it.href }}" class="r-hide-sm" aria-current="{{ it.current }}" style="height:42px;padding:0 16px;border-radius:999px;background:{{ it.bg }};color:{{ it.fg }};display:flex;align-items:center;gap:8px;cursor:pointer;text-decoration:none">{{ it.label }}<sc-if value="{{ it.hasCount }}"><span style="min-width:20px;height:20px;padding:0 6px;box-sizing:border-box;border-radius:10px;background:#6C4DF5;color:#FFFFFF;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center">{{ it.count }}</span></sc-if></a>
</sc-for>
<sc-if value="{{ pendingNote }}"><a href="/onboarding" class="r-hide-sm" style="height:42px;padding:0 16px;border-radius:999px;background:#FFF3D6;color:#8A5A00;display:flex;align-items:center;gap:8px;text-decoration:none"><span style="width:7px;height:7px;border-radius:50%;background:#D49A1A"></span>{{ pendingNote }}</a></sc-if>
<div style="flex:1"></div>
<sc-if value="{{ showSearch }}"><form role="search" onSubmit="{{ search }}" class="r-hide-sm" style="width:280px;height:44px;border-radius:999px;background:#F1EFF8;display:flex;align-items:center;gap:10px;padding:0 8px 0 16px;box-sizing:border-box;font-size:13px;font-weight:400;color:#8C84AE"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8C84AE" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" style="flex:none"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input name="q" value="{{ q }}" aria-label="Cerca" placeholder="Cerca persone, città, settori" class="bare-input" style="font-size:13px"></form></sc-if>
<sc-if value="{{ bell }}"><button type="button" onClick="{{ toggleBell }}" aria-label="{{ bell.aria }}" aria-haspopup="dialog" aria-expanded="{{ bellOpen }}" class="nav-bell" style="width:44px;height:44px;margin-left:8px;border:none;padding:0;border-radius:50%;background:{{ bell.bg }};color:{{ bell.fg }};display:flex;align-items:center;justify-content:center;position:relative;flex:none;cursor:pointer"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><sc-if value="{{ bell.count }}"><span style="position:absolute;top:4px;right:2px;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;background:#E5484D;color:#FFFFFF;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #FFFFFF">{{ bell.count }}</span></sc-if></button></sc-if>
<button type="button" onClick="{{ toggleMenu }}" aria-haspopup="menu" aria-expanded="{{ menuOpen }}" aria-label="Il tuo account" style="width:44px;height:44px;margin-left:8px;border:none;padding:0;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFFFFF,#C9C0F0 45%,#8E7FE0);display:flex;align-items:center;justify-content:center;font:600 12px 'Geist',sans-serif;color:#1A1726;cursor:pointer;overflow:hidden;flex:none"><sc-if value="{{ photo }}"><img src="{{ photo }}" alt="" style="width:100%;height:100%;object-fit:cover"></sc-if><sc-if value="{{ noPhoto }}">{{ initials }}</sc-if></button>
</div>
<sc-if value="{{ bellOpen }}"><div role="dialog" aria-label="Notifiche" class="bell-panel {{ bellAnim }}" style="position:absolute;right:var(--gutter);top:88px;background:#FFFFFF;border-radius:24px;padding:8px;box-shadow:0 16px 36px rgba(40,30,90,.16);display:flex;flex-direction:column;font-size:14px;box-sizing:border-box">
<div style="padding:10px 12px 6px;font-family:'Unbounded',sans-serif;font-size:17px;font-weight:600;letter-spacing:-.03em;color:#1A1726">Notifiche</div>
<sc-if value="{{ bellEmpty }}"><span style="padding:14px 12px;color:#6B6680">Nessuna notifica, per ora.</span></sc-if>
<sc-for list="{{ bellItems }}" as="n"><a href="{{ n.href }}" style="display:flex;gap:12px;align-items:flex-start;padding:10px 12px;border-radius:18px;background:{{ n.bg }};margin-top:2px;color:{{ n.fg }};text-decoration:none">
<sc-if value="{{ n.isPerson }}"><div style="flex:none"><dc-import name="App Photo" size="40" src="{{ n.photo }}" initials="{{ n.ini }}"></dc-import></div></sc-if>
<sc-if value="{{ n.isIcon }}"><div aria-hidden="true" style="width:40px;height:40px;border-radius:50%;flex:none;background:{{ n.ibg }};color:{{ n.ifg }};font-weight:600;display:flex;align-items:center;justify-content:center">{{ n.icon }}</div></sc-if>
<div style="display:flex;flex-direction:column;gap:4px;line-height:1.4;flex:1;min-width:0"><span><sc-if value="{{ n.hasWho }}"><b style="font-weight:600">{{ n.who }}</b>{{ n.rest }}</sc-if><sc-if value="{{ n.hasText }}">{{ n.text }}</sc-if></span><span style="font-size:12px;color:{{ n.whenFg }};font-weight:{{ n.whenFw }}">{{ n.when }}</span></div>
<sc-if value="{{ n.unread }}"><span aria-label="Da leggere" style="width:10px;height:10px;border-radius:50%;background:#6C4DF5;margin-top:15px;flex:none"></span></sc-if>
</a></sc-for>
<sc-if value="{{ bellReady }}"><a href="/notifiche" style="margin-top:6px;padding:12px;border-radius:16px;background:#F1EFF8;color:#3E2BA8;font-weight:600;text-align:center;text-decoration:none">{{ bellMore }}</a></sc-if>
</div></sc-if>
<sc-if value="{{ menuOpen }}"><div role="menu" style="position:absolute;right:var(--gutter);top:88px;background:#FFFFFF;border-radius:22px;padding:6px;box-shadow:0 16px 36px rgba(40,30,90,.16);display:flex;flex-direction:column;font-size:14px;width:220px">
<sc-for list="{{ menu }}" as="m"><a role="menuitem" href="{{ m.href }}" style="padding:10px 12px;border-radius:16px;color:{{ m.fg }};text-decoration:none">{{ m.l }}</a></sc-for>
<div style="height:1px;background:#ECE8F7;margin:4px 0"></div>
<button type="button" role="menuitem" onClick="{{ logout }}" style="padding:10px 12px;border-radius:16px;border:none;background:transparent;text-align:left;font:inherit;color:#1A1726;cursor:pointer">Esci</button>
</div></sc-if>
</div>`, class extends DCLogic {
  state = { menuOpen: false, bellOpen: false, bellItems: null, bellUnread: 0 };

  closeOnOutside(e) {
    if (!this.state.bellOpen && !this.state.menuOpen) return;
    if (e.type === 'keydown' ? e.key !== 'Escape' : e.target.closest('.bell-panel, .nav-bell, .bell-backdrop, [role=menu], [aria-label="Il tuo account"]')) return;
    // A link to another page (the bottom menu, the top bar): everything stays as it is until it opens
    const link = e.type === 'click' && e.target.closest('a[href]');
    if (link && !link.getAttribute('href').startsWith('#')) return;
    this.closeBell();
    if (this.state.menuOpen) this.setState({ menuOpen: false });
  }

  // Like Facebook: the latest 5, read or not; opening it clears the badge, the unread ones keep
  // their colour and dot until next time. It opens (a short fade, app.css) once they're loaded,
  // so nothing redraws it mid-animation.
  async openBell() {
    if (this.opening) return;
    this.opening = true;
    const c = this.props.me?.counts || {};
    let r = null;
    try { r = await api('GET', '/api/notifications?per_page=5'); } catch {}
    this.opening = false;
    this.animateBell = true;
    this.setState({ bellOpen: true, menuOpen: false, bellItems: r?.items || [], bellUnread: r?.unread ?? (c.notifications || 0) });
    this.animateBell = false; // only this first drawing animates
    if (r?.items.some(n => !n.read)) {
      await api('POST', '/api/notifications/read').catch(() => {});
      c.notifications = 0;
      setTimeout(() => this.setState({}), 200); // the badge goes once the animation is over
    }
  }

  closeBell() {
    const panel = document.querySelector('.bell-panel');
    if (!this.state.bellOpen || this.closing) return;
    document.body.classList.remove('bell-open');
    if (!panel || matchMedia('(prefers-reduced-motion: reduce)').matches) return this.setState({ bellOpen: false });
    this.closing = true;
    panel.classList.add('bell-out');
    setTimeout(() => { this.closing = false; this.setState({ bellOpen: false }); }, BELL_OUT_MS);
  }

  renderVals() {
    const me = this.props.me || {};
    const u = me.user || {};
    const p = me.profile || {};
    const c = me.counts || {};
    const a = this.props.active ?? 'none';
    const approved = u.status === 'approved';
    // Admins are members like everyone else; before launch they can also preview the member area
    const open = approved && (me.launched || u.role === 'admin');
    const items = open ? [
      ['scopri', 'Scopri chi torna', '/scopri', 0], ['connessioni', 'Connessioni', '/connessioni', c.received],
      ['messaggi', 'Messaggi', '/messaggi', c.unread_messages],
    ].map(([k, label, href, n]) => ({ label, href, count: n, hasCount: !!n, current: k === a ? 'page' : false, bg: k === a ? '#1A1726' : 'transparent', fg: k === a ? '#FFFFFF' : '#6B6680' })) : [];
    const pendingNote = u.status === 'onboarding' ? 'Completa il profilo' : null;
    const menu = [
      { l: 'Il tuo profilo', href: u.status === 'onboarding' ? '/onboarding' : '/profilo', fg: '#1A1726' },
      { l: 'Impostazioni', href: '/impostazioni', fg: '#1A1726' },
      ...(me.admin_url ? [{ l: 'Admin', href: me.admin_url, fg: '#6C4DF5' }] : []),
    ];
    return {
      items, pendingNote, menu, menuOpen: this.state.menuOpen, home: open ? '/scopri' : approved ? '/benvenuto' : '/',
      // Notifications as a bell next to the profile picture (like Facebook), with the unread count
      bell: open ? {
        count: c.notifications ? (c.notifications > 9 ? '9+' : String(c.notifications)) : '',
        aria: c.notifications ? `Notifiche, ${c.notifications} da leggere` : 'Notifiche',
        current: a === 'notifiche' ? 'page' : false, bg: a === 'notifiche' ? '#1A1726' : 'transparent', fg: a === 'notifiche' ? '#FFFFFF' : '#1A1726',
      } : null,
      showSearch: open, q: this.props.q ?? '',
      photo: p.photo_url, noPhoto: !p.photo_url, initials: `${(p.first_name || u.email || '?')[0]}${(p.last_name || '')[0] || ''}`.toUpperCase(),
      toggleMenu: () => this.setState({ menuOpen: !this.state.menuOpen, bellOpen: false }),
      bellOpen: dimBehindBell(this),
      toggleBell: () => (this.state.bellOpen ? this.closeBell() : this.openBell()),
      bellAnim: this.animateBell ? 'bell-in' : '',
      bellEmpty: !!this.state.bellItems && !this.state.bellItems.length,
      bellReady: !!this.state.bellItems?.length,
      bellItems: (this.state.bellItems || []).map(n => {
        const d = describeNotification(n);
        return {
          ...d, href: d.href || '/notifiche', hasWho: !!d.who, hasText: !!d.text, isPerson: !!n.actor && !d.icon, isIcon: !!d.icon,
          photo: n.actor?.photo_url, ini: notificationInitials(n.actor?.name), when: timeAgo(n.created_at), unread: !n.read,
          bg: n.read ? 'transparent' : '#EFEBFF', fg: n.read ? '#4A4560' : '#1A1726', whenFg: n.read ? '#8C84AE' : '#6C4DF5', whenFw: n.read ? '400' : '600',
        };
      }),
      // More unread than the 5 shown: "+ N notifiche"; otherwise "Vedi tutte"
      bellMore: this.state.bellUnread > 5 ? `+ ${this.state.bellUnread - 5} notifiche` : 'Vedi tutte',
      search: e => { e.preventDefault(); const q = new FormData(e.target).get('q'); location.href = `/scopri?q=${encodeURIComponent(q)}`; },
      logout: async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'rientro' } }); location.href = '/'; },
    };
  }
});

// ---------------------------------------------------------------------------------------------
// App TabBar — from UI TabBar (+ links, live dots). Shown on small screens only.

def('App TabBar', String.raw`
<nav class="r-show-sm tabbar" aria-label="Navigazione" style="position:fixed;left:0;right:0;bottom:0;z-index:30;padding:0 var(--gutter) 14px;box-sizing:border-box;font-family:'Geist',sans-serif">
<div style="border-radius:999px;background:rgba(255,255,255,.82);border:1px solid #FFFFFF;box-shadow:0 10px 30px rgba(80,60,160,.14);padding:6px;display:grid;grid-template-columns:repeat(4,1fr);backdrop-filter:blur(12px)">
<sc-for list="{{ items }}" as="it">
<a href="{{ it.href }}" aria-current="{{ it.current }}" style="min-height:52px;border-radius:999px;background:{{ it.bg }};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;position:relative;text-decoration:none">
<div style="width:18px;height:18px;border:1.8px solid {{ it.fg }};border-radius:{{ it.radius }};box-sizing:border-box;background:{{ it.fill }}"></div>
<span style="font-size:10px;color:{{ it.fg }};font-weight:{{ it.fw }}">{{ it.label }}</span>
<sc-if value="{{ it.dot }}"><span style="position:absolute;top:7px;left:calc(50% + 6px);width:8px;height:8px;border-radius:50%;background:#6C4DF5;border:2px solid #FFFFFF"></span></sc-if>
</a>
</sc-for>
</div></nav>`, class extends DCLogic {
  renderVals() {
    const a = this.props.active ?? 'scopri';
    const c = this.props.me?.counts || {};
    const items = [['scopri', 'Scopri', '/scopri', '50%', 0], ['connessioni', 'Connessioni', '/connessioni', '6px', c.received], ['messaggi', 'Messaggi', '/messaggi', '6px 6px 6px 2px', c.unread_messages], ['profilo', 'Profilo', '/impostazioni', '50%', 0]]
      .map(([k, label, href, radius, n]) => ({
        label, href, radius, dot: !!n && k !== a, current: k === a ? 'page' : false,
        bg: k === a ? '#EFEBFF' : 'transparent', fg: k === a ? '#3E2BA8' : '#6B6680', fill: k === a ? '#6C4DF5' : 'transparent', fw: k === a ? 600 : 500,
      }));
    return { items };
  }
});

// ---------------------------------------------------------------------------------------------
// App Side Menu — from UI Side Menu (+ links). items: [{ l, href, danger? }]

def('App Side Menu', String.raw`
<nav style="background:rgba(255,255,255,.55);border:1px solid #FFFFFF;border-radius:28px;padding:18px 10px;display:flex;flex-direction:column;gap:2px;font-family:'Geist',sans-serif;font-size:14px;color:#1A1726">
<sc-if value="{{ hasTitle }}"><span style="font-family:'Unbounded',sans-serif;font-size:19px;font-weight:600;letter-spacing:-.04em;padding:0 12px 14px">{{ title }}</span></sc-if>
<sc-if value="{{ hasEyebrow }}"><span style="font-family:'Geist Mono',monospace;font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#6B6680;padding:0 12px 10px">{{ eyebrow }}</span></sc-if>
<sc-for list="{{ items }}" as="it"><a href="{{ it.href }}" onClick="{{ it.click }}" aria-current="{{ it.current }}" style="padding:10px 14px;border-radius:999px;background:{{ it.bg }};color:{{ it.fg }};font-weight:{{ it.fw }};cursor:pointer;text-decoration:none">{{ it.l }}</a></sc-for>
</nav>`, class extends DCLogic {
  renderVals() {
    const a = this.props.active;
    const items = (this.props.items || []).map(it => {
      const on = it.l === a;
      return { ...it, current: on ? 'page' : false, bg: on ? '#1A1726' : 'transparent', fg: on ? '#FFFFFF' : it.danger ? '#B42318' : '#1A1726', fw: on ? 600 : 400 };
    });
    return { items, title: this.props.title, hasTitle: !!this.props.title, eyebrow: this.props.eyebrow, hasEyebrow: !!this.props.eyebrow };
  }
});

// ---------------------------------------------------------------------------------------------
// App Admin Sidebar — from UI Admin Sidebar (+ links, live counts, signed-in admin, audit log)

def('App Admin Sidebar', String.raw`
<div class="admin-sidebar" style="width:240px;min-height:100vh;box-sizing:border-box;padding:12px;font-family:'Geist',sans-serif;color:#1A1726;flex:none;position:sticky;top:var(--lb, 0px);align-self:flex-start">
<div style="min-height:calc(100vh - 24px);box-sizing:border-box;background:#1A1726;border-radius:24px;padding:20px 10px;display:flex;flex-direction:column;gap:22px">
<a href="/admin" style="display:flex;align-items:center;gap:8px;padding:0 10px;text-decoration:none"><dc-import name="UI Logo" size="22" tone="light"></dc-import><span style="font-family:'Geist Mono',monospace;font-size:10px;padding:3px 7px;border-radius:999px;background:#6C4DF5;color:#FFFFFF;letter-spacing:.04em">ADMIN</span></a>
<nav style="display:flex;flex-direction:column;gap:2px">
<sc-for list="{{ items }}" as="it">
<a href="{{ it.href }}" aria-current="{{ it.current }}" style="height:40px;padding:0 14px;border-radius:999px;display:flex;align-items:center;gap:10px;font-size:14px;color:{{ it.fg }};background:{{ it.bg }};font-weight:{{ it.fw }};text-decoration:none"><span style="width:7px;height:7px;border-radius:50%;background:{{ it.mark }}"></span>{{ it.label }}<sc-if value="{{ it.hasCount }}"><span style="margin-left:auto;font-family:'Geist Mono',monospace;font-size:11px;color:{{ it.cc }}">{{ it.count }}</span></sc-if></a>
</sc-for>
</nav>
<div style="flex:1"></div>
<a href="{{ site }}" style="padding:0 14px;font-size:13px;color:#8C84AE;text-decoration:none">← Torna al sito</a>
<div style="border-top:1px solid #2E2A40;padding:14px 10px 0;display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFFFFF,#C9C0F0 45%,#8E7FE0);color:#1A1726;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:none">{{ initials }}</div><div style="display:flex;flex-direction:column;min-width:0"><span style="font-size:13px;font-weight:500;color:#FFFFFF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ adminName }}</span><span style="font-size:12px;color:#B7B0D4">Moderazione</span></div><button type="button" onClick="{{ logout }}" style="margin-left:auto;height:32px;padding:0 12px;border:1px solid #3A3550;border-radius:999px;background:transparent;color:#C9C0F0;font:13px 'Geist',sans-serif;cursor:pointer;flex:none">Esci</button></div>
</div></div>
<nav aria-label="Sezioni admin" class="r-show-sm" style="padding:12px var(--gutter) 0;font-family:'Geist',sans-serif"><div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px"><sc-for list="{{ items }}" as="it"><a href="{{ it.href }}" aria-current="{{ it.current }}" style="flex:none;height:36px;padding:0 14px;border-radius:999px;display:flex;align-items:center;gap:6px;font-size:13px;background:{{ it.mbg }};color:{{ it.mfg }};text-decoration:none">{{ it.label }}<sc-if value="{{ it.hasCount }}"><span style="font-family:'Geist Mono',monospace;font-size:11px;opacity:.7">{{ it.count }}</span></sc-if></a></sc-for><button type="button" onClick="{{ logout }}" style="flex:none;height:36px;padding:0 14px;border:1px solid #DCD7EC;border-radius:999px;background:transparent;font:13px 'Geist',sans-serif;color:#6B6680;cursor:pointer">Esci</button></div></nav>`, class extends DCLogic {
  renderVals() {
    const a = this.props.active ?? 'dashboard';
    const c = this.props.counts || {};
    const email = this.props.email || '';
    const items = [
      ['dashboard', 'Dashboard', '/admin', ''], ['utenti', 'Utenti', '/admin/utenti', c.users ? c.users.toLocaleString('it-IT') : ''],
      ['foto', 'Foto da controllare', '/admin/foto', c.photos ? String(c.photos) : ''], ['bloccati', 'Contenuti bloccati', '/admin/bloccati', c.blocked ? String(c.blocked) : ''], ['segnalazioni', 'Segnalazioni', '/admin/segnalazioni', c.reports ? String(c.reports) : ''],
      ['analytics', 'Analytics', '/admin/analytics', ''], ['esportazioni', 'Esportazioni', '/admin/esportazioni', ''], ['registro', 'Registro accessi', '/admin/registro', ''],
    ].map(([k, label, href, count]) => ({
      label, href, count, hasCount: !!count, current: k === a ? 'page' : false,
      bg: k === a ? '#FFFFFF' : 'transparent', fg: k === a ? '#1A1726' : '#C9C0F0', fw: k === a ? 600 : 400, mark: k === a ? '#6C4DF5' : '#3A3550', cc: k === a ? '#6B6680' : '#8C84AE',
      mbg: k === a ? '#1A1726' : '#FFFFFF', mfg: k === a ? '#FFFFFF' : '#1A1726',
    }));
    // The panel may be on its own host (admin.rientro.it), where "/" is the panel itself
    const site = this.props.site || '/';
    const logout = async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'rientro' } }); location.href = site; };
    return { items, logout, site, adminName: email.split('@')[0], initials: email.slice(0, 2).toUpperCase() };
  }
});

// ---------------------------------------------------------------------------------------------
// App Onboarding Bar — from UI Onboarding Bar: logo and progress only (variable total)

def('App Onboarding Bar', String.raw`
<div style="width:100%;box-sizing:border-box;padding:18px var(--gutter) 0;font-family:'Geist',sans-serif">
<div style="border-radius:999px;background:{{ bg }};border:{{ bd }};padding:12px 24px 12px 26px;display:flex;flex-direction:column;gap:10px">
<div style="display:flex;align-items:center;gap:18px">
<a href="/" aria-label="Rientro" style="text-decoration:none"><dc-import name="UI Logo" size="24" tone="{{ tone }}"></dc-import></a>
<div style="flex:1"></div>
<button type="button" onClick="{{ logout }}" style="height:32px;padding:0 14px;border:1px solid {{ exitBorder }};border-radius:999px;background:transparent;color:{{ exitColor }};font:500 13px 'Geist',sans-serif;cursor:pointer">Esci</button>
</div>
<div role="progressbar" aria-valuemin="1" aria-valuemax="{{ total }}" aria-valuenow="{{ step }}" aria-valuetext="{{ label }}" aria-label="Avanzamento" style="display:grid;grid-template-columns:repeat({{ total }},1fr);gap:4px">
<sc-for list="{{ segs }}" as="s"><div style="height:5px;border-radius:3px;background:{{ s.c }}"></div></sc-for>
</div></div></div>`, class extends DCLogic {
  renderVals() {
    const step = Number(this.props.step ?? 1);
    const total = Number(this.props.total ?? 16);
    const dark = b(this.props.dark);
    const segs = Array.from({ length: total }, (_, i) => ({ c: i < step - 1 ? (dark ? '#C9C0F0' : '#1A1726') : i === step - 1 ? '#6C4DF5' : (dark ? '#3A3550' : '#DCD7EC') }));
    return {
      segs, step, total, label: `${step} di ${total}`,
      bg: dark ? '#2A2638' : 'rgba(255,255,255,.72)', bd: dark ? '1px solid #3A3550' : '1px solid #FFFFFF',
      tone: dark ? 'light' : 'dark',
      // Leave onboarding (progress is saved at every step) and sign out
      exitBorder: dark ? '#3A3550' : '#DCD7EC', exitColor: dark ? '#C9C0F0' : '#6B6680',
      logout: async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'rientro' } }); location.href = '/'; },
    };
  }
});

// ---------------------------------------------------------------------------------------------
// App Step Footer — from UI Step Footer (+ handlers, disabled state)

def('App Step Footer', String.raw`
<div style="width:100%;box-sizing:border-box;padding:16px var(--gutter) 20px;display:flex;align-items:center;gap:14px;font-family:'Geist',sans-serif">
<sc-if value="{{ hasBack }}"><dc-import name="UI Button" label="← Indietro" variant="{{ backVariant }}" on-click="{{ back }}"></dc-import></sc-if>
<div style="flex:1"></div>
<sc-if value="{{ hasStatus }}"><span role="status" class="r-hide-sm" style="font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:{{ statusColor }}">{{ status }}</span></sc-if>
<sc-if value="{{ hasSkip }}"><dc-import name="UI Button" label="{{ skip }}" variant="ghost" on-click="{{ skipFn }}"></dc-import></sc-if>
<dc-import name="UI Button" label="{{ primary }}" variant="{{ primaryVariant }}" on-click="{{ next }}" host-aria-disabled="{{ disabled }}"></dc-import>
</div>`, class extends DCLogic {
  renderVals() {
    const p = this.props;
    const dark = b(p.dark);
    const disabled = b(p.disabled);
    return {
      hasBack: !!p.onBack, back: p.onBack, backVariant: dark ? 'onDark' : 'glass',
      status: p.status, hasStatus: !!p.status, statusColor: b(p.error) ? '#B42318' : (dark ? '#B7B0D4' : '#8C84AE'),
      skip: p.skip, hasSkip: !!p.skip, skipFn: p.onSkip,
      primary: p.primary ?? 'Continua', next: p.onNext, disabled,
      primaryVariant: disabled ? 'secondary' : (b(p.accent) ? 'accent' : (dark ? 'light' : 'primary')),
    };
  }
});

// ---------------------------------------------------------------------------------------------
// App Field — a real <input>/<textarea> with UI Input's exact styling.
// Props: label, value, placeholder, type, size (md|lg), rows, maxlength, search, hint,
// field (data-key for focus restore), onInput(value), onEnter(), onBlur(), autocomplete, inputmode, error

def('App Field', String.raw`
<label style="display:flex;flex-direction:column;gap:6px;width:100%;font-family:'Geist',sans-serif">
<sc-if value="{{ hasLabel }}"><span style="font-size:13px;font-weight:500;color:#1A1726">{{ label }}<sc-if value="{{ optional }}"> <span style="color:#8C84AE;font-weight:400">Facoltativo</span></sc-if></span></sc-if>
<div class="dc-field" style="width:100%;min-height:{{ h }};border-radius:{{ radius }};background:#FFFFFF;border:{{ bd }};box-sizing:border-box;padding:{{ pad }};display:flex;align-items:{{ align }};gap:10px;font-size:{{ fs }}px;line-height:1.5;color:#1A1726">
<sc-if value="{{ search }}"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8C84AE" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" style="flex:none"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></sc-if>
<sc-if value="{{ multi }}"><textarea class="bare-input" data-key="{{ field }}" rows="{{ rows }}" maxlength="{{ maxlength }}" placeholder="{{ placeholder }}" value="{{ value }}" onInput="{{ input }}" onBlur="{{ blur }}" aria-invalid="{{ invalid }}" style="resize:vertical;min-height:{{ taH }}"></textarea></sc-if>
<sc-if value="{{ single }}"><input class="bare-input" data-key="{{ field }}" type="{{ type }}" maxlength="{{ maxlength }}" placeholder="{{ placeholder }}" value="{{ value }}" autocomplete="{{ autocomplete }}" inputmode="{{ inputmode }}" onInput="{{ input }}" onKeyDown="{{ keydown }}" onBlur="{{ blur }}" aria-invalid="{{ invalid }}"></sc-if>
<sc-if value="{{ hasHint }}"><span style="font-family:'Geist Mono',monospace;font-size:11px;color:#8C84AE;padding:2px 6px;border-radius:6px;background:#F1EFF8;white-space:nowrap">{{ hint }}</span></sc-if>
</div>
<sc-if value="{{ hasFoot }}"><div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#8C84AE"><span style="color:{{ footColor }}">{{ foot }}</span><sc-if value="{{ counter }}"><span style="font-family:'Geist Mono',monospace">{{ counter }}</span></sc-if></div></sc-if>
</label>`, class extends DCLogic {
  renderVals() {
    const p = this.props;
    const multi = !!p.rows;
    // Parent pages don't re-render on every keystroke, so the field tracks its own text for the counter.
    const value = this.state.v ?? p.value ?? '';
    const lg = p.size === 'lg';
    const counter = p.maxlength && p.counter !== false && multi ? `${String(value).length} / ${p.maxlength}` : '';
    return {
      label: p.label, hasLabel: !!p.label, optional: b(p.optional), multi, single: !multi, rows: p.rows,
      value, placeholder: p.placeholder ?? '', type: p.type ?? 'text', maxlength: p.maxlength, field: p.field,
      autocomplete: p.autocomplete ?? 'off', inputmode: p.inputmode, search: b(p.search), hint: p.hint, hasHint: !!p.hint,
      h: multi ? 'auto' : lg ? '52px' : '44px', taH: `${Number(p.rows || 2) * 24}px`,
      radius: multi ? '20px' : '999px', pad: multi ? '14px 18px' : '0 18px', align: multi ? 'flex-start' : 'center', fs: lg ? 17 : 14,
      bd: p.error ? '1.5px solid #D92D20' : '1px solid #E4E0F2', invalid: p.error ? 'true' : false,
      foot: p.error || p.foot || '', hasFoot: !!(p.error || p.foot || counter), counter, footColor: p.error ? '#B42318' : '#8C84AE',
      input: e => {
        p.onInput?.(e.target.value);
        if (counter) { this.state.v = e.target.value; this.__rerender(); }
      },
      keydown: e => { if (e.key === 'Enter' && p.onEnter) { e.preventDefault(); p.onEnter(e.target.value); } },
      blur: e => p.onBlur?.(e.target.value),
    };
  }
});

// App Pager — "1–24 di 87" and the page numbers (first, last, current ±1), for every paged list.
// Attributes: page, pages, total, perpage, noun ("persone"); dc-props: { onPage(n) }. Hidden on a single page.

def('App Pager', String.raw`
<sc-if value="{{ show }}"><nav aria-label="Pagine" class="r-wrap" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:6px 0;font-family:'Geist',sans-serif;font-size:13px;color:#1A1726">
<span style="font-family:'Geist Mono',monospace;font-size:11px;color:#8C84AE;letter-spacing:.02em">{{ range }}</span>
<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
<button type="button" onClick="{{ prev }}" disabled="{{ noPrev }}" aria-label="Pagina precedente" class="pager-btn">←</button>
<sc-for list="{{ items }}" as="p"><sc-if value="{{ p.cur }}"><span aria-current="page" class="pager-btn pager-cur">{{ p.l }}</span></sc-if><sc-if value="{{ p.link }}"><button type="button" onClick="{{ p.go }}" aria-label="{{ p.aria }}" class="pager-btn">{{ p.l }}</button></sc-if><sc-if value="{{ p.gap }}"><span class="pager-gap">…</span></sc-if></sc-for>
<button type="button" onClick="{{ next }}" disabled="{{ noNext }}" aria-label="Pagina successiva" class="pager-btn">→</button>
</div></nav></sc-if>`, class extends DCLogic {
  renderVals() {
    const p = this.props;
    const page = Number(p.page) || 1;
    const pages = Number(p.pages) || 1;
    const total = Number(p.total) || 0;
    const per = Number(p.perpage) || 20;
    const nums = [];
    for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums.at(-1) !== '…') nums.push('…');
    const go = n => () => { p.onPage?.(n); };
    return {
      show: pages > 1,
      range: `${(page - 1) * per + 1}–${Math.min(page * per, total)} di ${total}${p.noun ? ` ${p.noun}` : ''}`,
      items: nums.map(n => ({ l: String(n), gap: n === '…', cur: n === page, link: n !== '…' && n !== page, aria: `Pagina ${n}`, go: go(n) })),
      prev: go(page - 1), next: go(page + 1), noPrev: page <= 1, noNext: page >= pages,
    };
  }
});

// App Select — native <select> with UI Input styling. options: [{ v, l }]
def('App Select', String.raw`
<label style="display:flex;flex-direction:column;gap:6px;width:100%;font-family:'Geist',sans-serif">
<sc-if value="{{ hasLabel }}"><span style="font-size:13px;font-weight:500">{{ label }}<sc-if value="{{ optional }}"> <span style="color:#8C84AE;font-weight:400">Facoltativo</span></sc-if></span></sc-if>
<div class="dc-field" style="position:relative;width:100%;height:{{ h }};border-radius:999px;background:#FFFFFF;border:1px solid #E4E0F2;box-sizing:border-box;display:flex;align-items:center;font-size:{{ fs }}px;color:#1A1726">
<select class="bare-input" data-key="{{ field }}" onChange="{{ change }}" style="appearance:none;-webkit-appearance:none;padding:0 40px 0 18px;height:100%;cursor:pointer">
<sc-if value="{{ hasPlaceholder }}"><option value="" selected="{{ none }}">{{ placeholder }}</option></sc-if>
<sc-for list="{{ opts }}" as="o"><option value="{{ o.v }}" selected="{{ o.sel }}">{{ o.l }}</option></sc-for>
</select><span aria-hidden="true" style="position:absolute;right:18px;font-size:11px;color:#6B6680;pointer-events:none">▾</span>
</div></label>`, class extends DCLogic {
  renderVals() {
    const p = this.props;
    const opts = (p.options || []).map(o => ({ ...o, sel: o.v === p.value }));
    return {
      label: p.label, hasLabel: !!p.label, optional: b(p.optional), opts, field: p.field,
      placeholder: p.placeholder, hasPlaceholder: !!p.placeholder, none: !p.value,
      h: p.size === 'lg' ? '52px' : '44px', fs: p.size === 'lg' ? 17 : 14,
      change: e => p.onChange?.(e.target.value),
    };
  }
});

// ---------------------------------------------------------------------------------------------
// App City Jump — "Scopri chi rientra a [città ▾]": takes the visitor to sign-up with that city.
// Empty, the list shows Italy's 15 largest cities; typing searches every comune.

// Dropdown highlight (.dd-opt.is-hover): the option under the pointer, worked out from the
// pointer position rather than CSS :hover. It's recomputed on every mouse move and on every scroll
// anywhere (the list's own, and the page's: the smooth scroll that opens the home list moves it
// under a still pointer), plus after each redraw, which :hover doesn't reliably follow.
// Only a real mouse movement arms it: when a list opens, or you type, nothing lights up just because
// the list appeared (or the page scrolled it) under a pointer that stayed still.
let pointer = null, armed = false, paused = false, pauseTimer = 0;
export function disarmHover() { armed = false; }
// While the page scrolls itself (the smooth scroll that opens the home list) hover is off, and comes
// back when the scroll ends ('scrollend', or a timeout where that event doesn't exist).
function pauseHoverWhileScrolling() {
  paused = true;
  refreshHover();
  const resume = () => { clearTimeout(pauseTimer); window.removeEventListener('scrollend', resume); paused = false; refreshHover(); };
  window.addEventListener('scrollend', resume, { once: true });
  clearTimeout(pauseTimer);
  pauseTimer = setTimeout(resume, 1000);
}
function refreshHover() {
  const lists = document.querySelectorAll('.dd-list');
  if (!lists.length) return;
  const at = !paused && armed && pointer && document.elementFromPoint(...pointer)?.closest?.('.dd-opt');
  for (const list of lists) {
    const on = at && list.contains(at) ? at : null;
    for (const o of list.querySelectorAll('.dd-opt.is-hover')) if (o !== on) o.classList.remove('is-hover');
    on?.classList.add('is-hover');
    list.classList.toggle('has-hover', !!on);
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('mousemove', e => {
    // Browsers also send mousemove when content moves under a still pointer: same coordinates, not a move
    if (!pointer || pointer[0] !== e.clientX || pointer[1] !== e.clientY) armed = true;
    pointer = [e.clientX, e.clientY];
    refreshHover();
  }, { capture: true, passive: true });
  document.addEventListener('mouseleave', () => { pointer = null; refreshHover(); });
  let queued = false;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; refreshHover(); }); } };
  document.addEventListener('scroll', later, { capture: true, passive: true });
  document.addEventListener('wheel', later, { capture: true, passive: true });
}

// The same highlight set straight from the option's own mouse events (enter or move), so it never
// depends on the pointer-position lookup above; leaving the list clears it.
function hoverOption(el) {
  const list = el?.closest?.('.dd-list');
  if (!list || !armed || paused) return;
  for (const o of list.querySelectorAll('.dd-opt.is-hover')) if (o !== el) o.classList.remove('is-hover');
  el.classList.add('is-hover');
  list.classList.add('has-hover');
}
function leaveList(e) {
  const list = e.currentTarget;
  for (const o of list.querySelectorAll('.dd-opt.is-hover')) o.classList.remove('is-hover');
  list.classList.remove('has-hover');
}

// Empty query: the 15 largest cities; otherwise names starting with it, then names containing it.
function searchCities(list, query) {
  const q = fold(query.trim()).out;
  if (!q) return list.slice(0, 15);
  return [...list.filter(c => c.key.startsWith(q)), ...list.filter(c => !c.key.startsWith(q) && c.key.includes(q))].slice(0, 10);
}

// The phone sheet's result list. It re-renders on its own while the person types (App City Jump
// calls setQuery), so the search field and the sheet around it are never rebuilt: no flicker, and
// the keyboard and autocorrect keep working on the same field. Props: comuni, query, onPick,
// onReady(list).
def('App City Options', String.raw`
<div class="cj-sheet-options">
<sc-if value="{{ top }}"><span class="cj-head">Le città più grandi</span></sc-if>
<sc-for list="{{ matches }}" as="m"><div role="option" aria-selected="false" class="cj-sopt" onClick="{{ m.tap }}"><span>{{ m.name }}</span><span class="cj-meta">{{ m.region }}</span></div></sc-for>
<sc-if value="{{ none }}"><span class="cj-head">Nessun comune trovato</span></sc-if>
<sc-if value="{{ loading }}"><span class="cj-head">Carico le città…</span></sc-if>
</div>`, class extends DCLogic {
  setQuery(query) { this.state.query = query; this.__rerender?.(); }
  renderVals() {
    this.props.onReady?.(this);
    const comuni = this.props.comuni;
    const query = this.state.query ?? this.props.query ?? '';
    const found = comuni ? searchCities(comuni, query) : [];
    return {
      matches: found.map(c => ({ name: c.name, region: c.region, tap: () => this.props.onPick?.(c.name) })),
      top: !!comuni && !query.trim(), none: !!comuni && !!query.trim() && !found.length, loading: !comuni,
    };
  }
});

def('App City Jump', String.raw`
<div class="city-jump {{ openClass }}">
<label class="cj-lead" for="{{ uid }}">Scopri chi rientra a</label>
<div class="cj-box" onMouseDown="{{ boxDown }}" onClick="{{ boxClick }}">
<input id="{{ uid }}" data-key="{{ uid }}" class="cj-input bare-input" readonly="{{ phone }}" role="combobox" aria-expanded="{{ open }}" aria-controls="{{ uid }}-list" aria-autocomplete="list" autocomplete="off" placeholder="{{ placeholder }}" value="{{ query }}" onInput="{{ input }}" onKeyDown="{{ keydown }}" onFocus="{{ focus }}" onBlur="{{ blur }}">
<svg class="cj-chevron" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
<sc-if value="{{ open }}"><div id="{{ uid }}-list" data-key="{{ uid }}-list" role="listbox" aria-label="Città" class="cj-list dd-list {{ kbClass }}" onMouseLeave="{{ leave }}">
<sc-if value="{{ top }}"><span class="cj-head">Le città più grandi</span></sc-if>
<sc-for list="{{ matches }}" as="m"><div role="option" aria-selected="{{ m.active }}" class="cj-opt dd-opt" onMouseDown="{{ m.pick }}" onMouseOver="{{ m.hover }}" onMouseMove="{{ m.hover }}"><span>{{ m.name }}</span><span class="cj-meta">{{ m.region }}</span></div></sc-for>
<sc-if value="{{ none }}"><span class="cj-head">Nessun comune trovato</span></sc-if>
</div></sc-if>
</div>
<sc-if value="{{ sheet }}"><div class="cj-sheet-backdrop" aria-hidden="true"></div><div class="cj-sheet" role="dialog" aria-modal="true" aria-label="Scegli la città">
<div class="cj-sheet-top {{ anim }}">
<button type="button" class="cj-sheet-close" aria-label="Chiudi" onClick="{{ close }}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
<label class="cj-sheet-field"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="city-sheet-input" data-key="city-sheet" type="search" enterkeyhint="go" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Cerca la città" aria-controls="city-sheet-list" placeholder="Scegli la città" value="{{ query }}" onInput="{{ sheetInput }}" onKeyDown="{{ sheetKey }}"></label>
</div>
<div id="city-sheet-list" data-key="city-sheet-list" class="cj-sheet-list {{ anim }}" role="listbox" aria-label="Città"><dc-import name="App City Options" dc-props="{{ listProps }}"></dc-import></div>
</div></sc-if>
</div>`, class extends DCLogic {
  state = { query: '', open: false, idx: -1, comuni: null, sheet: false };
  // Phones get a full-screen picker instead of the dropdown: the pill looks the same but only
  // opens it (read-only, so it never raises the keyboard itself). The sheet has the search field
  // at the top and the list below, sized to the visible viewport so the keyboard never covers
  // it; the phone's back button closes it.
  get phone() { return matchMedia('(max-width: 720px)').matches; }
  // compact: a copy in a top bar (the home's), which opens where it is; uid: its element ids
  get compact() { return b(this.props.compact); }
  openSheet() {
    if (this.state.sheet) return;
    this.load();
    this.setState({ sheet: true, sheetFresh: true, open: false });
    this.state.sheetFresh = false; // later renders (the city list arriving) don't replay the animation
    document.getElementById('city-sheet-input')?.focus(); // inside the tap, so iOS shows the keyboard
    document.documentElement.classList.add('cj-locked');
    const vv = window.visualViewport;
    this.fit = () => {
      const root = document.documentElement.style;
      root.setProperty('--vvh', `${vv ? vv.height : window.innerHeight}px`);
      root.setProperty('--vvt', `${vv ? vv.offsetTop : 0}px`);
    };
    this.fit();
    vv?.addEventListener('resize', this.fit);
    vv?.addEventListener('scroll', this.fit);
    history.pushState({ cjSheet: true }, '');
    window.addEventListener('popstate', this.popped);
  }
  closeSheet(fromHistory) {
    if (!this.state.sheet) return;
    const vv = window.visualViewport;
    vv?.removeEventListener('resize', this.fit);
    vv?.removeEventListener('scroll', this.fit);
    document.documentElement.classList.remove('cj-locked');
    window.removeEventListener('popstate', this.popped);
    this.setState({ sheet: false, query: '' });
    if (!fromHistory && history.state?.cjSheet) history.back();
  }
  popped = () => { if (this.state.sheet) this.closeSheet(true); };
  // Phones: a copy in a top bar opens the hero's picker, the very same full-screen one (its own
  // would be boxed in by the bar's blur and fade, which confine fixed elements inside them). Still
  // inside the tap, so iOS shows the keyboard.
  openPhonePicker() {
    const hero = this.compact && document.getElementById('city-jump')?.closest('.cj-box');
    if (hero) hero.click();
    else this.openSheet();
  }
  // Highlight rules: the option under the mouse (.is-hover, see hoverOption/refreshHover); with no
  // mouse on the list, only an option whose name is exactly what was typed, or the one reached with
  // the arrow keys. Nothing is highlighted just because it comes first. Moving the mouse after using
  // the arrows hands the highlight back to the mouse (Chrome's synthetic mousemove on redraw, with
  // unchanged coordinates, is ignored).
  pointAt(e) {
    hoverOption(e.currentTarget);
    if (e.clientX === this.mx && e.clientY === this.my) return;
    this.mx = e.clientX; this.my = e.clientY;
    if (this.state.kb) this.setState({ kb: false, idx: -1 });
  }
  async load() {
    if (this.state.comuni) return;
    const cat = await getCatalog().catch(() => null);
    this.setState({ comuni: (cat?.comuni ?? []).map(c => ({ name: c[0], region: c[2], pop: c[3] ?? 0, key: fold(c[0]).out })).sort((a, b) => b.pop - a.pop) });
  }
  // Opening the list scrolls the hero headline up to the top of the screen, so the list has room
  // below it. Leaves room for the launch bar and, on phones, the sticky header; never scrolls back up.
  reveal() {
    if (this.compact) return; // the copy in the home's compact top bar opens where it is
    const h1 = document.getElementById('city-jump')?.closest('section')?.querySelector('h1');
    if (!h1) return;
    const header = document.querySelector('.site-header');
    const stuck = header && getComputedStyle(header).position === 'sticky' ? header.offsetHeight : 0;
    const lb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lb')) || 0;
    const top = h1.getBoundingClientRect().top + window.scrollY - lb - stuck - 24;
    if (top > window.scrollY + 4) { pauseHoverWhileScrolling(); window.scrollTo({ top, behavior: 'smooth' }); }
  }
  // To sign-up, carrying the city for the sign-up page's headline
  go(name) { location.href = `/accedi?citta=${encodeURIComponent(name)}`; }
  renderVals() {
    const { query, open, idx, comuni } = this.state;
    const q = fold(query.trim()).out;
    const found = searchCities(comuni ?? [], query);
    // Highlighted without the mouse: the arrow-key choice, or else the city whose name is exactly the text
    const exact = q ? found.findIndex(c => c.key === q) : -1;
    const active = this.state.kb ? idx : exact;
    const matches = found.map((c, i) => ({
      name: c.name, region: c.region, active: i === active ? 'true' : 'false',
      pick: e => { e.preventDefault(); this.go(c.name); },
      tap: () => this.go(c.name),
      hover: e => this.pointAt(e),
    }));
    const phone = this.phone;
    if (open) requestAnimationFrame(refreshHover); // options were redrawn
    return {
      uid: this.props.uid ?? (this.compact ? 'city-jump-bar' : 'city-jump'), placeholder: this.props.placeholder ?? 'scegli la città',
      query, open: open && !!comuni && !phone, matches, top: !q && !!comuni, none: !!q && !!comuni && !found.length, kbClass: this.state.kb ? 'dd-kb' : '', leave: leaveList,
      phone, sheet: this.state.sheet, loading: !comuni,
      openClass: open && comuni && !phone ? 'cj-open' : '',
      // The open animation plays once, not on every later render of the sheet
      anim: this.state.sheetFresh ? 'cj-anim' : '',
      listProps: { comuni, query, onPick: name => this.go(name), onReady: list => { this.list = list; } },
      sheetInput: e => {
        this.state.query = e.target.value;
        this.list?.setQuery(e.target.value);
        const box = document.getElementById('city-sheet-list');
        if (box) box.scrollTop = 0;
      },
      close: () => this.closeSheet(),
      boxClick: () => { if (this.phone) this.openPhonePicker(); },
      sheetKey: e => {
        const first = searchCities(this.state.comuni ?? [], this.state.query)[0];
        if (e.key === 'Enter' && first) { e.preventDefault(); this.go(first.name); }
        else if (e.key === 'Escape') this.closeSheet();
      },
      input: e => { disarmHover(); this.setState({ query: e.target.value, open: true, kb: false, idx: -1 }); },
      focus: () => { if (this.phone) return this.openPhonePicker(); disarmHover(); this.setState({ open: true }); this.load(); requestAnimationFrame(() => this.reveal()); },
      // The chevron and the rest of the pill open the list too (and close it when it's open)
      boxDown: e => {
        if (this.phone) { e.preventDefault(); return; } // the tap's click opens the full-screen picker
        if (e.target.closest('.cj-list') || e.target.tagName === 'INPUT') return;
        e.preventDefault();
        const input = document.getElementById('city-jump');
        if (document.activeElement === input) { disarmHover(); this.setState({ open: !this.state.open }); }
        else input?.focus();
      },
      blur: () => setTimeout(() => this.state.open && this.setState({ open: false }), 150),
      keydown: e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.setState({ open: true, kb: true, idx: Math.min(active + 1, found.length - 1) }); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.setState({ kb: true, idx: Math.max(active - 1, 0) }); }
        else if (e.key === 'Enter' && found[active]) { e.preventDefault(); this.go(found[active].name); }
        else if (e.key === 'Escape') this.setState({ open: false });
      },
    };
  }
});

// App Toc — "In questa guida" / "Indice" of the long pages (Rientro dei cervelli, legal pages): a
// sticky list of links to the sections, the one being read highlighted as you scroll (tocSpy).
// Props: eyebrow, items [{ label, href: '#id' }].
def('App Toc', String.raw`
<div class="toc">
<dc-import name="UI Eyebrow" text="{{ eyebrow }}"></dc-import>
<div style="height:10px"></div>
<sc-for list="{{ items }}" as="i"><a href="{{ i.href }}" class="toc-link">{{ i.label }}</a></sc-for>
</div>`, class extends DCLogic {
  renderVals() {
    requestAnimationFrame(tocSpy); // links were (re)drawn: mark the current one
    return { eyebrow: this.props.eyebrow ?? 'Indice', items: this.props.items ?? [] };
  }
});

// Highlights the link of the last section whose top has passed under the header; at the very
// bottom of the page, the last one (a short final section may never reach the top).
function tocSpy() {
  const links = [...document.querySelectorAll('.toc-link')];
  if (!links.length) return;
  const lb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lb')) || 0;
  let current = links[0];
  for (const a of links) {
    const section = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
    if (section && section.getBoundingClientRect().top <= 140 + lb) current = a;
  }
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = links[links.length - 1];
  for (const a of links) a.setAttribute('aria-current', a === current ? 'true' : 'false');
}
if (typeof window !== 'undefined') {
  let queued = false;
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; tocSpy(); }); } }, { passive: true });
  addEventListener('resize', () => tocSpy(), { passive: true });
}

// App Site Header — the public pages' header (home, Rientro dei cervelli, territori): logo, the same
// menu in the same order everywhere, and "Accedi a Rientro". Props: here ('home' | 'cervelli' | 'territori'),
// onEnter(). Home sections are linked as /#section from the other pages.

// Phones: the public header (sticky there) goes from nearly opaque to see-through over the first
// 80px of scrolling, so it's already there over the headline, and stays so. Background only: no layout.
const HEADER_A = [0.94, 0.7];
const headerAlpha = () => {
  const t = Math.min(1, scrollY / 80);
  document.documentElement.style.setProperty('--site-header-a', (HEADER_A[0] - (HEADER_A[0] - HEADER_A[1]) * t).toFixed(3));
};
addEventListener('scroll', headerAlpha, { passive: true });
headerAlpha();

def('App Site Header', String.raw`
<header style="padding:18px var(--gutter) 0"><div style="height:64px;padding:0 10px 0 26px;border-radius:999px;background:rgba(255,255,255,.72);border:1px solid #FFFFFF;box-shadow:0 8px 30px rgba(80,60,160,.10);display:flex;align-items:center;gap:32px;font-size:14px;font-weight:500;font-family:'Geist',sans-serif">
<a href="/" aria-label="Rientro, home" style="text-decoration:none"><dc-import name="UI Logo" size="28"></dc-import></a>
<nav aria-label="Menu" class="r-hide-md" style="display:flex;gap:26px;color:#6B6680;align-items:center">
<sc-for list="{{ links }}" as="l"><a href="{{ l.href }}" aria-current="{{ l.current }}" style="height:36px;padding:{{ l.pad }};border-radius:999px;background:{{ l.bg }};color:{{ l.fg }};text-decoration:none;display:flex;align-items:center">{{ l.label }}</a></sc-for>
</nav>
<div style="flex:1"></div><div class="site-enter-wrap"><div class="site-enter"><dc-import name="UI Button" label="Accedi a Rientro" on-click="{{ enter }}"></dc-import></div>
<sc-if value="{{ jump }}"><div class="site-jump"><dc-import name="App City Jump" compact="{{ true }}" uid="city-jump-head" placeholder="città"></dc-import></div></sc-if></div>
</div></header>`, class extends DCLogic {
  renderVals() {
    const here = this.props.here ?? 'home';
    const base = here === 'home' ? '' : '/';
    const links = [
      ['Come funziona', `${base}#come-funziona`], ['Per chi è', `${base}#per-chi`], ['Domande', `${base}#domande`],
      ['Rientro dei cervelli', '/rientro-dei-cervelli', 'cervelli'],
    ].map(([label, href, page]) => {
      const on = page === here;
      return { label, href, current: on ? 'page' : 'false', pad: on ? '0 14px' : '0', bg: on ? '#1A1726' : 'transparent', fg: on ? '#FFFFFF' : '#6B6680' };
    });
    // jump: on the home, phones swap "Accedi a Rientro" for the city picker once the hero's has
    // scrolled away (app.css, body.home-bar-on)
    return { links, enter: () => this.props.onEnter?.(), jump: b(this.props.jump) };
  }
});

// App Checkbox — UI Checkbox in a larger size, for a checkbox that stands alone as an answer
// ("Non lo so ancora", "Ho sempre vissuto in Italia"). Props: label, checked. Clicks go on the
// dc-import (on-click), like UI Checkbox.

def('App Checkbox', String.raw`
<div style="display:flex;align-items:center;gap:14px;min-height:44px;font-family:'Geist',sans-serif;font-size:17px;font-weight:500;color:#1A1726;cursor:pointer">
<span style="width:28px;height:28px;border-radius:9px;flex:none;box-sizing:border-box;background:{{ bg }};border:{{ bd }};color:#FFFFFF;font-size:16px;display:flex;align-items:center;justify-content:center">{{ mark }}</span>
<span>{{ label }}</span>
</div>`, class extends DCLogic {
  renderVals() {
    const on = b(this.props.checked);
    return { label: this.props.label ?? '', bg: on ? '#6C4DF5' : '#FFFFFF', bd: on ? 'none' : '2px solid #CFC8E8', mark: on ? '✓' : '' };
  }
});

// App Segmented — UI Segmented with clickable options. options: [{ v, l }], value, onSelect(v)

def('App Segmented', String.raw`
<div role="radiogroup" aria-label="{{ ariaLabel }}" style="display:flex;padding:4px;border-radius:999px;background:{{ track }};gap:2px;font-family:'Geist',sans-serif;font-size:13px;box-sizing:border-box;width:100%;flex-wrap:wrap">
<sc-for list="{{ opts }}" as="o">
<button type="button" role="radio" aria-checked="{{ o.on }}" onClick="{{ o.pick }}" style="flex:1;min-height:32px;border:none;border-radius:999px;background:{{ o.bg }};box-shadow:{{ o.sh }};color:{{ o.fg }};font:{{ o.fw }} 13px 'Geist',sans-serif;display:flex;align-items:center;justify-content:center;white-space:nowrap;padding:0 10px;cursor:pointer">{{ o.l }}</button>
</sc-for>
</div>`, class extends DCLogic {
  renderVals() {
    const p = this.props;
    const opts = (p.options || []).map(o => {
      const on = o.v === p.value;
      return { ...o, on: on ? 'true' : 'false', bg: on ? '#FFFFFF' : 'transparent', sh: on ? '0 2px 8px rgba(80,60,160,.12)' : 'none', fg: on ? '#1A1726' : '#6B6680', fw: on ? 600 : 500, pick: () => p.onSelect?.(on && b(p.clearable) ? '' : o.v) };
    });
    return { opts, ariaLabel: p.label ?? '', track: p.onWhite ? '#F1EFF8' : (p.track ?? '#F1EFF8') };
  }
});

// ---------------------------------------------------------------------------------------------
// App Comune Picker — design 7b/8a/27a: chips + search with ↑ ↓ and Invio (max 1: the pick replaces the field). Also used for
// countries and foreign cities. Props: comuni (items: [name, sigla?, regione?, popolazione?]; the region shows, the sigla never does),
// selected[], max, counts?, placeholder, noun ("comune"), freeText (accept typed text), onChange(list)

// Accent-insensitive lowercase, with a map back to positions in the original string
function fold(str) {
  let out = '';
  const at = [];
  for (let i = 0; i < str.length; i++) {
    const f = str[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (let k = 0; k < f.length; k++) { out += f[k]; at.push(i); }
  }
  at.push(str.length);
  return { out, at };
}

def('App Comune Picker', String.raw`
<div style="display:flex;flex-direction:column;gap:12px;font-family:'Geist',sans-serif;position:relative">
<sc-if value="{{ smallChips }}"><div style="display:flex;gap:6px;flex-wrap:wrap">
<sc-for list="{{ chips }}" as="c"><dc-import name="UI Chip" label="{{ c.l }}" tone="selected" size="sm" removable="{{ true }}" on-click="{{ c.remove }}" host-aria-label="{{ c.aria }}"></dc-import></sc-for>
</div></sc-if>
<sc-if value="{{ bigChip }}"><div style="display:flex">
<sc-for list="{{ chips }}" as="c"><button type="button" aria-label="{{ c.aria }}" onClick="{{ c.remove }}" style="height:{{ h }};max-width:100%;padding:0 12px 0 22px;border:none;border-radius:999px;background:#1A1726;color:#FFFFFF;font:500 {{ fs }}px 'Geist',sans-serif;display:inline-flex;align-items:center;gap:12px;cursor:pointer;box-sizing:border-box"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.l }}</span><span aria-hidden="true" style="flex:none;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1">×</span></button></sc-for>
</div></sc-if>
<sc-if value="{{ showField }}"><div class="dc-field" style="width:100%;height:{{ h }};border-radius:999px;background:#FFFFFF;border:1px solid #E4E0F2;box-sizing:border-box;padding:0 18px;display:flex;align-items:center;gap:10px;font-size:{{ fs }}px;color:#1A1726">
<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8C84AE" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" style="flex:none"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
<input class="bare-input" data-key="{{ field }}" role="combobox" aria-expanded="{{ open }}" aria-autocomplete="list" aria-label="{{ label }}" value="{{ query }}" placeholder="{{ placeholder }}" disabled="{{ full }}" onInput="{{ input }}" onKeyDown="{{ keydown }}" onFocus="{{ focus }}" onBlur="{{ blur }}">
</div></sc-if>
<sc-if value="{{ open }}"><div role="listbox" class="dd-list {{ kbClass }}" onMouseLeave="{{ leave }}" style="position:absolute;left:0;right:0;top:{{ dropTop }};z-index:15;border-radius:22px;background:#FFFFFF;padding:6px;display:flex;flex-direction:column;box-shadow:0 16px 36px rgba(80,60,160,.14);font-size:14px">
<sc-for list="{{ matches }}" as="m"><div role="option" aria-selected="{{ m.active }}" class="dd-opt" onMouseDown="{{ m.pick }}" onMouseOver="{{ m.hover }}" onMouseMove="{{ m.hover }}" style="padding:10px 12px;border-radius:16px;display:flex;justify-content:space-between;gap:12px;cursor:pointer"><span>{{ m.pre }}<b style="font-weight:600">{{ m.head }}</b>{{ m.rest }}</span><span style="font-family:'Geist Mono',monospace;font-size:11px;color:#6B6680;white-space:nowrap">{{ m.meta }}</span></div></sc-for>
<sc-if value="{{ none }}"><div style="padding:10px 12px;color:#8C84AE">{{ noneText }}</div></sc-if>
</div></sc-if>
</div>`, class extends DCLogic {
  state = { query: '', open: false, idx: -1 };
  // Highlight rules: the option under the mouse (.is-hover, see hoverOption/refreshHover); with no
  // mouse on the list, only an option whose name is exactly what was typed, or the one reached with
  // the arrow keys. Nothing is highlighted just because it comes first. Moving the mouse after using
  // the arrows hands the highlight back to the mouse (Chrome's synthetic mousemove on redraw, with
  // unchanged coordinates, is ignored).
  pointAt(e) {
    hoverOption(e.currentTarget);
    if (e.clientX === this.mx && e.clientY === this.my) return;
    this.mx = e.clientX; this.my = e.clientY;
    if (this.state.kb) this.setState({ kb: false, idx: -1 });
  }
  // Items starting with the query first, then items with a later word starting with it;
  // within each group the most populous first (or the list's own order).
  matchesFor(q) {
    const sel = this.props.selected || [];
    const t = fold(q.trim()).out;
    if (!t) return [];
    const hits = [];
    for (const [i, c] of (this.props.comuni || []).entries()) {
      if (sel.includes(c[0])) continue;
      const f = fold(c[0]);
      let pos = f.out.startsWith(t) ? 0 : -1;
      if (pos < 0) {
        const m = new RegExp(`[\\s'’\\-(/]${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).exec(f.out);
        if (m) pos = m.index + 1;
      }
      if (pos >= 0) hits.push({ c, i, pos, f, weight: typeof c[3] === 'number' ? c[3] : -i });
    }
    hits.sort((a, b) => (a.pos > 0) - (b.pos > 0) || b.weight - a.weight);
    return hits.slice(0, 6).map(h => ({ ...h, len: t.length }));
  }
  add(name) {
    const sel = this.props.selected || [];
    const max = Number(this.props.max || 10);
    if (sel.includes(name)) return;
    this.state.query = '';
    this.state.open = false;
    if (max === 1) this.props.onChange?.([name]); // a new pick replaces the old one
    else if (sel.length < max) this.props.onChange?.([...sel, name]);
  }
  renderVals() {
    const sel = this.props.selected || [];
    const q = this.state.query;
    const counts = this.props.counts;
    const max = Number(this.props.max || 10);
    const found = this.matchesFor(q);
    const typed = q.trim();
    const offerTyped = b(this.props.freeText) && typed && !found.some(h => h.c[0].toLowerCase() === typed.toLowerCase());
    const options = [
      ...found.map(h => {
        const a = h.f.at[h.pos];
        const z = h.f.at[h.pos + h.len];
        const c = h.c;
        return { name: c[0], pre: c[0].slice(0, a), head: c[0].slice(a, z), rest: c[0].slice(z), meta: counts ? `${counts[c[0]] || 0} persone` : (c[2]?.toUpperCase() ?? '') };
      }),
      ...(offerTyped ? [{ name: typed, pre: 'Usa “', head: typed, rest: '”', meta: '' }] : []),
    ];
    if (this.state.open) requestAnimationFrame(refreshHover); // options were redrawn
    // Highlighted without the mouse: the arrow-key choice, or else the place whose name is exactly the
    // text (never the "Usa …" suggestion)
    const exact = typed ? found.findIndex(h => h.f.out === fold(typed).out) : -1;
    const active = this.state.kb ? this.state.idx : exact;
    const matches = options.map((o, i) => ({
      ...o, active: i === active ? 'true' : 'false',
      pick: e => { e.preventDefault(); this.add(o.name); },
      hover: e => this.pointAt(e),
    }));
    const full = max > 1 && sel.length >= max;
    const noun = this.props.noun ?? 'comune';
    // Single choice: once picked, the chip takes the field's place; removing it brings the field back
    const single = max === 1;
    const placeholder = full ? `Massimo ${max} ${noun === 'comune' ? 'comuni' : 'scelte'}` : (this.props.placeholder ?? `Cerca un ${noun}`);
    return {
      chips: sel.map(l => ({ l, aria: `Rimuovi ${l}`, remove: () => {
        this.props.onChange?.(sel.filter(x => x !== l));
        const key = this.props.field ?? 'comuni';
        setTimeout(() => document.querySelector(`[data-key="${key}"]`)?.focus()); // ready to type the next one
      } })),
      // Single choice: the chip stands in for the field, so it takes the field's size
      smallChips: !single && sel.length > 0, bigChip: single && sel.length > 0, showField: !(single && sel.length), field: this.props.field ?? 'comuni', full, query: q,
      placeholder, label: placeholder,
      open: this.state.open && typed.length > 0, matches, none: this.state.open && typed && !matches.length, kbClass: this.state.kb ? 'dd-kb' : '', leave: leaveList,
      noneText: this.props.noneText ?? `Nessun ${noun} trovato`,
      h: this.props.size === 'lg' ? '52px' : '44px', fs: this.props.size === 'lg' ? 17 : 14, dropTop: 'calc(100% + 6px)',
      input: e => { disarmHover(); this.setState({ query: e.target.value, open: true, kb: false, idx: -1 }); },
      focus: () => { if (this.state.query) this.setState({ open: true }); },
      blur: () => setTimeout(() => this.state.open && this.setState({ open: false }), 150),
      keydown: e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.setState({ kb: true, idx: Math.min(active + 1, options.length - 1) }); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.setState({ kb: true, idx: Math.max(active - 1, 0) }); }
        else if (e.key === 'Enter' && options[active]) { e.preventDefault(); this.add(options[active].name); }
        else if (e.key === 'Escape') this.setState({ open: false });
        else if (e.key === 'Backspace' && !this.state.query && sel.length) this.props.onChange?.(sel.slice(0, -1));
      },
    };
  }
});

// ---------------------------------------------------------------------------------------------
// App Photo — UI Photo with a real image or video when one exists (falls back to the design's
// striped placeholder). Props: as UI Photo, plus src, video (url), alt, initials.

def('App Photo', String.raw`
<div style="position:relative;flex:none;width:{{ w }};height:{{ h }};aspect-ratio:{{ ratio }};border-radius:{{ radius }};background:{{ bg }};overflow:hidden;box-sizing:border-box">
<sc-if value="{{ src }}"><img class="media-fill" src="{{ src }}" alt="{{ alt }}" loading="lazy"></sc-if>
<sc-if value="{{ video }}"><video class="media-fill" src="{{ video }}" controls preload="metadata" playsinline aria-label="{{ alt }}"></video></sc-if>
<sc-if value="{{ showInitials }}"><span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:600 {{ ifs }}px 'Geist',sans-serif;color:{{ ic }}">{{ initials }}</span></sc-if>
<sc-if value="{{ showLabel }}"><span style="position:absolute;left:14px;bottom:12px;font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:.06em;color:#8C84AE">{{ label }}</span></sc-if>
<sc-if value="{{ hasBadge }}"><dc-import name="UI Badge" kind="{{ badgeKind }}" label="{{ badge }}" style="position:absolute;top:12px;left:12px"></dc-import></sc-if>
<sc-if value="{{ hasDuration }}"><span style="position:absolute;right:14px;bottom:12px;font-family:'Geist Mono',monospace;font-size:11px;color:#FFFFFF">{{ duration }}</span></sc-if>
</div>`, class extends DCLogic {
  renderVals() {
    const p = this.props;
    const size = p.size ? Number(p.size) : 0;
    const dark = b(p.dark);
    const small = size && size < 90;
    const media = !!(p.src || p.video);
    return {
      w: size ? `${size}px` : '100%', h: size ? `${size}px` : (p.height ? `${p.height}px` : 'auto'),
      ratio: size || p.height ? 'auto' : (p.ratio ?? '4/3'), radius: p.radius ?? (size ? '50%' : '22px'),
      bg: media ? '#1A1726' : dark ? 'repeating-linear-gradient(135deg,#2A2638 0 8px,#231F30 8px 16px)' : 'repeating-linear-gradient(135deg,#E3DEF5 0 8px,#DAD4F0 8px 16px)',
      src: p.video ? null : p.src, video: p.video, alt: p.alt ?? '',
      initials: p.initials, showInitials: !media && !!p.initials, ifs: size ? Math.max(11, Math.round(size / 3)) : 28, ic: dark ? '#B7B0D4' : '#6B6680',
      label: p.label ?? 'FOTO', showLabel: !media && !p.initials && !small && p.label !== '',
      hasBadge: !!p.badge, badge: p.badge, badgeKind: p.badgeKind ?? 'idea', duration: p.duration, hasDuration: !!p.duration && !media,
    };
  }
});

// ---------------------------------------------------------------------------------------------
// App Person Card — from UI Person Card (+ real photo, profile link, connection-aware action).
// Props: person (profiles.card shape), compact, ratio, onConnect(person)

def('App Person Card', String.raw`
<article style="height:100%;box-sizing:border-box;background:linear-gradient(180deg,#FFFFFF,#F6F4FC);border:1px solid #FFFFFF;border-radius:28px;padding:10px 10px 20px;box-shadow:0 14px 40px rgba(80,60,160,.12);display:flex;flex-direction:column;font-family:'Geist',sans-serif;color:#1A1726">
<div class="pc-top" style="flex:1;display:flex;flex-direction:column">
<div class="pc-head" style="display:flex;flex-direction:column;gap:14px;margin:-10px -10px 0;padding:10px 10px 12px;border-radius:28px 28px 0 0">
<a href="{{ href }}" tabindex="-1" aria-hidden="true"><dc-import name="App Photo" ratio="{{ ratio }}" label="FOTO PROFILO" src="{{ p.photo_url }}" alt="" badge="{{ badge }}" badge-kind="{{ badgeKind }}"></dc-import></a>
<div style="display:flex;flex-direction:column;gap:4px;padding:0 10px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h3 style="margin:0;font-family:'Unbounded',sans-serif;font-weight:600;font-size:18px;letter-spacing:-.03em"><a href="{{ href }}" style="color:inherit;text-decoration:none">{{ p.name }}</a></h3><span style="font-family:'Geist Mono',monospace;font-size:11px;color:#8C84AE;white-space:nowrap;flex:none">{{ p.age }}</span></div><span style="font-size:13px;color:#6B6680">{{ p.role }}</span></div>
</div>
<div style="padding:0 10px;display:flex;flex-direction:column;gap:12px;flex:1">
<div style="display:flex;align-items:center;gap:8px;font-size:14px;flex-wrap:wrap"><span style="color:#6B6680">Vive a {{ p.from }}</span><sc-if value="{{ p.to }}"><span style="color:#6C4DF5" aria-label="vuole trasferirsi a">→</span><span style="font-weight:500">{{ p.to }}</span></sc-if></div>
<div style="display:grid;grid-template-columns:72px 1fr;gap:6px 10px;font-size:13px;padding-top:12px;border-top:1px solid #ECE8F7"><span style="color:#8C84AE">Cerca</span><span>{{ p.seeks }}</span><span style="color:#8C84AE">Interessi</span><span>{{ p.tags }}</span><span style="color:#8C84AE">Tempo</span><span>{{ p.time }}</span></div>
<sc-if value="{{ hasComp }}"><div style="display:flex;gap:8px;align-items:flex-start;padding:10px 14px;border-radius:16px;background:#EFEBFF;color:#3E2BA8;font-size:13px;line-height:1.4"><span style="width:6px;height:6px;border-radius:50%;background:#6C4DF5;margin-top:6px;flex:none"></span>{{ p.comp }}</div></sc-if>
<div style="flex:1"></div>
</div>
</div>
<sc-if value="{{ showActions }}"><div style="padding:8px 10px 0;display:grid;grid-template-columns:1fr 1fr;gap:8px">
<a href="{{ href }}" style="text-decoration:none"><dc-import name="UI Button" label="{{ secondaryLabel }}" variant="secondary" full="{{ true }}"></dc-import></a>
<dc-import name="UI Button" label="{{ action.l }}" variant="{{ action.v }}" full="{{ true }}" on-click="{{ action.fn }}" host-aria-disabled="{{ action.off }}"></dc-import>
</div></sc-if>
</article>`, class extends DCLogic {
  renderVals() {
    const p = this.props.person || {};
    const c = p.connection?.status ?? 'none';
    const go = href => () => { location.href = href; };
    const action = {
      none: { l: 'Connettiti', v: 'primary', fn: () => this.props.onConnect?.(p), off: false },
      pending_sent: { l: 'In attesa', v: 'secondary', fn: null, off: true },
      pending_received: { l: 'Rispondi', v: 'accent', fn: go(`/persone/${p.id}`), off: false },
      connected: { l: 'Messaggio', v: 'primary', fn: go(`/messaggi/${p.id}`), off: false },
    }[c] ?? { l: 'Connettiti', v: 'primary', fn: null, off: true };
    return {
      // da: where the profile's back link goes (persona.js); noactions: just the card, no buttons
      p, ratio: this.props.ratio ?? '5/4', href: `/persone/${p.id}${this.props.da ? `?da=${this.props.da}` : ''}`, showActions: !b(this.props.noactions),
      badge: (INTENT_BADGE[p.intent] ?? INTENT_BADGE[p.idea ? 'has_idea' : 'seeking_idea'])[0], badgeKind: (INTENT_BADGE[p.intent] ?? INTENT_BADGE[p.idea ? 'has_idea' : 'seeking_idea'])[1],
      hasComp: !!p.comp, action,
      secondaryLabel: b(this.props.compact) ? 'Profilo' : 'Scopri il profilo',
    };
  }
});



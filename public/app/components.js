// App-specific variants of the design components. Each template is copied from the matching
// design/UI *.dc.html file; the only changes are real links, live data instead of the
// design's hard-coded placeholders (counts, "AR", "Chiara M."), and real form controls.
import { DCLogic, register } from '../dc/runtime.js';

const def = (name, template, Component) => register({ name, template, propsMeta: {}, Component });
const b = v => v === true || v === 'true';

// ---------------------------------------------------------------------------------------------
// App Nav — from UI Nav (+ links, live counts, search, avatar menu)

def('App Nav', String.raw`
<div class="r-pad" style="width:100%;padding:18px 24px 0;box-sizing:border-box;font-family:'Geist',sans-serif;position:relative;z-index:20">
<div style="height:64px;padding:0 10px 0 26px;border-radius:999px;background:rgba(255,255,255,.72);border:1px solid #FFFFFF;box-shadow:0 8px 30px rgba(80,60,160,.10);box-sizing:border-box;display:flex;align-items:center;gap:4px;font-size:14px;font-weight:500;color:#1A1726">
<a href="{{ home }}" aria-label="Rientro, home" style="display:flex;align-items:baseline;gap:3px;font-family:'Instrument Serif',serif;font-style:italic;font-size:28px;line-height:1;margin-right:22px;color:#1A1726;text-decoration:none">Rientro<span style="width:7px;height:7px;border-radius:50%;background:#6C4DF5;display:inline-block"></span></a>
<sc-for list="{{ items }}" as="it">
<a href="{{ it.href }}" class="r-hide-sm" aria-current="{{ it.current }}" style="height:42px;padding:0 16px;border-radius:999px;background:{{ it.bg }};color:{{ it.fg }};display:flex;align-items:center;gap:8px;cursor:pointer;text-decoration:none">{{ it.label }}<sc-if value="{{ it.hasCount }}"><span style="min-width:20px;height:20px;padding:0 6px;box-sizing:border-box;border-radius:10px;background:#6C4DF5;color:#FFFFFF;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center">{{ it.count }}</span></sc-if></a>
</sc-for>
<sc-if value="{{ pendingNote }}"><a href="/stato" class="r-hide-sm" style="height:42px;padding:0 16px;border-radius:999px;background:#FFF3D6;color:#8A5A00;display:flex;align-items:center;gap:8px;text-decoration:none"><span style="width:7px;height:7px;border-radius:50%;background:#D49A1A"></span>{{ pendingNote }}</a></sc-if>
<div style="flex:1"></div>
<sc-if value="{{ showSearch }}"><form role="search" onSubmit="{{ search }}" class="r-hide-sm" style="width:280px;height:44px;border-radius:999px;background:#F1EFF8;display:flex;align-items:center;gap:10px;padding:0 8px 0 16px;box-sizing:border-box;font-size:13px;font-weight:400;color:#8C84AE"><span style="width:11px;height:11px;border:1.8px solid #8C84AE;border-radius:50%;flex:none"></span><input name="q" value="{{ q }}" aria-label="Cerca" placeholder="Cerca persone, città, settori" class="bare-input" style="font-size:13px"><span style="margin-left:auto;font-family:'Geist Mono',monospace;font-size:11px;padding:3px 7px;border-radius:999px;background:#FFFFFF">⌘K</span></form></sc-if>
<button type="button" onClick="{{ toggleMenu }}" aria-haspopup="menu" aria-expanded="{{ menuOpen }}" aria-label="Il tuo account" style="width:44px;height:44px;margin-left:8px;border:none;padding:0;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFFFFF,#C9C0F0 45%,#8E7FE0);display:flex;align-items:center;justify-content:center;font:600 12px 'Geist',sans-serif;color:#1A1726;cursor:pointer;overflow:hidden;flex:none"><sc-if value="{{ photo }}"><img src="{{ photo }}" alt="" style="width:100%;height:100%;object-fit:cover"></sc-if><sc-if value="{{ noPhoto }}">{{ initials }}</sc-if></button>
</div>
<sc-if value="{{ menuOpen }}"><div role="menu" style="position:absolute;right:34px;top:88px;background:#FFFFFF;border-radius:22px;padding:6px;box-shadow:0 16px 36px rgba(40,30,90,.16);display:flex;flex-direction:column;font-size:14px;width:220px">
<sc-for list="{{ menu }}" as="m"><a role="menuitem" href="{{ m.href }}" style="padding:10px 12px;border-radius:16px;color:{{ m.fg }};text-decoration:none">{{ m.l }}</a></sc-for>
<div style="height:1px;background:#ECE8F7;margin:4px 0"></div>
<button type="button" role="menuitem" onClick="{{ logout }}" style="padding:10px 12px;border-radius:16px;border:none;background:transparent;text-align:left;font:inherit;color:#1A1726;cursor:pointer">Esci</button>
</div></sc-if>
</div>`, class extends DCLogic {
  state = { menuOpen: false };
  renderVals() {
    const me = this.props.me || {};
    const u = me.user || {};
    const p = me.profile || {};
    const c = me.counts || {};
    const a = this.props.active ?? 'none';
    const approved = u.status === 'approved' || u.role === 'admin';
    const items = approved && me.launched ? [
      ['scopri', 'Scopri persone', '/scopri', 0], ['connessioni', 'Connessioni', '/connessioni', c.received],
      ['messaggi', 'Messaggi', '/messaggi', c.unread_messages], ['notifiche', 'Notifiche', '/notifiche', c.notifications],
    ].map(([k, label, href, n]) => ({ label, href, count: n, hasCount: !!n, current: k === a ? 'page' : false, bg: k === a ? '#1A1726' : 'transparent', fg: k === a ? '#FFFFFF' : '#6B6680' })) : [];
    const pendingNote = !approved ? { onboarding: 'Completa il profilo', in_review: 'Profilo in revisione', changes_requested: 'Modifiche richieste', rejected: 'Profilo non approvato' }[u.status] : null;
    const menu = [
      { l: 'Il tuo profilo', href: approved ? '/profilo' : (u.status === 'onboarding' ? '/onboarding' : '/stato'), fg: '#1A1726' },
      { l: 'Impostazioni', href: '/impostazioni', fg: '#1A1726' },
      ...(u.role === 'admin' ? [{ l: 'Admin', href: '/admin', fg: '#6C4DF5' }] : []),
    ];
    return {
      items, pendingNote, menu, menuOpen: this.state.menuOpen, home: approved && me.launched ? '/scopri' : '/',
      showSearch: approved && me.launched, q: this.props.q ?? '',
      photo: p.photo_url, noPhoto: !p.photo_url, initials: `${(p.first_name || u.email || '?')[0]}${(p.last_name || '')[0] || ''}`.toUpperCase(),
      toggleMenu: () => this.setState({ menuOpen: !this.state.menuOpen }),
      search: e => { e.preventDefault(); const q = new FormData(e.target).get('q'); location.href = `/scopri?q=${encodeURIComponent(q)}`; },
      logout: async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'rientro' } }); location.href = '/'; },
    };
  }
});

// ---------------------------------------------------------------------------------------------
// App TabBar — from UI TabBar (+ links, live dots). Shown on small screens only.

def('App TabBar', String.raw`
<nav class="r-show-sm tabbar" aria-label="Navigazione" style="position:fixed;left:0;right:0;bottom:0;z-index:30;padding:0 var(--gutter) 14px;box-sizing:border-box;font-family:'Geist',sans-serif">
<div style="border-radius:999px;background:rgba(255,255,255,.82);border:1px solid #FFFFFF;box-shadow:0 10px 30px rgba(80,60,160,.14);padding:6px;display:grid;grid-template-columns:repeat(5,1fr);backdrop-filter:blur(12px)">
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
    const items = [['scopri', 'Scopri', '/scopri', '50%', 0], ['connessioni', 'Connessioni', '/connessioni', '6px', c.received], ['messaggi', 'Messaggi', '/messaggi', '6px 6px 6px 2px', c.unread_messages], ['notifiche', 'Notifiche', '/notifiche', '50% 50% 4px 4px', c.notifications], ['profilo', 'Profilo', '/impostazioni', '50%', 0]]
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
<div class="admin-sidebar" style="width:240px;min-height:100vh;box-sizing:border-box;padding:12px;font-family:'Geist',sans-serif;color:#1A1726;flex:none;position:sticky;top:0;align-self:flex-start">
<div style="min-height:calc(100vh - 24px);box-sizing:border-box;background:#1A1726;border-radius:24px;padding:20px 10px;display:flex;flex-direction:column;gap:22px">
<a href="/admin" style="display:flex;align-items:center;gap:8px;padding:0 10px;text-decoration:none"><dc-import name="UI Logo" size="22" tone="light"></dc-import><span style="font-family:'Geist Mono',monospace;font-size:10px;padding:3px 7px;border-radius:999px;background:#6C4DF5;color:#FFFFFF;letter-spacing:.04em">ADMIN</span></a>
<nav style="display:flex;flex-direction:column;gap:2px">
<sc-for list="{{ items }}" as="it">
<a href="{{ it.href }}" aria-current="{{ it.current }}" style="height:40px;padding:0 14px;border-radius:999px;display:flex;align-items:center;gap:10px;font-size:14px;color:{{ it.fg }};background:{{ it.bg }};font-weight:{{ it.fw }};text-decoration:none"><span style="width:7px;height:7px;border-radius:50%;background:{{ it.mark }}"></span>{{ it.label }}<sc-if value="{{ it.hasCount }}"><span style="margin-left:auto;font-family:'Geist Mono',monospace;font-size:11px;color:{{ it.cc }}">{{ it.count }}</span></sc-if></a>
</sc-for>
</nav>
<div style="flex:1"></div>
<a href="/" style="padding:0 14px;font-size:13px;color:#8C84AE;text-decoration:none">← Torna al sito</a>
<div style="border-top:1px solid #2E2A40;padding:14px 10px 0;display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFFFFF,#C9C0F0 45%,#8E7FE0);color:#1A1726;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:none">{{ initials }}</div><div style="display:flex;flex-direction:column;min-width:0"><span style="font-size:13px;font-weight:500;color:#FFFFFF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ adminName }}</span><span style="font-size:12px;color:#B7B0D4">Moderazione</span></div><button type="button" onClick="{{ logout }}" style="margin-left:auto;height:32px;padding:0 12px;border:1px solid #3A3550;border-radius:999px;background:transparent;color:#C9C0F0;font:13px 'Geist',sans-serif;cursor:pointer;flex:none">Esci</button></div>
</div></div>
<nav aria-label="Sezioni admin" class="r-show-sm" style="padding:12px var(--gutter) 0;font-family:'Geist',sans-serif"><div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px"><sc-for list="{{ items }}" as="it"><a href="{{ it.href }}" aria-current="{{ it.current }}" style="flex:none;height:36px;padding:0 14px;border-radius:999px;display:flex;align-items:center;gap:6px;font-size:13px;background:{{ it.mbg }};color:{{ it.mfg }};text-decoration:none">{{ it.label }}<sc-if value="{{ it.hasCount }}"><span style="font-family:'Geist Mono',monospace;font-size:11px;opacity:.7">{{ it.count }}</span></sc-if></a></sc-for><button type="button" onClick="{{ logout }}" style="flex:none;height:36px;padding:0 14px;border:1px solid #DCD7EC;border-radius:999px;background:transparent;font:13px 'Geist',sans-serif;color:#6B6680;cursor:pointer">Esci</button></div></nav>`, class extends DCLogic {
  renderVals() {
    const a = this.props.active ?? 'dashboard';
    const c = this.props.counts || {};
    const email = this.props.email || '';
    const items = [
      ['dashboard', 'Dashboard', '/admin', ''], ['utenti', 'Utenti', '/admin/utenti', c.users ? c.users.toLocaleString('it-IT') : ''],
      ['approvazioni', 'Approvazioni', '/admin/approvazioni', c.approvals ? String(c.approvals) : ''], ['segnalazioni', 'Segnalazioni', '/admin/segnalazioni', c.reports ? String(c.reports) : ''],
      ['analytics', 'Analytics', '/admin/analytics', ''], ['esportazioni', 'Esportazioni', '/admin/esportazioni', ''], ['registro', 'Registro accessi', '/admin/registro', ''],
    ].map(([k, label, href, count]) => ({
      label, href, count, hasCount: !!count, current: k === a ? 'page' : false,
      bg: k === a ? '#FFFFFF' : 'transparent', fg: k === a ? '#1A1726' : '#C9C0F0', fw: k === a ? 600 : 400, mark: k === a ? '#6C4DF5' : '#3A3550', cc: k === a ? '#6B6680' : '#8C84AE',
      mbg: k === a ? '#1A1726' : '#FFFFFF', mfg: k === a ? '#FFFFFF' : '#1A1726',
    }));
    const logout = async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'rientro' } }); location.href = '/'; };
    return { items, logout, adminName: email.split('@')[0], initials: email.slice(0, 2).toUpperCase() };
  }
});

// ---------------------------------------------------------------------------------------------
// App Onboarding Bar — from UI Onboarding Bar (+ variable total, "Salva ed esci" link)

def('App Onboarding Bar', String.raw`
<div class="r-pad" style="width:100%;box-sizing:border-box;padding:18px 24px 0;font-family:'Geist',sans-serif">
<div style="border-radius:999px;background:{{ bg }};border:{{ bd }};padding:12px 24px 12px 26px;display:flex;flex-direction:column;gap:10px">
<div style="display:flex;align-items:center;gap:18px">
<a href="/" aria-label="Rientro" style="text-decoration:none"><dc-import name="UI Logo" size="24" tone="{{ tone }}"></dc-import></a>
<div style="flex:1"></div>
<span class="r-hide-sm" style="font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:{{ muted }}">{{ section }}</span>
<span style="font-family:'Geist Mono',monospace;font-size:12px;color:{{ fg }}">{{ label }}</span>
<a href="{{ exitHref }}" style="font-size:13px;color:{{ muted }};text-decoration:underline;text-underline-offset:3px">Salva ed esci</a>
</div>
<div role="progressbar" aria-valuemin="1" aria-valuemax="{{ total }}" aria-valuenow="{{ step }}" aria-label="Avanzamento" style="display:grid;grid-template-columns:repeat({{ total }},1fr);gap:4px">
<sc-for list="{{ segs }}" as="s"><div style="height:5px;border-radius:3px;background:{{ s.c }}"></div></sc-for>
</div></div></div>`, class extends DCLogic {
  renderVals() {
    const step = Number(this.props.step ?? 1);
    const total = Number(this.props.total ?? 16);
    const dark = b(this.props.dark);
    const segs = Array.from({ length: total }, (_, i) => ({ c: i < step - 1 ? (dark ? '#C9C0F0' : '#1A1726') : i === step - 1 ? '#6C4DF5' : (dark ? '#3A3550' : '#DCD7EC') }));
    return {
      segs, step, total, label: `${step} di ${total}`, section: this.props.section ?? 'Profilo', exitHref: this.props.exitHref ?? '/stato',
      bg: dark ? '#2A2638' : 'rgba(255,255,255,.72)', bd: dark ? '1px solid #3A3550' : '1px solid #FFFFFF',
      fg: dark ? '#FFFFFF' : '#1A1726', muted: dark ? '#B7B0D4' : '#6B6680', tone: dark ? 'light' : 'dark',
    };
  }
});

// ---------------------------------------------------------------------------------------------
// App Step Footer — from UI Step Footer (+ handlers, disabled state)

def('App Step Footer', String.raw`
<div class="r-pad" style="width:100%;box-sizing:border-box;padding:16px 24px 20px;display:flex;align-items:center;gap:14px;font-family:'Geist',sans-serif">
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
<sc-if value="{{ search }}"><span style="width:12px;height:12px;border:1.8px solid #8C84AE;border-radius:50%;flex:none"></span></sc-if>
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
// App Comune Picker — design 7b/8a/27a: chips + search with ↑ ↓ and Invio. Also used for
// countries and foreign cities. Props: comuni (items: [name, sigla?, regione?, popolazione?]),
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
<sc-if value="{{ hasChips }}"><div style="display:flex;gap:6px;flex-wrap:wrap">
<sc-for list="{{ chips }}" as="c"><dc-import name="UI Chip" label="{{ c.l }}" tone="selected" size="sm" removable="{{ true }}" on-click="{{ c.remove }}" host-aria-label="{{ c.aria }}"></dc-import></sc-for>
</div></sc-if>
<div class="dc-field" style="width:100%;height:{{ h }};border-radius:999px;background:#FFFFFF;border:1px solid #E4E0F2;box-sizing:border-box;padding:0 18px;display:flex;align-items:center;gap:10px;font-size:{{ fs }}px;color:#1A1726">
<span style="width:12px;height:12px;border:1.8px solid #8C84AE;border-radius:50%;flex:none"></span>
<input class="bare-input" data-key="{{ field }}" role="combobox" aria-expanded="{{ open }}" aria-autocomplete="list" aria-label="{{ placeholder }}" value="{{ query }}" placeholder="{{ placeholder }}" disabled="{{ full }}" onInput="{{ input }}" onKeyDown="{{ keydown }}" onFocus="{{ focus }}" onBlur="{{ blur }}">
</div>
<sc-if value="{{ open }}"><div role="listbox" style="position:absolute;left:0;right:0;top:{{ dropTop }};z-index:15;border-radius:22px;background:#FFFFFF;padding:6px;display:flex;flex-direction:column;box-shadow:0 16px 36px rgba(80,60,160,.14);font-size:14px">
<sc-for list="{{ matches }}" as="m"><div role="option" aria-selected="{{ m.active }}" onMouseDown="{{ m.pick }}" style="padding:10px 12px;border-radius:16px;background:{{ m.bg }};display:flex;justify-content:space-between;gap:12px;cursor:pointer"><span>{{ m.pre }}<b style="font-weight:600">{{ m.head }}</b>{{ m.rest }}</span><span style="font-family:'Geist Mono',monospace;font-size:11px;color:#6B6680;white-space:nowrap">{{ m.meta }}</span></div></sc-for>
<sc-if value="{{ none }}"><div style="padding:10px 12px;color:#8C84AE">{{ noneText }}</div></sc-if>
</div></sc-if>
</div>`, class extends DCLogic {
  state = { query: '', open: false, idx: 0 };
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
        return { name: c[0], pre: c[0].slice(0, a), head: c[0].slice(a, z), rest: c[0].slice(z), meta: counts ? `${counts[c[0]] || 0} persone` : [c[1], c[2]?.toUpperCase()].filter(Boolean).join(' · ') };
      }),
      ...(offerTyped ? [{ name: typed, pre: 'Usa “', head: typed, rest: '”', meta: '' }] : []),
    ];
    const matches = options.map((o, i) => ({
      ...o, active: i === this.state.idx ? 'true' : 'false', bg: i === this.state.idx ? '#F1EFF8' : 'transparent',
      pick: e => { e.preventDefault(); this.add(o.name); },
    }));
    const full = max > 1 && sel.length >= max;
    const noun = this.props.noun ?? 'comune';
    return {
      chips: sel.map(l => ({ l, aria: `Rimuovi ${l}`, remove: () => this.props.onChange?.(sel.filter(x => x !== l)) })),
      hasChips: sel.length > 0, query: q, field: this.props.field ?? 'comuni', full,
      placeholder: full ? `Massimo ${max} ${noun === 'comune' ? 'comuni' : 'scelte'}` : max === 1 && sel.length ? `Cambia ${noun}` : (this.props.placeholder ?? `Cerca un ${noun}`),
      open: this.state.open && typed.length > 0, matches, none: this.state.open && typed && !matches.length,
      noneText: this.props.noneText ?? `Nessun ${noun} trovato`,
      h: this.props.size === 'lg' ? '52px' : '44px', fs: this.props.size === 'lg' ? 17 : 14, dropTop: sel.length ? 'calc(100% + 6px)' : '52px',
      input: e => this.setState({ query: e.target.value, open: true, idx: 0 }),
      focus: () => { if (this.state.query) this.setState({ open: true }); },
      blur: () => setTimeout(() => this.state.open && this.setState({ open: false }), 150),
      keydown: e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.setState({ idx: Math.min(this.state.idx + 1, options.length - 1) }); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.setState({ idx: Math.max(this.state.idx - 1, 0) }); }
        else if (e.key === 'Enter') { e.preventDefault(); if (options[this.state.idx]) this.add(options[this.state.idx].name); }
        else if (e.key === 'Escape') this.setState({ open: false });
        else if (e.key === 'Backspace' && !this.state.query && sel.length) this.props.onChange?.(sel.slice(0, -1));
      },
    };
  }
});

// ---------------------------------------------------------------------------------------------
// App Tag Input — free-text chips with suggestions (job-seeking step). values[], suggestions[], max

def('App Tag Input', String.raw`
<div style="display:flex;flex-direction:column;gap:10px;font-family:'Geist',sans-serif">
<div style="display:flex;justify-content:space-between;align-items:baseline"><dc-import name="UI Eyebrow" text="{{ label }}"></dc-import><span style="font-family:'Geist Mono',monospace;font-size:11px;color:#8C84AE">{{ countLabel }}</span></div>
<sc-if value="{{ hasChips }}"><div style="display:flex;gap:6px;flex-wrap:wrap"><sc-for list="{{ chips }}" as="c"><dc-import name="UI Chip" label="{{ c.l }}" tone="selected" size="sm" removable="{{ true }}" on-click="{{ c.remove }}" host-aria-label="{{ c.aria }}"></dc-import></sc-for></div></sc-if>
<dc-import name="App Field" placeholder="{{ placeholder }}" field="{{ field }}" value="{{ draft }}" dc-props="{{ fieldProps }}"></dc-import>
<sc-if value="{{ hasSuggestions }}"><div style="display:flex;gap:6px;flex-wrap:wrap"><sc-for list="{{ suggestions }}" as="s"><dc-import name="UI Chip" label="{{ s.l }}" tone="dashed" size="sm" on-click="{{ s.add }}"></dc-import></sc-for></div></sc-if>
</div>`, class extends DCLogic {
  state = { draft: '' };
  commit(raw) {
    const values = this.props.values || [];
    const v = String(raw || '').trim();
    const max = Number(this.props.max || 10);
    if (!v || values.length >= max || values.some(x => x.toLowerCase() === v.toLowerCase())) return;
    this.state.draft = '';
    this.props.onChange?.([...values, v]);
  }
  renderVals() {
    const values = this.props.values || [];
    const max = Number(this.props.max || 10);
    return {
      label: this.props.label, countLabel: `${values.length} / ${max}`, field: this.props.field, placeholder: this.props.placeholder, draft: this.state.draft,
      chips: values.map(l => ({ l, aria: `Rimuovi ${l}`, remove: () => this.props.onChange?.(values.filter(x => x !== l)) })), hasChips: values.length > 0,
      suggestions: (this.props.suggestions || []).filter(s => !values.includes(s)).slice(0, 8).map(s => ({ l: `+ ${s}`, add: () => this.commit(s) })),
      hasSuggestions: values.length < max,
      fieldProps: { onInput: v => { this.state.draft = v; }, onEnter: v => this.commit(v), onBlur: v => { if (v.trim()) this.commit(v); } },
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
<article style="height:100%;box-sizing:border-box;background:linear-gradient(180deg,#FFFFFF,#F6F4FC);border:1px solid #FFFFFF;border-radius:28px;padding:10px;box-shadow:0 14px 40px rgba(80,60,160,.12);display:flex;flex-direction:column;gap:14px;font-family:'Geist',sans-serif;color:#1A1726">
<a href="{{ href }}" tabindex="-1" aria-hidden="true"><dc-import name="App Photo" ratio="{{ ratio }}" label="FOTO PROFILO" src="{{ p.photo_url }}" alt="" badge="{{ badge }}" badge-kind="{{ badgeKind }}"></dc-import></a>
<div style="padding:0 10px 10px;display:flex;flex-direction:column;gap:12px;flex:1">
<div style="display:flex;flex-direction:column;gap:4px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h3 style="margin:0;font-family:'Unbounded',sans-serif;font-weight:600;font-size:18px;letter-spacing:-.03em"><a href="{{ href }}" style="color:inherit;text-decoration:none">{{ p.name }}</a></h3><span style="font-family:'Geist Mono',monospace;font-size:11px;color:#8C84AE">{{ p.age }}</span></div><span style="font-size:13px;color:#6B6680">{{ p.role }}</span></div>
<div style="display:flex;align-items:center;gap:8px;font-size:14px;flex-wrap:wrap"><span style="color:#6B6680">Vive a {{ p.from }}</span><sc-if value="{{ p.to }}"><span style="color:#6C4DF5" aria-label="vuole trasferirsi a">→</span><span style="font-weight:500">{{ p.to }}</span></sc-if></div>
<div style="display:grid;grid-template-columns:72px 1fr;gap:6px 10px;font-size:13px;padding-top:12px;border-top:1px solid #ECE8F7"><span style="color:#8C84AE">Cerca</span><span>{{ p.seeks }}</span><span style="color:#8C84AE">Interessi</span><span>{{ p.tags }}</span><span style="color:#8C84AE">Tempo</span><span>{{ p.time }}</span></div>
<sc-if value="{{ hasComp }}"><div style="display:flex;gap:8px;align-items:flex-start;padding:10px 14px;border-radius:16px;background:#EFEBFF;color:#3E2BA8;font-size:13px;line-height:1.4"><span style="width:6px;height:6px;border-radius:50%;background:#6C4DF5;margin-top:6px;flex:none"></span>{{ p.comp }}</div></sc-if>
<sc-if value="{{ job }}"><span style="font-size:12px;color:#6B6680">Sta anche cercando lavoro in Italia</span></sc-if>
<div style="flex:1"></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
<a href="{{ href }}" style="text-decoration:none"><dc-import name="UI Button" label="{{ secondaryLabel }}" variant="secondary" full="{{ true }}"></dc-import></a>
<dc-import name="UI Button" label="{{ action.l }}" variant="{{ action.v }}" full="{{ true }}" on-click="{{ action.fn }}" host-aria-disabled="{{ action.off }}"></dc-import>
</div>
</div></article>`, class extends DCLogic {
  renderVals() {
    const p = this.props.person || {};
    const c = p.connection?.status ?? 'none';
    const go = href => () => { location.href = href; };
    const action = {
      none: { l: 'Connettiti', v: 'primary', fn: () => this.props.onConnect?.(p), off: false },
      pending_sent: { l: 'In attesa', v: 'secondary', fn: null, off: true },
      pending_received: { l: 'Rispondi', v: 'accent', fn: go(`/connessioni/${p.connection?.id}`), off: false },
      connected: { l: 'Messaggio', v: 'primary', fn: go(`/messaggi/${p.id}`), off: false },
    }[c] ?? { l: 'Connettiti', v: 'primary', fn: null, off: true };
    return {
      p, ratio: this.props.ratio ?? '5/4', href: `/persone/${p.id}`,
      badge: p.idea ? "Ha già un'idea" : "Cerca un'idea insieme", badgeKind: p.idea ? 'idea' : 'explore',
      hasComp: !!p.comp, job: !!p.job, action,
      secondaryLabel: b(this.props.compact) ? 'Profilo' : 'Scopri il profilo',
    };
  }
});


// ---------------------------------------------------------------------------------------------
// App Job Details — "Che tipo di opportunità cerchi in Italia?" (spec §10). Used in onboarding
// and in Impostazioni → Privacy. Props: job (job_preferences), catalog, desired[], onChange(patch)

const ROLE_SUGGESTIONS = ['Product Manager', 'Software Engineer', 'Designer', 'Data Scientist', 'Sales Manager', 'Marketing Manager', 'Operations Manager', 'Consulente'];
const SKILL_SUGGESTIONS = ['Leadership', 'Gestione team', 'Strategia', 'Analisi dati', 'Sviluppo software', 'Vendite B2B', 'Ricerca utenti', 'Finanza'];

def('App Job Details', String.raw`
<div style="background:#FFFFFF;border-radius:26px;padding:22px;display:flex;flex-direction:column;gap:22px">
<dc-import name="App Tag Input" label="Ruoli che ti interessano" values="{{ jobRoles }}" suggestions="{{ roleSuggestions }}" max="8" field="job-roles" placeholder="Scrivi un ruolo e premi Invio" dc-props="{{ rolesProps }}"></dc-import>
<dc-import name="App Tag Input" label="Competenze principali" values="{{ jobSkills }}" suggestions="{{ skillSuggestions }}" max="20" field="job-skills" placeholder="Scrivi una competenza e premi Invio" dc-props="{{ skillsProps }}"></dc-import>
<div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;justify-content:space-between;align-items:baseline"><dc-import name="UI Eyebrow" text="Settori"></dc-import><span style="font-family:'Geist Mono',monospace;font-size:11px;color:#8C84AE">{{ jobSectorCount }}</span></div>
<div style="display:flex;flex-wrap:wrap;gap:6px"><sc-for list="{{ jobSectors }}" as="s"><dc-import name="UI Chip" label="{{ s.l }}" tone="{{ s.tone }}" size="sm" on-click="{{ s.fn }}" host-role="checkbox" host-aria-checked="{{ s.aria }}"></dc-import></sc-for></div></div>
<div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><dc-import name="UI Eyebrow" text="Dove"></dc-import><sc-if value="{{ canCopyPlaces }}"><button type="button" onClick="{{ copyPlaces }}" style="border:none;background:none;padding:0;font:13px 'Geist',sans-serif;color:#6C4DF5;text-decoration:underline;text-underline-offset:3px;cursor:pointer">Usa i comuni dove vorresti vivere</button></sc-if></div>
<dc-import name="App Comune Picker" comuni="{{ comuni }}" selected="{{ jobPlaces }}" max="10" field="job-places" dc-props="{{ jobPlacesProps }}"></dc-import></div>
<div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:13px;font-weight:500">Modalità di lavoro</span><dc-import name="App Segmented" label="Modalità di lavoro" options="{{ workOpts }}" value="{{ work }}" clearable="{{ true }}" dc-props="{{ workProps }}"></dc-import></div>
<div class="r-grid-1" style="display:grid;grid-template-columns:1fr 1.6fr;gap:16px">
<div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:13px;font-weight:500">Tipo di impiego</span><dc-import name="App Segmented" label="Tipo di impiego" options="{{ empOpts }}" value="{{ emp }}" clearable="{{ true }}" dc-props="{{ empProps }}"></dc-import></div>
<div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:13px;font-weight:500">Disponibilità</span><dc-import name="App Segmented" label="Disponibilità" options="{{ availOpts }}" value="{{ avail }}" clearable="{{ true }}" dc-props="{{ availProps }}"></dc-import></div>
</div></div>`, class extends DCLogic {
  renderVals() {
    const j = this.props.job;
    const cat = this.props.catalog;
    const desired = this.props.desired || [];
    const set = patch => this.props.onChange?.(patch);
    const opts = pairs => pairs.map(([v, l]) => ({ v, l }));
    const toggle = s => (j.sectors.includes(s) ? j.sectors.filter(x => x !== s) : j.sectors.length >= 5 ? j.sectors : [...j.sectors, s]);
    return {
      comuni: cat.comuni,
      jobRoles: j.roles, roleSuggestions: ROLE_SUGGESTIONS, rolesProps: { onChange: v => set({ roles: v }) },
      jobSkills: j.skills, skillSuggestions: SKILL_SUGGESTIONS, skillsProps: { onChange: v => set({ skills: v }) },
      jobSectorCount: `${j.sectors.length} / 5`,
      jobSectors: cat.sectors.map(l => { const on = j.sectors.includes(l); return { l: on ? `✓ ${l}` : l, tone: on ? 'tint' : j.sectors.length >= 5 ? 'off' : 'default', aria: on ? 'true' : 'false', fn: () => set({ sectors: toggle(l) }) }; }),
      jobPlaces: j.preferred_locations, jobPlacesProps: { onChange: v => set({ preferred_locations: v }) },
      canCopyPlaces: desired.length > 0 && !j.preferred_locations.length, copyPlaces: () => set({ preferred_locations: desired.slice(0, 10) }),
      workOpts: opts(cat.workArrangements), work: j.work_arrangement, workProps: { onSelect: v => set({ work_arrangement: v || null }) },
      empOpts: opts(cat.employmentTypes), emp: j.employment_type, empProps: { onSelect: v => set({ employment_type: v || null }) },
      availOpts: opts(cat.availability), avail: j.availability, availProps: { onSelect: v => set({ availability: v || null }) },
    };
  }
});

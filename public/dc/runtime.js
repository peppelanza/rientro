// Minimal, dependency-free renderer for Claude Design `.dc` templates.
//
// Mirrors the semantics of design/support.js (template syntax, expression resolution,
// dc-import host elements, props defaults) without React, CDNs or eval, so it runs under a
// strict Content-Security-Policy. Components and screens are generated from design/ by
// scripts/build-design.js; their templates and renderVals() logic are copied verbatim.

export class DCLogic {
  constructor(props = {}) {
    this.props = props;
    this.state = {};
  }
  setState(patch) {
    Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch);
    this.__rerender?.();
  }
  componentDidMount() {}
  componentWillUnmount() {}
}

// ---------------------------------------------------------------------------------------------
// Expressions (same grammar as support.js resolve())

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export function resolve(vals, src) {
  const expr = String(src).trim();
  if (!expr) return undefined;
  if (expr[0] === '(' && expr.at(-1) === ')' && wrapsWhole(expr)) return resolve(vals, expr.slice(1, -1));
  const eq = topLevelEquality(expr);
  if (eq) {
    const l = resolve(vals, expr.slice(0, eq.index));
    const r = resolve(vals, expr.slice(eq.index + eq.op.length));
    return eq.op === '===' ? l === r : eq.op === '!==' ? l !== r : eq.op === '==' ? l == r : l != r; // eslint-disable-line eqeqeq
  }
  if (expr[0] === '!') return !resolve(vals, expr.slice(1));
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (expr === 'null') return null;
  if (expr === 'undefined') return undefined;
  if (NUMBER_RE.test(expr)) return Number(expr);
  if (expr.length >= 2 && (expr[0] === '"' || expr[0] === "'") && expr.at(-1) === expr[0]) return expr.slice(1, -1);
  return resolvePath(vals, expr);
}

function wrapsWhole(expr) {
  let depth = 0;
  for (let i = 0; i < expr.length - 1; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')' && --depth === 0) return false;
  }
  return true;
}

function topLevelEquality(expr) {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (depth === 0 && (c === '=' || c === '!') && expr[i + 1] === '=') {
      if (i > 0 && (expr[i - 1] === '=' || expr[i - 1] === '!')) continue;
      if (!expr.slice(0, i).trim()) continue;
      return { index: i, op: expr[i + 2] === '=' ? `${c}==` : `${c}=` };
    }
  }
  return null;
}

function resolvePath(vals, expr) {
  const head = expr.match(IDENT_RE);
  if (!head) return undefined;
  let cur = vals?.[head[0]];
  let i = head[0].length;
  while (i < expr.length) {
    if (expr[i] === '.') {
      const m = expr.slice(i + 1).match(IDENT_RE) || expr.slice(i + 1).match(/^\d+/);
      if (!m) return undefined;
      cur = cur?.[m[0]];
      i += 1 + m[0].length;
    } else if (expr[i] === '[') {
      let depth = 1;
      let j = i + 1;
      for (; j < expr.length; j++) {
        if (expr[j] === '[') depth++;
        else if (expr[j] === ']' && --depth === 0) break;
      }
      if (depth) return undefined;
      cur = cur?.[resolve(vals, expr.slice(i + 1, j))];
      i = j + 1;
    } else return undefined;
  }
  return cur;
}

function compileAttr(raw) {
  const whole = raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
  if (whole) return vals => resolve(vals, whole[1]);
  if (raw.includes('{{')) {
    const parts = raw.split(/\{\{([\s\S]+?)\}\}/g);
    return vals => parts.map((s, i) => (i & 1 ? resolve(vals, s) ?? '' : s)).join('');
  }
  return () => raw;
}

const kebabToCamel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// ---------------------------------------------------------------------------------------------
// Registry of components (generated modules register themselves via registerAll)

const registry = new Map();

export function register(mod) {
  registry.set(mod.name, { ...mod, compiled: null });
}

function entry(name) {
  const e = registry.get(name);
  if (!e) throw new Error(`dc: unknown component "${name}"`);
  if (!e.compiled) e.compiled = compile(e.template);
  return e;
}

// ---------------------------------------------------------------------------------------------
// Compilation: template string → tree of builder functions

const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
const RAW_TAGS = ['table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'select'];

function compile(template) {
  // Self-closing dc-import tags aren't valid HTML; expand them. Keep table parts inside
  // sc-for loops intact by aliasing them during parsing (as support.js does).
  let html = template.replace(/<(dc-import)((?:[^>"']|"[^"]*"|'[^']*')*)\/>/gi, '<$1$2></$1>');
  html = html.replace(/<helmet[\s\S]*?<\/helmet>/gi, '');
  for (const t of RAW_TAGS) html = html.replace(new RegExp(`(</?)${t}(?=[\\s>])`, 'gi'), `$1sc-raw-${t}`);
  // Inline style attributes would trip a strict CSP while parsing; carry them in a data
  // attribute and apply them through the CSSOM (el.style.cssText), which CSP allows.
  html = html.replace(/(\s)style(=|-hover=)/g, (_, sp, rest) => `${sp}data-dc-style${rest === '=' ? '=' : '-hover='}`);
  const doc = parser.parseFromString(`<!doctype html><body>${html}`, 'text/html');
  return walkChildren(doc.body);
}

function walkChildren(node) {
  return [...node.childNodes].map(walk).filter(Boolean);
}

function walk(node) {
  if (node.nodeType === 3) return walkText(node);
  if (node.nodeType !== 1) return null;
  const tag = node.localName;
  if (tag === 'sc-for') return walkFor(node);
  if (tag === 'sc-if') return walkIf(node);
  if (tag === 'dc-import') return walkComponent(node);
  if (tag === 'script' || tag === 'style') return null;
  return walkElement(node);
}

function walkText(node) {
  const txt = node.nodeValue ?? '';
  if (!txt.includes('{{')) {
    if (!txt.trim() && !txt.includes(' ')) return null;
    return () => document.createTextNode(txt);
  }
  const parts = txt.split(/\{\{([\s\S]+?)\}\}/g);
  return vals => {
    const frag = document.createDocumentFragment();
    parts.forEach((p, i) => {
      if (!(i & 1)) { if (p) frag.append(p); return; }
      const v = resolve(vals, p);
      if (v == null || typeof v === 'boolean') return;
      if (v instanceof Node) { frag.append(v); return; }
      const span = document.createElement('span');
      span.className = 'sc-interp';
      span.textContent = String(v);
      frag.append(span);
    });
    return frag;
  };
}

function walkFor(el) {
  const listGet = compileAttr(el.getAttribute('list') || '');
  const as = el.getAttribute('as') || 'item';
  const kids = walkChildren(el);
  return (vals, ctx) => {
    const list = listGet(vals);
    const frag = document.createDocumentFragment();
    if (!Array.isArray(list)) return frag;
    list.forEach((item, i) => {
      const sub = { ...vals, [as]: item, $index: i };
      for (const b of kids) frag.append(b(sub, ctx));
    });
    return frag;
  };
}

function walkIf(el) {
  const get = compileAttr(el.getAttribute('value') || '');
  const kids = walkChildren(el);
  return (vals, ctx) => {
    const frag = document.createDocumentFragment();
    if (get(vals)) for (const b of kids) frag.append(b(vals, ctx));
    return frag;
  };
}

const HOST_STYLE_PROPS = new Set(['position', 'left', 'right', 'top', 'bottom', 'inset', 'width', 'height', 'z-index', 'transform']);

function hostStyle(css) {
  return String(css || '').split(';').map(d => d.trim()).filter(d => {
    const i = d.indexOf(':');
    return i > 0 && HOST_STYLE_PROPS.has(d.slice(0, i).trim());
  }).join(';');
}

function walkComponent(el) {
  const name = el.getAttribute('name') || el.getAttribute('component') || '';
  const styleGet = el.hasAttribute('data-dc-style') ? compileAttr(el.getAttribute('data-dc-style')) : null;
  const getters = [];
  const events = [];
  const hostAttrs = [];
  for (const { name: attr, value } of [...el.attributes]) {
    if (attr === 'name' || attr === 'component' || attr === 'data-dc-style' || attr.startsWith('hint-')) continue;
    // App extensions: on-* binds an event on the host element; host-* sets a host attribute
    // (e.g. host-role="checkbox" host-aria-checked="{{ on }}").
    if (attr.startsWith('on-')) { events.push([attr.slice(3), compileAttr(value)]); continue; }
    if (attr.startsWith('host-')) { hostAttrs.push([attr.slice(5), compileAttr(value)]); continue; }
    getters.push([attr.includes('-') && !attr.startsWith('aria-') && !attr.startsWith('data-') ? kebabToCamel(attr) : attr, compileAttr(value)]);
  }
  return (vals, ctx) => {
    const props = {};
    for (const [k, g] of getters) {
      const v = g(vals);
      if (k === 'dcProps' && v && typeof v === 'object') Object.assign(props, v);
      else props[k] = v;
    }
    const host = renderComponent(name, props, ctx);
    if (styleGet) host.style.cssText = hostStyle(styleGet(vals));
    for (const [a, g] of hostAttrs) {
      const v = g(vals);
      if (v === false || v == null) continue;
      host.setAttribute(a, v === true ? 'true' : String(v));
    }
    for (const [ev, g] of events) {
      const fn = g(vals);
      if (typeof fn !== 'function') continue;
      host.addEventListener(ev, e => { if (host.getAttribute('aria-disabled') !== 'true') fn(e); });
      if (ev === 'click') makeActivatable(host);
    }
    return host;
  };
}

// Divs with click handlers get button semantics (keyboard + screen readers).
function makeActivatable(el) {
  if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
  if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
  el.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); el.click(); }
  });
}

const FOCUS_EVENTS = new Set(['focus', 'blur', 'focusin', 'focusout']);
let swapping = 0;

const BOOLEAN_ATTRS = new Set(['disabled', 'checked', 'selected', 'readonly', 'required', 'hidden', 'multiple', 'autofocus', 'open']);
const PROPERTY_ATTRS = new Set(['value', 'checked']);

function walkElement(el) {
  let tag = el.localName;
  if (tag.startsWith('sc-raw-')) tag = tag.slice(7);
  const attrs = [];
  const events = [];
  let hover = null;
  for (const { name, value } of [...el.attributes]) {
    if (name.startsWith('hint-')) continue;
    if (name === 'data-dc-style-hover') { hover = compileAttr(value); continue; }
    if (name === 'data-dc-style') { attrs.push(['style', compileAttr(value)]); continue; }
    if (name.startsWith('on') && name.length > 2) { events.push([name.slice(2), compileAttr(value)]); continue; }
    attrs.push([name, compileAttr(value)]);
  }
  const kids = walkChildren(el);
  const svg = el.namespaceURI === 'http://www.w3.org/2000/svg';
  return (vals, ctx) => {
    const out = svg ? document.createElementNS(el.namespaceURI, tag) : document.createElement(tag);
    for (const [name, g] of attrs) {
      const v = g(vals);
      if (name === 'style') { out.style.cssText = v ?? ''; continue; }
      if (v === false || v == null) continue;
      if (BOOLEAN_ATTRS.has(name)) { if (v) out.setAttribute(name, ''); if (PROPERTY_ATTRS.has(name)) out[name] = !!v; continue; }
      if (PROPERTY_ATTRS.has(name)) out[name] = v;
      if (name === 'ref' && typeof v === 'function') { v(out); continue; }
      out.setAttribute(name, v === true ? '' : String(v));
    }
    for (const [ev, g] of events) {
      const fn = g(vals);
      if (typeof fn !== 'function') continue;
      const type = ev === 'doubleclick' ? 'dblclick' : ev;
      // Focus moves caused by the renderer itself (removing a focused input, restoring focus
      // afterwards) aren't user actions; handling them would trigger render loops.
      out.addEventListener(type, FOCUS_EVENTS.has(type) ? e => { if (!swapping) fn(e); } : fn);
    }
    if (hover) out.classList.add(hoverClass(hover(vals)));
    for (const b of kids) out.append(b(vals, ctx));
    return out;
  };
}

// style-hover="…" becomes a generated class in a constructable stylesheet (CSP-safe).
const hoverSheet = typeof CSSStyleSheet !== 'undefined' ? new CSSStyleSheet() : null;
const hoverClasses = new Map();
function hoverClass(css) {
  if (hoverClasses.has(css)) return hoverClasses.get(css);
  const cls = `dc-h${hoverClasses.size}`;
  hoverClasses.set(css, cls);
  if (hoverSheet) {
    const decls = css.split(';').filter(Boolean).map(d => `${d.trim()} !important`).join(';');
    hoverSheet.insertRule(`.${cls}:hover{${decls}}`, hoverSheet.cssRules.length);
    if (!document.adoptedStyleSheets.includes(hoverSheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, hoverSheet];
  }
  return cls;
}

// ---------------------------------------------------------------------------------------------
// Rendering components

function withDefaults(e, props) {
  const out = {};
  for (const [k, meta] of Object.entries(e.propsMeta || {})) {
    if (k.startsWith('$')) continue;
    if (meta && meta.default !== undefined) out[k] = meta.default;
  }
  for (const [k, v] of Object.entries(props)) if (v !== undefined) out[k] = v;
  return out;
}

export function renderComponent(name, props = {}, ctx) {
  const e = entry(name);
  const host = document.createElement('div');
  host.className = 'sc-host';
  host.dataset.scName = name;
  const logic = new e.Component(withDefaults(e, props));
  const draw = () => {
    let vals;
    try { vals = logic.renderVals ? logic.renderVals() : {}; } catch (err) { console.error(`[dc] ${name}`, err); vals = {}; }
    swap(host, e.compiled.map(b => b(vals, ctx)));
  };
  logic.__rerender = serial(draw);
  draw();
  return host;
}

// A render requested while one is running (e.g. from an event fired mid-swap) runs right after.
function serial(draw) {
  let running = false;
  let again = false;
  return function rerender() {
    if (holding) { held.add(rerender); return; }
    if (running) { again = true; return; }
    running = true;
    try { draw(); } finally { running = false; }
    if (again) { again = false; rerender(); }
  };
}

function swap(root, nodes) {
  swapping++;
  try {
    const restore = keepFocus(root);
    root.replaceChildren(...nodes);
    restore();
  } finally { swapping--; }
}

// Keep focus and caret in real inputs across re-renders (inputs are keyed by data-key).
function keepFocus(root) {
  const active = document.activeElement;
  const key = root.contains(active) ? active?.dataset?.key : null;
  // Keyed containers (a dropdown list) keep their scroll position too
  const scrolls = [...root.querySelectorAll('[data-key]')].filter(el => el.scrollTop).map(el => [el.dataset.key, el.scrollTop]);
  let sel = null;
  if (key) try { sel = active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null; } catch {}
  return () => {
    for (const [k, top] of scrolls) { const el = root.querySelector(`[data-key="${CSS.escape(k)}"]`); if (el) el.scrollTop = top; }
    if (!key) return;
    const next = root.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (!next || next === document.activeElement) return;
    next.focus();
    if (sel) try { next.setSelectionRange(...sel); } catch {}
  };
}

// While a click or tap on a text field is in progress, re-renders wait for it to finish. A field
// whose focus handler re-renders (a picker opening its list) would otherwise be replaced in the
// middle of the click, and the browser would drop the caret at the start of the new field
// instead of where the person clicked. Once the click is done, the render runs and keepFocus
// carries the caret over. Touch taps focus the field after the finger lifts, so the hold lasts
// until the click event, with a timeout for taps that turn into scrolls.
let holding = false, holdTimer = 0;
const held = new Set();
function releaseHold() {
  if (!holding) return;
  holding = false; clearTimeout(holdTimer);
  const fns = [...held]; held.clear();
  for (const fn of fns) fn();
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    if (!e.target?.matches?.('input[data-key], textarea[data-key]')) return;
    holding = true; clearTimeout(holdTimer);
    holdTimer = setTimeout(releaseHold, 1000);
  }, true);
  const later = () => { if (holding) setTimeout(releaseHold, 0); };
  document.addEventListener('click', later, true);
  document.addEventListener('pointercancel', later, true);
}

// ---------------------------------------------------------------------------------------------
// Pages: a template + a logic instance whose state drives re-rendering.

export function mountPage(el, { template, Logic, props = {} }) {
  const compiled = compile(template);
  const logic = new Logic(props);
  const draw = () => {
    let vals;
    try { vals = logic.renderVals(); } catch (err) { console.error('[page]', err); return; }
    swap(el, compiled.map(b => b(vals, logic)));
    logic.didRender?.(el);
  };
  logic.__rerender = serial(draw);
  logic.__rerender();
  logic.componentDidMount?.();
  return logic;
}

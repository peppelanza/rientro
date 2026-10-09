// Press (/press, linked from the public footers): the materials for journalists, laid out like a
// desktop with folders. Brand (the logo and the icon of the favicon, in SVG, PNG and JPG), Ufficio
// stampa (the press release) and, on its own, the press kit. The files are in public/press/.
// As on a computer: a click selects, a double click (a tap on phones, Enter on the keyboard) opens
// a folder or downloads a file; Esc closes the folder.
import { Page } from './_base.js';

export const title = 'Press';

const FILES = {
  root: [
    { kind: 'folder', id: 'brand', name: 'Brand' },
    { kind: 'folder', id: 'stampa', name: 'Ufficio stampa' },
    { kind: 'pdf', name: 'Rientro · Press kit.pdf', href: '/press/rientro-press-kit.pdf', size: 48390 },
  ],
  brand: [
    { kind: 'image', name: 'Logo.svg', href: '/press/brand/rientro-logo.svg', size: 5394 },
    { kind: 'image', name: 'Logo.png', href: '/press/brand/rientro-logo.png', size: 109688, dims: '2632 × 776' },
    { kind: 'image', name: 'Logo.jpg', href: '/press/brand/rientro-logo.jpg', size: 149190, dims: '2632 × 776' },
    { kind: 'image', name: 'Logo bianco.svg', href: '/press/brand/rientro-logo-bianco.svg', size: 5394, dark: true },
    { kind: 'image', name: 'Logo bianco.png', href: '/press/brand/rientro-logo-bianco.png', size: 83298, dims: '2632 × 776', dark: true },
    { kind: 'image', name: 'Logo bianco.jpg', href: '/press/brand/rientro-logo-bianco.jpg', size: 161294, dims: '2632 × 776', dark: true },
    { kind: 'image', name: 'Icona.svg', href: '/press/brand/rientro-icona.svg', size: 1054, square: true },
    { kind: 'image', name: 'Icona.png', href: '/press/brand/rientro-icona.png', size: 34989, dims: '1024 × 1024', square: true },
    { kind: 'image', name: 'Icona.jpg', href: '/press/brand/rientro-icona.jpg', size: 48751, dims: '1024 × 1024', square: true },
  ],
  stampa: [
    { kind: 'pdf', name: 'Comunicato stampa.pdf', href: '/press/ufficio-stampa/rientro-comunicato-stampa.pdf', size: 49047 },
  ],
};
const FOLDER_NAMES = { brand: 'Brand', stampa: 'Ufficio stampa' };
const TYPE = { folder: 'Cartella', pdf: 'Documento PDF', image: 'Immagine' };

const kb = n => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const touch = () => matchMedia('(hover: none)').matches;
const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export default class extends Page {
  constructor(props) {
    super(props);
    Object.assign(this.state, { open: null, sel: null });
  }

  componentDidMount() {
    super.componentDidMount();
    this.onKey = e => { if (e.key === 'Escape' && this.state.open) this.close(); };
    addEventListener('keydown', this.onKey);
  }
  componentWillUnmount() { removeEventListener('keydown', this.onKey); }

  // The window plays its opening animation only on the drawing right after it opens (every redraw
  // makes new nodes, which would play it again)
  didRender(el) {
    this.opening = false;
    // a redraw makes a new file list: it stays scrolled where it was (selecting a file redraws)
    const files = el.querySelector('.press-files');
    if (files && this.filesTop) files.scrollTop = this.filesTop;
    if (this.focusKey) { el.querySelector(`[data-key="${this.focusKey}"]`)?.focus({ preventScroll: true }); this.focusKey = null; }
  }

  select(key) { this.filesTop = document.querySelector('.press-files')?.scrollTop ?? 0; this.state.sel = key; this.__rerender(); }
  openFolder(id) { Object.assign(this.state, { open: id, sel: null }); this.filesTop = 0; this.opening = true; this.focusKey = 'press-close'; this.__rerender(); }
  close() { const back = this.state.open; Object.assign(this.state, { open: null, sel: `f-${back}` }); this.focusKey = `f-${back}`; this.__rerender(); }
  download(f) {
    const a = document.createElement('a');
    a.href = f.href;
    a.download = f.href.split('/').pop();
    document.body.append(a); a.click(); a.remove();
  }
  activate(f) { if (f.kind === 'folder') this.openFolder(f.id); else this.download(f); }

  item(f) {
    const key = f.kind === 'folder' ? `f-${f.id}` : `x-${slug(f.name)}`;
    return {
      key, name: f.name, href: f.href ?? '',
      isFolder: f.kind === 'folder', isPdf: f.kind === 'pdf', isImage: f.kind === 'image',
      thumbCls: `press-thumb${f.dark ? ' dark' : ''}${f.square ? ' square' : ''}`,
      sel: this.state.sel === key ? 'true' : 'false',
      click: e => { e.preventDefault(); if (touch()) this.activate(f); else this.select(key); },
      dbl: e => { e.preventDefault(); this.activate(f); },
      key_: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.activate(f); } },
    };
  }

  renderVals() {
    const s = this.state;
    const list = s.open ? FILES[s.open] : [];
    const picked = list.find(f => `x-${slug(f.name)}` === s.sel);
    return {
      desk: FILES.root.map(f => this.item(f)),
      open: !!s.open, title: FOLDER_NAMES[s.open] ?? '', winCls: `press-win${this.opening ? ' opening' : ''}`,
      files: list.map(f => this.item(f)),
      close: () => this.close(),
      // the status line, as in a file window: what's in it, or the selected file and a way to get it
      status: picked ? `${picked.name} · ${TYPE[picked.kind]} · ${[picked.dims, kb(picked.size)].filter(Boolean).join(' · ')}` : `${list.length} ${list.length === 1 ? 'elemento' : 'elementi'}`,
      hasPicked: !!picked, getPicked: () => picked && this.download(picked),
      deselect: e => { if (e.target === e.currentTarget && s.sel) this.select(null); },
    };
  }
}

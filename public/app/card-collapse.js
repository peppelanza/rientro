// Scopri: while you scroll, each person card sticks to the top and its details (from "Vive a" to
// the hint, .pc-mid in App Person Card) fold away; what's left (photo, name, buttons) then scrolls
// off with the page. Each card sits in its grid cell (fixed to the card's full height), sticks to
// the cell's top edge and shrinks by as much as the cell has gone past it, so the card's bottom
// always meets the cell's bottom: no gaps, nothing overlapping.
const TOP = { phone: 12, computer: 16 }; // px from the top of the screen while stuck

let cells = [];

export function collapseCards(root) {
  cells = [...root.querySelectorAll('[data-collapse-cards] > .sc-host')];
  for (const cell of cells) {
    cell.style.height = '';
    const card = cell.querySelector('article');
    if (card) Object.assign(card.style, { height: '100%', position: 'sticky' });
  }
  // Measure everything first (one layout), then fix each cell to its full height and remember how
  // short its card gets once the details are gone
  const sizes = cells.map(c => [c.offsetHeight, c.querySelector('article')?.offsetHeight - (c.querySelector('.pc-mid')?.offsetHeight ?? 0)]);
  cells.forEach((c, i) => { c.style.height = `${sizes[i][0]}px`; c.dataset.folded = sizes[i][1]; });
  update();
}

function update() {
  const top = innerWidth <= 720 ? TOP.phone : TOP.computer;
  for (const cell of cells) {
    const card = cell.querySelector('article');
    if (!card?.querySelector('.pc-mid')) continue;
    const r = cell.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue; // off screen: leave it
    const past = Math.min(Math.max(top - r.top, 0), r.height - Number(cell.dataset.folded));
    card.style.top = `${top}px`;
    card.style.height = past > 0 ? `${r.height - past}px` : '100%';
  }
}

let ticking = false;
addEventListener('scroll', () => {
  if (ticking || !cells.length) return;
  ticking = true;
  requestAnimationFrame(() => { ticking = false; update(); });
}, { passive: true });
addEventListener('resize', () => { if (cells[0]?.isConnected) collapseCards(document); });

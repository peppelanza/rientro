// Scopri: while you scroll, the top of each person card (photo, name, job) stays pinned and the
// details (from "Vive a" to the hint) slide up underneath it until the buttons meet it; then the
// whole card scrolls off. All by position: sticky (app.css), so the browser moves everything in
// the same frame, without shaking. This only marks the pinned tops (.pc-stuck) and their cards,
// which then paint the card's top over a cover (app.css), so the sliding details never show.
let heads = [];

export function collapseCards(root) {
  heads = [...root.querySelectorAll('[data-collapse-cards] .pc-head')];
  update();
}

function update() {
  for (const head of heads) {
    const r = head.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue;
    // Out of its own place (it naturally sits 10px above .pc-top, over the card's padding): the
    // details are underneath it, from the moment it pins until the card has scrolled away
    const stuck = r.top - head.parentElement.getBoundingClientRect().top > -9;
    head.classList.toggle('pc-stuck', stuck);
    head.closest('article').classList.toggle('pc-card-stuck', stuck);
  }
}

addEventListener('scroll', () => { if (heads.length) update(); }, { passive: true });

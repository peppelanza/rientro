// Search shared by Scopri (profiles), Messaggi (what was written) and the groups (posts, comments).
// No index server: the texts are few enough to scan, so the work goes into making each scan cheap
// and the matching forgiving.
//   - Accents and capitals don't matter ("citta" finds "Città"), punctuation splits words.
//   - Each word typed counts on its own, as the start of a word ("svilup" finds "sviluppatore", "ma"
//     doesn't find "Roma"): a result has at least one of them, and the more it has, the higher it
//     comes ("backend torino": both first, then either).
//   - Nothing at all? A second pass forgives a missing, extra or swapped letter in words of 4+
//     letters ("Milno", "sviluppatroe"), and a wrong one only from 6 letters up (else "marco" would
//     find "mario"). Those results say they're only similar (results.fuzzy).
//   - Texts that never change (messages, posts, comments) are split into words once and kept.

export const norm = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const split = s => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// The words of a query: distinct, at most 8
export const terms = q => [...new Set(split(q))].slice(0, 8);

// The distinct words of a text
export const wordsOf = text => [...new Set(split(text))];

// Words of texts that never change, by key ("m42", "p7", "c9"); bounded, oldest out first
const memo = new Map();
const MEMO_MAX = 50_000;
export function fixedWords(key, text) {
  let w = memo.get(key);
  if (!w) {
    w = wordsOf(text);
    memo.set(key, w);
    if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
  }
  return w;
}

// a and b differ by at most one letter added, removed, two swapped or (with changed) one changed
function near(a, b, changed) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (changed && a.slice(i + 1) === b.slice(i + 1)) return true; // one changed
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // two swapped
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1); // one more or less
}

// Is the term the start of one of these words (or, forgiving, nearly)?
export function hit(term, words, fuzzy = false) {
  for (const w of words) {
    if (w.startsWith(term)) return true;
    if (fuzzy && term.length >= 4) {
      // compared with the word's start of about the same length, so "svilupat" ≈ "sviluppatore"
      for (const n of [term.length, term.length - 1, term.length + 1]) if (near(term, w.slice(0, n), term.length >= 6)) return true;
    }
  }
  return false;
}

// How many of the terms are in these words (0: none)
export const hits = (ts, words, fuzzy) => ts.filter(t => hit(t, words, fuzzy)).length;

// Runs a search exactly, and once more forgiving when it found nothing: run(fuzzy) → results[];
// forgiven results carry .fuzzy = true (shown as "similar", not as matches)
export function forgiving(run) {
  const exact = run(false);
  if (exact.length) return exact;
  return Object.assign(run(true), { fuzzy: true });
}

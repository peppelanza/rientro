// Prints the markup of one artboard (e.g. "1a", "26a") from a design file, as a starting
// point for an app page template. The artboard is the frame element that follows the
// "1a · Desktop …" label row inside <div id="1a">.
//
//   node scripts/extract-artboard.js "Rientro 01 Landing e Accesso v2" 1a
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [file, id] = process.argv.slice(2);
const src = fs.readFileSync(path.join(root, 'design', `${file}.dc.html`), 'utf8');

// Returns [start, end) of the element that opens at `start`, balancing same-name tags.
function elementAt(html, start) {
  const tag = html.slice(start + 1).match(/^[a-z0-9-]+/i)[0];
  const re = new RegExp(`<(/?)${tag}(?=[\\s>/])`, 'gi');
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(html));) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return [start, html.indexOf('>', m.index) + 1];
  }
  throw new Error('unbalanced');
}

const open = src.indexOf(`<div id="${id}"`);
if (open < 0) throw new Error(`artboard ${id} not found`);
const [, end] = elementAt(src, open);
const inner = src.slice(src.indexOf('>', open) + 1, end - '</div>'.length);
const label = elementAt(inner, inner.indexOf('<div'));
const frameStart = inner.indexOf('<', label[1]);
const frame = elementAt(inner, frameStart);
process.stdout.write(inner.slice(frame[0], frame[1]) + '\n');

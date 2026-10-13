import test from 'node:test';
import assert from 'node:assert/strict';
import { cropBox } from '../public/app/face.js';

// Where the face's centre lands in the square, as a fraction of its side (0.5 = the middle)
const at = (W, H, face) => {
  const { x, y, side } = cropBox(W, H, face);
  assert.ok(x >= 0 && y >= 0 && x + side <= W && y + side <= H, 'inside the photo');
  assert.ok(face.originX >= x && face.originY >= y && face.originX + face.width <= x + side && face.originY + face.height <= y + side, 'face whole');
  return { fx: (face.originX + face.width / 2 - x) / side, fy: (face.originY + face.height / 2 - y) / side, side };
};

test('webcam shot (16:9): the face is centred vertically too, not only horizontally', () => {
  // Laptop camera 1920×1080, face 380 px, sitting low and to the left
  const r = at(1920, 1080, { originX: 500, originY: 460, width: 380, height: 380 });
  assert.ok(Math.abs(r.fx - 0.5) < 0.06, `horizontal ${r.fx}`);
  assert.ok(Math.abs(r.fy - 0.45) < 0.06, `vertical ${r.fy}`);
  assert.ok(r.side >= 760, 'at least twice the face');
});

test('phone portrait with room: 2.6 times the face, centred both ways', () => {
  const r = at(3024, 4032, { originX: 1000, originY: 1200, width: 900, height: 900 });
  assert.equal(r.side, 2340);
  assert.ok(Math.abs(r.fx - 0.5) < 0.01 && Math.abs(r.fy - 0.46) < 0.02, `${r.fx} ${r.fy}`);
});

test('face at the very edge: still whole, as centred as the photo allows', () => {
  const r = at(1280, 720, { originX: 0, originY: 0, width: 300, height: 300 });
  assert.ok(r.side >= 400);
});

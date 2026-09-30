// Profile photos must show a face: checked in the browser with the MediaPipe Face Detector
// (self-hosted in /vendor) before the upload. The admin review stays the real gate, so if the
// detector can't load (old browser, network) the photo goes through.
const BASE = '/vendor/mediapipe-1.0.1';
let detector;

function load() {
  detector ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import(`${BASE}/vision_bundle.mjs`);
    const fileset = { wasmLoaderPath: `${BASE}/wasm/vision_wasm_internal.js`, wasmBinaryPath: `${BASE}/wasm/vision_wasm_internal.wasm` };
    return FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}/blaze_face_short_range.tflite` },
      runningMode: 'IMAGE', minDetectionConfidence: 0.75, // animals and drawings score lower (tested: cat 0.59, person 0.92)
    });
  })();
  detector.catch(() => { detector = undefined; }); // try again next time
  return detector;
}

// Start loading early (e.g. when the photo step opens), so the check is quick
export const warmUpFaceCheck = () => { load().catch(() => {}); };

// Checks the photo and frames it on the face: { file } ready to upload (a square JPEG centred on the
// face, which also drops the camera's metadata such as GPS) or { problem } with the message for the
// member. If the detector can't run the original goes through as it is, unless strict (the sign-in
// provider's photo, never used unchecked).
export async function preparePhoto(file, { strict = false } = {}) {
  let d, bitmap;
  try {
    d = await load();
    bitmap = await createImageBitmap(file);
  } catch (err) {
    console.warn('[face] check skipped:', err);
    return strict ? { problem: 'unchecked' } : { file };
  }
  try {
    const W = bitmap.width, H = bitmap.height;
    if (Math.min(W, H) < MIN_SIDE) return { problem: `La foto ha una risoluzione troppo bassa: usa una foto di almeno ${MIN_SIDE} × ${MIN_SIDE} pixel.` };
    const faces = d.detect(bitmap).detections.map(f => f.boundingBox).sort((a, b) => b.width * b.height - a.width * a.height);
    const size = f => f.width * f.height;
    // No face found, or one too small (the short-range model misses faces far from the camera):
    // same advice either way
    if (!faces.length || size(faces[0]) / (W * H) < 0.015) return { problem: 'Non riusciamo a vedere bene il tuo viso. Usa una foto in cui il volto sia in primo piano, come un mezzo busto.' };
    // Someone else next to you, about as big: not a profile photo
    if (faces.filter(f => size(f) >= size(faces[0]) * 0.35).length > 1) return { problem: 'Nella foto dovresti esserci solo tu.' };
    return { file: await frame(bitmap, faces[0], file.name) };
  } finally { bitmap.close(); }
}

// Resolution: photos show up to about 400 px wide, so 800 px keeps them sharp on retina screens.
// The crop is never enlarged: if framing tighter would leave fewer than CROP_SIDE pixels, it zooms
// out instead (down to the whole photo), and below MIN_SIDE the photo is refused.
const MIN_SIDE = 400;
const CROP_SIDE = 800;

// Square sized on the face, not just placed on it: about 2.6 times the face (head, hair and
// shoulders), the face a little above the middle so it stays in view in the round avatars and the
// 5:4 cards alike, and always whole inside the square with some room around it.
async function frame(bitmap, face, name) {
  const W = bitmap.width, H = bitmap.height;
  const side = Math.round(Math.min(W, H, Math.max(face.width * 2.6, face.height * 2.6, CROP_SIDE)));
  const cx = face.originX + face.width / 2, cy = face.originY + face.height / 2 + face.height * 0.1;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  // Centred where possible, never outside the photo, and the face whole with a margin of a third of
  // its size on every side (hair, ears, chin), as far as the photo allows
  const m = Math.max(face.width, face.height) / 3;
  const place = (c, start, len, total) => clamp(clamp(c - side / 2, start + len + m - side, start - m), 0, total - side);
  const x = Math.round(place(cx, face.originX, face.width, W));
  const y = Math.round(place(cy, face.originY, face.height, H));
  const out = Math.min(side, 1200);
  const canvas = new OffscreenCanvas(out, out);
  const g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, x, y, side, side, 0, 0, out, out);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return new File([blob], (name || 'foto').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

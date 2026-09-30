import { nsfwCheck, warmUpNsfwCheck } from './nsfw.js';

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

const HEIC = '/vendor/heic-to-1.5.2/heic-to.js';
// By type or name when the system says so, else by the file's first bytes ("ftyp" + a HEIF brand)
async function isHeicFile(file) {
  if (/^image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name || '')) return true;
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = String.fromCharCode(...head.slice(4, 12));
  return text.startsWith('ftyp') && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(text.slice(4));
}

// Start loading early (e.g. when the photo step opens), so the check is quick
export const warmUpFaceCheck = () => { load().catch(() => {}); warmUpNsfwCheck(); };

// Checks the photo and frames it on the face. Never blocks: returns { file } to upload plus
// { flag } when a check didn't pass, so the photo lands in the admin's "Foto da controllare" after
// sign-up. Flags: no_face, small_face, multiple_faces, low_res, unchecked (the detector couldn't run).
// With a face, the file is a square JPEG centred on it (which also drops the camera's metadata such
// as GPS). { problem } only when the file can't be opened at all (a HEIC that won't convert).
// { blocked, scores, file } when the image is explicit (nsfw.js): the caller sends it to quarantine.
// strict: for the sign-in provider's photo, used only if it passes every check.
export async function preparePhoto(file, { strict = false } = {}) {
  // iPhone photos (HEIC) become JPEG first; most browsers can't read them
  if (await isHeicFile(file)) {
    try {
      const { heicTo } = await import(HEIC);
      file = new File([await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 })], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (err) {
      console.warn('[face] HEIC conversion failed:', err);
      return { problem: 'Non riusciamo ad aprire questa foto. Salvala come JPG e riprova.' };
    }
  }
  // Explicit images are stopped here, before anything else (nsfw.js)
  const nsfw = await nsfwCheck(file);
  if (nsfw?.blocked) return strict ? { flag: 'nsfw' } : { blocked: true, scores: nsfw.scores, file };
  const result = await check(file);
  return strict && (result.flag || !nsfw) ? { flag: result.flag ?? 'unchecked' } : result;
}

async function check(file) {
  let d, bitmap;
  try {
    d = await load();
    bitmap = await createImageBitmap(file);
  } catch (err) {
    console.warn('[face] check skipped:', err);
    return { file, flag: 'unchecked' };
  }
  try {
    const W = bitmap.width, H = bitmap.height;
    const faces = d.detect(bitmap).detections.map(f => f.boundingBox).sort((a, b) => b.width * b.height - a.width * a.height);
    const size = f => f.width * f.height;
    // No face (or one the short-range model can't see, far from the camera): the photo as it is
    if (!faces.length) return { file, flag: 'no_face' };
    const flag = Math.min(W, H) < MIN_SIDE ? 'low_res'
      : size(faces[0]) / (W * H) < 0.015 ? 'small_face'
      // Someone else next to you, about as big
      : faces.filter(f => size(f) >= size(faces[0]) * 0.35).length > 1 ? 'multiple_faces' : null;
    return { file: await frame(bitmap, faces[0], file.name), flag };
  } finally { bitmap.close(); }
}

// Resolution: photos show up to about 400 px wide, so 800 px keeps them sharp on retina screens.
// The crop is never enlarged: if framing tighter would leave fewer than CROP_SIDE pixels, it zooms
// out instead (down to the whole photo). Below MIN_SIDE the photo goes to the admin's checks.
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

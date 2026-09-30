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

// null when the photo is fine, else the message for the member. strict: a photo that couldn't be
// checked doesn't pass either (used for the sign-in provider's photo, never shown if unchecked)
export async function faceProblem(file, { strict = false } = {}) {
  let d, bitmap;
  try {
    d = await load();
    bitmap = await createImageBitmap(file);
  } catch (err) {
    console.warn('[face] check skipped:', err);
    return strict ? 'unchecked' : null;
  }
  try {
    const area = bitmap.width * bitmap.height;
    const faces = d.detect(bitmap).detections.map(f => f.boundingBox.width * f.boundingBox.height).sort((a, b) => b - a);
    if (!faces.length) return 'Non vediamo un volto in questa foto. Carica una foto in cui si veda bene il tuo viso.';
    if (faces[0] / area < 0.015) return 'Il volto è troppo piccolo: scegli una foto più ravvicinata.';
    // Someone else next to you, about as big: not a profile photo
    if (faces.filter(a => a >= faces[0] * 0.35).length > 1) return 'Nella foto dovresti esserci solo tu.';
    return null;
  } finally { bitmap.close(); }
}

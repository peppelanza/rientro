// Explicit images (nudity, porn) stopped in the browser before they're uploaded, with NSFWJS and
// its small MobileNetV2 model (self-hosted in /vendor, ~5 MB, loaded only when a photo is picked).
// What it finds goes to the server's quarantine for the admin and the account is suspended
// (src/moderation.js). "Sexy" (swimsuits, beach photos) is not blocked.
const BASE = '/vendor/nsfwjs-4.4.0';
// Porn + Hentai probability from which an image is stopped. The small model is right about 9 times
// in 10, so the bar is high: a mistake suspends someone, even if the admin can undo it.
export const BLOCK_AT = 0.8;
let model;

function script(src) {
  return new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src, async: true, onload: resolve, onerror: reject });
    document.head.append(s);
  });
}

function load() {
  model ??= (async () => {
    if (!window.nsfwjs) await script(`${BASE}/nsfwjs.min.js`);
    return window.nsfwjs.load(`${BASE}/mobilenet_v2/model.json`);
  })();
  model.catch(() => { model = undefined; });
  return model;
}

export const warmUpNsfwCheck = () => { load().catch(() => {}); };

// { blocked, scores } — scores by class (Drawing, Hentai, Neutral, Porn, Sexy). null if the model
// couldn't run (the photo then goes on as usual; the admin review is still there).
export async function nsfwCheck(file) {
  let m, bitmap;
  try {
    m = await load();
    bitmap = await createImageBitmap(file);
  } catch (err) {
    console.warn('[nsfw] check skipped:', err);
    return null;
  }
  try {
    const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    const scores = Object.fromEntries((await m.classify(canvas, 5)).map(p => [p.className, Math.round(p.probability * 1000) / 1000]));
    return { blocked: (scores.Porn ?? 0) + (scores.Hentai ?? 0) >= BLOCK_AT, scores };
  } catch (err) {
    console.warn('[nsfw] check failed:', err);
    return null;
  } finally { bitmap.close(); }
}

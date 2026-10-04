// Pictures being attached to something about to be sent (a group post, a support message): picked one
// or several at a time (up to max), all show at once as thumbnails with ✕ and the wheel, then each is
// resized and converted (image-shrink.js), checked for explicit content (nsfw.js) and uploaded to
// `endpoint`, side by side; sending then only takes their ids. The page keeps the list in
// state.images and gets its template values from trayVals().
import { shrinkImage } from './image-shrink.js';
import { toast, upload } from './lib.js';
import { nsfwCheck, warmUpNsfwCheck } from './nsfw.js';

async function add(page, files, { endpoint, max }) {
  const s = page.state;
  const room = max - s.images.length;
  if (files.length > room) toast(`Puoi aggiungere al massimo ${max} foto.`, { tone: 'err' });
  const added = [...files].slice(0, Math.max(0, room)).map(file => ({ file, preview: URL.createObjectURL(file) }));
  s.images.push(...added);
  page.__rerender();
  await Promise.all(added.map(async img => {
    try {
      const blob = await shrinkImage(img.file);
      if ((await nsfwCheck(blob))?.blocked) throw new Error('Questa immagine non può essere pubblicata su Rientro.');
      img.id = (await upload(endpoint, blob)).id;
    } catch (err) {
      s.images = s.images.filter(x => x !== img);
      URL.revokeObjectURL(img.preview);
      toast(err.message, { tone: 'err' });
    }
    delete img.file;
    page.__rerender();
  }));
}

function remove(page, img) {
  page.state.images = page.state.images.filter(x => x !== img);
  URL.revokeObjectURL(img.preview);
  page.__rerender();
}

// Once sent: an empty tray
export function clearTray(page) {
  page.state.images.forEach(i => URL.revokeObjectURL(i.preview));
  page.state.images = [];
}

// Still uploading? (sending waits for them)
export const trayBusy = page => page.state.images.some(i => !i.id);
export const trayIds = page => page.state.images.map(i => i.id);

export function trayVals(page, { endpoint, max }) {
  const images = page.state.images;
  return {
    // (a copy: emptying the field, so the same picture can be picked again, empties its list too)
    pick: e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) { warmUpNsfwCheck(); add(page, files, { endpoint, max }); } },
    canAddImage: images.length < max,
    pending: images.map(img => ({ src: img.preview, uploading: !img.id, remove: () => remove(page, img) })),
    hasPending: images.length > 0,
  };
}

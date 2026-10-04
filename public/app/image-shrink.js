// Pictures picked for a post: decoded by the browser (iPhone HEIC photos too) and redrawn as a JPEG of
// at most 1600 px on the long side, so uploads stay light and every format arrives as one the server
// takes. The browser applies the photo's own orientation when drawing it.
export const MAX_SIDE = 1600;

export async function shrinkImage(file, max = MAX_SIDE) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Non riusciamo a leggere questa immagine. Prova con un’altra.'));
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Non riusciamo a preparare questa immagine.'))), 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}

// Pictures picked for a post: decoded by the browser (iPhone HEIC photos too) and redrawn at most
// 1600 px on the long side as a WebP (about a third smaller than a JPEG that looks the same), or a
// JPEG where the browser can't write WebP (older iPhones). A phone photo of several MB comes out at
// a few hundred KB, and every format arrives as one the server takes. The browser applies the
// photo's own orientation when drawing it.
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
    const encode = (type, q) => new Promise(resolve => canvas.toBlob(resolve, type, q));
    // a browser that can't write WebP hands back a PNG instead: then JPEG
    const webp = await encode('image/webp', 0.8);
    const blob = webp?.type === 'image/webp' ? webp : await encode('image/jpeg', 0.82);
    if (!blob) throw new Error('Non riusciamo a preparare questa immagine.');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

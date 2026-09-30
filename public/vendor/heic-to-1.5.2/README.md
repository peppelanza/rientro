heic-to 1.5.2 (npm `heic-to`, CSP build `dist/csp/heic-to.js`), LGPL-3.0 (see LICENSE), based on
libheif. https://github.com/hoppergee/heic-to. Unmodified, loaded on demand by public/app/face.js
to turn iPhone HEIC photos into JPEG in the browser. It decodes in a Worker created from a blob:
URL, hence `worker-src 'self' blob:` in the CSP. Upgrading: new folder with the new version number.

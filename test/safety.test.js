// What the exploring testers found (e2e): photo metadata, links, the address after signing in
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripImageMeta } from '../src/files.js';
import { handle, httpsUrl, linkedinUrl } from '../src/validate.js';

test('a JPEG loses its Exif (GPS) segment, keeps the picture', () => {
  const seg = (marker, body) => { const b = Buffer.alloc(4 + body.length); b[0] = 0xff; b[1] = marker; b.writeUInt16BE(body.length + 2, 2); body.copy(b, 4); return b; };
  const jfif = seg(0xe0, Buffer.from('JFIF\0'));
  const exif = seg(0xe1, Buffer.from('Exif\0\0GPS 37.5N 15.0E'));
  const scan = Buffer.from([0xff, 0xda, 0x00, 0x02, 1, 2, 3, 0xff, 0xd9]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, exif, scan]);
  const out = stripImageMeta(jpeg, 'image/jpeg');
  assert.ok(!out.includes(Buffer.from('GPS')));
  assert.deepEqual(out, Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, scan]));
  assert.equal(stripImageMeta(Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, scan]), 'image/jpeg'), null, 'nothing to take out');
});

test('links: capital Https, http made https, LinkedIn name alone, pasted X / Instagram links; no dead or other-scheme ones', () => {
  assert.equal(httpsUrl('Https://www.linkedin.com/in/mario', 'L'), 'https://www.linkedin.com/in/mario');
  assert.equal(httpsUrl('http://sito.it', 'S'), 'https://sito.it/');
  for (const bad of ['https://martalopresti/', 'ftp://x.it', 'javascript:alert(1)']) assert.throws(() => httpsUrl(bad, 'L'));
  assert.equal(linkedinUrl('martalopresti', 'L'), 'https://www.linkedin.com/in/martalopresti');
  assert.equal(handle('https://x.com/martalp?s=1', 'X'), '@martalp');
  assert.equal(handle('instagram.com/marta.lp/', 'I'), '@marta.lp');
});

test('a WebP loses its EXIF and XMP chunks; a JPEG loses a second picture glued after its end', () => {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32LE(data.length); return Buffer.concat([Buffer.from(type, 'ascii'), len, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
  const vp8x = chunk('VP8X', Buffer.from([0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  const body = Buffer.concat([vp8x, chunk('VP8 ', Buffer.from('pixels')), chunk('EXIF', Buffer.from('GPS 45N')), chunk('XMP ', Buffer.from('<xmp/>'))]);
  const head = Buffer.alloc(12); head.write('RIFF'); head.writeUInt32LE(body.length + 4, 4); head.write('WEBP', 8);
  const out = stripImageMeta(Buffer.concat([head, body]), 'image/webp');
  assert.ok(!out.includes(Buffer.from('GPS')) && !out.includes(Buffer.from('<xmp')));
  assert.equal(out.readUInt32LE(4), out.length - 8, 'RIFF size fixed');
  assert.equal(out[20] & 0x0c, 0, 'VP8X no longer says EXIF/XMP');
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 1, 2, 0xff, 0xd9]), Buffer.from([0xff, 0xd8]), Buffer.from('Exif\0\0GPS'), Buffer.from([0xff, 0xd9])]);
  const j = stripImageMeta(jpeg, 'image/jpeg');
  assert.ok(!j.includes(Buffer.from('GPS')));
  assert.deepEqual([...j.subarray(-2)], [0xff, 0xd9]);
});

test('LinkedIn only from linkedin.com, without tracking; sites with a real name, no IP or credentials', () => {
  assert.throws(() => linkedinUrl('https://evil.example/in/x', 'L'));
  assert.equal(linkedinUrl('https://it.linkedin.com/in/marta/?utm_source=share', 'L'), 'https://it.linkedin.com/in/marta/');
  for (const bad of ['https://.', 'https://1.2', 'https://127.0.0.1:3020/x', 'https://u:p@sito.it']) assert.throws(() => httpsUrl(bad, 'S'), bad);
  assert.equal(handle('https://www.instagram.com/marta.rinaldi.london/?hl=it', 'I'), '@marta.rinaldi.london');
});

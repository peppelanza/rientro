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

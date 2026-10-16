import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp } from './helpers.js';
import { config } from '../src/config.js';
import { affinityFor } from '../src/profiles.js';
import { provinceLabel, sameProvince } from '../src/places.js';

test('places count by province: Benevento and Paupisi (BN) go together, Napoli does not', () => {
  assert.ok(sameProvince('Benevento', 'Paupisi'));
  assert.ok(!sameProvince('Benevento', 'Napoli'));
  assert.ok(sameProvince('Londra', 'Londra'), 'the same name outside Italy');
  assert.equal(provinceLabel('Paupisi'), 'provincia di Benevento');
});

test('matches: the same province counts, said as such', () => {
  const base = { first_name: 'Luca', seeking_backgrounds: [], sectors: [], desired_unknown: 0 };
  const me = { ...base, lives_in: 'abroad', desired_comuni: ['Benevento'] };
  const score = affinityFor(me);
  const near = score({ ...base, lives_in: 'abroad', desired_comuni: ['Paupisi'] });
  assert.equal(near.score, 25);
  assert.equal(near.reason, 'Anche Luca vuole vivere a Paupisi, nella tua provincia');
  assert.equal(score({ ...base, lives_in: 'italy', lives_in_city: 'Paupisi', desired_comuni: ['Paupisi'] }).reason, 'Luca vive già a Paupisi, nella tua provincia');
  assert.equal(score({ ...base, lives_in: 'abroad', desired_comuni: ['Benevento'] }).reason, 'Anche Luca vuole vivere a Benevento');
  assert.equal(score({ ...base, lives_in: 'abroad', desired_comuni: ['Napoli'] }).score, 0);
});

test('Scopri: the filter Benevento finds who chose Paupisi, the counts are per province, search too, and the city page counts its province', async () => {
  const t = await startApp();
  try {
    const me = await t.approved('pv-me@x.it');
    const pau = await t.approved('pv-pau@x.it', { desired_comuni: ['Paupisi'] });
    const bn = await t.approved('pv-bn@x.it', { desired_comuni: ['Benevento'] });
    await t.approved('pv-na@x.it', { desired_comuni: ['Napoli'] });
    const ids = async q => (await me.get(`/api/profiles?${q}`)).body.people.map(p => p.id).sort();
    assert.deepEqual(await ids('desired=Benevento'), [pau.id, bn.id].sort());
    assert.deepEqual(await ids('desired=Paupisi'), [pau.id, bn.id].sort());
    assert.deepEqual(await ids('q=benevento'), [pau.id, bn.id].sort(), 'the search finds the province too');
    const counts = (await me.get('/api/comuni/counts')).body;
    assert.equal(counts['@BN'], 2);
    assert.equal(counts['Campania (regione)'], 3);
    const min = config.publicStatsMinCount;
    config.publicStatsMinCount = 1;
    try { assert.equal((await (await fetch(`${t.base}/api/public/territory/benevento`)).json()).count, 2); } finally { config.publicStatsMinCount = min; }
  } finally { t.close(); }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forgiving, hit, hits, terms, wordsOf } from '../src/search.js';

test('search: accents and capitals ignored, words start a word, each word counts, one typo forgiven only as a second pass', () => {
  const w = wordsOf('Sviluppatore a Città di Castello, ex-Zalando');
  assert.deepEqual(terms('  Città  città CASTELLO '), ['citta', 'castello']);
  assert.equal(hits(terms('citta svilup'), w), 2, 'any order, start of words, no accents');
  assert.equal(hits(terms('zalando'), w), 1, 'punctuation splits words');
  assert.ok(!hit('ello', w), 'not inside a word');
  assert.equal(hits(terms('castello roma'), w), 1, 'each word counts on its own');
  assert.ok(!hit('svilupaptore', w), 'exact pass: no typos');
  assert.ok(hit('svilupaptore', w, true) && hit('castelo', w, true) && hit('casetllo', w, true), 'forgiving: one letter missing, extra, changed or two swapped');
  assert.ok(!hit('cas', w.filter(x => x !== 'castello'), true), 'short words are never fuzzy');
  assert.deepEqual(forgiving(fuzzy => (fuzzy ? ['b'] : ['a'])), ['a']);
  const similar = forgiving(fuzzy => (fuzzy ? ['b'] : []));
  assert.deepEqual([...similar], ['b']);
  assert.equal(similar.fuzzy, true, 'forgiven results say so');
  assert.ok(!hit('marco', wordsOf('mario'), true), 'a wrong letter only from 6 letters up');
});

test('Scopri cards show what you filtered by: the background, and the sectors and places chosen first', async () => {
  const { startApp } = await import('./helpers.js');
  const t2 = await startApp();
  try {
    const a = await t2.approved('cardfilter@x.it', { background_area: 'Salute e benessere', sectors: ['AI, Software & SaaS', 'Finanza & Assicurazioni', 'Arte & Cultura', 'Sport & Tempo Libero'], desired_comuni: ['Milano', 'Torino', 'Bologna', 'Catania'] });
    const b = await t2.approved('cardviewer@x.it');
    const find = async q => (await b.get(`/api/profiles?${q}`)).body.people.find(p => p.id === a.id);
    const plain = await find('');
    assert.equal(plain.background, null);
    assert.ok(!plain.tags.includes('Sport'));
    const filtered = await find('backgrounds=Salute%20e%20benessere&sectors=Sport%20%26%20Tempo%20Libero&desired=Catania');
    assert.equal(filtered.background, 'Salute e benessere');
    assert.match(filtered.tags, /^Sport & Tempo Libero/);
    assert.match(filtered.to, /^Catania/);
  } finally { t2.close(); }
});

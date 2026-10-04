import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forgiving, hit, hitsAll, terms, wordsOf } from '../src/search.js';

test('search: accents and capitals ignored, words start a word, all words needed, one typo forgiven only as a second pass', () => {
  const w = wordsOf('Sviluppatore a Città di Castello, ex-Zalando');
  assert.deepEqual(terms('  Città  città CASTELLO '), ['citta', 'castello']);
  assert.ok(hitsAll(terms('citta svilup'), w), 'any order, start of words, no accents');
  assert.ok(hitsAll(terms('zalando'), w), 'punctuation splits words');
  assert.ok(!hit('ello', w), 'not inside a word');
  assert.ok(!hitsAll(terms('castello roma'), w), 'every word must be there');
  assert.ok(!hit('svilupaptore', w), 'exact pass: no typos');
  assert.ok(hit('svilupaptore', w, true) && hit('castelo', w, true) && hit('casetllo', w, true), 'forgiving: one letter missing, extra, changed or two swapped');
  assert.ok(!hit('cas', w.filter(x => x !== 'castello'), true), 'short words are never fuzzy');
  assert.deepEqual(forgiving(fuzzy => (fuzzy ? ['b'] : ['a'])), ['a']);
  const similar = forgiving(fuzzy => (fuzzy ? ['b'] : []));
  assert.deepEqual([...similar], ['b']);
  assert.equal(similar.fuzzy, true, 'forgiven results say so');
  assert.ok(!hit('marco', wordsOf('mario'), true), 'a wrong letter only from 6 letters up');
});

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
    await a.patch('/api/me/profile', { primary_intent: 'has_idea', idea_title: 'Agriturismo sull’Etna' });
    assert.equal((await find('')).idea_line, null, 'not without the filter');
    assert.equal((await find('intent=has_idea')).idea_line, 'Agriturismo sull’Etna', 'filtering by goal shows the idea');
  } finally { t2.close(); }
});

test('Scopri keeps its members in memory and reads again only who changed: edits, new profiles, hidden ones, experiences', async () => {
  const { startApp } = await import('./helpers.js');
  const t2 = await startApp();
  try {
    const viewer = await t2.approved('ixviewer@x.it');
    const a = await t2.approved('ixa@x.it', { first_name: 'Ada' });
    const names = async q => (await viewer.get(`/api/profiles?${q}`)).body.people.map(p => p.first_name);
    assert.ok((await names('')).includes('Ada'));
    await a.patch('/api/me/profile', { first_name: 'Adele' });
    assert.ok((await names('q=adele')).includes('Adele'), 'an edit shows at once');
    await a.post('/api/me/experiences', { company: 'Zalando', role: 'PM', current: true });
    assert.ok((await names('q=zalando')).includes('Adele'), 'a new experience is searchable');
    const b = await t2.approved('ixb@x.it', { first_name: 'Bruno' });
    assert.equal((await names(''))[0], 'Bruno', 'a new profile comes first');
    t2.app.db.prepare('UPDATE profiles SET visible = 0 WHERE user_id = ?').run(b.id);
    assert.ok(!(await names('')).includes('Bruno'), 'a hidden profile leaves');
  } finally { t2.close(); }
});

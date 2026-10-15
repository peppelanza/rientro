import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';
import { nameCase, realName } from '../public/app/text-case.js';

test('names: initials refused, capitals and lower case fixed, the rest as written', () => {
  for (const n of ['G', 'G.', 'L', 'aaa', 'Xx', ' . ']) assert.equal(realName(n), false, n);
  for (const n of ['Ng', 'Lia', 'De Luca', 'Jo']) assert.equal(realName(n), true, n);
  assert.equal(nameCase('GIUSEPPE'), 'Giuseppe');
  assert.equal(nameCase('giuseppe maria'), 'Giuseppe Maria');
  assert.equal(nameCase("D'ANGELO"), "D'Angelo");
  assert.equal(nameCase('ROSSI-BIANCHI'), 'Rossi-Bianchi');
  assert.equal(nameCase('McDonald'), 'McDonald');
  assert.equal(nameCase('de Luca'), 'de Luca');
});

let t;
before(async () => { t = await startApp(); });
after(() => t.close());

test('the server: "G" "L" refused with a clear message, "MARIO ROSSI" saved as "Mario Rossi", texts as written', async () => {
  const a = await t.login('maiuscole@x.it');
  const r = await a.patch('/api/me/profile', { first_name: 'G', last_name: 'L' });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /nome vero/);
  const ok = await a.patch('/api/me/profile', { first_name: 'MARIO', last_name: 'ROSSI', bio: 'SONO UN INGEGNERE E VIVO A PARIGI.' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.first_name, 'Mario');
  assert.equal(ok.body.last_name, 'Rossi');
  assert.equal(ok.body.bio, 'SONO UN INGEGNERE E VIVO A PARIGI.');
  // from Google with initials only: Presentati is needed
  t.app.db.prepare("UPDATE profiles SET first_name = 'G', last_name = 'L' WHERE user_id = ?").run(a.id);
  t.app.db.prepare("INSERT INTO login_methods (user_id, method, first_used_at, last_used_at) VALUES (?, 'google', '', '')").run(a.id);
  assert.equal((await a.get('/api/me')).body.name_from_login, false);
});

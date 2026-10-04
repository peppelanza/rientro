import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp } from './helpers.js';
import { LEGAL_VERSIONS } from '../src/config.js';
import { sendLegalNotices } from '../src/legal-notice.js';

test('terms or privacy updated: every member gets one email (one for both), not about the starting versions, not who joined after, never twice', async () => {
  const t = await startApp();
  const was = { ...LEGAL_VERSIONS };
  try {
    const { db } = t.app;
    const a = await t.approved('legal-a@example.com');
    await t.member('legal-b@example.com');
    const sent = [];
    const opts = { send: async m => sent.push(m), enabled: () => true };
    await sendLegalNotices(db, opts);
    assert.equal(sent.length, 0, 'the versions first seen are the starting point');

    Object.assign(LEGAL_VERSIONS, { terms: '2026-11-01', privacy: '2026-11-01' });
    db.prepare("UPDATE users SET created_at = '2026-01-01T00:00:00.000Z'").run(); // both from before
    await sendLegalNotices(db, opts);
    assert.equal(sent.length, 2, 'each member once');
    assert.ok(sent.some(m => m.to === 'legal-a@example.com'));
    assert.match(sent[0].subject, /Abbiamo aggiornato i Termini e condizioni e la Privacy Policy/);
    assert.match(sent[0].text, /\/legal\/termini/);
    assert.match(sent[0].text, /Non devi fare nulla/);

    await sendLegalNotices(db, opts);
    assert.equal(sent.length, 2, 'never twice');
    await t.approved('legal-late@example.com'); // joined after the update
    await sendLegalNotices(db, opts);
    assert.equal(sent.length, 2, 'not who joined after');
    assert.equal((await a.patch('/api/me/profile', { bio: 'x'.repeat(160) })).status, 200, 'nothing waits for it');
  } finally { Object.assign(LEGAL_VERSIONS, was); await t.close(); }
});

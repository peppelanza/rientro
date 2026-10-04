import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp } from './helpers.js';
import { mailer } from '../src/support.js';

test('supporto: a member opens tickets (as many as they like), the team answers in the admin panel, notifications both ways, a closed ticket reopens when the member writes', async () => {
  const t = await startApp();
  try {
    const a = await t.approved('sup-a@example.com');
    const b = await t.approved('sup-b@example.com');
    const admin = await t.asAdmin();

    assert.equal((await a.post('/api/support', { subject: '', body: 'x' })).status, 400, 'a subject');
    const one = (await a.post('/api/support', { subject: 'Non vedo le foto', body: 'Le foto del gruppo non si caricano.' })).body;
    assert.match(one.code, /^R-\d{4}$/);
    assert.equal(one.messages.length, 1);
    const two = (await a.post('/api/support', { subject: 'Cambio email', body: 'Come cambio email?' })).body;
    assert.equal((await a.get('/api/support')).body.tickets.length, 2, 'more than one ticket');
    assert.equal((await b.get(`/api/support/${one.id}`)).status, 404, 'only your own');

    // the team: notified, sees it waiting, answers
    assert.ok((await admin.get('/api/notifications')).body.items.some(n => n.kind === 'support_new' && n.data.ticket_id === one.id));
    const list = (await admin.get('/api/admin/support')).body;
    assert.equal(list.counts.open, 2);
    assert.ok(list.items.every(x => x.waiting));
    assert.equal((await admin.get('/api/admin/sidebar')).body.support, 2);
    assert.equal((await a.get('/api/admin/support')).status, 403, 'the team only');
    const sent = [];
    Object.assign(mailer, { enabled: () => true, send: async m => sent.push(m) });
    const answered = (await admin.post(`/api/admin/support/${one.id}`, { body: 'Ciao! Stiamo controllando.' })).body;
    assert.equal(sent.length, 1, 'an answer always emails the member');
    assert.equal(sent[0].to, 'sup-a@example.com');
    assert.match(sent[0].subject, /ti ha risposto · #R-\d{4}: Non vedo le foto/);
    assert.match(sent[0].text, /Stiamo controllando/);
    assert.equal(answered.messages.at(-1).from_team, true);
    assert.equal((await admin.get('/api/admin/sidebar')).body.support, 1, 'answered: no longer waiting');

    // the member: notified, reads it
    const note = (await a.get('/api/notifications')).body.items.find(n => n.kind === 'support_reply');
    assert.equal(note.data.ticket_id, one.id);
    assert.ok((await a.get('/api/support')).body.tickets.find(x => x.id === one.id).unread);
    const seen = (await a.get(`/api/support/${one.id}`)).body;
    assert.equal(seen.messages.length, 2);
    assert.ok(!(await a.get('/api/support')).body.tickets.find(x => x.id === one.id).unread, 'opened: read');

    // closed, then the member writes: open again, and the team hears of it
    await admin.post(`/api/admin/support/${two.id}/status`, { status: 'closed' });
    assert.match(sent.at(-1).subject, /Abbiamo chiuso il tuo ticket/, 'closing emails too');
    assert.equal((await a.get(`/api/support/${two.id}`)).body.status, 'closed');
    await a.post(`/api/support/${two.id}`, { body: 'Ancora io' });
    assert.equal((await a.get(`/api/support/${two.id}`)).body.status, 'open');
    assert.ok((await admin.get('/api/notifications')).body.items.some(n => n.kind === 'support_message' && n.data.ticket_id === two.id));

    // in the member's data export
    const data = (await a.get('/api/me/export')).body;
    assert.equal(data.support_tickets?.length, 2);
  } finally { await t.close(); }
});

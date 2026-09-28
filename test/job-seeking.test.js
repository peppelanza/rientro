import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';

let t;
before(async () => { t = await startApp(); });
after(() => t.close());

test('job-seeking coexists with either primary intent', async () => {
  for (const intent of ['has_idea', 'seeking_idea']) {
    const u = await t.member(`intent-${intent}@x.it`, { primary_intent: intent });
    assert.equal((await u.put('/api/me/job-seeking?source=onboarding', { looking_for_italian_job: true })).status, 200);
    const me = (await u.get('/api/me')).body;
    assert.equal(me.profile.primary_intent, intent);
    assert.equal(me.job_seeking.looking_for_italian_job, true);
  }
});

test('job-seeking is off by default and cannot be set through the profile endpoint', async () => {
  const u = await t.member('noinfer@x.it', { current_role: 'Recruiter, cerco lavoro in Italia', bio: 'Voglio lavorare per un’azienda italiana' });
  assert.equal((await u.get('/api/me')).body.job_seeking.looking_for_italian_job, false);
  const r = await u.patch('/api/me/profile', { looking_for_italian_job: true });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'unknown_field');
  assert.equal((await u.get('/api/me')).body.job_seeking.looking_for_italian_job, false);
});

test('only an explicit boolean is accepted', async () => {
  const u = await t.member('strict@x.it');
  for (const v of ['true', 1, 'yes', null]) {
    assert.equal((await u.put('/api/me/job-seeking', { looking_for_italian_job: v })).status, 400, `value ${JSON.stringify(v)}`);
  }
});

test('selection and deselection are timestamped, versioned and logged', async () => {
  const u = await t.member('ledger@x.it');
  const on = (await u.put('/api/me/job-seeking?source=onboarding', { looking_for_italian_job: true })).body;
  assert.ok(on.selected_at);
  await u.put('/api/me/job-seeking', { looking_for_italian_job: true }); // no duplicate
  const off = (await u.put('/api/me/job-seeking', { looking_for_italian_job: false })).body;
  assert.equal(off.selected_at, null);
  assert.ok(off.deselected_at);
  const history = (await u.get('/api/me/preference-history')).body.filter(e => e.preference === 'job_seeking');
  assert.deepEqual(history.map(h => [h.value, h.source]), [[false, 'settings'], [true, 'onboarding']]);
  for (const h of history) assert.ok(h.notice_version && h.privacy_policy_version && h.created_at);
});

test('job details require the flag, are structured, and are cleared on deselect', async () => {
  const u = await t.member('details@x.it');
  assert.equal((await u.patch('/api/me/job-preferences', { roles: ['PM'] })).status, 409);
  await u.put('/api/me/job-seeking', { looking_for_italian_job: true });
  const saved = (await u.patch('/api/me/job-preferences', {
    roles: ['Product Manager', ' product manager ', 'Head of Product'], skills: ['SQL'], sectors: ['Fintech'],
    preferred_locations: ['Milano'], work_arrangement: 'hybrid', employment_type: 'full_time', availability: 'within_6_months',
  })).body;
  assert.deepEqual(saved.roles, ['Product Manager', 'Head of Product']);
  assert.equal((await u.patch('/api/me/job-preferences', { work_arrangement: 'sometimes' })).status, 400);
  const off = (await u.put('/api/me/job-seeking', { looking_for_italian_job: false })).body;
  assert.deepEqual([off.roles, off.skills, off.work_arrangement], [[], [], null]);
});

test('marketing consent is separate: opt-in at signup is recorded, never implied', async () => {
  const quiet = await t.login('quiet@x.it');
  assert.equal((await quiet.get('/api/me')).body.communication.marketing_email, false);
  const yes = await t.login('yes@x.it', { marketing: true });
  const me = (await yes.get('/api/me')).body;
  assert.equal(me.communication.marketing_email, true);
  assert.equal(me.job_seeking.looking_for_italian_job, false);
  const h = (await yes.get('/api/me/preference-history')).body;
  assert.deepEqual(h.map(e => [e.preference, e.value, e.source]), [['marketing_email', true, 'signup']]);
  assert.equal((await yes.put('/api/me/communication', { preference: 'job_seeking', value: true })).status, 400);
});

test('signing up records the terms and privacy notice acknowledgement', async () => {
  const u = await t.login('terms@x.it');
  const me = (await u.get('/api/me')).body;
  assert.deepEqual(me.legal.needs, []);
});

test('living abroad cannot name Italy as the country', async () => {
  const u = await t.login('abroad@x.it');
  assert.equal((await u.patch('/api/me/profile', { lives_in: 'abroad', lives_in_country: 'Italia', lives_in_city: 'Roma' })).status, 400);
  assert.equal((await u.patch('/api/me/profile', { lives_in: 'abroad', lives_in_country: 'Regno Unito', lives_in_city: 'Londra' })).status, 200);
  assert.equal((await u.patch('/api/me/profile', { lives_in: 'italy', lives_in_city: 'Roma' })).status, 200);
});

test('idea stages are the three new ones, and old stored stages move over', async () => {
  const u = await t.login('stage@x.it');
  assert.equal((await u.patch('/api/me/profile', { primary_intent: 'has_idea', idea_title: 'X', idea_stage: 'validation' })).status, 400);
  assert.equal((await u.patch('/api/me/profile', { primary_intent: 'has_idea', idea_title: 'X', idea_stage: 'prototype' })).status, 200);

  const { openDb, migrateIdeaStages } = await import('../src/db.js');
  const db = openDb(':memory:');
  const t2 = await startApp({ db });
  const v = await t2.login('old@x.it');
  await v.patch('/api/me/profile', { primary_intent: 'has_idea', idea_title: 'X', idea_stage: 'idea' });
  db.prepare('UPDATE profiles SET idea_stage = ?').run('first_customers');
  migrateIdeaStages(db);
  assert.equal((await v.get('/api/me')).body.profile.idea_stage, 'revenue');
  t2.close();
});

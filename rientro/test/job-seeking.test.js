import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startApp } from './helpers.js';

let t;
before(async () => { t = await startApp(); });
after(() => t.close());

test('job-seeking coexists with either primary intent', async () => {
  for (const intent of ['has_idea', 'seeking_idea']) {
    const u = await t.member(`intent-${intent}@x.it`, { primary_intent: intent });
    const r = await u.put('/api/me/job-seeking?source=onboarding', { looking_for_italian_job: true });
    assert.equal(r.status, 200);
    const me = (await u.get('/api/me')).body;
    assert.equal(me.profile.primary_intent, intent);
    assert.equal(me.job_seeking.looking_for_italian_job, true);
  }
});

test('job-seeking is off by default and cannot be set through the profile endpoint', async () => {
  const u = await t.member('noinfer@x.it', { current_role: 'Recruiter cerco lavoro in Italia', bio: 'Voglio lavorare in Italia' });
  assert.equal((await u.get('/api/me')).body.job_seeking.looking_for_italian_job, false);
  const r = await u.patch('/api/me/profile', { looking_for_italian_job: true });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'unknown_field');
  assert.equal((await u.get('/api/me')).body.job_seeking.looking_for_italian_job, false);
});

test('only an explicit boolean is accepted', async () => {
  const u = await t.member('strict@x.it');
  for (const v of ['true', 1, 'yes', null]) {
    const r = await u.put('/api/me/job-seeking', { looking_for_italian_job: v });
    assert.equal(r.status, 400, `value ${JSON.stringify(v)} must be rejected`);
  }
});

test('selection and deselection are timestamped, versioned and logged', async () => {
  const u = await t.member('ledger@x.it');
  const on = (await u.put('/api/me/job-seeking?source=onboarding', { looking_for_italian_job: true })).body;
  assert.ok(on.selected_at);
  assert.equal(on.deselected_at, null);

  // Same value again: no duplicate ledger row.
  await u.put('/api/me/job-seeking', { looking_for_italian_job: true });

  const off = (await u.put('/api/me/job-seeking', { looking_for_italian_job: false })).body;
  assert.equal(off.looking_for_italian_job, false);
  assert.equal(off.selected_at, null);
  assert.ok(off.deselected_at);

  const history = (await u.get('/api/me/preference-history')).body.filter(e => e.preference === 'job_seeking');
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(h => [h.value, h.source]), [[false, 'settings'], [true, 'onboarding']]);
  for (const h of history) {
    assert.equal(h.notice_version, 'job-notice-v1');
    assert.ok(h.privacy_policy_version);
    assert.ok(h.created_at);
  }
});

test('job details require the flag, are structured, and are cleared on deselect', async () => {
  const u = await t.member('details@x.it');
  const blocked = await u.patch('/api/me/job-preferences', { roles: ['PM'] });
  assert.equal(blocked.status, 409);

  await u.put('/api/me/job-seeking', { looking_for_italian_job: true });
  const saved = (await u.patch('/api/me/job-preferences', {
    roles: ['Product Manager', ' product manager ', 'Head of Product'],
    skills: ['Roadmapping', 'SQL'],
    sectors: ['Fintech'],
    preferred_locations: ['Milano', 'Bologna'],
    work_arrangement: 'hybrid',
    employment_type: 'full_time',
    availability: 'within_6_months',
  })).body;
  assert.deepEqual(saved.roles, ['Product Manager', 'Head of Product']);
  assert.equal(saved.work_arrangement, 'hybrid');

  const invalid = await u.patch('/api/me/job-preferences', { work_arrangement: 'sometimes' });
  assert.equal(invalid.status, 400);

  const off = (await u.put('/api/me/job-seeking', { looking_for_italian_job: false })).body;
  assert.deepEqual([off.roles, off.skills, off.preferred_locations, off.work_arrangement], [[], [], [], null]);
});

test('marketing consent is separate from job-seeking', async () => {
  const u = await t.member('mkt@x.it');
  await u.put('/api/me/job-seeking', { looking_for_italian_job: true });
  let me = (await u.get('/api/me')).body;
  assert.equal(me.communication.marketing_email, false);

  await u.put('/api/me/communication', { preference: 'marketing_email', value: true });
  await u.put('/api/me/job-seeking', { looking_for_italian_job: false });
  me = (await u.get('/api/me')).body;
  assert.equal(me.communication.marketing_email, true);
  assert.equal(me.job_seeking.looking_for_italian_job, false);

  const r = await u.put('/api/me/communication', { preference: 'job_seeking', value: true });
  assert.equal(r.status, 400);
});

test('terms must be accepted before building a profile', async () => {
  const u = await t.login('noterms@x.it');
  assert.equal((await u.put('/api/me/job-seeking', { looking_for_italian_job: true })).status, 409);
  assert.equal((await u.post('/api/me/legal', { accept_terms: true, read_privacy: false })).status, 400);
  assert.equal((await u.post('/api/me/legal', { accept_terms: true, read_privacy: true })).status, 200);
  assert.equal((await u.put('/api/me/job-seeking', { looking_for_italian_job: true })).status, 200);
});

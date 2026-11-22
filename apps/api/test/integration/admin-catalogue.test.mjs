import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { AppModule } from '../../dist/app.module.js';
import { fixture } from '../../../../packages/db/test/integration/fixture.mjs';

const PROJECT = 'demo-exam-prep';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' }] };
const token = (uid = `uid-${randomUUID()}`) =>
  new SignJWT({ email: `${uid}@example.test`, email_verified: true, name: 'Synthetic Admin', auth_time: Math.floor(Date.now() / 1000) - 10, firebase: { sign_in_provider: 'password' } })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(`https://securetoken.google.com/${PROJECT}`).setAudience(PROJECT).setSubject(uid)
    .setIssuedAt().setExpirationTime('1h').sign(privateKey);

async function api(t) {
  const db = await fixture(t);
  const saved = { ...process.env };
  Object.assign(process.env, { NODE_ENV: 'test', APP_ENV: 'test', FIREBASE_PROJECT_ID: PROJECT, FIREBASE_TEST_JWKS: JSON.stringify(jwks), DATABASE_URL: db.appUrl });
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/v1`;
  t.after(async () => { await app.close(); process.env = saved; });
  const call = async (method, path, { as, body } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (as) { headers.authorization = `Bearer ${as.jwt}`; headers['x-device-id'] = as.device; }
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: res.status === 204 ? null : await res.json(), cache: res.headers.get('cache-control') };
  };
  const user = async ({ roles, flags = {} } = {}) => {
    const jwt = await token();
    const session = await call('POST', '/identity/session', { body: { deviceName: 'Laptop', platform: 'web', ageConfirmed: true }, as: { jwt } });
    assert.equal(session.status, 200);
    const id = session.body.profile.id;
    if (roles) await db.owner.query('UPDATE profiles SET roles = $2::user_role_type[] WHERE id = $1', [id, roles]);
    for (const [flag, on] of Object.entries(flags)) await db.owner.query(`UPDATE profiles SET is_${flag}_admin = $2 WHERE id = $1`, [id, on]);
    return { id, jwt, device: session.body.device.id };
  };
  return { db, call, user };
}

test('admin catalogue needs an admin with the ops (or super) permission', async (t) => {
  const { call, user } = await api(t);
  const student = await user();
  const plainAdmin = await user({ roles: ['student', 'admin'] });
  const finance = await user({ roles: ['student', 'admin'], flags: { finance: true } });
  const ops = await user({ roles: ['student', 'admin'], flags: { ops: true } });
  const superAdmin = await user({ roles: ['student', 'admin'], flags: { super: true } });
  const reviewer = await user({ roles: ['student', 'qc_reviewer'], flags: { ops: true } });
  assert.equal((await call('GET', '/admin/catalogue/exams')).status, 401);
  for (const who of [student, plainAdmin, finance, reviewer]) {
    assert.equal((await call('GET', '/admin/catalogue/exams', { as: who })).status, 403);
    assert.equal((await call('POST', '/admin/catalogue/categories', { as: who, body: { name: 'X', slug: 'x' } })).status, 403);
  }
  const ok = await call('GET', '/admin/catalogue/exams', { as: ops });
  assert.equal(ok.status, 200);
  assert.equal(ok.cache, 'no-store');
  assert.equal((await call('GET', '/admin/catalogue/categories', { as: superAdmin })).status, 200);
});

test('an admin sets up a full exam template through the API; drafts, publishing, versions and audit', async (t) => {
  const { db, call, user } = await api(t);
  const admin = await user({ roles: ['student', 'admin'], flags: { ops: true } });
  const as = admin;
  const post = (path, body) => call('POST', `/admin/catalogue${path}`, { as, body });
  const put = (path, body) => call('PUT', `/admin/catalogue${path}`, { as, body });
  const patch = (path, body) => call('PATCH', `/admin/catalogue${path}`, { as, body });
  const del = (path) => call('DELETE', `/admin/catalogue${path}`, { as });
  const get = (path) => call('GET', `/admin/catalogue${path}`, { as });

  // Category and exam.
  const category = await post('/categories', { name: 'Defence', slug: 'defence' });
  assert.equal(category.status, 201);
  const dup = await post('/categories', { name: 'Defence 2', slug: 'defence' });
  assert.deepEqual([dup.status, dup.body.error.code, dup.body.error.details.field], [409, 'ALREADY_EXISTS', 'slug']);
  assert.equal((await post('/categories', { name: 'Bad', slug: 'Not A Slug' })).body.error.code, 'VALIDATION_FAILED');
  const created = await post('/exams', { categoryId: category.body.id, name: 'CDS', slug: 'cds' });
  assert.equal(created.status, 201);
  let exam = created.body;
  assert.equal(exam.isActive, false, 'new exams start hidden');
  const show = await patch(`/exams/${exam.id}`, { expectedUpdatedAt: exam.updatedAt, isActive: true });
  assert.deepEqual([show.status, show.body.error.code], [409, 'IN_USE'], 'cannot show an exam without a published template');

  // Details, with a stale second save refused.
  const details = await patch(`/exams/${exam.id}`, {
    expectedUpdatedAt: exam.updatedAt,
    syllabusMarkdown: '- English\n- General Knowledge\n- Elementary Mathematics',
    importantDates: [{ label: 'CDS I exam', date: '2027-04-12' }],
    previousCutoffs: [{ label: '2025, IMA', score: 132 }],
    lastCutoffScore: 132,
  });
  assert.equal(details.status, 200);
  assert.deepEqual(details.body.importantDates, [{ label: 'CDS I exam', date: '2027-04-12' }]);
  const staleExam = await patch(`/exams/${exam.id}`, { expectedUpdatedAt: exam.updatedAt, name: 'Overwrite' });
  assert.deepEqual([staleExam.status, staleExam.body.error.code], [409, 'STALE_EDIT']);
  exam = details.body;

  // Stage and syllabus tree.
  exam = (await post(`/exams/${exam.id}/stages`, { name: 'Written', slug: 'written' })).body;
  assert.equal((await post(`/exams/${exam.id}/stages`, { name: 'Again', slug: 'written' })).body.error.code, 'ALREADY_EXISTS');
  const stage = exam.stages[0];
  exam = (await post(`/exams/${exam.id}/subjects`, { name: 'Elementary Mathematics' })).body;
  exam = (await post(`/exams/${exam.id}/subjects`, { name: 'English' })).body;
  const maths = exam.subjects.find((s) => s.name === 'Elementary Mathematics');
  const english = exam.subjects.find((s) => s.name === 'English');
  exam = (await post(`/subjects/${maths.id}/topics`, { names: ['Algebra', 'Geometry', 'algebra', 'Trigonometry'] })).body;
  exam = (await post(`/subjects/${maths.id}/topics`, { names: ['Geometry', 'Mensuration'] })).body;
  const mathsTopics = exam.subjects.find((s) => s.id === maths.id).topics;
  assert.deepEqual(mathsTopics.map((x) => x.name), ['Algebra', 'Geometry', 'Mensuration', 'Trigonometry'], 'duplicates skipped, case-insensitive');
  const algebra = mathsTopics.find((x) => x.name === 'Algebra');

  // Draft template: saved even while inconsistent; issues explain why it cannot be published.
  const draftBody = {
    stageId: stage.id, name: 'CDS Elementary Mathematics', totalQuestions: 100, totalDurationSeconds: 7200,
    hasSectionalTiming: false, defaultPositiveMarks: 1, defaultNegativeMarks: 0.33,
    sections: [{ name: 'Mathematics', subjectId: maths.id, questionCount: 90, durationSeconds: 999, positiveMarks: 1, negativeMarks: 0.33, targetTopicCounts: { [algebra.id]: 20 } }],
  };
  const draft = await post(`/exams/${exam.id}/templates`, draftBody);
  assert.equal(draft.status, 201);
  assert.equal(draft.body.status, 'draft');
  assert.equal(draft.body.sections[0].durationSeconds, null, 'section times dropped without sectional timing');
  assert.deepEqual(draft.body.issues, ['Sections add up to 90 questions, but the template has 100.']);
  const refused = await post(`/templates/${draft.body.id}/publish`, { expectedUpdatedAt: draft.body.updatedAt });
  assert.deepEqual([refused.status, refused.body.error.code, refused.body.error.details.issues.length], [422, 'TEMPLATE_NOT_PUBLISHABLE', 1]);
  const wrongStage = await put(`/templates/${draft.body.id}`, { ...draftBody, stageId: randomUUID(), expectedUpdatedAt: draft.body.updatedAt });
  assert.equal(wrongStage.body.error.code, 'VALIDATION_FAILED');

  const fixed = await put(`/templates/${draft.body.id}`, { ...draftBody, expectedUpdatedAt: draft.body.updatedAt, sections: [{ ...draftBody.sections[0], questionCount: 100 }] });
  assert.equal(fixed.status, 200);
  assert.deepEqual(fixed.body.issues, []);
  const staleSave = await put(`/templates/${draft.body.id}`, { ...draftBody, expectedUpdatedAt: draft.body.updatedAt });
  assert.equal(staleSave.body.error.code, 'STALE_EDIT');
  const stalePublish = await post(`/templates/${draft.body.id}/publish`, { expectedUpdatedAt: draft.body.updatedAt });
  assert.equal(stalePublish.body.error.code, 'STALE_EDIT');
  const v1 = await post(`/templates/${draft.body.id}/publish`, { expectedUpdatedAt: fixed.body.updatedAt });
  assert.deepEqual([v1.status, v1.body.status, v1.body.version], [200, 'published', 1]);

  // Published is locked; changes go through a new version.
  assert.equal((await put(`/templates/${v1.body.id}`, { ...draftBody, expectedUpdatedAt: v1.body.updatedAt })).body.error.code, 'TEMPLATE_LOCKED');
  assert.equal((await del(`/templates/${v1.body.id}`)).body.error.code, 'TEMPLATE_LOCKED');
  assert.equal((await del(`/stages/${stage.id}`)).body.error.code, 'IN_USE');
  assert.equal((await del(`/topics/${algebra.id}`)).body.error.code, 'IN_USE');
  assert.equal((await del(`/subjects/${maths.id}`)).body.error.code, 'IN_USE');
  exam = (await del(`/subjects/${english.id}`)).body;
  assert.equal(exam.subjects.length, 1, 'unused subject deleted');

  const v2 = await post(`/templates/${v1.body.id}/new-version`);
  assert.deepEqual([v2.status, v2.body.status, v2.body.version, v2.body.supersedesTemplateId], [200, 'draft', 2, v1.body.id]);
  assert.equal((await post(`/templates/${v1.body.id}/new-version`)).body.id, v2.body.id, 'repeat returns the same draft');
  const v2saved = await put(`/templates/${v2.body.id}`, { ...draftBody, name: 'CDS Elementary Mathematics', totalQuestions: 100, expectedUpdatedAt: v2.body.updatedAt,
    sections: [{ ...draftBody.sections[0], questionCount: 100, negativeMarks: 0.25, targetTopicCounts: { [algebra.id]: 25 } }] });
  const v2pub = await post(`/templates/${v2.body.id}/publish`, { expectedUpdatedAt: v2saved.body.updatedAt });
  assert.equal(v2pub.body.status, 'published');
  assert.equal((await get(`/templates/${v1.body.id}`)).body.status, 'retired', 'publishing a version retires the previous one');
  assert.equal((await post(`/templates/${v1.body.id}/new-version`)).body.error.code, 'ALREADY_EXISTS');

  // A throwaway draft can be deleted.
  const scratch = await post(`/exams/${exam.id}/templates`, { ...draftBody, name: 'Scratch' });
  assert.equal((await del(`/templates/${scratch.body.id}`)).status, 204);

  // Now the exam can go on the website, with the current version's pattern.
  exam = (await get(`/exams/${exam.id}`)).body;
  const shown = await patch(`/exams/${exam.id}`, { expectedUpdatedAt: exam.updatedAt, isActive: true });
  assert.equal(shown.status, 200);
  const publicPage = await call('GET', '/exams/cds');
  assert.equal(publicPage.status, 200);
  assert.equal(publicPage.body.pattern.sections[0].negativeMarks, 0.25);

  // History names each action and who did it; the database holds before/after for all of them.
  const history = await get(`/exams/${exam.id}/history`);
  const actions = history.body.items.map((i) => i.action);
  for (const a of ['catalogue.exam.create', 'catalogue.exam.update', 'catalogue.stage.create', 'catalogue.subject.create', 'catalogue.subject.delete',
    'catalogue.topic.create', 'catalogue.template.create', 'catalogue.template.save_draft', 'catalogue.template.publish',
    'catalogue.template.new_version', 'catalogue.template.retire_superseded', 'catalogue.template.delete_draft']) {
    assert.ok(actions.includes(a), `history has ${a}`);
  }
  assert.ok(history.body.items.every((i) => i.actor.id === admin.id));
  const showEntry = history.body.items.find((i) => i.action === 'catalogue.exam.update' && i.changedFields.includes('is_active'));
  assert.ok(showEntry, 'changed fields are listed');
  const refusedWrites = (await db.owner.query("SELECT count(*)::int AS n FROM admin_audit_logs WHERE after_state->>'name' = 'Overwrite'")).rows[0].n;
  assert.equal(refusedWrites, 0, 'refused changes leave no audit rows');
  const categoryAudit = (await db.owner.query("SELECT count(*)::int AS n FROM admin_audit_logs WHERE action_name = 'catalogue.category.create' AND admin_id = $1", [admin.id])).rows[0].n;
  assert.equal(categoryAudit, 1);
});

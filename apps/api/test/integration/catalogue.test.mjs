import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../dist/app.module.js';
import { fixture } from '../../../../packages/db/test/integration/fixture.mjs';

const SEED = fileURLToPath(new URL('../../../../packages/db/seeds/demo-catalogue.mjs', import.meta.url));

/** The real API against an isolated database holding the synthetic demo catalogue, as the app role. */
async function api(t) {
  const db = await fixture(t);
  execFileSync(process.execPath, [SEED], { env: { ...process.env, APP_ENV: 'test', MIGRATION_DATABASE_URL: db.url }, stdio: 'pipe' });
  const saved = { ...process.env };
  Object.assign(process.env, { NODE_ENV: 'test', APP_ENV: 'test', FIREBASE_PROJECT_ID: 'demo-exam-prep', DATABASE_URL: db.appUrl });
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/v1`;
  t.after(async () => { await app.close(); process.env = saved; });
  const get = async (path) => {
    const res = await fetch(`${base}${path}`);
    return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() };
  };
  return { db, get };
}

/** Every key anywhere in a JSON value. */
const keysOf = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); keysOf(v, out); }
  return out;
};
const FORBIDDEN = ['stem', 'stemEn', 'stem_en', 'options', 'correctOption', 'correct_option', 'solution', 'solutionEn', 'solution_en',
  'email', 'phone', 'firebaseUid', 'firebase_uid', 'roles', 'panNumber', 'pan_number', 'bankAccountNumber', 'bank_account_number', 'upiId', 'gstin'];

test('lists exams with live and free test counts, publicly cacheable', async (t) => {
  const { get } = await api(t);
  const res = await get('/exams');
  assert.equal(res.status, 200);
  assert.match(res.cache, /^public/);
  // Ordered by category (SSC, Banking, Railways), then exam name.
  assert.deepEqual(res.body.items.map((e) => [e.slug, e.liveTestCount, e.freeTestCount]), [
    ['ssc-cgl', 6, 2], ['ibps-po', 3, 1], ['rrb-ntpc', 2, 1],
  ]);
  const exam = await get('/exams/ssc-cgl');
  assert.equal(exam.body.pattern.totalQuestions, 100);
  assert.equal(exam.body.pattern.sections.length, 4);
  assert.equal((await get(`/exams/${exam.body.id}`)).body.slug, 'ssc-cgl', 'id and slug both resolve');
});

test('paginates every live test exactly once and filters by exam, access, type and search', async (t) => {
  const { get } = await api(t);
  const seen = [];
  let cursor = '';
  do {
    const page = await get(`/tests?limit=4${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(page.status, 200);
    seen.push(...page.body.items.map((x) => x.slug));
    cursor = page.body.nextCursor;
  } while (cursor);
  assert.equal(seen.length, 11);
  assert.equal(new Set(seen).size, 11);
  assert.ok((await get('/tests?access=free')).body.items.every((x) => x.access === 'free' && x.pricePaise === 0));
  assert.ok((await get('/tests?exam=ibps-po&type=sectional')).body.items.every((x) => x.exam.slug === 'ibps-po' && x.type === 'sectional'));
  assert.deepEqual((await get('/tests?q=polity')).body.items.map((x) => x.slug), ['rrb-ga-sec']);
});

test('public payloads never carry questions, keys, solutions or examiner private fields', async (t) => {
  const { get } = await api(t);
  const testDetail = await get('/tests/cgl-mini-1');
  assert.equal(testDetail.body.sections.reduce((n, s) => n + s.questionCount, 0), 40);
  const series = await get('/series/cgl-sprint');
  const examiner = await get(`/examiners/${series.body.examiner.id}`);
  for (const res of [await get('/exams'), await get('/exams/ssc-cgl'), await get('/tests'), testDetail, series, examiner]) {
    assert.equal(res.status, 200);
    const leaked = [...keysOf(res.body)].filter((k) => FORBIDDEN.includes(k));
    assert.deepEqual(leaked, []);
  }
});

test('drafts, unapproved examiners and unpublished series stay hidden', async (t) => {
  const { db, get } = await api(t);
  const live = (await get('/tests/cgl-mini-1')).body;
  const ids = (await db.owner.query('SELECT exam_id, stage_id, template_id FROM tests WHERE id = $1', [live.id])).rows[0];
  await db.owner.query(
    `INSERT INTO tests (exam_id, stage_id, template_id, examiner_id, title, slug, total_questions, total_duration_seconds, total_marks)
     VALUES ($1, $2, $3, $4, 'Unreleased draft', 'unreleased-draft', 10, 600, 20)`,
    [ids.exam_id, ids.stage_id, ids.template_id, live.examiner.id],
  );
  assert.equal((await get('/tests/unreleased-draft')).status, 404);
  assert.ok(!(await get('/tests?limit=50')).body.items.some((x) => x.slug === 'unreleased-draft'));

  await db.owner.query("UPDATE test_series SET is_published = false WHERE slug = 'cgl-sprint'");
  assert.equal((await get('/series/cgl-sprint')).status, 404);

  await db.owner.query("UPDATE examiner_profiles SET onboarding_status = 'suspended' WHERE user_id = $1", [live.examiner.id]);
  assert.equal((await get(`/examiners/${live.examiner.id}`)).status, 404);
  assert.equal((await get('/tests/cgl-mini-1')).status, 404);
  assert.ok((await get('/tests?limit=50')).body.items.every((x) => x.examiner.id !== live.examiner.id));
});

test('rejects malformed ids, cursors, limits and unknown query fields', async (t) => {
  const { get } = await api(t);
  for (const path of ['/tests?limit=0', '/tests?limit=51', '/tests?cursor=not-a-cursor', '/tests?sort=price', '/examiners/ssc-cgl', "/tests/x'--"]) {
    const res = await get(path);
    assert.deepEqual([path, res.status, res.body.error.code], [path, 400, 'VALIDATION_FAILED']);
  }
  assert.equal((await get('/tests/does-not-exist')).body.error.code, 'NOT_FOUND');
});

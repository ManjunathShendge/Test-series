import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDatabase } from '../../dist/index.js';
import { migrateDatabase } from '../../dist/migrate.js';

// Real PostgreSQL (pnpm services:up). Missing configuration fails rather than skips.
const adminUrl = process.env.MIGRATION_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
assert.ok(adminUrl && appUrl && workerUrl, 'MIGRATION_DATABASE_URL, DATABASE_URL and WORKER_DATABASE_URL are required; run pnpm setup');
const grants = readFileSync(new URL('../../../../docker/postgres/init/002-grants.sql', import.meta.url), 'utf8');
const withDatabase = (url, name) => { const u = new URL(url); u.pathname = `/${name}`; return u.href; };

/** Isolated, migrated database per test with the same role grants as local Docker. */
export async function fixture(t) {
  const name = `exam_test_${randomBytes(6).toString('hex')}`;
  const admin = createDatabase(adminUrl, { max: 1 });
  await admin.query(`CREATE DATABASE ${name}`);
  const owner = createDatabase(withDatabase(adminUrl, name), { max: 4 });
  await owner.query(grants);
  await migrateDatabase(withDatabase(adminUrl, name));
  const app = createDatabase(withDatabase(appUrl, name), { max: 8 });
  const worker = createDatabase(withDatabase(workerUrl, name), { max: 4 });
  t.after(async () => {
    await app.end(); await worker.end(); await owner.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`); await admin.end();
  });
  return { owner, app, worker, url: withDatabase(adminUrl, name), appUrl: withDatabase(appUrl, name) };
}

/** Creates a profile through the sign-in function, optionally with extra roles (set by the owner). */
export async function profile(db, owner, roles = ['student']) {
  const uid = `firebase-${randomUUID()}`;
  const { rows } = await db.query('SELECT ensure_profile_for_firebase_user($1, $2, $3) AS id', [uid, `${uid}@example.test`, 'Synthetic User']);
  if (roles.join() !== 'student') await owner.query('UPDATE profiles SET roles = $2::user_role_type[] WHERE id = $1', [rows[0].id, roles]);
  return rows[0].id;
}

/** Category > exam > stage, subject > topic, and a one-section template (owner = admin setup). */
export async function seedExam(owner) {
  const q = async (sql, params) => (await owner.query(sql, params)).rows[0].id;
  const tag = randomUUID().slice(0, 8);
  const category = await q("INSERT INTO exam_categories (name, slug) VALUES ($1, $1) RETURNING id", [`SSC-${tag}`]);
  const exam = await q("INSERT INTO exams (category_id, name, slug) VALUES ($1, 'SSC CGL', $2) RETURNING id", [category, `ssc-cgl-${tag}`]);
  const stage = await q("INSERT INTO exam_stages (exam_id, name, slug) VALUES ($1, 'Tier 1', 'tier-1') RETURNING id", [exam]);
  const subject = await q("INSERT INTO subjects (exam_id, name) VALUES ($1, 'Quantitative Aptitude') RETURNING id", [exam]);
  const topic = await q("INSERT INTO topics (subject_id, name) VALUES ($1, 'Percentages') RETURNING id", [subject]);
  const template = await q("INSERT INTO exam_templates (exam_id, stage_id, name, total_questions, total_duration_seconds) VALUES ($1, $2, 'Full Length Mock', 2, 600) RETURNING id", [exam, stage]);
  const templateSection = await q("INSERT INTO exam_template_sections (template_id, subject_id, name, section_order, question_count, positive_marks, negative_marks) VALUES ($1, $2, 'Quant', 1, 2, 2, 0.5) RETURNING id", [template, subject]);
  return { category, exam, stage, subject, topic, template, templateSection };
}

/** An examiner profile with an accepted agreement. */
export async function examiner(app, owner) {
  const id = await profile(app, owner, ['student', 'examiner']);
  await owner.query("INSERT INTO examiner_profiles (user_id, agreement_version, agreement_accepted_at) VALUES ($1, 'v1', now())", [id]);
  return id;
}

/** Inserts a question; `db` decides which identity and policies apply. */
export async function question(db, exam, examinerId, stem = `What is ${randomUUID()}% of 200?`, extra = {}) {
  const cols = { exam_id: exam.exam, examiner_id: examinerId, subject_id: exam.subject, topic_id: exam.topic, stem_en: stem,
    options: JSON.stringify([{ id: 'A', text_en: '10' }, { id: 'B', text_en: '20' }]), correct_option: 'B', solution_en: 'Because.',
    norm_stem_en: stem.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ''), text_hash: randomUUID(), masked_hash: randomUUID(), ...extra };
  const keys = Object.keys(cols);
  const { rows } = await db.query(`INSERT INTO questions (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, Object.values(cols));
  return rows[0].id;
}

/** A draft test with one section, owned by the examiner. */
export async function draftTest(db, exam, examinerId) {
  const tag = randomUUID().slice(0, 8);
  const test = (await db.query(`INSERT INTO tests (exam_id, stage_id, template_id, examiner_id, title, slug, total_questions, total_duration_seconds, total_marks, price_paise)
    VALUES ($1, $2, $3, $4, 'Mock 1', $5, 2, 600, 4, 4900) RETURNING id`, [exam.exam, exam.stage, exam.template, examinerId, `mock-${tag}`])).rows[0].id;
  const section = (await db.query(`INSERT INTO test_sections (test_id, template_section_id, name, section_order, question_count, positive_marks, negative_marks)
    VALUES ($1, $2, 'Quant', 1, 2, 2, 0.5) RETURNING id`, [test, exam.templateSection])).rows[0].id;
  return { test, section };
}

/** A live two-question test with approved questions (set up by the owner as system/admin). */
export async function liveTest(owner, exam, examinerId) {
  const { test, section } = await draftTest(owner, exam, examinerId);
  const items = [];
  for (const order of [1, 2]) {
    const q = await question(owner, exam, examinerId);
    await owner.query('UPDATE questions SET is_approved_in_corpus = true WHERE id = $1', [q]);
    const tq = (await owner.query('INSERT INTO test_questions (test_id, section_id, question_id, display_order, positive_marks, negative_marks) VALUES ($1, $2, $3, $4, 2, 0.5) RETURNING id', [test, section, q, order])).rows[0].id;
    items.push({ question: q, testQuestion: tq });
  }
  await owner.query("UPDATE tests SET status = 'approved' WHERE id = $1", [test]);
  await owner.query("UPDATE tests SET status = 'live', published_at = now() WHERE id = $1", [test]);
  return { test, section, items };
}

/** Starts an attempt as the student, with the server-computed deadline. */
export async function startAttempt(client, studentId, testId, expiresInSeconds = 600) {
  const { rows } = await client.query(`INSERT INTO student_attempts (student_id, test_id, server_expires_at, remaining_seconds_at_last_sync, total_questions)
    VALUES ($1, $2, now() + make_interval(secs => $3), $3, 2) RETURNING id`, [studentId, testId, expiresInSeconds]);
  return rows[0].id;
}

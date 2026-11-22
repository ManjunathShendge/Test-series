import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withUser } from '../../dist/index.js';
import { draftTest, examiner, fixture, profile, seedExam } from './fixture.mjs';

/** A draft template with one section for the seeded exam. */
async function draftTemplate(owner, exam, name = 'Draft pattern') {
  const id = (await owner.query(
    "INSERT INTO exam_templates (exam_id, stage_id, name, total_questions, total_duration_seconds) VALUES ($1, $2, $3, 2, 600) RETURNING id",
    [exam.exam, exam.stage, name],
  )).rows[0].id;
  await owner.query("INSERT INTO exam_template_sections (template_id, subject_id, name, section_order, question_count, positive_marks, negative_marks) VALUES ($1, $2, 'Quant', 1, 2, 2, 0.5)", [id, exam.subject]);
  return id;
}

test('drafts are editable; published templates and their sections are frozen except availability', async (t) => {
  const { owner } = await fixture(t);
  const exam = await seedExam(owner);
  const draft = await draftTemplate(owner, exam);
  await owner.query('UPDATE exam_templates SET total_questions = 3 WHERE id = $1', [draft]);
  await owner.query('UPDATE exam_template_sections SET question_count = 3 WHERE template_id = $1', [draft]);
  await assert.rejects(owner.query("INSERT INTO exam_template_sections (template_id, name, section_order, question_count, positive_marks, negative_marks) VALUES ($1, 'Dup', 1, 1, 1, 0)", [draft]), /duplicate key/);

  await owner.query('UPDATE exam_templates SET published_at = now() WHERE id = $1', [draft]);
  await assert.rejects(owner.query('UPDATE exam_templates SET total_questions = 4 WHERE id = $1', [draft]), /published template cannot be changed/);
  await assert.rejects(owner.query('UPDATE exam_templates SET published_at = NULL WHERE id = $1', [draft]), /published template cannot be changed/);
  await assert.rejects(owner.query('UPDATE exam_template_sections SET question_count = 4 WHERE template_id = $1', [draft]), /Sections of a published template/);
  await assert.rejects(owner.query('DELETE FROM exam_template_sections WHERE template_id = $1', [draft]), /Sections of a published template/);
  await assert.rejects(owner.query("INSERT INTO exam_template_sections (template_id, name, section_order, question_count, positive_marks, negative_marks) VALUES ($1, 'More', 2, 1, 1, 0)", [draft]), /Sections of a published template/);
  await assert.rejects(owner.query('DELETE FROM exam_templates WHERE id = $1', [draft]), /published template cannot be changed/);
  // Deleting the exam or stage would cascade into a published template: refused.
  await assert.rejects(owner.query('DELETE FROM exam_stages WHERE id = $1', [exam.stage]), /published template|foreign key/);
  // Retire and reinstate are allowed.
  await owner.query('UPDATE exam_templates SET is_active = false WHERE id = $1', [draft]);
  await owner.query('UPDATE exam_templates SET is_active = true WHERE id = $1', [draft]);

  // A draft can still be deleted, sections and all.
  const other = await draftTemplate(owner, exam, 'Throwaway');
  await owner.query('DELETE FROM exam_templates WHERE id = $1', [other]);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM exam_template_sections WHERE template_id = $1', [other])).rows[0].n, 0);
});

test('templates and sections stay inside their exam', async (t) => {
  const { owner } = await fixture(t);
  const a = await seedExam(owner);
  const b = await seedExam(owner);
  await assert.rejects(
    owner.query("INSERT INTO exam_templates (exam_id, stage_id, name, total_questions, total_duration_seconds) VALUES ($1, $2, 'Wrong stage', 1, 600)", [a.exam, b.stage]),
    /stage must belong/,
  );
  const draft = await draftTemplate(owner, a);
  await assert.rejects(
    owner.query("INSERT INTO exam_template_sections (template_id, subject_id, name, section_order, question_count, positive_marks, negative_marks) VALUES ($1, $2, 'X', 2, 1, 1, 0)", [draft, b.subject]),
    /subject must belong/,
  );
});

test('tests are built only on a published, available template of the same exam and stage', async (t) => {
  const { owner, app } = await fixture(t);
  const exam = await seedExam(owner);
  const author = await examiner(app, owner);
  await draftTest(owner, exam, author); // fixture template is published

  const draft = await draftTemplate(owner, exam);
  const insert = (template) => owner.query(
    `INSERT INTO tests (exam_id, stage_id, template_id, examiner_id, title, slug, total_questions, total_duration_seconds, total_marks, price_paise)
     VALUES ($1, $2, $3, $4, 'T', $5, 2, 600, 4, 0)`, [exam.exam, exam.stage, template, author, `t-${Math.random().toString(36).slice(2)}`]);
  await assert.rejects(insert(draft), /published, available template/);
  await owner.query('UPDATE exam_templates SET is_active = false WHERE id = $1', [exam.template]);
  await assert.rejects(insert(exam.template), /published, available template/);
  // Existing tests keep their (now retired) template.
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM tests WHERE template_id = $1', [exam.template])).rows[0].n, 1);
});

test('only admins write the hierarchy, and every admin change is audited', async (t) => {
  const { owner, app } = await fixture(t);
  const exam = await seedExam(owner);
  const student = await profile(app, owner);
  const reviewer = await profile(app, owner, ['student', 'qc_reviewer']);
  const admin = await profile(app, owner, ['student', 'admin']);
  for (const who of [student, reviewer]) {
    await assert.rejects(withUser(app, who, (c) => c.query("INSERT INTO exam_categories (name, slug) VALUES ('X', 'x')")), /managed by the server/);
    await assert.rejects(withUser(app, who, (c) => c.query("UPDATE exams SET name = 'Hacked' WHERE id = $1", [exam.exam])), /managed by the server/);
    await assert.rejects(withUser(app, who, (c) => c.query("INSERT INTO topics (subject_id, name) VALUES ($1, 'New')", [exam.subject])), /managed by the server/);
  }
  const before = (await owner.query('SELECT count(*)::int AS n FROM admin_audit_logs')).rows[0].n;
  await withUser(app, admin, async (c) => {
    await c.query("SELECT set_config('app.audit_action', 'catalogue.exam.update', true)");
    await c.query("UPDATE exams SET name = 'SSC CGL 2027' WHERE id = $1", [exam.exam]);
  });
  const rows = (await owner.query('SELECT admin_id, action_name, target_table, target_record_id, before_state->>\'name\' AS was, after_state->>\'name\' AS now FROM admin_audit_logs ORDER BY created_at DESC LIMIT 1')).rows;
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM admin_audit_logs')).rows[0].n, before + 1);
  assert.deepEqual(rows[0], { admin_id: admin, action_name: 'catalogue.exam.update', target_table: 'exams', target_record_id: exam.exam, was: 'SSC CGL', now: 'SSC CGL 2027' });
});

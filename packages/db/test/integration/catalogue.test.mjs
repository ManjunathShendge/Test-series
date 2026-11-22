import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withUser } from '../../dist/index.js';
import { fixture, profile, seedExam, examiner, question, draftTest } from './fixture.mjs';

test('exam hierarchy, syllabus and templates enforce uniqueness and references', async (t) => {
  const { owner } = await fixture(t);
  const exam = await seedExam(owner);
  await assert.rejects(owner.query("INSERT INTO exam_stages (exam_id, name, slug) VALUES ($1, 'Again', 'tier-1')", [exam.exam]), /duplicate key/);
  await assert.rejects(owner.query("INSERT INTO topics (subject_id, name) VALUES ($1, 'Percentages')", [exam.subject]), /duplicate key/);
  await assert.rejects(owner.query("INSERT INTO exam_template_sections (template_id, name, section_order, question_count, positive_marks, negative_marks) VALUES ($1, 'Dup', 1, 1, 1, 0)", [exam.template]), /published template/);
  await assert.rejects(owner.query('DELETE FROM exam_categories WHERE id = $1', [exam.category]), /foreign key/);
  const defaults = (await owner.query('SELECT pyq_max_percentage, trigram_high_threshold, price_band_max_new_paise FROM exams WHERE id = $1', [exam.exam])).rows[0];
  assert.deepEqual(defaults, { pyq_max_percentage: '10.00', trigram_high_threshold: '0.750', price_band_max_new_paise: 4900 });
});

test('examiners see and edit only their own questions; QC reviewers and admins see all', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner); const bob = await examiner(app, owner);
  const reviewer = await profile(app, owner, ['qc_reviewer']);
  const q1 = await withUser(app, alice, (c) => question(c, exam, alice));
  await withUser(app, bob, (c) => question(c, exam, bob));
  await assert.rejects(withUser(app, alice, (c) => question(c, exam, bob)), /row-level security/);
  const count = (id) => withUser(app, id, (c) => c.query('SELECT count(*)::int AS n FROM questions')).then((r) => r.rows[0].n);
  assert.equal(await count(alice), 1);
  assert.equal(await count(reviewer), 2);
  assert.equal((await app.query('SELECT count(*)::int AS n FROM questions')).rows[0].n, 0, 'no user context sees nothing');
  assert.equal((await withUser(app, bob, (c) => c.query("UPDATE questions SET stem_en = 'x' WHERE id = $1", [q1]))).rowCount, 0);
});

test('examiners cannot approve, unhide or forge AI output; QC reviewers can approve', async (t) => {
  const { app, owner, worker } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const reviewer = await profile(app, owner, ['qc_reviewer']);
  await assert.rejects(withUser(app, alice, (c) => question(c, exam, alice, undefined, { is_approved_in_corpus: true })), /Only QC reviewers and admins/);
  await assert.rejects(withUser(app, alice, (c) => question(c, exam, alice, undefined, { ai_suggestion: '{"blind_solve_key":"B"}' })), /system-managed/);
  const q = await withUser(app, alice, (c) => question(c, exam, alice));
  for (const change of ['is_approved_in_corpus = true', 'is_auto_hidden = true', 'open_report_count = 3', `ai_suggestion = '{"x":1}'`, 'total_attempts = 9']) {
    await assert.rejects(withUser(app, alice, (c) => c.query(`UPDATE questions SET ${change} WHERE id = $1`, [q])), /Only QC reviewers and admins|system-managed/, change);
  }
  await worker.query(`UPDATE questions SET ai_suggestion = '{"blind_solve_key":"A","answer_differs":true}' WHERE id = $1`, [q]);
  await withUser(app, reviewer, (c) => c.query('UPDATE questions SET is_approved_in_corpus = true WHERE id = $1', [q]));
  const row = (await owner.query('SELECT is_approved_in_corpus, correct_option, ai_suggestion FROM questions WHERE id = $1', [q])).rows[0];
  // The AI rule: the suggestion never changed the key.
  assert.deepEqual([row.is_approved_in_corpus, row.correct_option, row.ai_suggestion.blind_solve_key], [true, 'B', 'A']);
});

test('approved questions are immutable and undeletable; corrections are new versions; stats stay writable', async (t) => {
  const { app, owner, worker } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const q = await question(owner, exam, alice);
  await owner.query('UPDATE questions SET is_approved_in_corpus = true WHERE id = $1', [q]);
  for (const change of ["correct_option = 'A'", "stem_en = 'changed'", "solution_hi = 'नया'", 'is_approved_in_corpus = false']) {
    await assert.rejects(owner.query(`UPDATE questions SET ${change} WHERE id = $1`, [q]), /immutable/, change);
  }
  await assert.rejects(owner.query('DELETE FROM questions WHERE id = $1', [q]), /cannot be deleted/);
  await worker.query('UPDATE questions SET total_attempts = 4, correct_attempts = 3 WHERE id = $1', [q]);
  assert.equal((await owner.query('SELECT pct_correct FROM questions WHERE id = $1', [q])).rows[0].pct_correct, '75.00');
  const v2 = await question(owner, exam, alice, undefined, { parent_question_id: q, version_number: 2, correct_option: 'A' });
  await assert.rejects(question(owner, exam, alice, undefined, { parent_question_id: q, version_number: 2 }), /duplicate key/);
  assert.equal((await owner.query('SELECT correct_option FROM questions WHERE id = $1', [v2])).rows[0].correct_option, 'A');
});

test('trigram similarity finds near-duplicate stems within an exam', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  await question(owner, exam, alice, 'What is 25% of 480 rupees?');
  await question(owner, exam, alice, 'Name the capital city of Rajasthan state');
  const { rows } = await owner.query(`SELECT stem_en, round(similarity(norm_stem_en, $2)::numeric, 3) AS s FROM questions
    WHERE exam_id = $1 AND similarity(norm_stem_en, $2) >= 0.55 ORDER BY s DESC`, [exam.exam, 'what is 25 of 480 rupees']);
  assert.equal(rows.length, 1);
  assert.match(rows[0].stem_en, /480/);
});

test('examiners move their tests only from draft to submitted; they cannot publish or change price after', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner); const bob = await examiner(app, owner);
  const admin = await profile(app, owner, ['admin']);
  const { test: id } = await withUser(app, alice, (c) => draftTest(c, exam, alice));
  const asAlice = (sql) => withUser(app, alice, (c) => c.query(sql, [id]));
  await assert.rejects(asAlice("UPDATE tests SET status = 'live' WHERE id = $1"), /row-level security/);
  await assert.rejects(asAlice("UPDATE tests SET status = 'approved' WHERE id = $1"), /row-level security/);
  await asAlice('UPDATE tests SET price_paise = 3900 WHERE id = $1');
  await asAlice("UPDATE tests SET status = 'submitted' WHERE id = $1");
  assert.equal((await asAlice('UPDATE tests SET price_paise = 100 WHERE id = $1')).rowCount, 0, 'no edits after submission');
  assert.equal((await withUser(app, bob, (c) => c.query("UPDATE tests SET title = 'x' WHERE id = $1", [id]))).rowCount, 0);
  // Students browse only scheduled/live tests; the owner still sees their own submitted test.
  const student = await profile(app, owner);
  const visible = (who) => withUser(app, who, (c) => c.query('SELECT count(*)::int AS n FROM tests')).then((r) => r.rows[0].n);
  assert.equal(await visible(student), 0);
  assert.equal(await visible(alice), 1);
  await withUser(app, admin, (c) => c.query("UPDATE tests SET status = 'approved' WHERE id = $1", [id]));
  await withUser(app, admin, (c) => c.query("UPDATE tests SET status = 'live', published_at = now() WHERE id = $1", [id]));
  assert.equal(await visible(student), 1);
  const found = await withUser(app, student, (c) => c.query("SELECT id FROM tests WHERE search_vector @@ plainto_tsquery('english', 'mock')"));
  assert.equal(found.rowCount, 1);
});

test('published tests are versioned, not edited: content, structure and status history are frozen', async (t) => {
  const { app, owner, worker } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const { test: id, section } = await draftTest(owner, exam, alice);
  const q = await question(owner, exam, alice);
  await owner.query('INSERT INTO test_questions (test_id, section_id, question_id, display_order, positive_marks, negative_marks) VALUES ($1, $2, $3, 1, 2, 0.5)', [id, section, q]);
  await owner.query("UPDATE tests SET status = 'approved' WHERE id = $1", [id]);
  await owner.query("UPDATE tests SET status = 'live' WHERE id = $1", [id]);
  for (const change of ['price_paise = 100', "title = 'Renamed'", 'total_marks = 10', "status = 'draft'", "status = 'approved'"]) {
    await assert.rejects(owner.query(`UPDATE tests SET ${change} WHERE id = $1`, [id]), /versioned, not edited|Invalid status change/, change);
  }
  await assert.rejects(owner.query('DELETE FROM tests WHERE id = $1', [id]), /cannot be deleted/);
  await assert.rejects(owner.query('UPDATE test_sections SET question_count = 5 WHERE test_id = $1', [id]), /versioned, not edited/);
  await assert.rejects(owner.query('DELETE FROM test_questions WHERE test_id = $1', [id]), /versioned, not edited/);
  await worker.query('UPDATE tests SET attempts_count = 12, avg_score = 3.5 WHERE id = $1', [id]);
  await owner.query("UPDATE tests SET status = 'archived' WHERE id = $1", [id]);
  // A correction is a new version that points at its parent.
  const v2 = (await draftTest(owner, exam, alice)).test;
  await owner.query('UPDATE tests SET parent_test_id = $2, version_number = 2 WHERE id = $1', [v2, id]);
  assert.equal((await owner.query('SELECT version_number FROM tests WHERE parent_test_id = $1', [id])).rows[0].version_number, 2);
});

test('questions approved by QC stay locked while the examiner revises the rest', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const reviewer = await profile(app, owner, ['qc_reviewer']);
  const { test: id, section } = await withUser(app, alice, (c) => draftTest(c, exam, alice));
  const [q1, q2, q3] = await withUser(app, alice, async (c) => [await question(c, exam, alice), await question(c, exam, alice), await question(c, exam, alice)]);
  const add = (who, qid, order, extra = '') => withUser(app, who, (c) => c.query(`INSERT INTO test_questions (test_id, section_id, question_id, display_order, positive_marks, negative_marks${extra ? ', is_locked_by_qc' : ''}) VALUES ($1, $2, $3, $4, 2, 0.5${extra ? ', true' : ''}) RETURNING id`, [id, section, qid, order]));
  const tq1 = (await add(alice, q1, 1)).rows[0].id;
  const tq2 = (await add(alice, q2, 2)).rows[0].id;
  await assert.rejects(add(alice, q3, 3, 'locked'), /Only QC reviewers and admins set QC state/);
  await owner.query("UPDATE tests SET status = 'changes_requested' WHERE id = $1", [id]);
  await withUser(app, reviewer, (c) => c.query("UPDATE test_questions SET qc_status = 'approve', is_locked_by_qc = true WHERE id = $1", [tq1]));
  await withUser(app, reviewer, (c) => c.query("UPDATE test_questions SET qc_status = 'request_change' WHERE id = $1", [tq2]));
  const asAlice = (sql, p) => withUser(app, alice, (c) => c.query(sql, p));
  await assert.rejects(asAlice('DELETE FROM test_questions WHERE id = $1', [tq1]), /locked during revisions/);
  await assert.rejects(asAlice('UPDATE test_questions SET question_id = $2 WHERE id = $1', [tq1, q3]), /locked during revisions/);
  await assert.rejects(asAlice('UPDATE test_questions SET is_locked_by_qc = false WHERE id = $1', [tq1]), /locked during revisions|Only QC reviewers/);
  await asAlice('UPDATE test_questions SET question_id = $2 WHERE id = $1', [tq2, q3]);
});

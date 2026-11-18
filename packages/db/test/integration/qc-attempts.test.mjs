import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withUser } from '../../dist/index.js';
import { fixture, profile, seedExam, examiner, question, draftTest, liveTest, startAttempt } from './fixture.mjs';

test('QC queue orders by flag count then SLA; SLA defaults are 48h (review) and 72h (reports)', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const reviewer = await profile(app, owner, ['qc_reviewer']);
  await owner.query('INSERT INTO qc_reviewer_mappings (reviewer_id, exam_id, subject_id) VALUES ($1, $2, $3)', [reviewer, exam.exam, exam.subject]);
  await assert.rejects(owner.query('INSERT INTO qc_reviewer_mappings (reviewer_id, exam_id, subject_id) VALUES ($1, $2, $3)', [reviewer, exam.exam, exam.subject]), /duplicate key/);
  const ids = [];
  for (const flags of [1, 5, 3]) {
    const { test: id } = await draftTest(owner, exam, alice);
    ids.push((await owner.query('INSERT INTO qc_reviews (test_id, flag_count) VALUES ($1, $2) RETURNING id, extract(epoch FROM sla_deadline_at - created_at)::int AS sla', [id, flags])).rows[0]);
  }
  assert.equal(ids[0].sla, 48 * 3600);
  const queue = (await owner.query("SELECT flag_count FROM qc_reviews WHERE status = 'in_qc' ORDER BY flag_count DESC, sla_deadline_at ASC")).rows.map((r) => r.flag_count);
  assert.deepEqual(queue, [5, 3, 1]);
  const { test: live, items } = await liveTest(owner, exam, alice);
  const student = await profile(app, owner);
  const report = (await withUser(app, student, (c) => c.query("INSERT INTO question_reports (question_id, test_id, student_id, reason) VALUES ($1, $2, $3, 'wrong_answer') RETURNING extract(epoch FROM examiner_sla_deadline_at - created_at)::int AS sla", [items[0].question, live, student]))).rows[0];
  assert.equal(report.sla, 72 * 3600);
});

test('five distinct student reports auto-hide an approved question; duplicates and direct edits do not count', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const { test: live, items } = await liveTest(owner, exam, alice);
  const q = items[0].question;
  const students = [];
  for (let i = 0; i < 5; i++) students.push(await profile(app, owner));
  const report = (s) => withUser(app, s, (c) => c.query("INSERT INTO question_reports (question_id, test_id, student_id, reason) VALUES ($1, $2, $3, 'ambiguous')", [q, live, s]));
  for (const s of students.slice(0, 4)) await report(s);
  await assert.rejects(report(students[0]), /duplicate key/);
  let row = (await owner.query('SELECT open_report_count, is_auto_hidden FROM questions WHERE id = $1', [q])).rows[0];
  assert.deepEqual([row.open_report_count, row.is_auto_hidden], [4, false]);
  // A student cannot moderate directly, even on their own transaction.
  const direct = await withUser(app, students[0], (c) => c.query('UPDATE questions SET open_report_count = 0 WHERE id = $1', [q]));
  assert.equal(direct.rowCount, 0, 'students cannot see raw questions');
  await assert.rejects(withUser(app, alice, (c) => c.query('UPDATE questions SET open_report_count = 0 WHERE id = $1', [q])), /Only QC reviewers and admins/);
  await report(students[4]);
  row = (await owner.query('SELECT open_report_count, is_auto_hidden, correct_option FROM questions WHERE id = $1', [q])).rows[0];
  assert.deepEqual([row.open_report_count, row.is_auto_hidden, row.correct_option], [5, true, 'B']);
});

test('key corrections are recorded as new versions, never by editing the approved question', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const admin = await profile(app, owner, ['admin']);
  const { test: live, items } = await liveTest(owner, exam, alice);
  const old = items[0].question;
  await assert.rejects(owner.query("UPDATE questions SET correct_option = 'A' WHERE id = $1", [old]), /immutable/);
  const v2 = await question(owner, exam, alice, undefined, { parent_question_id: old, version_number: 2, correct_option: 'A' });
  await owner.query("INSERT INTO question_key_corrections (test_id, old_question_id, new_question_id, old_correct_option, new_correct_option, corrected_by, reason) VALUES ($1, $2, $3, 'B', 'A', $4, 'Key verified wrong')", [live, old, v2, admin]);
  await assert.rejects(owner.query("UPDATE question_key_corrections SET new_correct_option = 'C'"), /append-only/);
  await assert.rejects(owner.query('DELETE FROM question_key_corrections'), /append-only/);
  await assert.rejects(owner.query("INSERT INTO question_key_corrections (test_id, old_question_id, new_question_id, old_correct_option, new_correct_option, corrected_by, reason) VALUES ($1, $2, $2, 'B', 'A', $3, 'x')", [live, old, admin]), /check constraint/);
});

test('students see and change only their own attempts and answers; admins see all', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const { test: live, section, items } = await liveTest(owner, exam, alice);
  const s1 = await profile(app, owner); const s2 = await profile(app, owner);
  const admin = await profile(app, owner, ['admin']);
  const a1 = await withUser(app, s1, (c) => startAttempt(c, s1, live));
  await withUser(app, s2, (c) => startAttempt(c, s2, live));
  await assert.rejects(withUser(app, s1, (c) => startAttempt(c, s2, live)), /row-level security/);
  const count = (who, table) => withUser(app, who, (c) => c.query(`SELECT count(*)::int AS n FROM ${table}`)).then((r) => r.rows[0].n);
  assert.equal(await count(s1, 'student_attempts'), 1);
  assert.equal(await count(admin, 'student_attempts'), 2);
  await withUser(app, s1, (c) => c.query("INSERT INTO student_attempt_answers (attempt_id, test_question_id, question_id, section_id, palette_state, selected_option) VALUES ($1, $2, $3, $4, 'answered', 'B')", [a1, items[0].testQuestion, items[0].question, section]));
  assert.equal(await count(s2, 'student_attempt_answers'), 0);
  assert.equal((await withUser(app, s2, (c) => c.query("UPDATE student_attempt_answers SET selected_option = 'A'"))).rowCount, 0);
  // Answer sync is an idempotent upsert per (attempt, question).
  await withUser(app, s1, (c) => c.query(`INSERT INTO student_attempt_answers (attempt_id, test_question_id, question_id, section_id, palette_state, selected_option)
    VALUES ($1, $2, $3, $4, 'answered_and_marked', 'A') ON CONFLICT (attempt_id, question_id) DO UPDATE SET selected_option = EXCLUDED.selected_option, palette_state = EXCLUDED.palette_state`, [a1, items[0].testQuestion, items[0].question, section]));
  const answer = (await owner.query('SELECT selected_option, palette_state FROM student_attempt_answers WHERE attempt_id = $1', [a1])).rows;
  assert.deepEqual(answer, [{ selected_option: 'A', palette_state: 'answered_and_marked' }]);
});

test('students cannot change timers, scores or evaluation; the server can', async (t) => {
  const { app, owner, worker } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const { test: live, section, items } = await liveTest(owner, exam, alice);
  const s1 = await profile(app, owner);
  const a1 = await withUser(app, s1, (c) => startAttempt(c, s1, live));
  const asStudent = (sql, p = [a1]) => withUser(app, s1, (c) => c.query(sql, p));
  for (const change of ['total_score = 100', "server_expires_at = server_expires_at + interval '1 hour'", 'rank = 1', 'is_qualified_pass_attempt = true', "status = 'timed_out'"]) {
    await assert.rejects(asStudent(`UPDATE student_attempts SET ${change} WHERE id = $1`), /server-managed|Only the server/, change);
  }
  await assert.rejects(withUser(app, s1, (c) => c.query(`INSERT INTO student_attempts (student_id, test_id, server_expires_at, remaining_seconds_at_last_sync, total_questions, total_score)
    VALUES ($1, $2, now() + interval '10 minutes', 600, 2, 8)`, [s1, live])), /server-managed/);
  await assert.rejects(asStudent("INSERT INTO student_attempt_answers (attempt_id, test_question_id, question_id, section_id, selected_option, is_correct, marks_awarded) VALUES ($1, $2, $3, $4, 'B', true, 2)", [a1, items[0].testQuestion, items[0].question, section]), /server-managed/);
  // Allowed for the student: progress, palette, app switches, submission.
  await asStudent('UPDATE student_attempts SET remaining_seconds_at_last_sync = 300, app_switch_count = 1, current_question_id = $2 WHERE id = $1', [a1, items[1].question]);
  await asStudent("UPDATE student_attempts SET status = 'submitted', submitted_at = now() WHERE id = $1");
  await assert.rejects(asStudent("UPDATE student_attempts SET status = 'in_progress', submitted_at = NULL WHERE id = $1"), /cannot be reopened/);
  // The worker scores it.
  await worker.query('UPDATE student_attempts SET total_score = 3.5, correct_count = 2, rank = 1, percentile = 100 WHERE id = $1', [a1]);
  assert.equal((await owner.query('SELECT total_score FROM student_attempts WHERE id = $1', [a1])).rows[0].total_score, '3.50');
});

test('answers are rejected after submission or after the server deadline, and cannot be deleted', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const { test: live, section, items } = await liveTest(owner, exam, alice);
  const s1 = await profile(app, owner); const s2 = await profile(app, owner);
  const answer = (who, attempt, option = 'B') => withUser(app, who, (c) => c.query(`INSERT INTO student_attempt_answers (attempt_id, test_question_id, question_id, section_id, selected_option)
    VALUES ($1, $2, $3, $4, $5) ON CONFLICT (attempt_id, question_id) DO UPDATE SET selected_option = EXCLUDED.selected_option`, [attempt, items[0].testQuestion, items[0].question, section, option]));
  const expired = await withUser(app, s1, (c) => startAttempt(c, s1, live, -1));
  await assert.rejects(answer(s1, expired), /closed for answers/);
  const open = await withUser(app, s2, (c) => startAttempt(c, s2, live));
  await answer(s2, open);
  await assert.rejects(withUser(app, s2, (c) => c.query('DELETE FROM student_attempt_answers WHERE attempt_id = $1', [open])), /cannot be deleted/);
  await withUser(app, s2, (c) => c.query("UPDATE student_attempts SET status = 'submitted', submitted_at = now() WHERE id = $1", [open]));
  await assert.rejects(answer(s2, open, 'A'), /closed for answers/);
  assert.equal((await owner.query('SELECT selected_option FROM student_attempt_answers WHERE attempt_id = $1', [open])).rows[0].selected_option, 'B');
});

test('bookmarks, mistake notebook and ratings keep one row per student', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const { test: live, items } = await liveTest(owner, exam, alice);
  const s1 = await profile(app, owner);
  await owner.query('INSERT INTO student_saved_questions (student_id, question_id, test_id, is_bookmarked) VALUES ($1, $2, $3, true)', [s1, items[0].question, live]);
  await assert.rejects(owner.query('INSERT INTO student_saved_questions (student_id, question_id) VALUES ($1, $2)', [s1, items[0].question]), /duplicate key/);
  await owner.query('INSERT INTO test_ratings (test_id, student_id, rating) VALUES ($1, $2, 5)', [live, s1]);
  await assert.rejects(owner.query('INSERT INTO test_ratings (test_id, student_id, rating) VALUES ($1, $2, 4)', [live, s1]), /duplicate key/);
  const s2 = await profile(app, owner);
  await assert.rejects(owner.query('INSERT INTO test_ratings (test_id, student_id, rating) VALUES ($1, $2, 6)', [live, s2]), /check constraint/);
});

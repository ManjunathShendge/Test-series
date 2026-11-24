import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withUser } from '../../dist/index.js';
import { fixture, profile, seedExam, examiner, question, draftTest, liveTest, startAttempt, openAnswers } from './fixture.mjs';

/** A purchase row written as the server (no user context). */
async function purchase(db, student, extra = {}) {
  const cols = { student_id: student, item_type: 'single_test', gross_amount_paise: 11800, taxable_amount_paise: 10000,
    gst_amount_paise: 1800, total_paid_paise: 11800, net_revenue_paise: 10000, status: 'captured', ...extra };
  const keys = Object.keys(cols);
  return (await db.query(`INSERT INTO purchases (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, Object.values(cols))).rows[0].id;
}

test('students create only their own pending orders; capture, entitlement and ledger are server-managed', async (t) => {
  const { app, owner, worker } = await fixture(t);
  const s1 = await profile(app, owner); const s2 = await profile(app, owner);
  // Every single-test purchase names its test (purchases_one_item, migration 016).
  const { test: item } = await liveTest(owner, await seedExam(owner), await examiner(app, owner));
  const order = (who, student, status = 'created', extra = {}) => withUser(app, who, (c) => purchase(c, student, { status, test_id: item, ...extra }));
  const id = await order(s1, s1, 'created', { razorpay_order_id: 'order_1' });
  await assert.rejects(order(s1, s2), /row-level security/);
  await assert.rejects(order(s1, s1, 'captured'), /row-level security/);
  assert.equal((await withUser(app, s1, (c) => c.query("UPDATE purchases SET status = 'captured' WHERE id = $1", [id]))).rowCount, 0);
  await worker.query("UPDATE purchases SET status = 'captured', razorpay_payment_id = 'pay_1', invoice_number = 'INV-2026-00001' WHERE id = $1", [id]);
  const seen = (who) => withUser(app, who, (c) => c.query('SELECT status FROM purchases')).then((r) => r.rows.map((x) => x.status));
  assert.deepEqual(await seen(s1), ['captured']);
  assert.deepEqual(await seen(s2), []);
  await assert.rejects(purchase(worker, s2, { test_id: item, razorpay_order_id: 'order_1' }), /duplicate key/);
  await purchase(worker, s2, { test_id: item, payment_channel: 'apple_iap', store_transaction_id: 'apple-1', store_product_id: 'test.4900', store_environment: 'sandbox' });
  await assert.rejects(purchase(worker, s2, { test_id: item, payment_channel: 'apple_iap', store_transaction_id: 'apple-1' }), /duplicate key/);
  await purchase(worker, s2, { test_id: item, payment_channel: 'google_play', play_purchase_token: 'tok-1', store_transaction_id: 'GPA.1' });
  await assert.rejects(purchase(worker, s2, { test_id: item, payment_channel: 'google_play', play_purchase_token: 'tok-1', store_transaction_id: 'GPA.2' }), /duplicate key/);

  await assert.rejects(withUser(app, s1, (c) => c.query("INSERT INTO student_entitlements (student_id, purchase_id, item_type) VALUES ($1, $2, 'single_test')", [s1, id])), /managed by the server/);
  await worker.query("INSERT INTO student_entitlements (student_id, purchase_id, item_type) VALUES ($1, $2, 'single_test')", [s1, id]);

  await worker.query("INSERT INTO billing_events (provider, provider_event_id, purchase_id, payload, verified_at) VALUES ('razorpay', 'evt_1', $1, '{}', now())", [id]);
  await assert.rejects(worker.query("INSERT INTO billing_events (provider, provider_event_id, purchase_id, payload, verified_at) VALUES ('razorpay', 'evt_1', $1, '{}', now())", [id]), /duplicate key/);
  await worker.query("INSERT INTO ledger_entries (purchase_id, entry_type, source_event, amount_paise) VALUES ($1, 'capture', 'razorpay:evt_1', 11800)", [id]);
  await assert.rejects(worker.query("INSERT INTO ledger_entries (purchase_id, entry_type, source_event, amount_paise) VALUES ($1, 'capture', 'razorpay:evt_1', 11800)", [id]), /duplicate key/);
  await assert.rejects(worker.query('UPDATE ledger_entries SET amount_paise = 0'), /append-only/);
  await assert.rejects(worker.query('DELETE FROM ledger_entries'), /append-only/);
  await assert.rejects(owner.query('TRUNCATE ledger_entries CASCADE'), /append-only/);
  await assert.rejects(withUser(app, s1, (c) => c.query("INSERT INTO ledger_entries (purchase_id, entry_type, source_event, amount_paise) VALUES ($1, 'adjustment', 'x', 1)", [id])), /managed by the server/);
});

test('every admin and reviewer change writes an audit row in the same transaction; student actions do not', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const admin = await profile(app, owner, ['admin']);
  const reviewer = await profile(app, owner, ['qc_reviewer']);
  const alice = await examiner(app, owner);
  await withUser(app, admin, async (c) => {
    await c.query("SELECT set_config('app.audit_action', 'CHANGE_PYQ_CAP', true)");
    await c.query('UPDATE exams SET pyq_max_percentage = 15 WHERE id = $1', [exam.exam]);
  });
  const q = await withUser(app, alice, (c) => question(c, exam, alice));
  await withUser(app, reviewer, (c) => c.query('UPDATE questions SET is_approved_in_corpus = true WHERE id = $1', [q]));
  const rows = (await owner.query('SELECT admin_id, action_name, target_table, target_record_id, before_state, after_state FROM admin_audit_logs ORDER BY created_at')).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].admin_id, rows[0].action_name, rows[0].target_record_id], [admin, 'CHANGE_PYQ_CAP', exam.exam]);
  assert.deepEqual([rows[0].before_state.pyq_max_percentage, rows[0].after_state.pyq_max_percentage], [10, 15]);
  assert.deepEqual([rows[1].admin_id, rows[1].action_name, rows[1].target_record_id], [reviewer, 'UPDATE questions', q]);
  // A failed admin change leaves no audit row behind.
  await assert.rejects(withUser(app, admin, async (c) => { await c.query('UPDATE exams SET pyq_max_percentage = 20 WHERE id = $1', [exam.exam]); throw new Error('rollback'); }), /rollback/);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM admin_audit_logs')).rows[0].n, 2);
});

test('duplicate check finds exact, PYQ, masked and trigram matches among approved questions of the same exam', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner); const bob = await examiner(app, owner);
  const approve = async (stem, extra) => { const id = await question(owner, exam, alice, stem, extra); await owner.query('UPDATE questions SET is_approved_in_corpus = true WHERE id = $1', [id]); return id; };
  const exact = await approve('What is 25% of 480 rupees?', { text_hash: 'h-exact', masked_hash: 'm-exact' });
  const pyq = await approve('Who wrote the Indian national anthem?', { text_hash: 'h-pyq', masked_hash: 'm-pyq', is_pyq: true, pyq_year: 2022 });
  await question(owner, exam, alice, 'Unapproved draft question about rivers', { text_hash: 'h-draft', masked_hash: 'm-draft' });
  const check = (who, examinerId, textHash, masked, stem) => withUser(app, who, (c) => c.query('SELECT * FROM run_question_duplicate_check($1, $2, $3, $4, $5)', [exam.exam, examinerId, textHash, masked, stem])).then((r) => r.rows);
  const byHash = await check(alice, alice, 'h-exact', 'x', 'zzz');
  assert.deepEqual([byHash[0].matched_question_id, byHash[0].match_kind, byHash[0].is_same_examiner], [exact, 'exact_hash', true]);
  assert.equal((await check(bob, bob, 'h-pyq', 'x', 'zzz'))[0].match_kind, 'pyq_match');
  assert.equal((await check(bob, bob, 'h-pyq', 'x', 'zzz'))[0].matched_question_id, pyq);
  assert.equal((await check(bob, bob, 'x', 'm-exact', 'zzz'))[0].match_kind, 'masked_hash');
  const fuzzy = await check(bob, bob, 'x', 'y', 'what is 25 of 480 rupees');
  assert.equal(fuzzy[0].match_kind, 'trigram_high');
  assert.equal(fuzzy[0].is_same_examiner, false);
  assert.deepEqual(await check(bob, bob, 'h-draft', 'm-draft', 'unrelated text entirely'), []);
  await assert.rejects(check(bob, alice, 'h-exact', 'x', 'zzz'), /Not authorised/);
});

test('pre-submit check blocks count, Hindi, internal duplicate and PYQ-cap problems and reports blueprint fit', async (t) => {
  const { app, owner } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner); const bob = await examiner(app, owner);
  const { test: id, section } = await withUser(app, alice, (c) => draftTest(c, exam, alice));
  await owner.query('UPDATE tests SET has_hindi = true WHERE id = $1', [id]);
  const add = (q, order) => owner.query('INSERT INTO test_questions (test_id, section_id, question_id, display_order, positive_marks, negative_marks) VALUES ($1, $2, $3, $4, 2, 0.5)', [id, section, q, order]);
  await add(await question(owner, exam, alice, 'Question one', { text_hash: 'same' }), 1);
  const run = (who) => withUser(app, who, (c) => c.query('SELECT run_test_presubmit_check($1) AS r', [id])).then((r) => r.rows[0].r);
  let report = await run(alice);
  assert.equal(report.can_submit, false);
  assert.ok(report.blocking_errors.some((e) => /Expected 2 total questions, found 1/.test(e)));
  assert.ok(report.blocking_errors.some((e) => /missing Hindi/.test(e)));
  assert.equal(report.section_mismatches.length, 1);
  await add(await question(owner, exam, alice, 'Question two', { text_hash: 'same', is_pyq: true }), 2);
  report = await run(alice);
  assert.ok(report.blocking_errors.some((e) => /duplicate question hashes/.test(e)));
  assert.ok(report.blocking_errors.some((e) => /PYQ percentage \(50.00%\) exceeds/.test(e)));
  assert.equal(report.pyq_percentage, 50);
  assert.equal(report.pattern_fit_warning_report.Quant.actual_topic_counts[exam.topic], 2);
  await assert.rejects(run(bob), /Not authorised/);

  const clean = await withUser(app, alice, (c) => draftTest(c, exam, alice));
  for (const order of [1, 2]) await owner.query('INSERT INTO test_questions (test_id, section_id, question_id, display_order, positive_marks, negative_marks) VALUES ($1, $2, $3, $4, 2, 0.5)', [clean.test, clean.section, await question(owner, exam, alice), order]);
  const ok = await withUser(app, alice, (c) => c.query('SELECT run_test_presubmit_check($1) AS r', [clean.test])).then((r) => r.rows[0].r);
  assert.deepEqual([ok.can_submit, ok.blocking_errors], [true, []]);
});

test('key correction re-scores past attempts and ranks from the correction record, idempotently', async (t) => {
  const { app, owner, worker } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const reviewer = await profile(app, owner, ['qc_reviewer']);
  const { test: live, items } = await liveTest(owner, exam, alice);
  const [s1, s2] = [await profile(app, owner), await profile(app, owner)];
  const sit = async (student, picks) => {
    const attempt = await withUser(app, student, (c) => startAttempt(c, student, live));
    await openAnswers(owner, attempt);
    await withUser(app, student, async (c) => {
      for (const [i, pick] of picks.entries()) await c.query("UPDATE student_attempt_answers SET palette_state = 'answered', selected_option = $3 WHERE attempt_id = $1 AND question_id = $2", [attempt, items[i].question, pick]);
      await c.query("UPDATE student_attempts SET status = 'submitted', submitted_at = now() WHERE id = $1", [attempt]);
    });
    // Initial scoring by the engine against key B.
    await worker.query(`UPDATE student_attempt_answers SET is_correct = selected_option = 'B', marks_awarded = CASE WHEN selected_option = 'B' THEN 2 ELSE -0.5 END WHERE attempt_id = $1`, [attempt]);
    await worker.query(`UPDATE student_attempts SET total_score = (SELECT sum(marks_awarded) FROM student_attempt_answers WHERE attempt_id = $1) WHERE id = $1`, [attempt]);
    return attempt;
  };
  const a1 = await sit(s1, ['B', 'B']);
  const a2 = await sit(s2, ['A', 'B']);
  const v2 = await question(owner, exam, alice, 'Corrected stem', { parent_question_id: items[0].question, version_number: 2, correct_option: 'A' });
  const correction = await withUser(app, reviewer, (c) => c.query("INSERT INTO question_key_corrections (test_id, old_question_id, new_question_id, old_correct_option, new_correct_option, corrected_by, reason) VALUES ($1, $2, $3, 'B', 'A', $4, 'Verified') RETURNING id", [live, items[0].question, v2, reviewer])).then((r) => r.rows[0].id);
  await assert.rejects(withUser(app, s1, (c) => c.query('SELECT rescore_test_attempts_on_key_change($1)', [correction])), /Only QC reviewers and admins/);
  for (let run = 0; run < 2; run++) await withUser(app, reviewer, (c) => c.query('SELECT rescore_test_attempts_on_key_change($1)', [correction]));
  const result = (await owner.query('SELECT id, total_score, correct_count, incorrect_count, rank, percentile FROM student_attempts WHERE id = ANY($1) ORDER BY rank', [[a1, a2]])).rows;
  assert.deepEqual(result.map((r) => [r.id, r.total_score, r.correct_count, r.incorrect_count, r.rank]), [[a2, '4.00', 2, 0, 1], [a1, '1.50', 1, 1, 2]]);
  assert.equal((await owner.query('SELECT correct_option FROM questions WHERE id = $1', [items[0].question])).rows[0].correct_option, 'B', 'approved question untouched');
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM jobs WHERE kind = 'notify_rescored_students'")).rows[0].n, 1);
  assert.equal((await withUser(app, reviewer, (c) => c.query("SELECT current_setting('app.user_id') AS u FROM (SELECT rescore_test_attempts_on_key_change($1)) x", [correction]))).rows[0].u, reviewer, 'user context restored');
});

test('test delivery hides keys until the attempt is finished, serves corrected versions and skips hidden questions', async (t) => {
  const { app, owner, worker } = await fixture(t);
  const exam = await seedExam(owner);
  const alice = await examiner(app, owner);
  const admin = await profile(app, owner, ['admin']);
  const { test: live, items } = await liveTest(owner, exam, alice);
  const v2 = await question(owner, exam, alice, 'Corrected stem', { parent_question_id: items[0].question, version_number: 2, correct_option: 'A' });
  await owner.query("INSERT INTO question_key_corrections (test_id, old_question_id, new_question_id, old_correct_option, new_correct_option, corrected_by, reason) VALUES ($1, $2, $3, 'B', 'A', $4, 'Verified')", [live, items[0].question, v2, admin]);
  const [s1, s2] = [await profile(app, owner), await profile(app, owner)];
  const attempt = await withUser(app, s1, (c) => startAttempt(c, s1, live));
  const deliver = (who) => withUser(app, who, (c) => c.query('SELECT * FROM get_test_questions_for_attempt($1)', [attempt])).then((r) => r.rows);
  const during = await deliver(s1);
  assert.equal(during.length, 2);
  assert.ok(during.every((r) => r.correct_option === null && r.solution_en === null && r.solution_hi === null));
  assert.ok(!JSON.stringify(during).includes('"correct_option":"'), 'no key anywhere in the payload');
  assert.equal(during[0].stem_en, 'Corrected stem');
  await assert.rejects(deliver(s2), /Unauthorized or invalid attempt/);
  await worker.query('UPDATE questions SET is_auto_hidden = true WHERE id = $1', [items[1].question]);
  await withUser(app, s1, (c) => c.query("UPDATE student_attempts SET status = 'submitted', submitted_at = now() WHERE id = $1", [attempt]));
  const after = await deliver(s1);
  assert.equal(after.length, 1);
  assert.deepEqual([after[0].correct_option, after[0].solution_en], ['A', 'Because.']);
});

test('monthly payouts match a hand-calculated fixture with holds, refunds, the minimum and finalisation', async (t) => {
  const { app, owner, worker } = await fixture(t);
  const exam = await seedExam(owner);
  const e1 = await examiner(app, owner); const e2 = await examiner(app, owner);
  await owner.query('UPDATE examiner_profiles SET first_payout_completed = true WHERE user_id = $1', [e1]);
  // Payouts are held until KYC is verified (migration 016); both examiners have completed it.
  await owner.query('UPDATE examiner_profiles SET kyc_verified_at = now() WHERE user_id = ANY($1)', [[e1, e2]]);
  // A paid payout in an earlier month: that is what lifts the first-payout hold.
  const history = (e) => worker.query(`INSERT INTO examiner_payouts (examiner_id, payout_month, gross_earnings_paise, net_payable_paise, status, paid_at, bank_transfer_ref)
    VALUES ($1::uuid, (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') - interval '3 months')::date, 60000, 54000, 'paid', now(), 'UTR0-' || $1::text)`, [e]);
  const t1 = (await liveTest(owner, exam, e1)).test; const t2 = (await liveTest(owner, exam, e2)).test;
  const student = await profile(app, owner);
  // Only a finished month can be calculated: everything happens mid last month (India time).
  const { m: month, mid } = (await owner.query(`SELECT (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') - interval '1 month')::date AS m,
    ((date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') - interval '1 month' + interval '14 days 12 hours') AT TIME ZONE 'Asia/Kolkata') AS mid`)).rows[0];
  // The refunded sale was captured the month before, so only its refund falls in this month.
  const earlier = new Date(new Date(mid).getTime() - 30 * 86400000);
  // Direct sale 100000 net (65% = 65000), coupon sale 20000 net (75% = 15000), refund 10000 net (65% = 6500).
  await purchase(worker, student, { examiner_id: e1, test_id: t1, net_revenue_paise: 100000, captured_at: mid });
  await purchase(worker, student, { examiner_id: e1, test_id: t1, net_revenue_paise: 20000, is_examiner_coupon: true, captured_at: mid });
  await purchase(worker, student, { examiner_id: e1, test_id: t1, net_revenue_paise: 10000, status: 'refunded', captured_at: earlier, refunded_at: mid });
  // A 30-day Pass with 40000 net: pool = 50% = 20000; two qualified attempts, one per examiner: 10000 each.
  const plan = (await owner.query("INSERT INTO pass_plans (name, duration_days, price_paise) VALUES ('1 Month Pass', 30, 47200) RETURNING id")).rows[0].id;
  const passPurchase = await purchase(worker, student, { item_type: 'pass', pass_plan_id: plan, net_revenue_paise: 40000, captured_at: mid });
  await worker.query("INSERT INTO student_entitlements (student_id, purchase_id, item_type, pass_plan_id, valid_from, valid_until) VALUES ($1, $2, 'pass', $3, $4, $4::timestamptz + interval '30 days')", [student, passPurchase, plan, mid]);
  for (const testId of [t1, t2]) {
    await worker.query(`INSERT INTO student_attempts (student_id, test_id, server_expires_at, remaining_seconds_at_last_sync, total_questions, status, submitted_at, attempted_count, used_pass_access)
      VALUES ($1, $2, $3, 0, 2, 'submitted', $3, 1, true)`, [student, testId, mid]);
  }
  // Not qualified: practice reattempt, and an attempt below 50% answered.
  await worker.query(`INSERT INTO student_attempts (student_id, test_id, server_expires_at, remaining_seconds_at_last_sync, total_questions, status, submitted_at, attempted_count, used_pass_access, attempt_number)
    VALUES ($1, $2, $3, 0, 2, 'submitted', $3, 2, true, 2), ($1, $2, $3, 0, 4, 'submitted', $3, 1, true, 1)`, [student, t1, mid]);

  const plain = await profile(app, owner, ['admin']);
  const finance = await profile(app, owner, ['admin']);
  await owner.query('UPDATE profiles SET is_finance_admin = true WHERE id = $1', [finance]);
  const calculate = (who) => withUser(app, who, (c) => c.query('SELECT calculate_monthly_examiner_payouts($1)', [month]));
  await assert.rejects(calculate(plain), /Only finance admins/);
  await assert.rejects(calculate(student), /Only finance admins/);
  await history(e1);
  await calculate(finance);

  const pool = (await owner.query('SELECT total_net_pass_revenue_paise, examiner_pool_50_pct_paise, total_qualified_attempts, per_attempt_rate_paise FROM monthly_pass_pools WHERE payout_month = $1', [month])).rows[0];
  assert.deepEqual(pool, { total_net_pass_revenue_paise: '40000', examiner_pool_50_pct_paise: '20000', total_qualified_attempts: 2, per_attempt_rate_paise: '10000.0000' });
  const payout = async (e) => (await owner.query('SELECT direct_sales_65_paise d, coupon_sales_75_paise c, pass_pool_share_paise p, refund_deductions_paise r, gross_earnings_paise g, tds_deducted_paise tds, net_payable_paise n, status, hold_reason FROM examiner_payouts WHERE examiner_id = $1 AND payout_month = $2', [e, month])).rows[0];
  // e1: 65000 + 15000 + 10000 - 6500 = 83500 gross; 10% TDS 8350; net 75150.
  assert.deepEqual(await payout(e1), { d: '65000', c: '15000', p: '10000', r: '6500', g: '83500', tds: '8350', n: '75150', status: 'calculated', hold_reason: null });
  // e2: pool share only, and no earlier payout: held for one cycle.
  const p2 = await payout(e2);
  assert.deepEqual([p2.g, p2.status, p2.hold_reason], ['10000', 'on_hold', 'First payout is held for one cycle']);

  // Paid rows are never overwritten by a recalculation; held rows are.
  await worker.query("UPDATE examiner_payouts SET status = 'paid', paid_at = now(), bank_transfer_ref = 'UTR1' WHERE examiner_id = $1 AND payout_month = $2", [e1, month]);
  await history(e2);
  await purchase(worker, student, { examiner_id: e1, test_id: t1, net_revenue_paise: 100000, captured_at: mid });
  await calculate(finance);
  assert.deepEqual([(await payout(e1)).g, (await payout(e1)).status], ['83500', 'paid']);
  assert.deepEqual([(await payout(e2)).status, (await payout(e2)).hold_reason], ['on_hold', 'Below the ₹500 minimum; carries forward']);
  // One audit row per calculation run; the rows it writes are system work, not separate admin edits.
  const audits = (await owner.query('SELECT action_name FROM admin_audit_logs WHERE admin_id = $1', [finance])).rows.map((r) => r.action_name);
  assert.deepEqual(audits, ['CALCULATE_MONTHLY_PAYOUTS', 'CALCULATE_MONTHLY_PAYOUTS']);

  await worker.query('UPDATE monthly_pass_pools SET is_finalized = true WHERE payout_month = $1', [month]);
  await assert.rejects(calculate(finance), /is finalised/);
  await assert.rejects(withUser(app, finance, (c) => c.query("SELECT calculate_monthly_examiner_payouts('2026-11-15')")), /first day of a month/);
});

test('functions are not executable by PUBLIC', async (t) => {
  const { owner } = await fixture(t);
  const rows = (await owner.query(`SELECT p.proname::text AS name, has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
      AND p.proname IN ('run_question_duplicate_check', 'run_test_presubmit_check', 'rescore_test_attempts_on_key_change',
                        'get_test_questions_for_attempt', 'calculate_monthly_examiner_payouts', 'ensure_profile_for_firebase_user')`)).rows;
  assert.equal(rows.length, 6);
  for (const row of rows) assert.equal(row.public_exec, false, row.name);
});

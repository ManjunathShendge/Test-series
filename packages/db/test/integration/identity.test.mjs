import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withUser } from '../../dist/index.js';
import { fixture, profile } from './fixture.mjs';

test('sign-in creates one student profile per Firebase uid and never merges by email', async (t) => {
  const { app, owner } = await fixture(t);
  const create = (uid, email) => app.query('SELECT ensure_profile_for_firebase_user($1, $2, $3) AS id', [uid, email, '']).then((r) => r.rows[0].id);
  const first = await create('firebase-a', 'same@example.test');
  assert.equal(await create('firebase-a', 'same@example.test'), first);
  const row = (await owner.query('SELECT roles, full_name, is_blocked FROM profiles WHERE id = $1', [first])).rows[0];
  assert.equal(row.roles, '{student}');
  assert.equal(row.full_name, 'Student');
  // A different Firebase identity with the same email is refused, not linked (CLAUDE.md invariant 10).
  await assert.rejects(create('firebase-b', 'same@example.test'), /duplicate key value violates unique constraint "profiles_email_key"/);
  await assert.rejects(create('', 'x@example.test'), /Firebase uid is required/);
});

test('profiles are visible only to their owner and to admins', async (t) => {
  const { app, owner } = await fixture(t);
  const alice = await profile(app, owner); const bob = await profile(app, owner);
  const admin = await profile(app, owner, ['student', 'admin']);
  assert.equal((await app.query('SELECT count(*)::int AS n FROM profiles')).rows[0].n, 0, 'no user context sees nothing');
  const seenBy = (id) => withUser(app, id, (c) => c.query('SELECT id FROM profiles ORDER BY id')).then((r) => r.rows.map((x) => x.id));
  assert.deepEqual(await seenBy(alice), [alice]);
  assert.equal((await seenBy(admin)).length, 3);
  const updated = await withUser(app, alice, (c) => c.query("UPDATE profiles SET full_name = 'Hacked' WHERE id = $1", [bob]));
  assert.equal(updated.rowCount, 0);
  await withUser(app, alice, (c) => c.query("UPDATE profiles SET preferred_language = 'hi' WHERE id = $1", [alice]));
  assert.equal((await owner.query('SELECT preferred_language FROM profiles WHERE id = $1', [alice])).rows[0].preferred_language, 'hi');
});

test('users cannot grant themselves roles or admin flags; admins and system jobs can', async (t) => {
  const { app, owner, worker } = await fixture(t);
  const alice = await profile(app, owner);
  const admin = await profile(app, owner, ['student', 'admin']);
  for (const change of ["roles = '{student,admin}'", 'is_super_admin = true', 'is_blocked = false, is_finance_admin = true']) {
    await assert.rejects(withUser(app, alice, (c) => c.query(`UPDATE profiles SET ${change} WHERE id = $1`, [alice])), /Only admins/);
  }
  await withUser(app, admin, (c) => c.query("UPDATE profiles SET roles = '{student,examiner}' WHERE id = $1", [alice]));
  await worker.query('UPDATE profiles SET is_blocked = true WHERE id = $1', [alice]);
  const row = (await owner.query('SELECT roles, is_blocked FROM profiles WHERE id = $1', [alice])).rows[0];
  assert.deepEqual([row.roles, row.is_blocked], ['{student,examiner}', true]);
  // A blocked admin loses admin powers.
  await owner.query('UPDATE profiles SET is_blocked = true WHERE id = $1', [admin]);
  assert.equal((await withUser(app, admin, (c) => c.query('SELECT has_role($1) AS r', ['admin']))).rows[0].r, false);
});

test('at most two active devices; a third is rejected until one is removed, even under concurrency', async (t) => {
  const { app, owner } = await fixture(t);
  const alice = await profile(app, owner);
  // Device rows are written as their owner (per-row rules since migration 026).
  const asAlice = (sql, params) => withUser(app, alice, (c) => c.query(sql, params));
  const add = (fp) => asAlice("INSERT INTO user_devices (user_id, device_fingerprint, platform) VALUES ($1, $2, 'android') RETURNING id", [alice, fp]).then((r) => r.rows[0].id);
  const phone = await add('phone'); await add('tablet');
  await assert.rejects(add('laptop'), /Active device limit reached/);
  await asAlice('UPDATE user_devices SET is_active = false WHERE id = $1', [phone]);
  await add('laptop');
  await assert.rejects(asAlice('UPDATE user_devices SET is_active = true WHERE id = $1', [phone]), /Active device limit reached/);

  const bob = await profile(app, owner);
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) =>
    withUser(app, bob, (c) => c.query("INSERT INTO user_devices (user_id, device_fingerprint, platform) VALUES ($1, $2, 'ios')", [bob, `d${i}`]))));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM user_devices WHERE user_id = $1 AND is_active', [bob])).rows[0].n, 2);
});

test('admin audit log is append-only, including TRUNCATE', async (t) => {
  const { app, owner, worker } = await fixture(t);
  const admin = await profile(app, owner, ['student', 'admin']);
  // Entries are appended only in the acting admin's own name (migration 024).
  await withUser(app, admin, (c) => c.query("INSERT INTO admin_audit_logs (admin_id, action_name, target_table, target_record_id, before_state, after_state) VALUES ($1, 'VERIFY_KYC', 'examiner_profiles', $2, '{}', '{\"ok\":true}')", [admin, randomUUID()]));
  await assert.rejects(app.query("INSERT INTO admin_audit_logs (admin_id, action_name, target_table, target_record_id) VALUES ($1, 'FORGED', 'x', $2)", [admin, randomUUID()]), /row-level security/);
  // The API role has no update rule, so an edit matches no rows; the append-only trigger covers
  // the worker and the owner below.
  const edited = await withUser(app, admin, (c) => c.query("UPDATE admin_audit_logs SET action_name = 'X'"));
  assert.equal(edited.rowCount, 0);
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM admin_audit_logs WHERE action_name = 'VERIFY_KYC'")).rows[0].n, 1);
  await assert.rejects(worker.query("UPDATE admin_audit_logs SET action_name = 'X'"), /append-only/);
  await assert.rejects(worker.query('DELETE FROM admin_audit_logs'), /append-only/);
  await assert.rejects(owner.query('TRUNCATE admin_audit_logs'), /append-only/);
});

test('examiner profiles and followers enforce their references', async (t) => {
  const { app, owner } = await fixture(t);
  const examiner = await profile(app, owner, ['student', 'examiner']);
  const student = await profile(app, owner);
  await assert.rejects(app.query('INSERT INTO examiner_profiles (user_id) VALUES ($1)', [examiner]), /agreement_version/);
  await app.query("INSERT INTO examiner_profiles (user_id, agreement_version, agreement_accepted_at) VALUES ($1, 'v1', now())", [examiner]);
  // Students follow as themselves (per-row rules since migration 021).
  const asStudent = (sql, params) => withUser(app, student, (c) => c.query(sql, params));
  await asStudent('INSERT INTO examiner_followers (student_id, examiner_id) VALUES ($1, $2)', [student, examiner]);
  await assert.rejects(asStudent('INSERT INTO examiner_followers (student_id, examiner_id) VALUES ($1, $2)', [student, student]), /foreign key|violates/);
});

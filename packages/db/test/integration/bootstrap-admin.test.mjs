import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { withUser } from '../../dist/index.js';
import { fixture, profile } from './fixture.mjs';

const script = fileURLToPath(new URL('../../scripts/bootstrap-super-admin.mjs', import.meta.url));
/** Runs the script as an owner would; resolves with stdout or rejects with its error output. */
const run = (url, email, confirm = email) =>
  promisify(execFile)(process.execPath, [script], {
    env: { PATH: process.env.PATH, MIGRATION_DATABASE_URL: url, BOOTSTRAP_ADMIN_EMAIL: email ?? '', CONFIRM_BOOTSTRAP_ADMIN: confirm ?? '' },
  }).then((r) => r.stdout);
const emailOf = async (owner, id) => (await owner.query('SELECT email FROM profiles WHERE id = $1', [id])).rows[0].email;

test('first super admin: needs confirmation and an existing account, grants once, and is audited', async (t) => {
  const { owner, app, url } = await fixture(t);
  const first = await profile(app, owner);
  const email = await emailOf(owner, first);

  await assert.rejects(run(url, email, 'someone-else@example.test'), /CONFIRM_BOOTSTRAP_ADMIN/);
  await assert.rejects(run(url, 'nobody@example.test'), /No account uses nobody@example\.test/);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM profiles WHERE is_super_admin')).rows[0].n, 0);

  // Case and spaces in the typed address do not matter.
  assert.match(await run(url, `  ${email.toUpperCase()} `), /Super admin granted/);
  const row = (await owner.query('SELECT roles, is_super_admin FROM profiles WHERE id = $1', [first])).rows[0];
  assert.equal(row.roles, '{student,admin}');
  assert.equal(row.is_super_admin, true);
  const audit = (await owner.query('SELECT admin_id, action_name, target_record_id, before_state, after_state FROM admin_audit_logs')).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action_name, 'bootstrap_super_admin');
  assert.equal(audit[0].target_record_id, first);
  assert.equal(audit[0].before_state.isSuperAdmin, false);
  assert.equal(audit[0].after_state.isSuperAdmin, true);

  // It cannot add or replace admins once one exists; that is done in the product.
  const second = await profile(app, owner);
  await assert.rejects(run(url, await emailOf(owner, second)), /A super admin already exists/);
  await assert.rejects(run(url, email), /A super admin already exists/);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM admin_audit_logs')).rows[0].n, 1);
});

test('first super admin refuses blocked accounts and demo personas', async (t) => {
  const { owner, app, url } = await fixture(t);
  const blocked = await profile(app, owner);
  await owner.query('UPDATE profiles SET is_blocked = true WHERE id = $1', [blocked]);
  await assert.rejects(run(url, await emailOf(owner, blocked)), /blocked/);
  await owner.query("INSERT INTO profiles (firebase_uid, email, full_name) VALUES ('demo-seed:x', 'persona@example.test', 'Persona')");
  await assert.rejects(run(url, 'persona@example.test'), /demo persona/);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM profiles WHERE is_super_admin')).rows[0].n, 0);
});

test('18+ confirmation starts unset, is recorded with a time, and cannot be withdrawn by the user', async (t) => {
  const { owner, app } = await fixture(t);
  const id = await profile(app, owner);
  const read = async () => (await owner.query('SELECT is_age_verified_18_plus AS ok, age_confirmed_at AS at FROM profiles WHERE id = $1', [id])).rows[0];
  assert.deepEqual(await read(), { ok: false, at: null });
  await assert.rejects(owner.query('UPDATE profiles SET is_age_verified_18_plus = true WHERE id = $1', [id]), /profiles_age_confirmation_recorded/);

  await withUser(app, id, (c) => c.query('UPDATE profiles SET is_age_verified_18_plus = true, age_confirmed_at = now() WHERE id = $1', [id]));
  const confirmed = await read();
  assert.equal(confirmed.ok, true);
  assert.ok(confirmed.at instanceof Date);
  await assert.rejects(
    withUser(app, id, (c) => c.query('UPDATE profiles SET is_age_verified_18_plus = false WHERE id = $1', [id])),
    /cannot be withdrawn/,
  );
  await assert.rejects(
    withUser(app, id, (c) => c.query("UPDATE profiles SET age_confirmed_at = now() - interval '1 day' WHERE id = $1", [id])),
    /cannot be withdrawn or changed/,
  );
  assert.deepEqual(await read(), confirmed);
});

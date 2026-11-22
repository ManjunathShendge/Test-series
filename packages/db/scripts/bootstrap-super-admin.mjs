// One-time: makes an existing account the first super admin. Every later staff grant is made
// by an admin in the product (search by email, audited); there are no invite links and no way
// to sign up as staff. This script exists only because the first admin has nobody to grant it.
//
// The person signs in to the website or app first, so the account exists through the normal
// Firebase path (invariant 10: never create or merge accounts by email). Then the owner runs:
//
//   BOOTSTRAP_ADMIN_EMAIL=owner@example.com CONFIRM_BOOTSTRAP_ADMIN=owner@example.com \
//     pnpm --filter @exam-prep/db bootstrap-super-admin
//
// Required env: MIGRATION_DATABASE_URL (schema owner), BOOTSTRAP_ADMIN_EMAIL and the same
// address again in CONFIRM_BOOTSTRAP_ADMIN. Optional: DATABASE_CA_CERT_PATH for hosted databases.
// Refuses when any super admin already exists, so it cannot be used to add or replace admins.
// The grant and its audit record commit together.
import { createDatabase, transaction } from '../dist/index.js';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) fail('MIGRATION_DATABASE_URL is required');
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('BOOTSTRAP_ADMIN_EMAIL must be an email address');
if (process.env.CONFIRM_BOOTSTRAP_ADMIN?.trim().toLowerCase() !== email) {
  fail('Set CONFIRM_BOOTSTRAP_ADMIN to the same email address to confirm');
}

const db = createDatabase(url, { caCertPath: process.env.DATABASE_CA_CERT_PATH, max: 1 });
try {
  const granted = await transaction(db, async (client) => {
    // Two runs at once must not both pass the "no super admin yet" check.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bootstrap-super-admin'))");
    const existing = await client.query('SELECT 1 FROM profiles WHERE is_super_admin AND deleted_at IS NULL LIMIT 1');
    if (existing.rowCount) fail('A super admin already exists. Grant staff roles from the admin console instead.');

    const found = await client.query(
      `SELECT id, roles, is_ops_admin, is_finance_admin, is_super_admin, is_blocked, deleted_at, firebase_uid
         FROM profiles WHERE lower(email) = $1 FOR UPDATE`,
      [email],
    );
    const before = found.rows[0];
    if (!before) fail(`No account uses ${email}. Sign in to the website or app with it first, then run this again.`);
    if (before.deleted_at) fail('That account is deleted.');
    if (before.is_blocked) fail('That account is blocked.');
    if (before.firebase_uid.startsWith('demo-seed:')) fail('That is a demo persona, not a real account.');

    const { rows } = await client.query(
      `UPDATE profiles
          SET roles = CASE WHEN 'admin' = ANY(roles) THEN roles ELSE array_append(roles, 'admin'::user_role_type) END,
              is_super_admin = true
        WHERE id = $1
    RETURNING id, roles, is_ops_admin, is_finance_admin, is_super_admin`,
      [before.id],
    );
    const after = rows[0];
    await client.query(
      `INSERT INTO admin_audit_logs (admin_id, action_name, target_table, target_record_id, before_state, after_state)
       VALUES ($1, 'bootstrap_super_admin', 'profiles', $1, $2, $3)`,
      [
        before.id,
        { roles: before.roles, isOpsAdmin: before.is_ops_admin, isFinanceAdmin: before.is_finance_admin, isSuperAdmin: before.is_super_admin },
        { roles: after.roles, isOpsAdmin: after.is_ops_admin, isFinanceAdmin: after.is_finance_admin, isSuperAdmin: after.is_super_admin, source: 'scripts/bootstrap-super-admin.mjs' },
      ],
    );
    return after.id;
  });
  console.log(`Super admin granted to ${email} (profile ${granted}). Recorded in admin_audit_logs.`);
} finally {
  await db.end();
}

function fail(message) {
  throw new Error(message);
}

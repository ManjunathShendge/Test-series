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
  return { owner, app, worker, url: withDatabase(adminUrl, name) };
}

/** Creates a profile through the sign-in function, optionally with extra roles (set by the owner). */
export async function profile(db, owner, roles = ['student']) {
  const uid = `firebase-${randomUUID()}`;
  const { rows } = await db.query('SELECT ensure_profile_for_firebase_user($1, $2, $3) AS id', [uid, `${uid}@example.test`, 'Synthetic User']);
  if (roles.join() !== 'student') await owner.query('UPDATE profiles SET roles = $2::user_role_type[] WHERE id = $1', [rows[0].id, roles]);
  return rows[0].id;
}

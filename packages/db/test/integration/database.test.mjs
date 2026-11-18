import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabase, enqueueJob, claimJob, finishJob, SCHEMA_VERSION } from '../../dist/index.js';
import { migrateDatabase } from '../../dist/migrate.js';
import { fixture } from './fixture.mjs';

test('migrations are repeatable, checksummed and install the required extensions', async (t) => {
  const { owner, url } = await fixture(t);
  assert.deepEqual(await migrateDatabase(url), []);
  await checkDatabase(owner);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 2);
  assert.equal((await owner.query("SELECT version FROM bootstrap_state WHERE id = 'schema'")).rows[0].version, SCHEMA_VERSION);
  const ext = (await owner.query("SELECT array_agg(extname::text ORDER BY extname) AS e FROM pg_extension WHERE extname IN ('pg_trgm','btree_gin','pgcrypto')")).rows[0].e;
  assert.deepEqual(ext, ['btree_gin', 'pg_trgm', 'pgcrypto']);
  await owner.query("UPDATE schema_migrations SET checksum = 'tampered'");
  await assert.rejects(migrateDatabase(url), /Applied migration changed/);
});
test('job deduplication, lease recovery and stale acknowledgements', async (t) => {
  const { app } = await fixture(t);
  const t0 = new Date('2026-01-01T00:00:00Z'); const at = (ms) => new Date(t0.getTime() + ms);
  await enqueueJob(app, 'test', {}, 'event-1', t0); await enqueueJob(app, 'test', {}, 'event-1', t0);
  assert.equal((await app.query('SELECT count(*)::int AS n FROM jobs')).rows[0].n, 1);
  const first = await claimJob(app, 'test', t0, 100);
  assert.equal(await claimJob(app, 'test', at(50), 100), undefined);
  const recovered = await claimJob(app, 'test', at(100), 100);
  assert.equal(recovered.id, first.id);
  assert.equal(recovered.attempts, 2);
  assert.equal(await finishJob(app, first.id, first.lease_token, at(101)), false);
  assert.equal(await finishJob(app, recovered.id, recovered.lease_token, at(101)), true);
});
test('concurrent workers never claim the same job', async (t) => {
  const { app } = await fixture(t);
  const now = new Date();
  for (let i = 0; i < 20; i++) await enqueueJob(app, 'test', { i }, `event-${i}`, now);
  const claims = await Promise.all(Array.from({ length: 24 }, () => claimJob(app, 'test', now, 60000)));
  const ids = claims.filter(Boolean).map((c) => c.id);
  assert.equal(ids.length, 20);
  assert.equal(new Set(ids).size, 20);
});
test('schema mismatch fails readiness', async (t) => {
  const { owner } = await fixture(t);
  await owner.query("UPDATE bootstrap_state SET version = 999 WHERE id = 'schema'");
  await assert.rejects(checkDatabase(owner), /incompatible/);
});
test('every table has RLS; worker has full access, API is governed by schema policies where they exist', async (t) => {
  const { owner } = await fixture(t);
  const rows = (await owner.query(`SELECT c.relname::text AS name, c.relrowsecurity AS rls,
      COALESCE((SELECT array_agg(p.policyname::text ORDER BY p.policyname) FROM pg_policies p WHERE p.tablename = c.relname), '{}') AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migrations'`)).rows;
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  for (const row of rows) {
    assert.equal(row.rls, true, row.name);
    assert.ok(row.policies.includes('exam_worker_access'), row.name);
    const schemaPolicies = row.policies.filter((p) => !p.startsWith('exam_'));
    assert.equal(row.policies.includes('exam_app_access'), schemaPolicies.length === 0, row.name);
  }
  assert.ok(byName.profiles.policies.includes('Users manage own profile'));
  assert.ok(!byName.profiles.policies.includes('exam_app_access'));
  assert.ok(byName.user_devices.policies.includes('exam_app_access'));
});

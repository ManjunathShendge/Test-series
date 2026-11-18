import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDatabase, checkDatabase, transaction, enqueueJob, claimJob, finishJob } from '../../dist/index.js';
import { migrateDatabase } from '../../dist/migrate.js';

// Real PostgreSQL (pnpm services:up). Missing configuration fails rather than skips.
const adminUrl = process.env.MIGRATION_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
assert.ok(adminUrl && appUrl, 'MIGRATION_DATABASE_URL and DATABASE_URL are required; run pnpm setup');
const grants = readFileSync(new URL('../../../../docker/postgres/init/002-grants.sql', import.meta.url), 'utf8');
const withDatabase = (url, name) => { const u = new URL(url); u.pathname = `/${name}`; return u.href; };

/** Isolated, migrated database per test with the same role grants as local Docker. */
async function fixture(t) {
  const name = `exam_test_${randomBytes(6).toString('hex')}`;
  const admin = createDatabase(adminUrl, { max: 1 });
  await admin.query(`CREATE DATABASE ${name}`);
  const owner = createDatabase(withDatabase(adminUrl, name), { max: 4 });
  await owner.query(grants);
  await migrateDatabase(withDatabase(adminUrl, name));
  const app = createDatabase(withDatabase(appUrl, name), { max: 4 });
  t.after(async () => {
    await app.end(); await owner.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`); await admin.end();
  });
  return { owner, app, url: withDatabase(adminUrl, name) };
}
async function user(db) {
  const id = randomUUID();
  await db.query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, `${id}@example.test`]);
  return id;
}
async function order(db) {
  const userId = await user(db); const id = randomUUID();
  await db.query("INSERT INTO billing_orders (id, user_id, idempotency_key, amount_paise, currency, status) VALUES ($1, $2, 'checkout-1', 100, 'INR', 'pending')", [id, userId]);
  return { id, userId };
}

test('migrations are repeatable, checksummed and install the search extensions', async (t) => {
  const { owner, url } = await fixture(t);
  assert.deepEqual(await migrateDatabase(url), []);
  await checkDatabase(owner);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 1);
  const ext = (await owner.query("SELECT array_agg(extname::text ORDER BY extname) AS e FROM pg_extension WHERE extname IN ('pg_trgm','btree_gin')")).rows[0].e;
  assert.deepEqual(ext, ['btree_gin', 'pg_trgm']);
  await owner.query("UPDATE schema_migrations SET checksum = 'tampered'");
  await assert.rejects(migrateDatabase(url), /Applied migration changed/);
});
test('API role reads and writes rows but cannot change the schema', async (t) => {
  const { app } = await fixture(t);
  const id = await user(app);
  await app.query("INSERT INTO user_roles VALUES ($1, 'student')", [id]);
  await app.query("INSERT INTO sessions VALUES ('hashed-token', $1, now() + interval '1 day', NULL)", [id]);
  assert.equal((await app.query("SELECT user_id FROM sessions WHERE token_hash = 'hashed-token'")).rows[0].user_id, id);
  await assert.rejects(app.query('INSERT INTO user_roles VALUES ($1, $2)', [randomUUID(), 'student']), /foreign key/);
  await assert.rejects(app.query('CREATE TABLE intruder (x int)'), /permission denied/);
  await assert.rejects(app.query('ALTER TABLE users ADD COLUMN x int'), /must be owner/);
  await assert.rejects(app.query('DROP TABLE jobs'), /must be owner/);
});
test('billing idempotency, integer money and append-only ledger are enforced', async (t) => {
  const { app, owner } = await fixture(t);
  const { id, userId } = await order(app);
  await assert.rejects(app.query("INSERT INTO billing_orders (id, user_id, idempotency_key, amount_paise, currency, status) VALUES ($1, $2, 'checkout-1', 100, 'INR', 'pending')", [randomUUID(), userId]), /duplicate key/);
  await assert.rejects(app.query('UPDATE billing_orders SET amount_paise = $1', [1.5]), /invalid input syntax for type bigint/);
  await assert.rejects(app.query('UPDATE billing_orders SET amount_paise = -1'), /check constraint/);
  await assert.rejects(app.query("UPDATE billing_orders SET currency = 'USD'"), /check constraint/);
  await app.query("INSERT INTO ledger_entries (id, order_id, source_event, amount_paise) VALUES ($1, $2, 'verified-event', 100)", [randomUUID(), id]);
  await assert.rejects(app.query("INSERT INTO ledger_entries (id, order_id, source_event, amount_paise) VALUES ($1, $2, 'verified-event', 100)", [randomUUID(), id]), /duplicate key/);
  await assert.rejects(app.query('UPDATE ledger_entries SET amount_paise = 0'), /append-only/);
  await assert.rejects(app.query('DELETE FROM ledger_entries'), /append-only/);
  await assert.rejects(owner.query('TRUNCATE ledger_entries CASCADE'), /append-only/);
});
test('billing and audit changes roll back together', async (t) => {
  const { app } = await fixture(t);
  await order(app);
  await assert.rejects(transaction(app, async (client) => {
    await client.query("UPDATE billing_orders SET status = 'paid'");
    await client.query("INSERT INTO audit_events (id, action, metadata) VALUES ($1, 'paid', '{}')", [randomUUID()]);
    throw new Error('simulated interruption');
  }), /interruption/);
  assert.equal((await app.query('SELECT status FROM billing_orders')).rows[0].status, 'pending');
  assert.equal((await app.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n, 0);
});
test('audit history cannot be rewritten, deleted or truncated', async (t) => {
  const { app, owner } = await fixture(t);
  await app.query("INSERT INTO audit_events (id, action, metadata) VALUES ($1, 'bootstrap', '{\"k\":1}')", [randomUUID()]);
  await assert.rejects(app.query("UPDATE audit_events SET action = 'other'"), /append-only/);
  await assert.rejects(app.query('DELETE FROM audit_events'), /append-only/);
  await assert.rejects(owner.query('TRUNCATE audit_events'), /append-only/);
  await assert.rejects(app.query("INSERT INTO audit_events (id, action, metadata) VALUES ($1, 'x', 'not json')", [randomUUID()]), /invalid input syntax for type json/);
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

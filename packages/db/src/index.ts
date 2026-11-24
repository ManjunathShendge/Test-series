import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

export type Database = pg.Pool;
export type DatabaseClient = pg.PoolClient;
export type Queryable = Pick<pg.Pool, 'query'>;

export interface DatabaseOptions {
  /** PEM CA certificate path; when set, TLS is required and the server certificate verified. */
  caCertPath?: string | undefined;
  max?: number;
  connectionTimeoutMillis?: number;
}

/**
 * Pools work through the Supabase transaction pooler: node-postgres only uses
 * unnamed statements, so no prepared-statement settings are needed.
 */
export function createDatabase(url: string, options: DatabaseOptions = {}): Database {
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('Database URL must be a postgresql:// URL');
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5000,
    ...(options.caCertPath
      ? { ssl: { ca: readFileSync(options.caCertPath, 'utf8'), rejectUnauthorized: true } }
      : {}),
  });
  // An idle client losing its connection must not crash the process; the next query reconnects.
  pool.on('error', () => {});
  return pool;
}

/** Bumped by every migration that changes the schema this code expects. */
export const SCHEMA_VERSION = 23;

export async function checkDatabase(db: Queryable): Promise<void> {
  const { rows } = await db.query<{ version: number }>(
    "SELECT version FROM bootstrap_state WHERE id = 'schema'",
  );
  if (rows[0]?.version !== SCHEMA_VERSION) throw new Error('Database schema is incompatible');
}

/** Never hold a transaction across provider calls; keep callbacks to database work. */
export async function transaction<T>(
  db: Database,
  action: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Runs a transaction as a verified user: row-level security policies read this identity through
 * public.current_user_id(). Call only after the API has verified the Firebase token and resolved
 * the profile. The setting is transaction-local, so pooled connections never carry it over.
 */
export async function withUser<T>(
  db: Database,
  profileId: string,
  action: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  return transaction(db, async (client) => {
    await client.query("SELECT set_config('app.user_id', $1, true)", [profileId]);
    return action(client);
  });
}

export async function enqueueJob(
  db: Queryable,
  kind: string,
  payload: unknown,
  key: string,
  now = new Date(),
): Promise<void> {
  await db.query(
    `INSERT INTO jobs (id, deduplication_key, kind, payload, available_at)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (deduplication_key) DO NOTHING`,
    [randomUUID(), key, kind, JSON.stringify(payload), now],
  );
}

export interface ClaimedJob {
  id: string;
  kind: string;
  payload: unknown;
  lease_token: string;
  attempts: number;
}

/** Atomic claim; concurrent workers skip locked rows and expired leases can be recovered. */
export async function claimJob(
  db: Queryable,
  kind: string,
  now = new Date(),
  leaseMs = 30000,
): Promise<ClaimedJob | undefined> {
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new Error('Invalid job lease');
  const { rows } = await db.query<ClaimedJob>(
    `UPDATE jobs SET status = 'running', lease_token = $1, lease_until = $2, attempts = attempts + 1
     WHERE id = (
       SELECT id FROM jobs
       WHERE kind = $3 AND ((status = 'pending' AND available_at <= $4) OR (status = 'running' AND lease_until <= $4))
       ORDER BY available_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING id, kind, payload, lease_token, attempts`,
    [randomUUID(), new Date(now.getTime() + leaseMs), kind, now],
  );
  return rows[0];
}

/** Only the current, unexpired lease holder can acknowledge a job. */
export async function finishJob(
  db: Queryable,
  id: string,
  token: string,
  now = new Date(),
): Promise<boolean> {
  const result = await db.query(
    `UPDATE jobs SET status = 'done', lease_token = NULL, lease_until = NULL
     WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_until > $3`,
    [id, token, now],
  );
  return result.rowCount === 1;
}

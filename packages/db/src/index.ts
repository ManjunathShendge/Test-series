import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { resolveDatabasePath } from './path.js';

export type Database = DatabaseSync;
export { resolveDatabasePath } from './path.js';

export function createDatabase(url: string): Database {
  const db = new DatabaseSync(resolveDatabasePath(url), { timeout: 5000 });
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    return db;
  } catch (error) { db.close(); throw error; }
}

export function checkDatabase(db: Database): void {
  const row = db.prepare("SELECT version FROM bootstrap_state WHERE id = 'schema'").get();
  if (row?.['version'] !== 1) throw new Error('Database schema is incompatible');
  if (db.prepare('PRAGMA foreign_keys').get()?.['foreign_keys'] !== 1) throw new Error('Foreign keys are disabled');
}

/** The callback must be synchronous; never hold a transaction across provider calls. */
export function transaction<T>(db: Database, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    if (result && typeof (result as { then?: unknown }).then === 'function') throw new Error('Transaction callbacks must be synchronous');
    db.exec('COMMIT');
    return result;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function enqueueJob(db: Database, kind: string, payload: unknown, key: string, now = Date.now()): void {
  db.prepare('INSERT INTO jobs (id, deduplication_key, kind, payload, available_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(deduplication_key) DO NOTHING')
    .run(randomUUID(), key, kind, JSON.stringify(payload), now);
}

/** Atomic claim; expired leases can be recovered. Only claim registered job kinds. */
export function claimJob(db: Database, kind: string, now = Date.now(), leaseMs = 30000) {
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new Error('Invalid job lease');
  return db.prepare(`UPDATE jobs SET status='running', lease_token=?, lease_until=?, attempts=attempts+1
    WHERE id=(SELECT id FROM jobs WHERE kind=? AND ((status='pending' AND available_at<=?) OR (status='running' AND lease_until<=?)) ORDER BY available_at, id LIMIT 1)
    RETURNING id, kind, payload, lease_token, attempts`).get(randomUUID(), now + leaseMs, kind, now, now);
}

export function finishJob(db: Database, id: string, token: string, now = Date.now()): boolean {
  return db.prepare("UPDATE jobs SET status='done', lease_token=NULL, lease_until=NULL WHERE id=? AND lease_token=? AND status='running' AND lease_until>?")
    .run(id, token, now).changes === 1;
}

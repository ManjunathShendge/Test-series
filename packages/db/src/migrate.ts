import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDatabase, transaction, type DatabaseOptions } from './index.js';

// Arbitrary constant: serialises concurrent migrators (two deploys starting at once).
const MIGRATION_LOCK = 4_221_190_318;

/**
 * Applies every pending migration in one transaction. Run through a session-mode
 * connection (Supabase session pooler or direct): it takes a transaction-scoped advisory lock.
 */
export async function migrateDatabase(url: string, options: DatabaseOptions = {}): Promise<string[]> {
  const db = createDatabase(url, { ...options, max: 1 });
  try {
    return await transaction(db, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const directory = fileURLToPath(new URL('../migrations/postgres/', import.meta.url));
      const applied: string[] = [];
      for (const name of readdirSync(directory).filter((s) => s.endsWith('.sql')).sort()) {
        const sql = readFileSync(`${directory}/${name}`, 'utf8');
        const checksum = createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex');
        const { rows } = await client.query<{ checksum: string }>(
          'SELECT checksum FROM schema_migrations WHERE name = $1',
          [name],
        );
        if (rows[0]) {
          if (rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
          continue;
        }
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
        applied.push(name);
      }
      return applied;
    });
  } finally {
    await db.end();
  }
}

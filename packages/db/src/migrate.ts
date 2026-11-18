import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDatabase, transaction, type DatabaseOptions, type Queryable } from './index.js';

// Arbitrary constant: serialises concurrent migrators (two deploys starting at once).
const MIGRATION_LOCK = 4_221_190_318;
const SERVICE_POLICIES = ['exam_worker_access', 'exam_app_access', 'exam_service_access'];

/**
 * Row-level security on every public table. Supabase enables RLS on new tables automatically
 * (its ensure_rls event trigger); doing the same everywhere keeps local and hosted behaviour
 * identical and keeps Supabase's Data API roles locked out.
 *
 * - exam_worker: full row access everywhere, for system jobs (rescoring, payouts, fulfilment).
 * - exam_app: governed by the schema's own policies where a table has them (evaluated against
 *   current_user_id()); full row access only on tables the schema leaves without policies.
 *
 * Idempotent; runs after every migration and after role provisioning.
 */
export async function ensureServiceAccess(client: Queryable): Promise<void> {
  const { rows: roles } = await client.query<{ rolname: string }>(
    "SELECT rolname FROM pg_roles WHERE rolname IN ('exam_app', 'exam_worker')",
  );
  const has = (role: string) => roles.some((r) => r.rolname === role);
  const { rows: tables } = await client.query<{ name: string; policies: string[] }>(
    `SELECT c.relname::text AS name,
       COALESCE((SELECT array_agg(p.policyname::text) FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = c.relname), '{}') AS policies
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migrations'`,
  );
  // Supabase grants its Data API roles EXECUTE on new public functions by default; the API
  // and worker are the only callers.
  const { rows: dataApiRoles } = await client.query<{ rolname: string }>(
    "SELECT rolname::text AS rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')",
  );
  if (dataApiRoles.length > 0) {
    const list = dataApiRoles.map((r) => r.rolname).join(', ');
    await client.query(`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM ${list}`);
  }
  for (const table of tables) {
    const name = `"${table.name.replaceAll('"', '""')}"`;
    const policies = new Set(table.policies);
    const schemaPolicies = table.policies.filter((p) => !SERVICE_POLICIES.includes(p));
    await client.query(`ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY`);
    if (policies.has('exam_service_access'))
      await client.query(`DROP POLICY exam_service_access ON ${name}`);
    if (has('exam_worker') && !policies.has('exam_worker_access'))
      await client.query(
        `CREATE POLICY exam_worker_access ON ${name} FOR ALL TO exam_worker USING (true) WITH CHECK (true)`,
      );
    if (schemaPolicies.length > 0 && policies.has('exam_app_access'))
      await client.query(`DROP POLICY exam_app_access ON ${name}`);
    if (has('exam_app') && schemaPolicies.length === 0 && !policies.has('exam_app_access'))
      await client.query(
        `CREATE POLICY exam_app_access ON ${name} FOR ALL TO exam_app USING (true) WITH CHECK (true)`,
      );
  }
}

/**
 * Applies every pending migration in one transaction. Run through a session-mode
 * connection (Supabase session pooler or direct): it takes a transaction-scoped advisory lock.
 */
export async function migrateDatabase(
  url: string,
  options: DatabaseOptions = {},
): Promise<string[]> {
  const db = createDatabase(url, { ...options, max: 1 });
  try {
    return await transaction(db, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const directory = fileURLToPath(new URL('../migrations/postgres/', import.meta.url));
      const applied: string[] = [];
      for (const name of readdirSync(directory)
        .filter((s) => s.endsWith('.sql'))
        .sort()) {
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
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
          name,
          checksum,
        ]);
        applied.push(name);
      }
      await ensureServiceAccess(client);
      return applied;
    });
  } finally {
    await db.end();
  }
}

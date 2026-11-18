// Creates or rotates the restricted API/worker roles on a hosted PostgreSQL (Supabase)
// and writes their connection URLs into an env file. Passwords are generated here and
// never printed. Run after migrations; safe to re-run (re-running rotates passwords).
//
// Required env: MIGRATION_DATABASE_URL (schema owner, session pooler), DATABASE_CA_CERT_PATH,
// OUTPUT_ENV_FILE, OUTPUT_PREFIX (e.g. STAGING_). Optional: API_POOLER_PORT (default 6543).
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createDatabase, transaction } from '../dist/index.js';
import { ensureServiceAccess } from '../dist/migrate.js';

const {
  MIGRATION_DATABASE_URL: ownerUrl,
  DATABASE_CA_CERT_PATH: caCertPath,
  OUTPUT_ENV_FILE: output,
  OUTPUT_PREFIX: prefix,
} = process.env;
if (!ownerUrl || !caCertPath || !output || !prefix)
  throw new Error(
    'MIGRATION_DATABASE_URL, DATABASE_CA_CERT_PATH, OUTPUT_ENV_FILE and OUTPUT_PREFIX are required',
  );
if (!/^[A-Z][A-Z0-9_]*_$/.test(prefix)) throw new Error('OUTPUT_PREFIX must look like STAGING_');

const owner = new URL(ownerUrl);
// Supabase poolers address roles as <role>.<project-ref>.
const [ownerRole, projectRef] = decodeURIComponent(owner.username).split('.');
const roles = { app: 'exam_app', worker: 'exam_worker' };
const db = createDatabase(ownerUrl, { caCertPath, max: 1 });
const passwords = {};
try {
  await transaction(db, async (client) => {
    for (const role of Object.values(roles)) {
      const password = randomBytes(24).toString('base64url');
      passwords[role] = password;
      const exists =
        (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount === 1;
      // Role names are constants above; the password is passed as a quoted literal.
      const literal = (await client.query('SELECT quote_literal($1) AS q', [password])).rows[0].q;
      await client.query(
        `${exists ? 'ALTER' : 'CREATE'} ROLE ${role} WITH LOGIN NOINHERIT NOCREATEDB NOCREATEROLE PASSWORD ${literal}`,
      );
    }
    await client.query(`
    GRANT USAGE ON SCHEMA public TO exam_app, exam_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO exam_app, exam_worker;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO exam_app, exam_worker;
    REVOKE ALL ON schema_migrations FROM exam_app, exam_worker;
    ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO exam_app, exam_worker;
    ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO exam_app, exam_worker;`);
    // Supabase grants its Data API roles access to new public tables by default. The NestJS
    // API is the only path to data, so close that even if the Data API is re-enabled.
    const supabaseRoles =
      (
        await client.query(
          "SELECT array_agg(rolname::text) AS r FROM pg_roles WHERE rolname IN ('anon', 'authenticated')",
        )
      ).rows[0].r ?? [];
    if (supabaseRoles.length) {
      const list = supabaseRoles.join(', ');
      await client.query(`
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${list};
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${list};
      ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public REVOKE ALL ON TABLES FROM ${list};
      ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${list};`);
    }
    // Supabase enables row-level security on new tables; give only our roles row access.
    await ensureServiceAccess(client);
  });
} finally {
  await db.end();
}

function roleUrl(role, port) {
  const url = new URL(owner.href);
  url.username = projectRef ? `${role}.${projectRef}` : role;
  url.password = passwords[role];
  url.port = String(port);
  return url.href;
}
const values = {
  [`${prefix}DATABASE_URL`]: roleUrl(roles.app, process.env.API_POOLER_PORT ?? 6543),
  [`${prefix}WORKER_DATABASE_URL`]: roleUrl(roles.worker, owner.port || 5432),
  [`${prefix}DATABASE_CA_CERT_PATH`]: caCertPath,
};
let text = existsSync(output) ? readFileSync(output, 'utf8') : '';
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  text = pattern.test(text)
    ? text.replace(pattern, () => line)
    : `${text.replace(/\n?$/, '\n')}${line}\n`;
}
writeFileSync(output, text);
console.log(
  `Roles ${Object.values(roles).join(', ')} ready; wrote ${Object.keys(values).join(', ')} to ${output}`,
);

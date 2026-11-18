// Creates or rotates exam_keepalive: a login-only role used by the scheduled GitHub Actions
// job that keeps a Supabase free-plan project from pausing. It has no table, sequence or
// function grants beyond PostgreSQL defaults, and row-level security on every table gives it
// no rows. Writes its URL into an env file without printing the password.
//
// Required env: MIGRATION_DATABASE_URL (schema owner), DATABASE_CA_CERT_PATH, OUTPUT_ENV_FILE,
// OUTPUT_PREFIX (e.g. STAGING_). Optional: KEEPALIVE_POOLER_PORT (default 6543).
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createDatabase, transaction } from '../dist/index.js';

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
const projectRef = decodeURIComponent(owner.username).split('.')[1];
const password = randomBytes(24).toString('base64url');
const db = createDatabase(ownerUrl, { caCertPath, max: 1 });
try {
  await transaction(db, async (client) => {
    const exists =
      (await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'exam_keepalive'")).rowCount === 1;
    const literal = (await client.query('SELECT quote_literal($1) AS q', [password])).rows[0].q;
    await client.query(
      `${exists ? 'ALTER' : 'CREATE'} ROLE exam_keepalive WITH LOGIN NOINHERIT NOCREATEDB NOCREATEROLE CONNECTION LIMIT 2 PASSWORD ${literal}`,
    );
    // Belt and braces: nothing in public is readable even if a default grant appears later.
    await client.query(`
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM exam_keepalive;
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM exam_keepalive;`);
  });
} finally {
  await db.end();
}

const url = new URL(owner.href);
url.username = projectRef ? `exam_keepalive.${projectRef}` : 'exam_keepalive';
url.password = password;
url.port = String(process.env.KEEPALIVE_POOLER_PORT ?? 6543);
const key = `${prefix}KEEPALIVE_DATABASE_URL`;
const line = `${key}=${url.href}`;
let text = existsSync(output) ? readFileSync(output, 'utf8') : '';
const pattern = new RegExp(`^${key}=.*$`, 'm');
text = pattern.test(text) ? text.replace(pattern, () => line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
writeFileSync(output, text);
console.log(`Role exam_keepalive ready; wrote ${key} to ${output}`);

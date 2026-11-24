// Browser acceptance runner (pnpm test:browser). Everything it starts is its own: a fresh
// PostgreSQL database seeded with the demo catalogue, the API in test mode on a free port, and a
// separate web build in .next-e2e. Firebase is never contacted: the API trusts a key generated
// here (FIREBASE_TEST_JWKS, test mode only) and the spec answers the browser's Firebase calls
// with tokens signed by that key. Local MinIO and ClamAV (pnpm services:up) are used for real.
import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomBytes, createSign, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../../../../packages/db/dist/index.js';
import { migrateDatabase } from '../../../../packages/db/dist/migrate.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const web = fileURLToPath(new URL('../../', import.meta.url));
const PROJECT = 'demo-exam-prep-e2e';
const adminUrl = process.env.MIGRATION_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
if (!adminUrl || !appUrl) throw new Error('MIGRATION_DATABASE_URL and DATABASE_URL are required; run pnpm setup');

async function freePort() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}
const withDatabase = (url, name) => {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.href;
};
const base64url = (value) => Buffer.from(value).toString('base64url');

// Test-only signing key; the public half goes to the API, tokens go to the spec.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'e2e-key', alg: 'RS256', use: 'sig' }] };
function idToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: 'e2e-key', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: `https://securetoken.google.com/${PROJECT}`,
      aud: PROJECT,
      sub: user.uid,
      user_id: user.uid,
      email: user.email,
      email_verified: true,
      name: user.name,
      auth_time: now - 5,
      iat: now,
      exp: now + 3600,
      firebase: { sign_in_provider: 'password', identities: { email: [user.email] } },
    }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}
const tag = randomBytes(3).toString('hex');
const users = Object.fromEntries(
  [
    ['examiner', 'Asha Examiner'],
    ['admin', 'Ravi Operations'],
  ].map(([role, name]) => {
    const user = { uid: `e2e-${role}-${randomUUID()}`, email: `${role}-${tag}@example.test`, name };
    return [role, { ...user, token: idToken(user) }];
  }),
);

const children = [];
function start(name, command, args, cwd, env) {
  // An undefined value removes the variable (for example an emulator host from .env).
  const merged = Object.fromEntries(Object.entries({ ...process.env, ...env }).filter(([, value]) => value !== undefined));
  const child = spawn(command, args, { cwd, env: merged, stdio: ['ignore', 'inherit', 'inherit'] });
  child.name = name;
  children.push(child);
  return child;
}
async function run(name, command, args, cwd, env) {
  const child = start(name, command, args, cwd, env);
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`${name} failed with exit code ${code}`);
}
async function waitFor(url, child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`${child.name} exited (code ${child.exitCode}) before ${url}`);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return;
    } catch {
      /* Retry until the deadline. */
    }
    await delay(500);
  }
  throw new Error(`${child.name} did not become ready: ${url}`);
}

const name = `exam_e2e_${randomBytes(6).toString('hex')}`;
const admin = createDatabase(adminUrl, { max: 1 });
const nextEnv = readFileSync(`${web}next-env.d.ts`, 'utf8');
let owner;
let status = 1;
try {
  const [apiPort, webPort] = [await freePort(), await freePort()];
  const origin = `http://localhost:${webPort}`;
  const apiBase = `http://127.0.0.1:${apiPort}/v1`;

  await admin.query(`CREATE DATABASE ${name}`);
  owner = createDatabase(withDatabase(adminUrl, name), { max: 2 });
  await owner.query(readFileSync(`${root}docker/postgres/init/002-grants.sql`, 'utf8'));
  await migrateDatabase(withDatabase(adminUrl, name));
  await run('Demo seed', process.execPath, ['seeds/demo-catalogue.mjs'], `${root}packages/db`, {
    APP_ENV: 'test',
    MIGRATION_DATABASE_URL: withDatabase(adminUrl, name),
  });

  const api = start('API', process.execPath, ['dist/main.js'], `${root}apps/api`, {
    NODE_ENV: 'test',
    APP_ENV: 'test',
    API_PORT: String(apiPort),
    PUBLIC_WEB_ORIGIN: origin,
    CORS_ORIGINS: origin,
    DATABASE_URL: withDatabase(appUrl, name),
    WORKER_DATABASE_URL: withDatabase(appUrl, name),
    FIREBASE_PROJECT_ID: PROJECT,
    FIREBASE_TEST_JWKS: JSON.stringify(jwks),
    FIREBASE_AUTH_EMULATOR_HOST: undefined,
  });
  await waitFor(`http://127.0.0.1:${apiPort}/health/ready`, api);

  // The operations admin exists before the run, as the bootstrap script would leave it.
  const session = await fetch(`${apiBase}/identity/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${users.admin.token}` },
    body: JSON.stringify({ deviceName: 'E2E setup', platform: 'web', ageConfirmed: true }),
  });
  if (session.status !== 200) throw new Error(`Admin session failed with ${session.status}`);
  const { profile } = await session.json();
  await owner.query(
    "UPDATE profiles SET roles=array_append(roles,'admin'::user_role_type), is_ops_admin=true WHERE id=$1",
    [profile.id],
  );

  const webEnv = {
    NODE_ENV: 'production',
    NEXT_DIST_DIR: '.next-e2e',
    NEXT_TSCONFIG: 'tsconfig.e2e.json',
    NEXT_PUBLIC_API_BASE_URL: apiBase,
    API_BASE_URL: apiBase,
    NEXT_PUBLIC_SITE_URL: origin,
    NEXT_PUBLIC_FIREBASE_API_KEY: 'e2e-browser-key',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
    NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:e2e',
  };
  const nextBin = `${web}node_modules/next/dist/bin/next`;
  if (process.env.E2E_REUSE_BUILD !== 'true') await run('Web build', process.execPath, [nextBin, 'build'], web, webEnv);
  const site = start('Web', process.execPath, [nextBin, 'start', '--port', String(webPort)], web, webEnv);
  await waitFor(`http://127.0.0.1:${webPort}/health`, site);

  const playwright = start(
    'Playwright',
    process.execPath,
    [`${web}node_modules/@playwright/test/cli.js`, 'test', ...process.argv.slice(2)],
    web,
    { E2E_BASE_URL: origin, E2E_API_URL: apiBase, E2E_USERS: JSON.stringify(users) },
  );
  [status] = await once(playwright, 'exit');
} catch (error) {
  console.error(error);
} finally {
  await Promise.all(
    children.map(async (child) => {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(force);
    }),
  );
  // next build rewrites next-env.d.ts for its dist folder; keep the tracked file unchanged.
  writeFileSync(`${web}next-env.d.ts`, nextEnv);
  await owner?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch((error) => console.error(error));
  await admin.end();
}
process.exit(status ?? 1);

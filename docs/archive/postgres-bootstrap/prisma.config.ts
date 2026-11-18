import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { defineConfig, env } from 'prisma/config';

const localEnv = new URL('../../.env', import.meta.url);
if (existsSync(localEnv)) loadEnvFile(localEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'migrations', seed: 'node --env-file-if-exists=../../.env seeds/index.mjs' },
  datasource: { url: env('DIRECT_DATABASE_URL') },
});

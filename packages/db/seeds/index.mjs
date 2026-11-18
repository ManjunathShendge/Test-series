import { createDatabase } from '../dist/index.js';
if (!['local', 'test'].includes(process.env.APP_ENV ?? '')) throw new Error('Seed requires APP_ENV=local or test');
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL is required');
const db = createDatabase(url, { max: 1 });
try {
  await db.query("INSERT INTO bootstrap_state VALUES ('synthetic-fixture', 1) ON CONFLICT (id) DO NOTHING");
  console.log('Fixture ready; no accounts or paid entitlements were fabricated');
} finally { await db.end(); }

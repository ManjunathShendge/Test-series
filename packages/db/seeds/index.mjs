import { createDatabase } from '../dist/index.js';
if (!['local', 'test'].includes(process.env.APP_ENV ?? '')) throw new Error('Seed requires APP_ENV=local or test');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = createDatabase(process.env.DATABASE_URL);
try {
  db.prepare("INSERT INTO bootstrap_state VALUES ('synthetic-fixture', 1) ON CONFLICT(id) DO NOTHING").run();
  console.log('SQLite fixture ready; no accounts or paid entitlements were fabricated');
} finally { db.close(); }

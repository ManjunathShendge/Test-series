import { migrateDatabase } from '../dist/migrate.js';
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL is required; run pnpm setup');
const applied = await migrateDatabase(url, { caCertPath: process.env.DATABASE_CA_CERT_PATH || undefined });
console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Database schema is up to date');

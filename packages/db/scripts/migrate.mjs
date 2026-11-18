import { migrateDatabase } from '../dist/migrate.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; run pnpm setup');
migrateDatabase(process.env.DATABASE_URL);
console.log('SQLite migrations applied');

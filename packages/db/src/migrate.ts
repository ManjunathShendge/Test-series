import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, transaction } from './index.js';
import { resolveDatabasePath } from './path.js';

export function migrateDatabase(url: string): void {
  mkdirSync(dirname(resolveDatabasePath(url)), { recursive: true });
  const db = createDatabase(url);
  try {
    transaction(db, () => {
      db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL) STRICT');
      const directory = fileURLToPath(new URL('../migrations/sqlite/', import.meta.url));
      for (const name of readdirSync(directory).filter((s) => s.endsWith('.sql')).sort()) {
        const sql = readFileSync(`${directory}/${name}`, 'utf8');
        const checksum = createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex');
        const existing = db.prepare('SELECT checksum FROM schema_migrations WHERE name = ?').get(name);
        if (existing) {
          if (existing['checksum'] !== checksum) throw new Error(`Applied migration changed: ${name}`);
          continue;
        }
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, checksum);
      }
    });
  } finally { db.close(); }
}

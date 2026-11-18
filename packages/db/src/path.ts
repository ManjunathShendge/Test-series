import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';

// Package source/dist both sit one level below packages/db. All processes resolve
// relative database paths against the same workspace, never their working directory.
const workspace = fileURLToPath(new URL('../../../', import.meta.url));
export function resolveDatabasePath(value: string): string {
  if (!value.startsWith('file:') || value === 'file:' || value.includes(':memory:')) {
    throw new Error('DATABASE_URL must identify a persistent SQLite file');
  }
  if (value.startsWith('file://')) return fileURLToPath(value);
  const path = value.slice(5);
  return isAbsolute(path) ? path : resolve(workspace, path);
}

import { readdir, readFile } from 'node:fs/promises';

const allowed = new Set(['NEXT_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_API_BASE_URL']);
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.next', '.expo', 'dist', 'android', 'ios', '.turbo'].includes(entry.name))
      continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await inspect(path);
      continue;
    }
    if (!/\.(?:tsx?|mjs|json)$/.test(entry.name) && entry.name !== '.env.example') continue;
    const text = await readFile(path, 'utf8');
    for (const [name] of text.matchAll(/(?:NEXT|EXPO)_PUBLIC_[A-Z0-9_]+/g)) {
      if (!allowed.has(name))
        throw new Error(`Unreviewed public environment variable ${name} in ${path}`);
    }
  }
}
await inspect('apps/web');
await inspect('apps/mobile');
console.log('Client public environment allowlist passed (not a general secret scanner).');

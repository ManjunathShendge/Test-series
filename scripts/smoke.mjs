import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

// Own isolated listeners; never attach to or terminate a developer's app.
const env = {
  ...process.env,
  NODE_ENV: 'test',
  APP_ENV: 'test',
  API_PORT: '43101',
  WORKER_PORT: '43102',
};
const children = [];
function start(args, cwd) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  children.push(child);
  return child;
}
async function waitFor(url, child) {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`Service exited before ${url}`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return;
    } catch {
      /* Retry until deadline. */
    }
    await delay(500);
  }
  throw new Error(`Service did not become ready: ${url}`);
}
try {
  const api = start(['dist/main.js'], 'apps/api');
  const worker = start(['dist/worker.js'], 'apps/api');
  const web = start(['node_modules/next/dist/bin/next', 'start', '--port', '43100'], 'apps/web');
  await Promise.all([
    waitFor('http://127.0.0.1:43101/health/ready', api),
    waitFor('http://127.0.0.1:43102/health/ready', worker),
    waitFor('http://127.0.0.1:43100/health', web),
  ]);
  assert.match(await (await fetch('http://127.0.0.1:43100')).text(), /Exam Prep Marketplace/);
  const allowed = await fetch('http://127.0.0.1:43101/health/live', {
    headers: { Origin: 'http://localhost:3000' },
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  const denied = await fetch('http://127.0.0.1:43101/health/live', {
    headers: { Origin: 'https://untrusted.example' },
  });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  console.log('API, worker, web and CORS smoke checks passed.');
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
}

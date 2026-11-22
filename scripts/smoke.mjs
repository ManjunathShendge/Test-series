import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

// Ports the OS reports free right now. Fixed ports can collide on CI runners, where they fall
// inside the ephemeral range used by outgoing connections.
async function freePort() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}
const [webPort, apiPort, workerPort] = [await freePort(), await freePort(), await freePort()];

// Own isolated listeners; never attach to or terminate a developer's app.
const env = {
  ...process.env,
  NODE_ENV: 'test',
  APP_ENV: 'test',
  API_PORT: String(apiPort),
  WORKER_PORT: String(workerPort),
};
const children = [];
function start(name, args, cwd) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  child.name = name;
  children.push(child);
  return child;
}
async function waitFor(url, child) {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        `${child.name} exited (code ${child.exitCode}, signal ${child.signalCode}) before ${url}`,
      );
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return;
    } catch {
      /* Retry until deadline. */
    }
    await delay(500);
  }
  throw new Error(`${child.name} did not become ready: ${url}`);
}
try {
  console.log(`Smoke ports: web ${webPort}, API ${apiPort}, worker ${workerPort}`);
  const api = start('API', ['dist/main.js'], 'apps/api');
  const worker = start('Worker', ['dist/worker.js'], 'apps/api');
  const web = start(
    'Web',
    ['node_modules/next/dist/bin/next', 'start', '--port', String(webPort)],
    'apps/web',
  );
  await Promise.all([
    waitFor(`http://127.0.0.1:${apiPort}/health/ready`, api),
    waitFor(`http://127.0.0.1:${workerPort}/health/ready`, worker),
    waitFor(`http://127.0.0.1:${webPort}/health`, web),
  ]);
  assert.match(await (await fetch(`http://127.0.0.1:${webPort}`)).text(), /MakeMePrepare/);
  const allowed = await fetch(`http://127.0.0.1:${apiPort}/health/live`, {
    headers: { Origin: 'http://localhost:3000' },
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  const denied = await fetch(`http://127.0.0.1:${apiPort}/health/live`, {
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

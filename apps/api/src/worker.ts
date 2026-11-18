import 'reflect-metadata';
import { createServer } from 'node:http';
import { checkDatabase, createDatabase } from '@exam-prep/db';
import { parseEnvironment } from './config/env.js';

const env = parseEnvironment(process.env);
const database = createDatabase(env.DATABASE_URL);
let ready = false;
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/health/live') {
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (request.url !== '/health/ready') {
    response.writeHead(404).end(JSON.stringify({ status: 'not_found' }));
    return;
  }
  try {
    if (!ready) throw new Error('Starting or stopping');
    await checkDatabase(database);
    database.prepare('SELECT id FROM jobs LIMIT 1').all();
    response.end(JSON.stringify({ status: 'ok', checks: { database: 'ok', queue: 'ok' } }));
  } catch {
    response.writeHead(503).end(JSON.stringify({ status: 'unavailable' }));
  }
});
server.listen(env.WORKER_PORT);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  ready = false;
  server.close();
  database.close();
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
try {
  await checkDatabase(database);
  database.prepare('SELECT id FROM jobs LIMIT 1').all();
  ready = true;
  console.log(
    `Worker ready on port ${env.WORKER_PORT}; domain consumers arrive in later milestones`,
  );
} catch {
  console.error('Worker startup failed: check database connectivity and migrations');
  await stop();
  process.exitCode = 1;
}

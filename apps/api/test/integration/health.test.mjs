import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../dist/app.module.js';

async function withApi(databaseUrl, check) {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    await check(await app.getUrl());
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}

test('HTTP liveness survives an unavailable database, readiness returns 503 without secrets', async () => {
  // Port 1 refuses connections; the password must never appear in a response.
  await withApi('postgresql://exam_app:never-print-this@127.0.0.1:1/exam_prep', async (url) => {
    assert.equal((await fetch(`${url}/health/live`)).status, 200);
    const response = await fetch(`${url}/health/ready`);
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.ok(!body.includes('never-print-this'));
    assert.ok(body.includes('failed'));
  });
});

test('readiness passes against the migrated database', async () => {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required; run pnpm setup and pnpm db:migrate');
  await withApi(process.env.DATABASE_URL, async (url) => {
    const response = await fetch(`${url}/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).checks, { database: 'ok', schema: 'ok' });
  });
});

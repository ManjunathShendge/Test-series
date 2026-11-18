import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../dist/app.module.js';

test('HTTP liveness survives an unavailable database, readiness returns 503 without secrets', async () => {
  const previous = process.env.DATABASE_URL;
  const directory = mkdtempSync(join(tmpdir(), 'exam-health-'));
  process.env.DATABASE_URL = pathToFileURL(join(directory, 'unmigrated.sqlite')).href;
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    assert.equal((await fetch(`${url}/health/live`)).status, 200);
    const response = await fetch(`${url}/health/ready`);
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.ok(!body.includes('never-print-this'));
    assert.ok(body.includes('failed'));
  } finally {
    await app.close();
    assert.ok(directory.startsWith(join(tmpdir(), 'exam-health-')));
    rmSync(directory, { recursive: true });
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

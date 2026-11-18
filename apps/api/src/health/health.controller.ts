import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { checkDatabase, DATABASE } from '../database/database.module.js';
import type { Database } from '@exam-prep/db';

/**
 * Liveness answers "is this process alive" and must stay dependency free, so a
 * failing database never causes the platform to restart a healthy process.
 * Readiness answers "may this instance receive traffic" and is where dependency
 * and migration-compatibility checks are added as they arrive (docs/OPERATIONS.md).
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly database: Database) {}
  @Get('live')
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok'; checks: Record<string, string> }> {
    try {
      await checkDatabase(this.database);
      return { status: 'ok', checks: { database: 'ok', schema: 'ok' } };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        checks: { database: 'failed' },
      });
    }
  }
}

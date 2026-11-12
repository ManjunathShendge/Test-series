import { Controller, Get } from '@nestjs/common';

/**
 * Liveness answers "is this process alive" and must stay dependency free, so a
 * failing database never causes the platform to restart a healthy process.
 * Readiness answers "may this instance receive traffic" and is where dependency
 * and migration-compatibility checks are added as they arrive (docs/OPERATIONS.md).
 */
@Controller('health')
export class HealthController {
  @Get('live')
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  @Get('ready')
  ready(): { status: 'ok'; checks: Record<string, string> } {
    // M0 has no dependencies wired yet. Each one registers a named check here.
    return { status: 'ok', checks: {} };
  }
}

import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { DatabaseModule } from './database/database.module.js';

/**
 * Domain modules from docs/ARCHITECTURE.md are registered here as they are built.
 * HTTP and worker entry points share this module graph.
 */
@Module({ imports: [DatabaseModule, HealthModule] })
export class AppModule {}

import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HealthModule } from './health/health.module.js';
import { DatabaseModule } from './database/database.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { CatalogueModule } from './modules/catalogue/catalogue.module.js';
import { ApiErrorFilter } from './common/filters/api-error.filter.js';

/**
 * Domain modules from docs/ARCHITECTURE.md are registered here as they are built.
 * HTTP and worker entry points share this module graph.
 */
@Module({
  imports: [DatabaseModule, HealthModule, IdentityModule, CatalogueModule],
  providers: [{ provide: APP_FILTER, useClass: ApiErrorFilter }],
})
export class AppModule {}

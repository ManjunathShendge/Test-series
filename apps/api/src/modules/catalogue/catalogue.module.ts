import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AdminCatalogueService } from './application/admin-catalogue.service.js';
import { CatalogueService } from './application/catalogue.service.js';
import { AdminCatalogueController } from './http/admin-catalogue.controller.js';
import { CatalogueController } from './http/catalogue.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [CatalogueController, AdminCatalogueController],
  providers: [CatalogueService, AdminCatalogueService],
})
export class CatalogueModule {}

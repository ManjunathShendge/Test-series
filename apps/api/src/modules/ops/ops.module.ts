import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { OpsService } from './application/ops.service.js';
import { OpsController, PublicBannersController } from './http/ops.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [OpsController, PublicBannersController],
  providers: [OpsService],
})
export class OpsModule {}

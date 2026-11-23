import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AuthoringService } from './application/authoring.service.js';
import { AuthoringController } from './http/authoring.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [AuthoringController],
  providers: [AuthoringService],
})
export class AuthoringModule {}

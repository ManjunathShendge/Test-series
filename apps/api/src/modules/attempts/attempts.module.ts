import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AttemptFinalizer } from './application/attempt-finalizer.js';
import { AttemptsService } from './application/attempts.service.js';
import { AttemptsController } from './http/attempts.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [AttemptsController],
  providers: [AttemptsService, AttemptFinalizer],
})
export class AttemptsModule {}

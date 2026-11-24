import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { PublishScheduler } from './application/publish-scheduler.js';
import { QcService } from './application/qc.service.js';
import { AdminQcController, ExaminerQualityController, QcReviewController } from './http/qc.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [QcReviewController, ExaminerQualityController, AdminQcController],
  providers: [QcService, PublishScheduler],
})
export class QcModule {}

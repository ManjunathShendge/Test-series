import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AuthoringService } from './application/authoring.service.js';
import { ExaminerTestsService } from './application/examiner-tests.service.js';
import { AuthoringController } from './http/authoring.controller.js';
import { ExaminerTestsController } from './http/examiner-tests.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [AuthoringController, ExaminerTestsController],
  providers: [AuthoringService, ExaminerTestsService],
})
export class AuthoringModule {}

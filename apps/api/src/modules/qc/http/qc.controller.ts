import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  AddQcReviewerRequest,
  CorrectKeyRequest,
  CreateSpotCheckRequest,
  MapReviewerRequest,
  QcDecisionRequest,
  QcFinishRequest,
  QcMinorEditRequest,
  ReassignReviewRequest,
  RespondReportRequest,
  ResolveReportRequest,
  SpotCheckResultRequest,
  UpdateAdminExaminerRequest,
  UpdateQcSettingsRequest,
  type AdminExaminer,
  type AdminExaminerList,
  type AssetViewUrl,
  type ExaminerQualityResponse,
  type QcFinishResponse,
  type QcOverview,
  type QcQueue,
  type QcReviewDetail,
  type QuestionReportList,
} from '@exam-prep/contracts';
import { FirebaseAuthGuard, CurrentIdentity } from '../../../common/guards/firebase-auth.guard.js';
import { parseContract } from '../../../common/pipes/parse-contract.js';
import type { VerifiedIdentity } from '../../../providers/firebase/identity-verifier.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import { CurrentAccess, RequireAdminPermission, Roles, RolesGuard } from '../../identity/http/roles.guard.js';
import { QcService } from '../application/qc.service.js';

const Id = z.uuid();

/** Reviewer workspace: assigned reviews, decisions, verdicts, second reviews and student reports. */
@Controller('qc')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('qc_reviewer', 'admin')
export class QcReviewController {
  constructor(private readonly service: QcService) {}

  @Get('queue')
  queue(@CurrentAccess() access: AccessContext): Promise<QcQueue> {
    return this.service.queue(access);
  }

  @Get('reviews/:id')
  review(@CurrentAccess() access: AccessContext, @Param('id') id: string): Promise<QcReviewDetail> {
    return this.service.getReview(access, parseContract(Id, id));
  }

  @Put('reviews/:id/items/:itemId')
  decide(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ): Promise<QcReviewDetail> {
    return this.service.decide(
      access,
      parseContract(Id, id),
      parseContract(Id, itemId),
      parseContract(QcDecisionRequest, body),
    );
  }

  @Put('reviews/:id/items/:itemId/edit')
  minorEdit(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ): Promise<QcReviewDetail> {
    return this.service.minorEdit(
      access,
      parseContract(Id, id),
      parseContract(Id, itemId),
      parseContract(QcMinorEditRequest, body),
    );
  }

  @Post('reviews/:id/finish')
  @HttpCode(200)
  finish(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<QcFinishResponse> {
    return this.service.finish(access, parseContract(Id, id), parseContract(QcFinishRequest, body).comments);
  }

  @Post('reviews/:id/spot-check')
  @HttpCode(200)
  spotCheck(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<QcFinishResponse> {
    return this.service.spotCheckResult(access, parseContract(Id, id), parseContract(SpotCheckResultRequest, body));
  }

  @Get('reviews/:id/images/:assetId')
  image(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
  ): Promise<AssetViewUrl> {
    return this.service.reviewImage(access, parseContract(Id, id), parseContract(Id, assetId));
  }

  @Get('reports')
  reports(@CurrentAccess() access: AccessContext): Promise<QuestionReportList> {
    return this.service.staffReports(access);
  }

  @Post('reports/:id/correct-key')
  @HttpCode(200)
  correctKey(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<QuestionReportList> {
    return this.service.correctKey(access, parseContract(Id, id), parseContract(CorrectKeyRequest, body));
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  resolve(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<QuestionReportList> {
    return this.service.resolveReport(access, parseContract(Id, id), parseContract(ResolveReportRequest, body));
  }
}

/** Examiner dashboard: tier and quality inputs, and student reports to answer (PRD 4.4). */
@Controller('examiner')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ExaminerQualityController {
  constructor(private readonly service: QcService) {}

  @Get('quality')
  quality(@CurrentIdentity() identity: VerifiedIdentity): Promise<ExaminerQualityResponse> {
    return this.service.examinerQuality(identity);
  }

  @Get('reports')
  reports(@CurrentIdentity() identity: VerifiedIdentity): Promise<QuestionReportList> {
    return this.service.examinerReports(identity);
  }

  @Post('reports/:id/response')
  @HttpCode(200)
  respond(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<QuestionReportList> {
    return this.service.respond(identity, parseContract(Id, id), parseContract(RespondReportRequest, body).response);
  }
}

/** Admin QC operations and examiner management (PRD 8 "QC operations", "Examiners"). */
@Controller('admin')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@RequireAdminPermission('ops')
export class AdminQcController {
  constructor(private readonly service: QcService) {}

  @Get('qc')
  overview(@CurrentAccess() access: AccessContext): Promise<QcOverview> {
    return this.service.overview(access);
  }

  @Post('qc/reviewers')
  addReviewer(@CurrentAccess() access: AccessContext, @Body() body: unknown): Promise<QcOverview> {
    return this.service.addReviewer(access, parseContract(AddQcReviewerRequest, body));
  }

  @Delete('qc/reviewers/:id')
  removeReviewer(@CurrentAccess() access: AccessContext, @Param('id') id: string): Promise<QcOverview> {
    return this.service.removeReviewer(access, parseContract(Id, id));
  }

  @Post('qc/reviewers/:id/exams')
  mapReviewer(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<QcOverview> {
    return this.service.mapReviewer(access, parseContract(Id, id), parseContract(MapReviewerRequest, body).examId);
  }

  @Delete('qc/mappings/:id')
  unmapReviewer(@CurrentAccess() access: AccessContext, @Param('id') id: string): Promise<QcOverview> {
    return this.service.unmapReviewer(access, parseContract(Id, id));
  }

  @Patch('qc/reviews/:id/assign')
  assign(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<QcOverview> {
    return this.service.assign(access, parseContract(Id, id), parseContract(ReassignReviewRequest, body));
  }

  @Post('qc/spot-checks')
  spotCheck(@CurrentAccess() access: AccessContext, @Body() body: unknown): Promise<QcOverview> {
    return this.service.createSpotCheck(access, parseContract(CreateSpotCheckRequest, body));
  }

  @Put('qc/settings/:examId')
  settings(@CurrentAccess() access: AccessContext, @Param('examId') examId: string, @Body() body: unknown): Promise<QcOverview> {
    return this.service.updateSettings(access, parseContract(Id, examId), parseContract(UpdateQcSettingsRequest, body));
  }

  @Get('examiners')
  examiners(@CurrentAccess() access: AccessContext): Promise<AdminExaminerList> {
    return this.service.examiners(access);
  }

  @Patch('examiners/:id')
  updateExaminer(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminExaminer> {
    return this.service.updateExaminer(access, parseContract(Id, id), parseContract(UpdateAdminExaminerRequest, body));
  }
}

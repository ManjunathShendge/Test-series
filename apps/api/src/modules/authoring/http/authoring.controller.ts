import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  CreateExaminerApplicationRequest,
  DecideExaminerApplicationRequest,
  DEVICE_ID_HEADER,
  type ExaminerApplication,
  type ExaminerApplicationList,
  AssetUploadIntentRequest,
  AssetUploadIntent,
  AdminKycDownloadUrl,
  CompleteAssetRequest,
  DraftQuestionInput,
  DraftQuestion,
  DraftQuestionList,
  QuestionBankQuery,
  type AssetViewUrl,
  ImportPreviewRequest,
  ImportPreview,
  ImportCommitRequest,
  ExaminerAuthoringOptions,
} from '@exam-prep/contracts';
import { FirebaseAuthGuard, CurrentIdentity } from '../../../common/guards/firebase-auth.guard.js';
import { parseContract } from '../../../common/pipes/parse-contract.js';
import type { VerifiedIdentity } from '../../../providers/firebase/identity-verifier.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import {
  CurrentAccess,
  RequireAdminPermission,
  RolesGuard,
} from '../../identity/http/roles.guard.js';
import { AuthoringService } from '../application/authoring.service.js';

const IdParam = z.uuid();

@Controller()
export class AuthoringController {
  constructor(private readonly service: AuthoringService) {}

  @Post('examiner/applications')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  createApplication(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Headers(DEVICE_ID_HEADER) _deviceId: string | undefined,
    @Body() body: unknown,
  ): Promise<ExaminerApplication> {
    return this.service.createApplication(
      identity,
      parseContract(CreateExaminerApplicationRequest, body),
    );
  }

  @Get('examiner/options')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  authoringOptions(
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<ExaminerAuthoringOptions> {
    return this.service.authoringOptions(identity);
  }

  @Get('examiner/application')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  ownApplication(
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<ExaminerApplication | null> {
    return this.service.ownApplication(identity);
  }

  @Get('admin/examiner-applications')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @RequireAdminPermission('ops')
  listApplications(@CurrentAccess() access: AccessContext): Promise<ExaminerApplicationList> {
    return this.service.listApplications(access);
  }

  @Patch('admin/examiner-applications/:id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @RequireAdminPermission('ops')
  decideApplication(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ExaminerApplication> {
    return this.service.decideApplication(
      access,
      parseContract(IdParam, id),
      parseContract(DecideExaminerApplicationRequest, body),
    );
  }

  @Get('admin/examiner-applications/:applicationId/kyc/:assetId/download-url')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @RequireAdminPermission('ops')
  kycDownloadUrl(
    @CurrentAccess() access: AccessContext,
    @Param('applicationId') applicationId: string,
    @Param('assetId') assetId: string,
  ): Promise<AdminKycDownloadUrl> {
    return this.service.kycDownloadUrl(
      access,
      parseContract(IdParam, applicationId),
      parseContract(IdParam, assetId),
    );
  }

  @Post('assets/upload-intents')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  createUploadIntent(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: unknown,
  ): Promise<AssetUploadIntent> {
    return this.service.createUploadIntent(identity, parseContract(AssetUploadIntentRequest, body));
  }

  @Post('assets/:id/complete')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  completeUpload(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ id: string; sha256: string; sizeBytes: number }> {
    return this.service.completeUpload(
      identity,
      parseContract(IdParam, id),
      parseContract(CompleteAssetRequest, body),
    );
  }

  @Get('examiner/questions')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  listQuestions(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query() query: unknown,
  ): Promise<DraftQuestionList> {
    return this.service.listDraftQuestions(identity, parseContract(QuestionBankQuery, query));
  }

  @Get('assets/:id/view-url')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  imageViewUrl(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param('id') id: string,
  ): Promise<AssetViewUrl> {
    return this.service.questionImageUrl(identity, parseContract(IdParam, id));
  }

  @Post('examiner/questions')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  createQuestion(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: unknown,
  ): Promise<DraftQuestion> {
    return this.service.createDraftQuestion(identity, parseContract(DraftQuestionInput, body));
  }

  @Patch('examiner/questions/:id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  updateQuestion(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DraftQuestion> {
    return this.service.updateDraftQuestion(
      identity,
      parseContract(IdParam, id),
      parseContract(DraftQuestionInput, body),
    );
  }

  @Post('examiner/imports/preview')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  previewImport(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: unknown,
  ): Promise<ImportPreview> {
    return this.service.previewImport(identity, parseContract(ImportPreviewRequest, body));
  }

  @Post('examiner/imports/:id/commit')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  commitImport(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ id: string; questionIds: string[] }> {
    return this.service.commitImport(
      identity,
      parseContract(IdParam, id),
      parseContract(ImportCommitRequest, body),
    );
  }
}

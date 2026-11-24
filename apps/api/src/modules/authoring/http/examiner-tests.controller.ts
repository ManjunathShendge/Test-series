import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  CreateExaminerSeriesRequest,
  CreateExaminerTestRequest,
  ExaminerTestActionRequest,
  FillTestFromImportRequest,
  SetSectionQuestionsRequest,
  UpdateExaminerSeriesRequest,
  UpdateExaminerTestRequest,
  type ExaminerSeriesDetail,
  type ExaminerSeriesList,
  type ExaminerTestDetail,
  type ExaminerTestList,
  type SubmitExaminerTestResponse,
} from '@exam-prep/contracts';
import { FirebaseAuthGuard, CurrentIdentity } from '../../../common/guards/firebase-auth.guard.js';
import { parseContract } from '../../../common/pipes/parse-contract.js';
import type { VerifiedIdentity } from '../../../providers/firebase/identity-verifier.js';
import { Roles, RolesGuard } from '../../identity/http/roles.guard.js';
import { ExaminerTestsService } from '../application/examiner-tests.service.js';

const Id = z.uuid();

/** Examiner-owned draft tests and series (API_CONTRACTS "/examiner/tests"). */
@Controller('examiner')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('examiner')
export class ExaminerTestsController {
  constructor(private readonly service: ExaminerTestsService) {}

  @Get('tests')
  listTests(@CurrentIdentity() identity: VerifiedIdentity): Promise<ExaminerTestList> {
    return this.service.listTests(identity);
  }

  @Post('tests')
  createTest(@CurrentIdentity() identity: VerifiedIdentity, @Body() body: unknown): Promise<ExaminerTestDetail> {
    return this.service.createTest(identity, parseContract(CreateExaminerTestRequest, body));
  }

  @Get('tests/:id')
  getTest(@CurrentIdentity() identity: VerifiedIdentity, @Param('id') id: string): Promise<ExaminerTestDetail> {
    return this.service.getTest(identity, parseContract(Id, id));
  }

  @Patch('tests/:id')
  updateTest(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ExaminerTestDetail> {
    return this.service.updateTest(identity, parseContract(Id, id), parseContract(UpdateExaminerTestRequest, body));
  }

  @Delete('tests/:id')
  @HttpCode(204)
  deleteTest(@CurrentIdentity() identity: VerifiedIdentity, @Param('id') id: string): Promise<void> {
    return this.service.deleteTest(identity, parseContract(Id, id));
  }

  @Put('tests/:id/sections/:sectionId/questions')
  setSectionQuestions(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() body: unknown,
  ): Promise<ExaminerTestDetail> {
    return this.service.setSectionQuestions(
      identity,
      parseContract(Id, id),
      parseContract(Id, sectionId),
      parseContract(SetSectionQuestionsRequest, body),
    );
  }

  @Post('tests/:id/fill-from-import')
  @HttpCode(200)
  fillFromImport(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ExaminerTestDetail> {
    return this.service.fillFromImport(identity, parseContract(Id, id), parseContract(FillTestFromImportRequest, body));
  }

  @Post('tests/:id/precheck')
  @HttpCode(200)
  precheck(@CurrentIdentity() identity: VerifiedIdentity, @Param('id') id: string): Promise<SubmitExaminerTestResponse> {
    return this.service.precheck(identity, parseContract(Id, id));
  }

  @Post('tests/:id/submit')
  @HttpCode(200)
  submit(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<SubmitExaminerTestResponse> {
    return this.service.submit(
      identity,
      parseContract(Id, id),
      parseContract(ExaminerTestActionRequest, body).expectedUpdatedAt,
    );
  }

  @Post('tests/:id/use-latest-versions')
  @HttpCode(200)
  useLatestVersions(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ExaminerTestDetail> {
    return this.service.useLatestVersions(
      identity,
      parseContract(Id, id),
      parseContract(ExaminerTestActionRequest, body).expectedUpdatedAt,
    );
  }

  @Get('series')
  listSeries(@CurrentIdentity() identity: VerifiedIdentity): Promise<ExaminerSeriesList> {
    return this.service.listSeries(identity);
  }

  @Post('series')
  createSeries(@CurrentIdentity() identity: VerifiedIdentity, @Body() body: unknown): Promise<ExaminerSeriesDetail> {
    return this.service.createSeries(identity, parseContract(CreateExaminerSeriesRequest, body));
  }

  @Get('series/:id')
  getSeries(@CurrentIdentity() identity: VerifiedIdentity, @Param('id') id: string): Promise<ExaminerSeriesDetail> {
    return this.service.getSeries(identity, parseContract(Id, id));
  }

  @Patch('series/:id')
  updateSeries(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ExaminerSeriesDetail> {
    return this.service.updateSeries(identity, parseContract(Id, id), parseContract(UpdateExaminerSeriesRequest, body));
  }

  @Post('series/:id/publish')
  @HttpCode(200)
  publishSeries(@CurrentIdentity() identity: VerifiedIdentity, @Param('id') id: string, @Body() body: unknown): Promise<ExaminerSeriesDetail> {
    return this.service.setSeriesPublished(identity, parseContract(Id, id), parseContract(ExaminerTestActionRequest, body).expectedUpdatedAt, true);
  }

  @Post('series/:id/unpublish')
  @HttpCode(200)
  unpublishSeries(@CurrentIdentity() identity: VerifiedIdentity, @Param('id') id: string, @Body() body: unknown): Promise<ExaminerSeriesDetail> {
    return this.service.setSeriesPublished(identity, parseContract(Id, id), parseContract(ExaminerTestActionRequest, body).expectedUpdatedAt, false);
  }

  @Delete('series/:id')
  @HttpCode(204)
  deleteSeries(@CurrentIdentity() identity: VerifiedIdentity, @Param('id') id: string): Promise<void> {
    return this.service.deleteSeries(identity, parseContract(Id, id));
  }
}

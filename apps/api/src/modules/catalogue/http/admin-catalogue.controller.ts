import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  CreateCategoryRequest,
  CreateExamRequest,
  CreateTemplateRequest,
  CreateTopicsRequest,
  NameRequest,
  StageRequest,
  TemplateActionRequest,
  UpdateCategoryRequest,
  UpdateExamRequest,
  UpdateTemplateRequest,
  type AdminCategory,
  type AdminCategoryList,
  type AdminExam,
  type AdminExamList,
  type AdminTemplate,
  type AuditList,
} from '@exam-prep/contracts';
import { FirebaseAuthGuard } from '../../../common/guards/firebase-auth.guard.js';
import { parseContract } from '../../../common/pipes/parse-contract.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import { CurrentAccess, RequireAdminPermission, RolesGuard } from '../../identity/http/roles.guard.js';
import { AdminCatalogueService } from '../application/admin-catalogue.service.js';

const IdParam = z.uuid();

/**
 * /v1/admin/catalogue: categories, exams, stages, syllabus tree and templates. Ops (or super)
 * admins only; reads are private and never cached.
 */
@Controller('admin/catalogue')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@RequireAdminPermission('ops')
export class AdminCatalogueController {
  constructor(private readonly service: AdminCatalogueService) {}

  // Categories
  @Get('categories')
  @Header('Cache-Control', 'no-store')
  async listCategories(@CurrentAccess() who: AccessContext): Promise<AdminCategoryList> {
    return { items: await this.service.listCategories(who) };
  }

  @Post('categories')
  createCategory(@CurrentAccess() who: AccessContext, @Body() body: unknown): Promise<AdminCategory> {
    return this.service.createCategory(who, parseContract(CreateCategoryRequest, body));
  }

  @Patch('categories/:id')
  updateCategory(@CurrentAccess() who: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminCategory> {
    return this.service.updateCategory(who, parseContract(IdParam, id), parseContract(UpdateCategoryRequest, body));
  }

  @Delete('categories/:id')
  @HttpCode(204)
  deleteCategory(@CurrentAccess() who: AccessContext, @Param('id') id: string): Promise<void> {
    return this.service.deleteCategory(who, parseContract(IdParam, id));
  }

  // Exams
  @Get('exams')
  @Header('Cache-Control', 'no-store')
  async listExams(@CurrentAccess() who: AccessContext): Promise<AdminExamList> {
    return { items: await this.service.listExams(who) };
  }

  @Post('exams')
  createExam(@CurrentAccess() who: AccessContext, @Body() body: unknown): Promise<AdminExam> {
    return this.service.createExam(who, parseContract(CreateExamRequest, body));
  }

  @Get('exams/:id')
  @Header('Cache-Control', 'no-store')
  getExam(@CurrentAccess() who: AccessContext, @Param('id') id: string): Promise<AdminExam> {
    return this.service.getExam(who, parseContract(IdParam, id));
  }

  @Patch('exams/:id')
  updateExam(@CurrentAccess() who: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminExam> {
    return this.service.updateExam(who, parseContract(IdParam, id), parseContract(UpdateExamRequest, body));
  }

  @Get('exams/:id/history')
  @Header('Cache-Control', 'no-store')
  async history(@CurrentAccess() who: AccessContext, @Param('id') id: string): Promise<AuditList> {
    return { items: await this.service.getHistory(who, parseContract(IdParam, id)) };
  }

  // Stages
  @Post('exams/:id/stages')
  addStage(@CurrentAccess() who: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminExam> {
    return this.service.addStage(who, parseContract(IdParam, id), parseContract(StageRequest, body));
  }

  @Put('stages/:id')
  updateStage(@CurrentAccess() who: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminExam> {
    return this.service.updateStage(who, parseContract(IdParam, id), parseContract(StageRequest, body));
  }

  @Delete('stages/:id')
  deleteStage(@CurrentAccess() who: AccessContext, @Param('id') id: string): Promise<AdminExam> {
    return this.service.deleteStage(who, parseContract(IdParam, id));
  }

  // Syllabus tree
  @Post('exams/:id/subjects')
  addSubject(@CurrentAccess() who: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminExam> {
    return this.service.addSubject(who, parseContract(IdParam, id), parseContract(NameRequest, body).name);
  }

  @Put('subjects/:id')
  renameSubject(@CurrentAccess() who: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminExam> {
    return this.service.renameSubject(who, parseContract(IdParam, id), parseContract(NameRequest, body).name);
  }

  @Delete('subjects/:id')
  deleteSubject(@CurrentAccess() who: AccessContext, @Param('id') id: string): Promise<AdminExam> {
    return this.service.deleteSubject(who, parseContract(IdParam, id));
  }

  @Post('subjects/:id/topics')
  async addTopics(@CurrentAccess() who: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminExam> {
    return (await this.service.addTopics(who, parseContract(IdParam, id), parseContract(CreateTopicsRequest, body).names)).exam;
  }

  @Put('topics/:id')
  renameTopic(@CurrentAccess() who: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminExam> {
    return this.service.renameTopic(who, parseContract(IdParam, id), parseContract(NameRequest, body).name);
  }

  @Delete('topics/:id')
  deleteTopic(@CurrentAccess() who: AccessContext, @Param('id') id: string): Promise<AdminExam> {
    return this.service.deleteTopic(who, parseContract(IdParam, id));
  }

  // Templates
  @Post('exams/:id/templates')
  createTemplate(@CurrentAccess() who: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminTemplate> {
    return this.service.createTemplate(who, parseContract(IdParam, id), parseContract(CreateTemplateRequest, body));
  }

  @Get('templates/:id')
  @Header('Cache-Control', 'no-store')
  getTemplate(@CurrentAccess() who: AccessContext, @Param('id') id: string): Promise<AdminTemplate> {
    return this.service.getTemplate(who, parseContract(IdParam, id));
  }

  @Put('templates/:id')
  updateTemplate(@CurrentAccess() who: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminTemplate> {
    return this.service.updateTemplate(who, parseContract(IdParam, id), parseContract(UpdateTemplateRequest, body));
  }

  @Delete('templates/:id')
  @HttpCode(204)
  deleteTemplate(@CurrentAccess() who: AccessContext, @Param('id') id: string): Promise<void> {
    return this.service.deleteTemplate(who, parseContract(IdParam, id));
  }

  @Post('templates/:id/publish')
  @HttpCode(200)
  publish(@CurrentAccess() who: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminTemplate> {
    return this.service.publishTemplate(who, parseContract(IdParam, id), parseContract(TemplateActionRequest, body).expectedUpdatedAt);
  }

  @Post('templates/:id/new-version')
  @HttpCode(200)
  newVersion(@CurrentAccess() who: AccessContext, @Param('id') id: string): Promise<AdminTemplate> {
    return this.service.newVersion(who, parseContract(IdParam, id));
  }

  @Post('templates/:id/retire')
  @HttpCode(200)
  retire(@CurrentAccess() who: AccessContext, @Param('id') id: string): Promise<AdminTemplate> {
    return this.service.setTemplateAvailable(who, parseContract(IdParam, id), false);
  }

  @Post('templates/:id/reinstate')
  @HttpCode(200)
  reinstate(@CurrentAccess() who: AccessContext, @Param('id') id: string): Promise<AdminTemplate> {
    return this.service.setTemplateAvailable(who, parseContract(IdParam, id), true);
  }
}

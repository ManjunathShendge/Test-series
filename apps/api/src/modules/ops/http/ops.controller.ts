import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  AuditQuery,
  CatalogueAction,
  CatalogueQuery,
  CreateBannerRequest,
  PublicBannerQuery,
  ReportExportQuery,
  ReportQuery,
  UpdateBannerRequest,
  type AuditLogPage,
  type Banner,
  type BannerList,
  type CatalogueList,
  type CatalogueRow,
  type OpsReport,
  type PublicBannerList,
} from '@exam-prep/contracts';
import { FirebaseAuthGuard } from '../../../common/guards/firebase-auth.guard.js';
import { parseContract } from '../../../common/pipes/parse-contract.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import { CurrentAccess, RequireAdminPermission, RolesGuard } from '../../identity/http/roles.guard.js';
import { OpsService } from '../application/ops.service.js';

const Id = z.uuid();

/** /v1/admin/ops: catalogue moderation, CMS banners, reports and the audit log (ops admins). */
@Controller('admin/ops')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@RequireAdminPermission('ops')
export class OpsController {
  constructor(private readonly service: OpsService) {}

  @Get('catalogue')
  @Header('Cache-Control', 'private, no-store')
  catalogue(@CurrentAccess() access: AccessContext, @Query() query: unknown): Promise<CatalogueList> {
    return this.service.catalogue(access, parseContract(CatalogueQuery, query));
  }

  @Patch('tests/:id')
  updateTest(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<CatalogueRow> {
    return this.service.updateTest(access, parseContract(Id, id), parseContract(CatalogueAction, body));
  }

  @Patch('series/:id')
  updateSeries(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<CatalogueRow> {
    return this.service.updateSeries(access, parseContract(Id, id), parseContract(CatalogueAction, body));
  }

  @Get('banners')
  @Header('Cache-Control', 'private, no-store')
  banners(@CurrentAccess() access: AccessContext): Promise<BannerList> {
    return this.service.banners(access);
  }

  @Post('banners')
  createBanner(@CurrentAccess() access: AccessContext, @Body() body: unknown): Promise<Banner> {
    return this.service.createBanner(access, parseContract(CreateBannerRequest, body));
  }

  @Patch('banners/:id')
  updateBanner(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<Banner> {
    return this.service.updateBanner(access, parseContract(Id, id), parseContract(UpdateBannerRequest, body));
  }

  @Delete('banners/:id')
  @HttpCode(204)
  async deleteBanner(@CurrentAccess() access: AccessContext, @Param('id') id: string): Promise<void> {
    await this.service.deleteBanner(access, parseContract(Id, id));
  }

  @Get('reports')
  @Header('Cache-Control', 'private, no-store')
  report(@CurrentAccess() access: AccessContext, @Query() query: unknown): Promise<OpsReport> {
    return this.service.report(access, parseContract(ReportQuery, query));
  }

  @Get('reports/export')
  @Header('Cache-Control', 'no-store')
  async exportReport(@CurrentAccess() access: AccessContext, @Query() query: unknown): Promise<StreamableFile> {
    const q = parseContract(ReportExportQuery, query);
    const range = parseContract(ReportQuery, { from: q.from, to: q.to });
    const out = await this.service.exportReport(access, range, q.kind);
    return new StreamableFile(out.file, { disposition: `attachment; filename="${out.filename}"`, type: 'text/csv; charset=utf-8' });
  }

  @Get('audit')
  @Header('Cache-Control', 'private, no-store')
  audit(@CurrentAccess() access: AccessContext, @Query() query: unknown): Promise<AuditLogPage> {
    return this.service.audit(access, parseContract(AuditQuery, query));
  }
}

/** Public banners for the website and the app home (no sign-in, cached briefly). */
@Controller('banners')
export class PublicBannersController {
  constructor(private readonly service: OpsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  list(@Query() query: unknown): Promise<PublicBannerList> {
    return this.service.publicBanners(parseContract(PublicBannerQuery, query).placement);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { withUser, type Database, type Queryable } from '@exam-prep/db';
import type {
  AuditLogPage,
  AuditQuery,
  Banner,
  CatalogueAction,
  CatalogueKind,
  CatalogueList,
  CatalogueQuery,
  CatalogueRow,
  CreateBannerRequest,
  OpsReport,
  PublicBannerList,
  ReportExportKind,
  ReportQuery,
  UpdateBannerRequest,
} from '@exam-prep/contracts';
import { DATABASE } from '../../../database/database.module.js';
import { ApiError, notFound } from '../../../common/errors/api-error.js';
import { auditAs } from '../../catalogue/repositories/admin-catalogue.repository.js';
import { csv } from '../../commerce/domain/commerce.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import { opsRepository as repo, type BannerRow, type CatalogueDbRow } from '../repositories/ops.repository.js';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toRow(kind: CatalogueKind, r: CatalogueDbRow): CatalogueRow {
  return {
    id: r.id,
    kind,
    title: r.title,
    slug: r.slug,
    examName: r.exam_name,
    examinerName: r.examiner_name,
    status: r.status,
    published: r.published,
    featured: r.featured,
    canFeature: r.can_feature,
    pricePaise: r.price_paise,
    attempts: r.attempts,
    sales: r.sales,
    publishedAt: iso(r.published_at),
  };
}

function toBanner(b: BannerRow): Banner {
  return {
    id: b.id,
    title: b.title,
    imageUrl: b.image_url,
    link: b.target_link,
    placement: b.placement,
    examId: b.exam_id,
    displayOrder: b.display_order,
    active: b.is_active,
    startsAt: iso(b.starts_at),
    endsAt: iso(b.ends_at),
  };
}

const pgCode = (e: unknown) => (e as { code?: string } | null)?.code;

/**
 * Admin operations (PRD 8): catalogue moderation, CMS banners, reports and the audit log.
 * Routes require an ops (or super) admin; the service checks again, and every change runs
 * inside withUser so the audit trigger records the admin, the named action and before/after.
 */
@Injectable()
export class OpsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private run<T>(access: AccessContext, action: string | null, work: (c: Queryable) => Promise<T>): Promise<T> {
    if (!access.roles.includes('admin') || !(access.admin.ops || access.admin.super)) {
      return Promise.reject(new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this'));
    }
    return withUser(this.db, access.profileId, async (c) => {
      if (action) await auditAs(c, action);
      return work(c);
    });
  }

  // Catalogue --------------------------------------------------------------------------------
  catalogue(access: AccessContext, q: CatalogueQuery): Promise<CatalogueList> {
    return this.run(access, null, async (c) => {
      const rows = q.kind === 'tests' ? await repo.catalogueTests(c, q.q ?? null, q.status) : await repo.catalogueSeries(c, q.q ?? null, q.status);
      return { items: rows.map((r) => toRow(q.kind, r)) };
    });
  }

  /**
   * Tests: feature on Home (free, published tests only) or unpublish (archive; final, because
   * published versions are immutable). Series: feature, unpublish or republish.
   */
  updateTest(access: AccessContext, id: string, body: CatalogueAction): Promise<CatalogueRow> {
    return this.run(access, `catalogue.test.${body.action}`, async (c) => {
      const test = await repo.testState(c, id);
      if (!test) throw notFound('Test');
      const published = test.status === 'live' || test.status === 'scheduled';
      if (body.action === 'feature') {
        if (body.featured && !(published && test.access_type === 'free')) {
          throw new ApiError(409, 'INVALID_STATE', 'Only free, published tests can be featured.');
        }
        await repo.setTestFeatured(c, id, body.featured);
      } else if (body.action === 'unpublish') {
        if (!published && test.status !== 'approved') throw new ApiError(409, 'INVALID_STATE', 'This test is not published.');
        await repo.archiveTest(c, id);
        await repo.writeAudit(c, access.profileId, 'catalogue.test.unpublish.reason', 'tests', id, { reason: body.reason });
      } else {
        throw new ApiError(409, 'INVALID_STATE', 'An unpublished test cannot be published again. The examiner can publish a new version.');
      }
      return this.reload(c, 'tests', id);
    });
  }

  updateSeries(access: AccessContext, id: string, body: CatalogueAction): Promise<CatalogueRow> {
    return this.run(access, `catalogue.series.${body.action}`, async (c) => {
      const series = await repo.seriesExists(c, id);
      if (!series) throw notFound('Series');
      if (body.action === 'feature') {
        if (body.featured && !series.is_published) throw new ApiError(409, 'INVALID_STATE', 'Publish the series before featuring it.');
        await repo.setSeries(c, id, { is_featured: body.featured });
      } else {
        const publish = body.action === 'republish';
        await repo.setSeries(c, id, publish ? { is_published: true } : { is_published: false, is_featured: false });
        await repo.writeAudit(c, access.profileId, `catalogue.series.${body.action}.reason`, 'test_series', id, { reason: body.reason });
      }
      return this.reload(c, 'series', id);
    });
  }

  private async reload(c: Queryable, kind: CatalogueKind, id: string): Promise<CatalogueRow> {
    const rows = kind === 'tests' ? await repo.catalogueTests(c, null, 'all') : await repo.catalogueSeries(c, null, 'all');
    const row = rows.find((r) => r.id === id);
    if (!row) throw notFound(kind === 'tests' ? 'Test' : 'Series');
    return toRow(kind, row);
  }

  // Banners ----------------------------------------------------------------------------------
  banners(access: AccessContext): Promise<{ items: Banner[] }> {
    return this.run(access, null, async (c) => ({ items: (await repo.banners(c)).map(toBanner) }));
  }

  createBanner(access: AccessContext, b: CreateBannerRequest): Promise<Banner> {
    return this.run(access, 'cms.banner.create', async (c) =>
      toBanner(
        await repo.createBanner(c, {
          title: b.title,
          image_url: b.imageUrl,
          target_link: b.link,
          placement: b.placement,
          exam_id: b.examId,
          display_order: b.displayOrder,
          is_active: b.active,
          starts_at: b.startsAt ? new Date(b.startsAt) : null,
          ends_at: b.endsAt ? new Date(b.endsAt) : null,
        }),
      ),
    ).catch((e: unknown) => this.bannerError(e));
  }

  updateBanner(access: AccessContext, id: string, b: UpdateBannerRequest): Promise<Banner> {
    return this.run(access, 'cms.banner.update', async (c) => {
      const row = await repo.updateBanner(c, id, {
        title: b.title,
        image_url: b.imageUrl,
        target_link: b.link,
        placement: b.placement,
        exam_id: b.examId,
        display_order: b.displayOrder,
        is_active: b.active,
        starts_at: b.startsAt === undefined ? undefined : b.startsAt ? new Date(b.startsAt) : null,
        ends_at: b.endsAt === undefined ? undefined : b.endsAt ? new Date(b.endsAt) : null,
      } as Partial<BannerRow>);
      if (!row) throw notFound('Banner');
      return toBanner(row);
    }).catch((e: unknown) => this.bannerError(e));
  }

  async deleteBanner(access: AccessContext, id: string): Promise<void> {
    await this.run(access, 'cms.banner.delete', async (c) => {
      if (!(await repo.deleteBanner(c, id))) throw notFound('Banner');
    });
  }

  /** Public, no sign-in: banners on show for the website or the app. */
  async publicBanners(placement: 'web' | 'app'): Promise<PublicBannerList> {
    const rows = await repo.showingBanners(this.db, placement);
    return { items: rows.map((b) => ({ id: b.id, title: b.title, imageUrl: b.image_url, link: b.target_link, examId: b.exam_id })) };
  }

  private bannerError(e: unknown): never {
    if (pgCode(e) === '23514') throw new ApiError(400, 'VALIDATION_FAILED', 'Check the image (https), link and schedule.');
    if (pgCode(e) === '23503') throw new ApiError(400, 'VALIDATION_FAILED', 'That exam does not exist.');
    throw e;
  }

  // Reports ----------------------------------------------------------------------------------
  report(access: AccessContext, { from, to }: ReportQuery): Promise<OpsReport> {
    return this.run(access, null, async (c) => {
      const [sales, channels, students, attempts, qc, top, daily] = await Promise.all([
        repo.salesTotals(c, from, to),
        repo.salesByChannel(c, from, to),
        repo.studentTotals(c, from, to),
        repo.attemptTotals(c, from, to),
        repo.qcTotals(c, from, to),
        repo.topTests(c, from, to),
        repo.daily(c, from, to),
      ]);
      return {
        from,
        to,
        sales: {
          orders: sales.orders,
          grossPaise: Number(sales.gross),
          discountPaise: Number(sales.discount),
          gstPaise: Number(sales.gst),
          netRevenuePaise: Number(sales.net),
          refunds: sales.refunds,
          refundedPaise: Number(sales.refunded),
          byChannel: channels.map((x) => ({ channel: x.channel, orders: x.orders, paidPaise: Number(x.paid) })),
        },
        students,
        attempts: { started: attempts.started, finished: attempts.finished, freeShare: attempts.started ? Math.round((attempts.free / attempts.started) * 1000) / 10 : 0 },
        qc: { decided: qc.decided, pending: qc.pending, avgTurnaroundHours: qc.avg_hours === null ? null : Number(qc.avg_hours), openReports: qc.open_reports },
        topTests: top.map((t) => ({ id: t.id, title: t.title, attempts: t.attempts, sales: t.sales, revenuePaise: Number(t.revenue) })),
        daily: daily.map((d) => ({ day: d.day, orders: d.orders, paidPaise: Number(d.paid), attempts: d.attempts, signups: d.signups })),
      };
    });
  }

  /** CSV exports (formula cells neutralised by csv()); each download is audited. */
  exportReport(access: AccessContext, { from, to }: ReportQuery, kind: ReportExportKind): Promise<{ file: Buffer; filename: string }> {
    return this.run(access, null, async (c) => {
      await repo.writeAudit(c, access.profileId, `reports.export.${kind}`, 'reports', access.profileId, { from, to });
      let rows: (string | number | null)[][];
      if (kind === 'daily') {
        const days = await repo.daily(c, from, to);
        rows = [['day', 'orders', 'paid_paise', 'attempts', 'signups'], ...days.map((d) => [d.day, d.orders, Number(d.paid), d.attempts, d.signups])];
      } else {
        const data = kind === 'sales' ? await repo.salesExport(c, from, to) : await repo.attemptsExport(c, from, to);
        const header = data[0] ? Object.keys(data[0]) : kind === 'sales' ? ['invoice_number'] : ['attempt_id'];
        rows = [header, ...data.map((r) => header.map((h) => r[h] ?? null))];
      }
      return { file: csv(rows), filename: `${kind}-${from}-to-${to}.csv` };
    });
  }

  // Audit log --------------------------------------------------------------------------------
  audit(access: AccessContext, q: AuditQuery): Promise<AuditLogPage> {
    return this.run(access, null, async (c) => {
      const [at, id] = q.before ? q.before.split('~') : [];
      const rows = await repo.audit(c, {
        table: q.table ?? null,
        action: q.action ?? null,
        actor: q.actor ?? null,
        before: at && id ? { at, id } : null,
        limit: q.limit,
      });
      const page = rows.slice(0, q.limit);
      const last = page.at(-1);
      return {
        items: page.map((r) => {
          const before = r.before_state;
          const after = r.after_state;
          const changed =
            before && after ? Object.keys(after).filter((k) => k !== 'updated_at' && JSON.stringify(before[k]) !== JSON.stringify(after[k])).sort() : [];
          return {
            id: r.id,
            at: r.created_at.toISOString(),
            actor: { id: r.actor_id, name: r.actor_name, email: r.actor_email },
            action: r.action_name,
            table: r.target_table,
            recordId: r.target_record_id,
            changedFields: changed,
            before: before && after ? Object.fromEntries(changed.map((k) => [k, before[k]])) : before,
            after: before && after ? Object.fromEntries(changed.map((k) => [k, after[k]])) : after,
          };
        }),
        nextBefore: rows.length > q.limit && last ? `${last.created_at.toISOString()}~${last.id}` : null,
      };
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { withUser, type Database, type DatabaseClient } from '@exam-prep/db';
import type { AssetViewUrl, CouponList, ExaminerSalesResponse, PayoutList, SalesRow } from '@exam-prep/contracts';
import { DATABASE, ENVIRONMENT } from '../../../database/database.module.js';
import type { Environment } from '../../../config/env.js';
import { ApiError, notFound } from '../../../common/errors/api-error.js';
import type { VerifiedIdentity } from '../../../providers/firebase/identity-verifier.js';
import { ObjectStorage } from '../../../providers/storage/object-storage.js';
import { identityRepository } from '../../identity/repositories/identity.repository.js';
import { authoringRepository } from '../../authoring/repositories/authoring.repository.js';
import { commerceRepository as repo, type CouponRow, type SalesAggregateRow } from '../repositories/commerce.repository.js';
import { csv, rupees, toPayout } from '../domain/commerce.js';

const empty = (): SalesRow => ({ sales: 0, refunds: 0, grossPaise: 0, netPaise: 0, sharePaise: 0, couponSales: 0, attempts: 0 });

function salesRow(row: SalesAggregateRow | undefined, attempts: number): SalesRow {
  if (!row) return { ...empty(), attempts };
  return {
    sales: row.sales,
    refunds: row.refunds,
    grossPaise: row.gross_paise,
    netPaise: row.net_paise,
    sharePaise: row.share_paise,
    couponSales: row.coupon_sales,
    attempts,
  };
}

export function toCoupon(row: CouponRow) {
  return {
    id: row.id,
    code: row.code,
    examinerId: row.examiner_id,
    examinerName: row.examiner_name,
    discountPercent: row.discount_percent === null ? null : Number(row.discount_percent),
    maxDiscountPaise: row.max_discount_paise,
    flatDiscountPaise: row.flat_discount_paise,
    validFrom: row.valid_from.toISOString(),
    validUntil: row.valid_until?.toISOString() ?? null,
    maxUses: row.max_uses,
    uses: row.current_uses,
    isActive: row.is_active,
    salesPaise: Number(row.sales_paise),
  };
}

/**
 * Examiner dashboard money views (PRD 4.4): sales and attempts, monthly payouts with statements
 * and TDS certificates, and their coupon codes. Aggregates only; no student identity leaves here.
 */
@Injectable()
export class EarningsService {
  private readonly storage: ObjectStorage;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) env: Environment,
  ) {
    this.storage = new ObjectStorage(env);
  }

  private async asExaminer<T>(identity: VerifiedIdentity, action: (client: DatabaseClient, examinerId: string) => Promise<T>): Promise<T> {
    const examinerId = await identityRepository.ensureProfile(this.db, identity.uid, identity.email, identity.name);
    return withUser(this.db, examinerId, async (client) => {
      if (!(await authoringRepository.requireExaminer(client, examinerId)))
        throw new ApiError(403, 'FORBIDDEN', 'Approved examiner access is required.');
      return action(client, examinerId);
    });
  }

  sales(identity: VerifiedIdentity, days: number): Promise<ExaminerSalesResponse> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const to = new Date();
      // Whole India days: the window starts at IST midnight `days - 1` days ago.
      const istToday = new Date(to.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
      const from = new Date(new Date(`${istToday}T00:00:00+05:30`).getTime() - (days - 1) * 86_400_000);
      const [byItem, byDayRows, attempts] = await Promise.all([
        repo.sales(client, examinerId, from, 'item'),
        repo.sales(client, examinerId, from, 'day'),
        repo.attemptStats(client, from),
      ]);
      const attemptsByTest = new Map<string, { title: string; count: number }>();
      const attemptsByDay = new Map<string, number>();
      for (const a of attempts) {
        const t = attemptsByTest.get(a.test_id) ?? { title: a.title, count: 0 };
        t.count += a.attempts;
        attemptsByTest.set(a.test_id, t);
        attemptsByDay.set(a.day, (attemptsByDay.get(a.day) ?? 0) + a.attempts);
      }
      const byTest: ExaminerSalesResponse['byTest'] = byItem.map((row) => ({
        ...salesRow(row, attemptsByTest.get(row.key)?.count ?? 0),
        itemId: row.key,
        itemType: row.item_type!,
        title: row.title ?? 'Untitled',
      }));
      for (const [testId, t] of attemptsByTest)
        if (!byItem.some((row) => row.key === testId))
          byTest.push({ ...salesRow(undefined, t.count), itemId: testId, itemType: 'single_test', title: t.title });
      byTest.sort((a, b) => b.sharePaise - a.sharePaise || b.attempts - a.attempts);

      const dayMap = new Map(byDayRows.map((row) => [row.key, row]));
      const byDay: ExaminerSalesResponse['byDay'] = [];
      for (let i = 0; i < days; i++) {
        const day = new Date(from.getTime() + i * 86_400_000 + 5.5 * 3600_000).toISOString().slice(0, 10);
        byDay.push({ ...salesRow(dayMap.get(day), attemptsByDay.get(day) ?? 0), day });
      }
      const totals = byDay.reduce<SalesRow>(
        (sum, d) => ({
          sales: sum.sales + d.sales,
          refunds: sum.refunds + d.refunds,
          grossPaise: sum.grossPaise + d.grossPaise,
          netPaise: sum.netPaise + d.netPaise,
          sharePaise: sum.sharePaise + d.sharePaise,
          couponSales: sum.couponSales + d.couponSales,
          attempts: sum.attempts + d.attempts,
        }),
        empty(),
      );
      return { from: from.toISOString(), to: to.toISOString(), totals, byTest, byDay };
    });
  }

  payouts(identity: VerifiedIdentity): Promise<PayoutList> {
    return this.asExaminer(identity, async (client, examinerId) => ({
      items: (await repo.examinerPayouts(client, examinerId)).map(toPayout),
    }));
  }

  /** Monthly statement CSV: every sale and refund behind the payout, then the payout summary. */
  statement(identity: VerifiedIdentity, payoutId: string): Promise<{ file: Buffer; filename: string }> {
    return this.asExaminer(identity, async (client, examinerId) => {
      const row = await repo.payout(client, payoutId);
      if (!row || row.examiner_id !== examinerId) throw notFound('Payout');
      const p = toPayout(row);
      const lines = await repo.statement(client, examinerId, p.month);
      const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().replace('T', ' ').slice(0, 16);
      const file = csv([
        ['Date (IST)', 'Type', 'Item', 'Item type', 'Invoice', 'Your code used', 'Paid by student (₹)', 'Net revenue (₹)', 'Your share (₹)'],
        ...lines.map((l) => [
          ist(l.happened_at),
          l.kind,
          l.title,
          l.item_type === 'test_series' ? 'Series' : 'Test',
          l.invoice_number,
          l.examiner_coupon ? 'Yes' : 'No',
          rupees(l.total_paid_paise),
          rupees(l.net_revenue_paise),
          rupees(l.share_paise),
        ]),
        [],
        ['Summary', p.month],
        ['Direct sales share (₹)', rupees(p.directSalesPaise)],
        ['Your-code sales share (₹)', rupees(p.couponSalesPaise)],
        ['Refund deductions (₹)', rupees(-p.refundDeductionsPaise)],
        ['Carried forward (₹)', rupees(p.carriedForwardPaise)],
        ['Gross earnings (₹)', rupees(p.grossPaise)],
        [`TDS at ${p.tdsRatePercent}% (₹)`, rupees(-p.tdsPaise)],
        ['Net payable (₹)', rupees(p.netPayablePaise)],
        ['Status', p.status.replace('_', ' ')],
        ['Hold reason', p.holdReason],
        ['Bank reference', p.bankTransferRef],
      ]);
      return { file, filename: `statement-${p.month}.csv` };
    });
  }

  async tdsCertificate(identity: VerifiedIdentity, payoutId: string): Promise<AssetViewUrl> {
    const doc = await this.asExaminer(identity, (client) => repo.payoutDocument(client, payoutId));
    if (!doc) throw notFound('TDS certificate');
    const signed = await this.storage.presignedDownload(doc.bucket, doc.object_key, doc.original_name);
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  coupons(identity: VerifiedIdentity): Promise<CouponList> {
    return this.asExaminer(identity, async (client, examinerId) => ({
      items: (await repo.coupons(client, examinerId)).map(toCoupon),
    }));
  }
}

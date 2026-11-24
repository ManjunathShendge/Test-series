import { Inject, Injectable } from '@nestjs/common';
import { withUser, type Database, type DatabaseClient } from '@exam-prep/db';
import type {
  AdminStudentDetail,
  AdminStudentList,
  BlockStudentRequest,
  CalculatePayoutsRequest,
  CreateCouponRequest,
  GrantAccessRequest,
  Payout,
  PayoutActionRequest,
  PayoutList,
  PricingOverview,
  RefundRequest,
  UpdatePriceBandRequest,
} from '@exam-prep/contracts';
import { DATABASE } from '../../../database/database.module.js';
import { ApiError, notFound } from '../../../common/errors/api-error.js';
import type { Razorpay } from '../../../providers/razorpay/razorpay.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import {
  auditAction,
  commerceRepository as repo,
  type AdminPurchaseRow,
  type StudentRow,
} from '../repositories/commerce.repository.js';
import { RAZORPAY, REFUND_WINDOW_DAYS, csv, mapCommerceError, rupees, toMyPurchase, toPayout } from '../domain/commerce.js';
import { toCoupon } from './earnings.service.js';

const forbidden = (message = 'You do not have permission to do this') => new ApiError(403, 'FORBIDDEN', message);
const stale = () => new ApiError(409, 'STALE_EDIT', 'Someone else changed this. Reload and try again.');
const FIRST_CYCLE_HOLD = 'First payout is held for one cycle';

/** Why a purchase cannot be refunded under the proposed policy, or null when it can. */
function refundBlock(row: AdminPurchaseRow, now = Date.now()): string | null {
  if (row.status === 'refunded') return 'Already refunded.';
  if (row.payment_channel === 'admin_grant') return 'Granted access is revoked, not refunded.';
  if (row.payment_channel !== 'razorpay') return 'App store purchases are refunded by Apple or Google.';
  if (!row.captured_at || !row.razorpay_payment_id) return 'The payment was never captured.';
  if (now - row.captured_at.getTime() > REFUND_WINDOW_DAYS * 86_400_000)
    return `More than ${REFUND_WINDOW_DAYS} days since payment.`;
  if (row.attempts_since > 0) return 'A covered test has already been started.';
  return null;
}

/**
 * Admin console money and students (PRD 8 "Pricing", "Payouts", "Students"). Every write runs as
 * the admin so the database's admin-only triggers apply and audit rows are written in the same
 * transaction. Payouts need the finance permission; pricing and students need ops.
 */
@Injectable()
export class AdminCommerceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(RAZORPAY) private readonly razorpay: Razorpay | null,
  ) {}

  private as<T>(access: AccessContext, permission: 'ops' | 'finance', action: (client: DatabaseClient) => Promise<T>, what?: string) {
    if (!access.roles.includes('admin') || !(access.admin[permission] || access.admin.super)) throw forbidden();
    return withUser(this.db, access.profileId, async (client) => {
      try {
        return await action(client);
      } catch (error) {
        return mapCommerceError(error, what);
      }
    });
  }

  // Pricing ------------------------------------------------------------------------------------

  pricing(access: AccessContext): Promise<PricingOverview> {
    return this.as(access, 'ops', async (client) => {
      const [coupons, bands, examiners] = await Promise.all([
        repo.coupons(client),
        repo.priceBands(client),
        repo.approvedExaminers(client),
      ]);
      return {
        coupons: coupons.map(toCoupon),
        bands: bands.map((b) => ({
          examId: b.exam_id,
          examName: b.exam_name,
          minPaise: b.min_paise,
          maxNewPaise: b.max_new_paise,
          maxVerifiedPaise: b.max_verified_paise,
          maxTopPaise: b.max_top_paise,
          updatedAt: b.updated_at.toISOString(),
        })),
        examiners,
      };
    });
  }

  async createCoupon(access: AccessContext, req: CreateCouponRequest): Promise<PricingOverview> {
    await this.as(access, 'ops', async (client) => {
      if (req.examinerId && !(await repo.isApprovedExaminer(client, req.examinerId)))
        throw new ApiError(422, 'VALIDATION_FAILED', 'Choose an approved examiner.');
      await auditAction(client, 'coupon.create');
      try {
        await repo.createCoupon(client, {
          ...req,
          maxDiscountPaise: req.discountPercent === null ? null : req.maxDiscountPaise,
        });
      } catch (error) {
        if ((error as { code?: unknown }).code === '23505')
          throw new ApiError(409, 'ALREADY_EXISTS', `The code ${req.code} already exists.`);
        throw error;
      }
    });
    return this.pricing(access);
  }

  async setCouponActive(access: AccessContext, id: string, active: boolean): Promise<PricingOverview> {
    await this.as(access, 'ops', async (client) => {
      await auditAction(client, active ? 'coupon.activate' : 'coupon.deactivate');
      if (!(await repo.setCouponActive(client, id, active))) throw notFound('Coupon');
    });
    return this.pricing(access);
  }

  async updatePriceBand(access: AccessContext, examId: string, req: UpdatePriceBandRequest): Promise<PricingOverview> {
    await this.as(access, 'ops', async (client) => {
      await auditAction(client, 'exam.price_band');
      const result = await repo.updatePriceBand(client, examId, req.expectedUpdatedAt, req);
      if (result === 'missing') throw notFound('Exam');
      if (result === 'stale') throw stale();
    });
    return this.pricing(access);
  }

  // Payouts ------------------------------------------------------------------------------------

  payouts(access: AccessContext, month: string): Promise<PayoutList> {
    return this.as(access, 'finance', async (client) => ({ items: (await repo.monthPayouts(client, month)).map(toPayout) }));
  }

  async calculate(access: AccessContext, req: CalculatePayoutsRequest): Promise<PayoutList> {
    await this.as(access, 'finance', async (client) => {
      try {
        await repo.calculatePayouts(client, req.month, req.tdsRatePercent);
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (code === '23514' || code === '23001')
          throw new ApiError(422, 'VALIDATION_FAILED', (error as Error).message);
        throw error;
      }
    });
    return this.payouts(access, req.month);
  }

  act(access: AccessContext, payoutId: string, req: PayoutActionRequest): Promise<Payout> {
    return this.as(
      access,
      'finance',
      async (client) => {
        const row = await repo.lockPayout(client, payoutId, req.expectedUpdatedAt);
        if (row === 'missing') throw notFound('Payout');
        if (row === 'stale') throw stale();
        const conflict = (message: string) => new ApiError(409, 'STALE_EDIT', message);
        const gross = Number(row.gross_earnings_paise);
        await auditAction(client, `payout.${req.action}`);
        switch (req.action) {
          case 'approve':
            if (row.status !== 'calculated') throw conflict('Only a calculated payout can be approved.');
            if (!row.kyc_verified) throw conflict('Verify the examiner’s KYC first.');
            if (Number(row.net_payable_paise) <= 0) throw conflict('Nothing is payable.');
            await repo.setPayout(client, payoutId, { status: 'approved', approvedBy: access.profileId });
            break;
          case 'hold':
            if (row.status !== 'calculated' && row.status !== 'approved')
              throw conflict('Only a calculated or approved payout can be held.');
            await repo.setPayout(client, payoutId, { status: 'on_hold', holdReason: req.reason });
            break;
          case 'release':
            if (row.status !== 'on_hold') throw conflict('This payout is not on hold.');
            if (row.carried_into_month) throw conflict(`This amount was already carried into ${row.carried_into_month}.`);
            if (row.hold_reason === FIRST_CYCLE_HOLD) throw conflict('The first payout is held for one cycle by policy.');
            if (!row.kyc_verified) throw conflict('Verify the examiner’s KYC first.');
            if (gross < 50_000) throw conflict('Below the ₹500 minimum; it carries forward.');
            await repo.setPayout(client, payoutId, { status: 'calculated', holdReason: null });
            break;
          case 'mark_paid':
            if (row.status !== 'approved') throw conflict('Approve the payout before marking it paid.');
            try {
              await repo.setPayout(client, payoutId, { status: 'paid', bankTransferRef: req.bankTransferRef });
            } catch (error) {
              if ((error as { code?: unknown }).code === '23505')
                throw new ApiError(409, 'ALREADY_EXISTS', 'That bank reference is already used on another payout.');
              throw error;
            }
            await repo.recordPayoutPaid(client, payoutId, row.examiner_id, row.net_payable_paise);
            break;
          case 'attach_tds':
            if (row.status !== 'approved' && row.status !== 'paid')
              throw conflict('Attach the TDS certificate to an approved or paid payout.');
            if (!(await repo.cleanPayoutDocument(client, req.assetId)))
              throw new ApiError(422, 'INVALID_ASSET', 'Upload a scanned PDF payout document first.');
            await repo.setPayout(client, payoutId, { tdsAssetId: req.assetId });
            break;
        }
        return toPayout((await repo.payout(client, payoutId))!);
      },
      'Payout',
    );
  }

  /** Bank-transfer sheet for a month (approved and paid rows), formula-safe. */
  exportPayouts(access: AccessContext, month: string): Promise<{ file: Buffer; filename: string }> {
    return this.as(access, 'finance', async (client) => {
      const rows = (await repo.monthPayouts(client, month)).map(toPayout);
      const file = csv([
        ['Month', 'Examiner', 'Examiner ID', 'Status', 'Gross (₹)', 'TDS %', 'TDS (₹)', 'Net payable (₹)', 'Hold reason', 'Bank reference', 'Paid at'],
        ...rows.map((p) => [
          p.month,
          p.examinerName,
          p.examinerId,
          p.status,
          rupees(p.grossPaise),
          p.tdsRatePercent,
          rupees(p.tdsPaise),
          rupees(p.netPayablePaise),
          p.holdReason,
          p.bankTransferRef,
          p.paidAt,
        ]),
      ]);
      return { file, filename: `payouts-${month}.csv` };
    });
  }

  // Students -----------------------------------------------------------------------------------

  private student(row: StudentRow) {
    return {
      id: row.id,
      name: row.full_name,
      email: row.email,
      isBlocked: row.is_blocked,
      createdAt: row.created_at.toISOString(),
      attempts: row.attempts,
    };
  }

  searchStudents(access: AccessContext, q: string): Promise<AdminStudentList> {
    return this.as(access, 'ops', async (client) => ({
      items: (await repo.searchStudents(client, q)).map((row) => this.student(row)),
    }));
  }

  studentDetail(access: AccessContext, id: string): Promise<AdminStudentDetail> {
    return this.as(access, 'ops', async (client) => {
      const row = await repo.student(client, id);
      if (!row) throw notFound('Student');
      const purchases = await repo.studentPurchases(client, id);
      return {
        ...this.student(row),
        purchases: purchases.map((p) => {
          const blocked = refundBlock(p);
          return { ...toMyPurchase(p), refundable: blocked === null, refundBlockedReason: blocked };
        }),
      };
    });
  }

  /**
   * Full refund through Razorpay, then recorded (access revoked, ledger entry, audit). An earlier
   * refund that reached Razorpay but was not recorded is found and recorded instead of repeated.
   */
  async refund(access: AccessContext, purchaseId: string, req: RefundRequest): Promise<AdminStudentDetail> {
    if (!this.razorpay)
      throw new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'Razorpay keys are not configured on the server.');
    const gateway = this.razorpay;
    const purchase = await this.as(access, 'ops', async (client) => {
      const studentId = await repo.purchaseOwner(client, purchaseId);
      if (!studentId) throw notFound('Purchase');
      const row = (await repo.studentPurchases(client, studentId, purchaseId))[0];
      if (!row) throw notFound('Purchase');
      const blocked = refundBlock(row);
      if (blocked) throw new ApiError(409, 'REFUND_NOT_ALLOWED', blocked);
      return row;
    });
    const paymentId = purchase.razorpay_payment_id!;
    const existing = (await gateway.refunds(paymentId)).find(
      (r) => r.status !== 'failed' && r.amount === purchase.total_paid_paise,
    );
    const refund =
      existing ??
      (await gateway.refund(paymentId, purchase.total_paid_paise, { purchase_id: purchase.id, reason: req.reason.slice(0, 200) }));
    await this.as(access, 'ops', (client) =>
      repo.recordRefund(client, purchase.id, refund.id, purchase.total_paid_paise, req.reason),
    );
    return this.studentDetail(access, purchase.student_id);
  }

  async grant(access: AccessContext, studentId: string, req: GrantAccessRequest): Promise<AdminStudentDetail> {
    await this.as(
      access,
      'ops',
      async (client) => {
        if (await repo.owns(client, studentId, req.itemType, req.itemId))
          throw new ApiError(409, 'ALREADY_OWNED', 'The student already has access to this.');
        await repo.grantAccess(client, studentId, req.itemType, req.itemId, req.reason);
      },
      'Student or item',
    );
    return this.studentDetail(access, studentId);
  }

  async block(access: AccessContext, studentId: string, req: BlockStudentRequest): Promise<AdminStudentDetail> {
    await this.as(access, 'ops', async (client) => {
      const row = await repo.student(client, studentId);
      if (!row) throw notFound('Student');
      if (row.id === access.profileId) throw forbidden('You cannot block yourself.');
      if (row.roles.some((r) => r !== 'student'))
        throw forbidden('Staff and examiner accounts are managed from their own sections.');
      if (row.is_blocked === req.blocked) return;
      await auditAction(client, req.blocked ? 'student.block' : 'student.unblock');
      await repo.setBlocked(client, access.profileId, studentId, req.blocked, req.reason);
    });
    return this.studentDetail(access, studentId);
  }
}

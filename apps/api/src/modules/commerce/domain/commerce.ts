import type { MyPurchase, Payout } from '@exam-prep/contracts';
import { ApiError, notFound } from '../../../common/errors/api-error.js';
import type { MyPurchaseRow, PayoutRow } from '../repositories/commerce.repository.js';

export const RAZORPAY = Symbol('RAZORPAY');

/** Proposed refund policy (PAYMENTS.md, DECISIONS): full refund within 7 days, nothing started. */
export const REFUND_WINDOW_DAYS = 7;

const pgCode = (error: unknown) => (error as { code?: unknown } | null)?.code;
const pgMessage = (error: unknown) => {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : undefined;
};

/** Database refusals from the commerce functions, as errors the client can act on. */
export function mapCommerceError(error: unknown, what = 'Item'): never {
  if (error instanceof ApiError) throw error;
  const code = pgCode(error);
  if (code === '23505') {
    const message = pgMessage(error) ?? '';
    if (/already own/i.test(message)) throw new ApiError(409, 'ALREADY_OWNED', message);
    throw new ApiError(409, 'ALREADY_EXISTS', 'That already exists.');
  }
  if (code === '23514') throw new ApiError(422, 'COUPON_INVALID', pgMessage(error) ?? 'This cannot be applied.');
  if (code === 'P0002') throw new ApiError(404, 'NOT_FOUND', pgMessage(error) ?? `${what} not found`);
  if (code === '42501') throw new ApiError(403, 'FORBIDDEN', pgMessage(error) ?? 'You do not have permission to do this');
  if (code === '23503') throw notFound(what);
  throw error;
}

export function toMyPurchase(row: MyPurchaseRow): MyPurchase {
  return {
    id: row.id,
    itemType: row.item_type,
    itemId: row.item_id,
    itemTitle: row.item_title,
    itemSlug: row.item_slug,
    status: row.status,
    totalPaise: row.total_paid_paise,
    discountPaise: row.discount_paise,
    couponCode: row.coupon_code,
    invoiceNumber: row.invoice_number,
    channel: row.payment_channel,
    validUntil: row.valid_until?.toISOString() ?? null,
    capturedAt: row.captured_at?.toISOString() ?? null,
    refundedAt: row.refunded_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export function toPayout(row: PayoutRow): Payout {
  return {
    id: row.id,
    examinerId: row.examiner_id,
    examinerName: row.examiner_name,
    month: row.payout_month,
    directSalesPaise: Number(row.direct_sales_65_paise),
    couponSalesPaise: Number(row.coupon_sales_75_paise),
    passPoolPaise: Number(row.pass_pool_share_paise),
    refundDeductionsPaise: Number(row.refund_deductions_paise),
    carriedForwardPaise: Number(row.carried_forward_paise),
    grossPaise: Number(row.gross_earnings_paise),
    tdsRatePercent: Number(row.tds_rate_percent),
    tdsPaise: Number(row.tds_deducted_paise),
    netPayablePaise: Number(row.net_payable_paise),
    status: row.status,
    holdReason: row.hold_reason,
    carriedIntoMonth: row.carried_into_month,
    bankTransferRef: row.bank_transfer_ref,
    paidAt: row.paid_at?.toISOString() ?? null,
    hasTdsCertificate: row.tds_certificate_asset_id !== null,
    kycVerified: row.kyc_verified,
    updatedAt: row.updated_at.toISOString(),
  };
}

/** One CSV cell: quoted, with spreadsheet formulas neutralised. */
function cell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csv(rows: (string | number | null)[][]): Buffer {
  return Buffer.from(`﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`, 'utf8');
}

export const rupees = (paise: number) => (paise / 100).toFixed(2);

import { series } from './catalogue';
import type { Purchase } from './types';

/**
 * Commerce and account policies the client previews. The server is the
 * authority for every one of them; these mirror docs/PAYMENTS.md so the UI can
 * explain eligibility before the student asks.
 */

/** Proposed web refund window (PRD 6.3; docs/PAYMENTS.md "Web proposed policy"). */
export const REFUND_WINDOW_DAYS = 7;
/** Concurrent device limit (DECISIONS C4: a third device is blocked, not swapped). */
export const DEVICE_LIMIT = 2;
/** Grace period before a requested account deletion runs (docs/SECURITY.md). */
export const DELETION_GRACE_DAYS = 7;

const DAY_MS = 86_400_000;

/** Tests a purchase unlocked: the test itself, or every test in the series. */
export function testsCoveredBy(purchase: Purchase): string[] {
  if (purchase.kind === 'test') return [purchase.itemId];
  return series.find((s) => s.id === purchase.itemId)?.testIds ?? [];
}

export type RefundEligibility =
  | { kind: 'store'; store: 'Google Play' | 'App Store' }
  | { kind: 'eligible'; daysLeft: number }
  | { kind: 'requested' }
  | { kind: 'ineligible'; reason: string };

/**
 * Web purchases: full refund within 7 days if none of the purchase's tests has
 * been started. Store purchases are refunded by Apple or Google under their own
 * rules; a verified store refund then revokes access on our side.
 */
export function refundEligibility(purchase: Purchase, startedTestIds: string[], now: number): RefundEligibility {
  if (purchase.channel !== 'Web') return { kind: 'store', store: purchase.channel };
  if (purchase.refund) return { kind: 'requested' };
  const ageDays = (now - Date.parse(purchase.purchasedAt)) / DAY_MS;
  if (ageDays > REFUND_WINDOW_DAYS) return { kind: 'ineligible', reason: `The ${REFUND_WINDOW_DAYS}-day refund window closed on ${new Date(Date.parse(purchase.purchasedAt) + REFUND_WINDOW_DAYS * DAY_MS).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.` };
  const started = testsCoveredBy(purchase).filter((id) => startedTestIds.includes(id));
  if (started.length > 0) return { kind: 'ineligible', reason: started.length === 1 ? 'A test from this purchase has been started.' : `${started.length} tests from this purchase have been started.` };
  return { kind: 'eligible', daysLeft: Math.max(1, Math.ceil(REFUND_WINDOW_DAYS - ageDays)) };
}

export function deletionDate(requestedAt: string): Date {
  return new Date(Date.parse(requestedAt) + DELETION_GRACE_DAYS * DAY_MS);
}

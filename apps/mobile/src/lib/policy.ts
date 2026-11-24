import { DELETION_GRACE_DAYS } from '@exam-prep/contracts';

/**
 * Account and commerce policies the app explains. The server enforces every one of them;
 * these only let the UI describe the rules before the student asks.
 */

export { DELETION_GRACE_DAYS };
/** Proposed web refund window (PRD 6.3; docs/PAYMENTS.md "Web proposed policy"). */
export const REFUND_WINDOW_DAYS = 7;
/** Concurrent device limit (DECISIONS C4: a third device is blocked, not swapped). */
export const DEVICE_LIMIT = 2;

const DAY_MS = 86_400_000;

/** When a pending deletion request will be carried out. */
export function deletionDate(requestedAt: string): Date {
  return new Date(Date.parse(requestedAt) + DELETION_GRACE_DAYS * DAY_MS);
}

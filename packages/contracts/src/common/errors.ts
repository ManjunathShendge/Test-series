import { z } from 'zod';

/** Stable machine-readable error codes. Additive only: deployed clients branch on these. */
export const ErrorCode = z.enum([
  'UNAUTHENTICATED',
  'EMAIL_NOT_VERIFIED',
  'AGE_CONFIRMATION_REQUIRED',
  'ACCOUNT_BLOCKED',
  'REAUTH_REQUIRED',
  'DELETION_NEEDS_SUPPORT',
  'ACCOUNT_EXISTS_WITH_DIFFERENT_SIGN_IN',
  'DEVICE_NOT_REGISTERED',
  'DEVICE_LIMIT_REACHED',
  /** Signed in, but the account lacks the role or admin permission the endpoint requires. */
  'FORBIDDEN',
  /** A unique value (for example a slug or name) is already used. details.field names it. */
  'ALREADY_EXISTS',
  /** Someone saved this record after it was loaded; reload and reapply the change. */
  'STALE_EDIT',
  /** The record is referenced (by a template, test or question) and cannot be removed or changed this way. */
  'IN_USE',
  /** A published template is frozen; publish a new version instead. */
  'TEMPLATE_LOCKED',
  /** The draft template is incomplete or inconsistent. details.issues lists why. */
  'TEMPLATE_NOT_PUBLISHABLE',
  'VALIDATION_FAILED',
  'QC_LOCKED',
  'AGREEMENT_UNAVAILABLE',
  'SCANNER_UNAVAILABLE',
  'STORAGE_UNAVAILABLE',
  'APPLICATION_ALREADY_EXISTS',
  'INVALID_ASSET',
  'IMPORT_REJECTED',
  'IMPORT_CONFLICT',
  'INVALID_IMPORT',
  'IMPORT_TOO_LARGE',
  'NOT_FOUND',
  /** Razorpay keys are not configured on this server. */
  'PAYMENTS_NOT_CONFIGURED',
  'PAYMENT_PROVIDER_UNAVAILABLE',
  'PAYMENT_REJECTED',
  /** The payment could not be verified as captured for this order; nothing was unlocked. */
  'PAYMENT_NOT_VERIFIED',
  'ALREADY_OWNED',
  'COUPON_INVALID',
  'REFUND_NOT_ALLOWED',
  'NOT_ENTITLED',
  'ATTEMPT_IN_PROGRESS',
  'ATTEMPT_CLOSED',
  'SESSION_REPLACED',
  'SYNC_GAP',
  'SYNC_CONFLICT',
  /** The item is not in a state that allows this action (e.g. featuring an unpublished test). */
  'INVALID_STATE',
  /** Too many requests from this device or network; retry after the Retry-After header. */
  'RATE_LIMITED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    /** Code-specific, documented per endpoint (for example the active devices on DEVICE_LIMIT_REACHED). */
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

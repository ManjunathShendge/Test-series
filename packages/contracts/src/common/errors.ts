import { z } from 'zod';

/** Stable machine-readable error codes. Additive only: deployed clients branch on these. */
export const ErrorCode = z.enum([
  'UNAUTHENTICATED',
  'EMAIL_NOT_VERIFIED',
  'AGE_CONFIRMATION_REQUIRED',
  'ACCOUNT_BLOCKED',
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
  'NOT_FOUND',
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

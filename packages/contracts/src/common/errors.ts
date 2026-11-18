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

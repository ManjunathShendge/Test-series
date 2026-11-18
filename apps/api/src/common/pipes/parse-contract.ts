import type { z } from 'zod';
import { ApiError } from '../errors/api-error.js';

/** Validates untrusted input against a contract schema; field paths only, never input values. */
export function parseContract<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'The request is not valid', {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return result.data;
}

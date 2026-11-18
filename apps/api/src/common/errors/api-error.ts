import { HttpException } from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@exam-prep/contracts';

/** A failure the client may act on: carries a contract error code and an HTTP status. */
export class ApiError extends HttpException {
  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    const body: ApiErrorBody = {
      error: details === undefined ? { code, message } : { code, message, details },
    };
    super(body, status);
  }
}

export const unauthenticated = () => new ApiError(401, 'UNAUTHENTICATED', 'Sign in again to continue');
export const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what} not found`);

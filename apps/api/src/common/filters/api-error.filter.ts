import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorBody } from '@exam-prep/contracts';
import { ApiError } from '../errors/api-error.js';

/**
 * Every error leaves the API in the contract shape { error: { code, message } }. Unexpected
 * failures are logged server-side and returned as INTERNAL without details, so connection
 * strings, SQL and stack traces never reach clients.
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>();
    if (exception instanceof ApiError) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // Readiness probes return their own { status, checks } body, which contains no secrets.
      if (status === 503) {
        response.status(503).json(exception.getResponse());
        return;
      }
      const body: ApiErrorBody = {
        error: {
          code: status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHENTICATED' : status < 500 ? 'VALIDATION_FAILED' : 'INTERNAL',
          message: status < 500 ? exception.message : 'Something went wrong',
        },
      };
      response.status(status).json(body);
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    const body: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Something went wrong' } };
    response.status(500).json(body);
  }
}

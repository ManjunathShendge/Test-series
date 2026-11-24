import type { z } from 'zod';
import { ApiErrorBody, DEVICE_ID_HEADER, type ErrorCode } from '@exam-prep/contracts';
import { idToken } from '@/lib/auth';
import { config } from '@/lib/config';
import { getDeviceId } from '@/lib/storage/device-id';

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'BAD_RESPONSE';

/** A failed API call with a contract error code the screens can branch on. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions<S extends z.ZodType> {
  body?: unknown;
  /** Response schema; omit for 204 responses. */
  schema?: S;
  timeoutMs?: number;
  /** Extra request headers (for example the attempt session). */
  headers?: Record<string, string>;
}

/**
 * Calls the API with the student's Firebase ID token and this install's device id. Every
 * response is validated against its contract before a screen sees it.
 */
export async function apiRequest<S extends z.ZodType>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  { body, schema, timeoutMs = 15000, headers: extra }: RequestOptions<S> = {},
): Promise<z.infer<S>> {
  const headers: Record<string, string> = { ...extra, accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = await idToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const deviceId = await getDeviceId();
  if (deviceId) headers[DEVICE_ID_HEADER] = deviceId;

  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }

  const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = ApiErrorBody.safeParse(payload);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiRequestError(response.status, code, message, details);
    }
    throw new ApiRequestError(response.status, 'BAD_RESPONSE', 'The server sent an unexpected reply.');
  }
  if (!schema) return undefined as z.infer<S>;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiRequestError(response.status, 'BAD_RESPONSE', 'The server sent an unexpected reply.');
  return parsed.data;
}

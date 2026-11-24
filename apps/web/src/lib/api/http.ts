'use client';

import type { z } from 'zod';
import { ApiErrorBody, DEVICE_ID_HEADER, type ErrorCode } from '@exam-prep/contracts';
import { idToken } from '@/lib/auth';
import { browserApiBase } from '@/lib/auth/config';
import { getDeviceId } from '@/lib/storage/device';

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'BAD_RESPONSE';

/** A failed API call with a contract error code the pages can branch on. */
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
 * Calls the API from the browser with the student's Firebase ID token and this browser's
 * device id. Every response is validated against its contract before a page sees it.
 */
export async function apiRequest<S extends z.ZodType>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  { body, schema, timeoutMs = 15000, headers: extra }: RequestOptions<S> = {},
): Promise<z.infer<S>> {
  const headers: Record<string, string> = { ...extra, accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = await idToken();
  if (token) headers['authorization'] = `Bearer ${token}`;
  const deviceId = getDeviceId();
  if (deviceId) headers[DEVICE_ID_HEADER] = deviceId;

  let response: Response;
  try {
    response = await fetch(`${browserApiBase}${path}`, {
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

/** GETs a file (for example an XLSX template) with the same credentials and error handling. */
export async function apiDownload(path: string, { timeoutMs = 30000 }: { timeoutMs?: number } = {}): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = await idToken();
  if (token) headers['authorization'] = `Bearer ${token}`;
  const deviceId = getDeviceId();
  if (deviceId) headers[DEVICE_ID_HEADER] = deviceId;
  let response: Response;
  try {
    response = await fetch(`${browserApiBase}${path}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  if (response.ok) return response.blob();
  const payload: unknown = await response.json().catch(() => undefined);
  const parsed = ApiErrorBody.safeParse(payload);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    throw new ApiRequestError(response.status, code, message, details);
  }
  throw new ApiRequestError(response.status, 'BAD_RESPONSE', 'The server sent an unexpected reply.');
}

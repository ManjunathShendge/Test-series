import { notFound } from 'next/navigation';
import type { z } from 'zod';
import {
  ExamDetail,
  ExaminerDetail,
  ExamList,
  SeriesDetail,
  TestDetail,
  TestList,
  type TestAccess,
  type TestType,
} from '@exam-prep/contracts';
import { serverApiHeaders } from './server-headers';

/*
 * Server-side reads of the public catalogue API (contracts/catalogue). Responses are
 * validated against the shared contracts so a drifted API fails loudly instead of rendering
 * wrong data. Data is cached for a minute, matching the API's own Cache-Control.
 */

const API_BASE = (process.env['API_BASE_URL'] ?? process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:3001/v1').replace(/\/$/, '');
const REVALIDATE_SECONDS = 60;

/** The API could not be reached or answered unexpectedly; pages show a retry state. */
export class CatalogueUnavailable extends Error {
  constructor(path: string, cause?: unknown) {
    super(`Catalogue request failed: ${path}`, { cause });
    this.name = 'CatalogueUnavailable';
  }
}

async function read<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { next: { revalidate: REVALIDATE_SECONDS }, headers: serverApiHeaders() });
  } catch (error) {
    throw new CatalogueUnavailable(path, error);
  }
  // 400 here means a malformed id or slug in the URL: for a visitor that is a missing page.
  if (res.status === 404 || res.status === 400) notFound();
  if (!res.ok) throw new CatalogueUnavailable(path, res.status);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new CatalogueUnavailable(path, parsed.error);
  return parsed.data;
}

const segment = (value: string) => encodeURIComponent(value);

export interface TestQuery {
  exam?: string | undefined;
  examiner?: string | undefined;
  type?: TestType | undefined;
  access?: TestAccess | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export const catalogue = {
  exams: () => read('/exams', ExamList),
  exam: (slug: string) => read(`/exams/${segment(slug)}`, ExamDetail),
  tests: (query: TestQuery = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
    const qs = params.toString();
    return read(`/tests${qs ? `?${qs}` : ''}`, TestList);
  },
  test: (slug: string) => read(`/tests/${segment(slug)}`, TestDetail),
  series: (slug: string) => read(`/series/${segment(slug)}`, SeriesDetail),
  examiner: (id: string) => read(`/examiners/${segment(id)}`, ExaminerDetail),
};

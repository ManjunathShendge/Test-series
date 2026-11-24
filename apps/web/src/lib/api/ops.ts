'use client';

import {
  AuditLogPage,
  Banner,
  BannerList,
  CatalogueList,
  CatalogueRow,
  OpsReport,
  type CatalogueAction,
  type CatalogueKind,
  type CreateBannerRequest,
  type ReportExportKind,
  type UpdateBannerRequest,
} from '@exam-prep/contracts';
import { apiDownload, apiRequest } from './http';

/** Admin operations calls (/v1/admin/ops, PRD 8). The API checks the operations permission on each one. */
const base = '/admin/ops';
const enc = encodeURIComponent;

/** Query string from the set values only ("" and undefined are left out). */
function query(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') params.set(key, String(value));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export interface AuditFilters {
  table?: string | undefined;
  action?: string | undefined;
  actor?: string | undefined;
  before?: string | undefined;
  limit?: number | undefined;
}

export const opsApi = {
  catalogue: async (kind: CatalogueKind, q: string, status: 'published' | 'unpublished' | 'all') =>
    (await apiRequest('GET', `${base}/catalogue${query({ kind, q: q.trim().length >= 2 ? q.trim() : undefined, status })}`, { schema: CatalogueList })).items,
  catalogueAction: (kind: CatalogueKind, id: string, body: CatalogueAction) =>
    apiRequest('PATCH', `${base}/${kind}/${enc(id)}`, { schema: CatalogueRow, body }),

  banners: async () => (await apiRequest('GET', `${base}/banners`, { schema: BannerList })).items,
  createBanner: (body: CreateBannerRequest) => apiRequest('POST', `${base}/banners`, { schema: Banner, body }),
  updateBanner: (id: string, body: UpdateBannerRequest) => apiRequest('PATCH', `${base}/banners/${enc(id)}`, { schema: Banner, body }),
  deleteBanner: (id: string) => apiRequest('DELETE', `${base}/banners/${enc(id)}`),

  report: (from: string, to: string) => apiRequest('GET', `${base}/reports${query({ from, to })}`, { schema: OpsReport, timeoutMs: 45000 }),
  exportReport: (from: string, to: string, kind: ReportExportKind) => apiDownload(`${base}/reports/export${query({ from, to, kind })}`, { timeoutMs: 60000 }),

  audit: (filters: AuditFilters) => apiRequest('GET', `${base}/audit${query({ ...filters })}`, { schema: AuditLogPage }),
};

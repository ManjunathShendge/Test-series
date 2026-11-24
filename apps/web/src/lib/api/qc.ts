'use client';

import {
  AdminExaminer,
  AdminExaminerList,
  QcFinishResponse,
  QcOverview,
  QcQueue,
  QcReviewDetail,
  QuestionReportList,
  AssetViewUrl,
  type CorrectKeyRequest,
  type CreateSpotCheckRequest,
  type QcMinorEditRequest,
  type QcDecisionRequest,
  type ReassignReviewRequest,
  type ResolveReportRequest,
  type SpotCheckResultRequest,
  type UpdateAdminExaminerRequest,
  type UpdateQcSettingsRequest,
} from '@exam-prep/contracts';
import { apiRequest } from './http';

const enc = encodeURIComponent;

/** Reviewer workspace (/v1/qc). The API checks the role and the assignment on every call. */
export const qcApi = {
  queue: async () => (await apiRequest('GET', '/qc/queue', { schema: QcQueue })).items,
  review: (id: string) => apiRequest('GET', `/qc/reviews/${enc(id)}`, { schema: QcReviewDetail }),
  decide: (id: string, itemId: string, body: QcDecisionRequest) =>
    apiRequest('PUT', `/qc/reviews/${enc(id)}/items/${enc(itemId)}`, { schema: QcReviewDetail, body }),
  finish: (id: string, comments: string) =>
    apiRequest('POST', `/qc/reviews/${enc(id)}/finish`, { schema: QcFinishResponse, body: { comments } }),
  spotCheck: (id: string, body: SpotCheckResultRequest) =>
    apiRequest('POST', `/qc/reviews/${enc(id)}/spot-check`, { schema: QcFinishResponse, body }),
  image: (id: string, assetId: string) =>
    apiRequest('GET', `/qc/reviews/${enc(id)}/images/${enc(assetId)}`, { schema: AssetViewUrl }),
  reports: async () => (await apiRequest('GET', '/qc/reports', { schema: QuestionReportList })).items,
  minorEdit: (id: string, itemId: string, body: QcMinorEditRequest) =>
    apiRequest('PUT', `/qc/reviews/${enc(id)}/items/${enc(itemId)}/edit`, { schema: QcReviewDetail, body }),
  correctKey: async (id: string, body: CorrectKeyRequest) =>
    (await apiRequest('POST', `/qc/reports/${enc(id)}/correct-key`, { schema: QuestionReportList, body })).items,
  resolve: async (id: string, body: ResolveReportRequest) =>
    (await apiRequest('POST', `/qc/reports/${enc(id)}/resolve`, { schema: QuestionReportList, body })).items,
};

/** Admin QC operations and examiner management (/v1/admin/qc, /v1/admin/examiners). */
export const adminQcApi = {
  overview: () => apiRequest('GET', '/admin/qc', { schema: QcOverview }),
  addReviewer: (email: string) => apiRequest('POST', '/admin/qc/reviewers', { schema: QcOverview, body: { email } }),
  removeReviewer: (id: string) => apiRequest('DELETE', `/admin/qc/reviewers/${enc(id)}`, { schema: QcOverview }),
  mapReviewer: (id: string, examId: string) =>
    apiRequest('POST', `/admin/qc/reviewers/${enc(id)}/exams`, { schema: QcOverview, body: { examId } }),
  unmap: (mappingId: string) => apiRequest('DELETE', `/admin/qc/mappings/${enc(mappingId)}`, { schema: QcOverview }),
  assign: (reviewId: string, body: ReassignReviewRequest) =>
    apiRequest('PATCH', `/admin/qc/reviews/${enc(reviewId)}/assign`, { schema: QcOverview, body }),
  spotCheck: (body: CreateSpotCheckRequest) =>
    apiRequest('POST', '/admin/qc/spot-checks', { schema: QcOverview, body }),
  settings: (examId: string, body: UpdateQcSettingsRequest) =>
    apiRequest('PUT', `/admin/qc/settings/${enc(examId)}`, { schema: QcOverview, body }),
  examiners: async () => (await apiRequest('GET', '/admin/examiners', { schema: AdminExaminerList })).items,
  updateExaminer: (id: string, body: UpdateAdminExaminerRequest) =>
    apiRequest('PATCH', `/admin/examiners/${enc(id)}`, { schema: AdminExaminer, body }),
};

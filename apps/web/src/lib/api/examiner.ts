'use client';

import {
  ExaminerSeriesDetail,
  ExaminerSeriesList,
  ExaminerTestDetail,
  ExaminerTestList,
  ExaminerQualityResponse,
  QuestionReportList,
  SubmitExaminerTestResponse,
  type CreateExaminerSeriesRequest,
  type CreateExaminerTestRequest,
  type FillTestFromImportRequest,
  type SetSectionQuestionsRequest,
  type UpdateExaminerSeriesRequest,
  type UpdateExaminerTestRequest,
} from '@exam-prep/contracts';
import { apiRequest } from './http';

/** Examiner tests and series (/v1/examiner/tests, /v1/examiner/series). The API authorizes every call. */
const enc = encodeURIComponent;

export const examinerApi = {
  tests: async () => (await apiRequest('GET', '/examiner/tests', { schema: ExaminerTestList })).items,
  test: (id: string) => apiRequest('GET', `/examiner/tests/${enc(id)}`, { schema: ExaminerTestDetail }),
  createTest: (body: CreateExaminerTestRequest) =>
    apiRequest('POST', '/examiner/tests', { schema: ExaminerTestDetail, body }),
  updateTest: (id: string, body: UpdateExaminerTestRequest) =>
    apiRequest('PATCH', `/examiner/tests/${enc(id)}`, { schema: ExaminerTestDetail, body }),
  deleteTest: (id: string) => apiRequest('DELETE', `/examiner/tests/${enc(id)}`),
  setSection: (id: string, sectionId: string, body: SetSectionQuestionsRequest) =>
    apiRequest('PUT', `/examiner/tests/${enc(id)}/sections/${enc(sectionId)}/questions`, {
      schema: ExaminerTestDetail,
      body,
    }),
  fillFromImport: (id: string, body: FillTestFromImportRequest) =>
    apiRequest('POST', `/examiner/tests/${enc(id)}/fill-from-import`, { schema: ExaminerTestDetail, body }),
  precheck: (id: string) =>
    apiRequest('POST', `/examiner/tests/${enc(id)}/precheck`, { schema: SubmitExaminerTestResponse }),
  submit: (id: string, expectedUpdatedAt: string) =>
    apiRequest('POST', `/examiner/tests/${enc(id)}/submit`, {
      schema: SubmitExaminerTestResponse,
      body: { expectedUpdatedAt },
    }),
  useLatestVersions: (id: string, expectedUpdatedAt: string) =>
    apiRequest('POST', `/examiner/tests/${enc(id)}/use-latest-versions`, {
      schema: ExaminerTestDetail,
      body: { expectedUpdatedAt },
    }),
  quality: () => apiRequest('GET', '/examiner/quality', { schema: ExaminerQualityResponse }),
  reports: async () => (await apiRequest('GET', '/examiner/reports', { schema: QuestionReportList })).items,
  respond: async (id: string, response: string) =>
    (await apiRequest('POST', `/examiner/reports/${enc(id)}/response`, { schema: QuestionReportList, body: { response } }))
      .items,
  series: async () => (await apiRequest('GET', '/examiner/series', { schema: ExaminerSeriesList })).items,
  oneSeries: (id: string) => apiRequest('GET', `/examiner/series/${enc(id)}`, { schema: ExaminerSeriesDetail }),
  createSeries: (body: CreateExaminerSeriesRequest) =>
    apiRequest('POST', '/examiner/series', { schema: ExaminerSeriesDetail, body }),
  updateSeries: (id: string, body: UpdateExaminerSeriesRequest) =>
    apiRequest('PATCH', `/examiner/series/${enc(id)}`, { schema: ExaminerSeriesDetail, body }),
  publishSeries: (id: string, published: boolean, expectedUpdatedAt: string) =>
    apiRequest('POST', `/examiner/series/${enc(id)}/${published ? 'publish' : 'unpublish'}`, {
      schema: ExaminerSeriesDetail,
      body: { expectedUpdatedAt },
    }),
  deleteSeries: (id: string) => apiRequest('DELETE', `/examiner/series/${enc(id)}`),
};

/** ₹ from paise for display; integer paise stay the source of truth (invariant 5). */
export const rupees = (paise: number) =>
  paise === 0 ? 'Free' : `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

'use client';

import {
  AdminCategory,
  AdminCategoryList,
  AdminExam,
  AdminExamList,
  AdminTemplate,
  AuditList,
  ExaminerApplication,
  ExaminerApplicationList,
  ExaminerApplicationStatusResponse,
  AdminKycDownloadUrl,
  ExaminerAuthoringOptions,
  CreateExaminerApplicationRequest,
  type DecideExaminerApplicationRequest,
  AssetUploadIntentRequest,
  AssetUploadIntent,
  CompleteAssetRequest,
  DraftQuestionInput,
  DraftQuestion,
  DraftQuestionList,
  AssetViewUrl,
  type QuestionBankQuery,
  ImportPreviewRequest,
  ImportPreview,
  type ImportTemplateQuery,
  ImportCommitRequest,
  CompleteAssetResponse,
  ImportCommitResponse,
  type CreateCategoryRequest,
  type CreateExamRequest,
  type CreateTemplateRequest,
  type StageRequest,
  type UpdateCategoryRequest,
  type UpdateExamRequest,
  type UpdateTemplateRequest,
} from '@exam-prep/contracts';
import { apiDownload, apiRequest } from './http';

/** Admin catalogue calls (/v1/admin/catalogue). The API authorizes each one; the UI only hides what it cannot do. */
const base = '/admin/catalogue';
const enc = encodeURIComponent;

export const adminApi = {
  examinerUploadIntent: (body: AssetUploadIntentRequest) =>
    apiRequest('POST', '/assets/upload-intents', { schema: AssetUploadIntent, body }),
  completeUpload: (id: string, body: CompleteAssetRequest) =>
    apiRequest('POST', `/assets/${enc(id)}/complete`, { schema: CompleteAssetResponse, body }),
  examinerQuestions: (query: Partial<QuestionBankQuery>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return apiRequest('GET', `/examiner/questions?${params}`, { schema: DraftQuestionList });
  },
  questionImageUrl: (id: string) =>
    apiRequest('GET', `/assets/${enc(id)}/view-url`, { schema: AssetViewUrl }),
  examinerOptions: () =>
    apiRequest('GET', '/examiner/options', { schema: ExaminerAuthoringOptions }),
  examinerApplication: async () =>
    (await apiRequest('GET', '/examiner/application', { schema: ExaminerApplicationStatusResponse }))
      .application,
  submitExaminerApplication: (body: CreateExaminerApplicationRequest) =>
    apiRequest('POST', '/examiner/applications', { schema: ExaminerApplication, body }),
  createExaminerQuestion: (body: DraftQuestionInput) =>
    apiRequest('POST', '/examiner/questions', { schema: DraftQuestion, body }),
  updateExaminerQuestion: (id: string, body: DraftQuestionInput) =>
    apiRequest('PATCH', `/examiner/questions/${enc(id)}`, { schema: DraftQuestion, body }),
  previewExaminerImport: (body: ImportPreviewRequest) =>
    apiRequest('POST', '/examiner/imports/preview', { schema: ImportPreview, body }),
  examinerImportTemplate: (query: ImportTemplateQuery) =>
    apiDownload(`/examiner/imports/template?${new URLSearchParams(query)}`),
  commitExaminerImport: (id: string, body: ImportCommitRequest) =>
    apiRequest('POST', `/examiner/imports/${enc(id)}/commit`, {
      schema: ImportCommitResponse,
      body,
    }),
  examinerApplications: async () =>
    (await apiRequest('GET', '/admin/examiner-applications', { schema: ExaminerApplicationList }))
      .items,
  decideExaminerApplication: (id: string, body: DecideExaminerApplicationRequest) =>
    apiRequest('PATCH', `/admin/examiner-applications/${enc(id)}`, {
      schema: ExaminerApplication,
      body,
    }),
  examinerKycDownloadUrl: (applicationId: string, assetId: string) =>
    apiRequest(
      'GET',
      `/admin/examiner-applications/${enc(applicationId)}/kyc/${enc(assetId)}/download-url`,
      { schema: AdminKycDownloadUrl },
    ),
  categories: async () =>
    (await apiRequest('GET', `${base}/categories`, { schema: AdminCategoryList })).items,
  createCategory: (body: CreateCategoryRequest) =>
    apiRequest('POST', `${base}/categories`, { schema: AdminCategory, body }),
  updateCategory: (id: string, body: UpdateCategoryRequest) =>
    apiRequest('PATCH', `${base}/categories/${enc(id)}`, { schema: AdminCategory, body }),
  deleteCategory: (id: string) => apiRequest('DELETE', `${base}/categories/${enc(id)}`),

  exams: async () => (await apiRequest('GET', `${base}/exams`, { schema: AdminExamList })).items,
  exam: (id: string) => apiRequest('GET', `${base}/exams/${enc(id)}`, { schema: AdminExam }),
  createExam: (body: CreateExamRequest) =>
    apiRequest('POST', `${base}/exams`, { schema: AdminExam, body }),
  updateExam: (id: string, body: UpdateExamRequest) =>
    apiRequest('PATCH', `${base}/exams/${enc(id)}`, { schema: AdminExam, body }),
  history: async (id: string) =>
    (await apiRequest('GET', `${base}/exams/${enc(id)}/history`, { schema: AuditList })).items,

  addStage: (examId: string, body: StageRequest) =>
    apiRequest('POST', `${base}/exams/${enc(examId)}/stages`, { schema: AdminExam, body }),
  updateStage: (id: string, body: StageRequest) =>
    apiRequest('PUT', `${base}/stages/${enc(id)}`, { schema: AdminExam, body }),
  deleteStage: (id: string) =>
    apiRequest('DELETE', `${base}/stages/${enc(id)}`, { schema: AdminExam }),

  addSubject: (examId: string, name: string) =>
    apiRequest('POST', `${base}/exams/${enc(examId)}/subjects`, {
      schema: AdminExam,
      body: { name },
    }),
  renameSubject: (id: string, name: string) =>
    apiRequest('PUT', `${base}/subjects/${enc(id)}`, { schema: AdminExam, body: { name } }),
  deleteSubject: (id: string) =>
    apiRequest('DELETE', `${base}/subjects/${enc(id)}`, { schema: AdminExam }),
  addTopics: (subjectId: string, names: string[]) =>
    apiRequest('POST', `${base}/subjects/${enc(subjectId)}/topics`, {
      schema: AdminExam,
      body: { names },
    }),
  renameTopic: (id: string, name: string) =>
    apiRequest('PUT', `${base}/topics/${enc(id)}`, { schema: AdminExam, body: { name } }),
  deleteTopic: (id: string) =>
    apiRequest('DELETE', `${base}/topics/${enc(id)}`, { schema: AdminExam }),

  template: (id: string) =>
    apiRequest('GET', `${base}/templates/${enc(id)}`, { schema: AdminTemplate }),
  createTemplate: (examId: string, body: CreateTemplateRequest) =>
    apiRequest('POST', `${base}/exams/${enc(examId)}/templates`, { schema: AdminTemplate, body }),
  updateTemplate: (id: string, body: UpdateTemplateRequest) =>
    apiRequest('PUT', `${base}/templates/${enc(id)}`, { schema: AdminTemplate, body }),
  deleteTemplate: (id: string) => apiRequest('DELETE', `${base}/templates/${enc(id)}`),
  publishTemplate: (id: string, expectedUpdatedAt: string) =>
    apiRequest('POST', `${base}/templates/${enc(id)}/publish`, {
      schema: AdminTemplate,
      body: { expectedUpdatedAt },
    }),
  newVersion: (id: string) =>
    apiRequest('POST', `${base}/templates/${enc(id)}/new-version`, { schema: AdminTemplate }),
  retireTemplate: (id: string) =>
    apiRequest('POST', `${base}/templates/${enc(id)}/retire`, { schema: AdminTemplate }),
  reinstateTemplate: (id: string) =>
    apiRequest('POST', `${base}/templates/${enc(id)}/reinstate`, { schema: AdminTemplate }),
};

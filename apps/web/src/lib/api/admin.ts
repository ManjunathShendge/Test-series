'use client';

import {
  AdminCategory,
  AdminCategoryList,
  AdminExam,
  AdminExamList,
  AdminTemplate,
  AuditList,
  type CreateCategoryRequest,
  type CreateExamRequest,
  type CreateTemplateRequest,
  type StageRequest,
  type UpdateCategoryRequest,
  type UpdateExamRequest,
  type UpdateTemplateRequest,
} from '@exam-prep/contracts';
import { apiRequest } from './http';

/** Admin catalogue calls (/v1/admin/catalogue). The API authorizes each one; the UI only hides what it cannot do. */
const base = '/admin/catalogue';
const enc = encodeURIComponent;

export const adminApi = {
  categories: async () => (await apiRequest('GET', `${base}/categories`, { schema: AdminCategoryList })).items,
  createCategory: (body: CreateCategoryRequest) => apiRequest('POST', `${base}/categories`, { schema: AdminCategory, body }),
  updateCategory: (id: string, body: UpdateCategoryRequest) => apiRequest('PATCH', `${base}/categories/${enc(id)}`, { schema: AdminCategory, body }),
  deleteCategory: (id: string) => apiRequest('DELETE', `${base}/categories/${enc(id)}`),

  exams: async () => (await apiRequest('GET', `${base}/exams`, { schema: AdminExamList })).items,
  exam: (id: string) => apiRequest('GET', `${base}/exams/${enc(id)}`, { schema: AdminExam }),
  createExam: (body: CreateExamRequest) => apiRequest('POST', `${base}/exams`, { schema: AdminExam, body }),
  updateExam: (id: string, body: UpdateExamRequest) => apiRequest('PATCH', `${base}/exams/${enc(id)}`, { schema: AdminExam, body }),
  history: async (id: string) => (await apiRequest('GET', `${base}/exams/${enc(id)}/history`, { schema: AuditList })).items,

  addStage: (examId: string, body: StageRequest) => apiRequest('POST', `${base}/exams/${enc(examId)}/stages`, { schema: AdminExam, body }),
  updateStage: (id: string, body: StageRequest) => apiRequest('PUT', `${base}/stages/${enc(id)}`, { schema: AdminExam, body }),
  deleteStage: (id: string) => apiRequest('DELETE', `${base}/stages/${enc(id)}`, { schema: AdminExam }),

  addSubject: (examId: string, name: string) => apiRequest('POST', `${base}/exams/${enc(examId)}/subjects`, { schema: AdminExam, body: { name } }),
  renameSubject: (id: string, name: string) => apiRequest('PUT', `${base}/subjects/${enc(id)}`, { schema: AdminExam, body: { name } }),
  deleteSubject: (id: string) => apiRequest('DELETE', `${base}/subjects/${enc(id)}`, { schema: AdminExam }),
  addTopics: (subjectId: string, names: string[]) => apiRequest('POST', `${base}/subjects/${enc(subjectId)}/topics`, { schema: AdminExam, body: { names } }),
  renameTopic: (id: string, name: string) => apiRequest('PUT', `${base}/topics/${enc(id)}`, { schema: AdminExam, body: { name } }),
  deleteTopic: (id: string) => apiRequest('DELETE', `${base}/topics/${enc(id)}`, { schema: AdminExam }),

  template: (id: string) => apiRequest('GET', `${base}/templates/${enc(id)}`, { schema: AdminTemplate }),
  createTemplate: (examId: string, body: CreateTemplateRequest) => apiRequest('POST', `${base}/exams/${enc(examId)}/templates`, { schema: AdminTemplate, body }),
  updateTemplate: (id: string, body: UpdateTemplateRequest) => apiRequest('PUT', `${base}/templates/${enc(id)}`, { schema: AdminTemplate, body }),
  deleteTemplate: (id: string) => apiRequest('DELETE', `${base}/templates/${enc(id)}`),
  publishTemplate: (id: string, expectedUpdatedAt: string) =>
    apiRequest('POST', `${base}/templates/${enc(id)}/publish`, { schema: AdminTemplate, body: { expectedUpdatedAt } }),
  newVersion: (id: string) => apiRequest('POST', `${base}/templates/${enc(id)}/new-version`, { schema: AdminTemplate }),
  retireTemplate: (id: string) => apiRequest('POST', `${base}/templates/${enc(id)}/retire`, { schema: AdminTemplate }),
  reinstateTemplate: (id: string) => apiRequest('POST', `${base}/templates/${enc(id)}/reinstate`, { schema: AdminTemplate }),
};

import { z } from 'zod';
import {
  ATTEMPT_SESSION_HEADER,
  AssetViewUrl,
  AttemptPaper,
  AttemptSession,
  AttemptState,
  AttemptReview,
  AttemptSummary,
  MyAttemptList,
  MyProgress,
  PracticeList,
  ReportQuestionResponse,
  type PracticeKind,
  type ReportQuestionRequest,
  type SaveQuestionRequest,
  SyncAttemptResponse,
  type SyncAttemptRequest,
} from '@exam-prep/contracts';
import { apiRequest } from './http';

/** Student attempts (docs/TEST_ENGINE.md). The session token proves this install is the one writer. */
const enc = encodeURIComponent;
const StartReply = z.union([AttemptSession, z.object({ attemptId: z.uuid(), resume: z.literal(true) })]);
const session = (token: string) => ({ [ATTEMPT_SESSION_HEADER]: token });

export const attemptsApi = {
  start: (testId: string) =>
    apiRequest('POST', '/attempts', { schema: StartReply, body: { testId, instructionsAccepted: true }, timeoutMs: 30000 }),
  get: (id: string, token: string | null) =>
    apiRequest('GET', `/attempts/${enc(id)}`, { schema: AttemptState, ...(token ? { headers: session(token) } : {}) }),
  takeover: (id: string) => apiRequest('POST', `/attempts/${enc(id)}/takeover`, { schema: AttemptSession }),
  paper: (id: string) => apiRequest('GET', `/attempts/${enc(id)}/paper`, { schema: AttemptPaper, timeoutMs: 30000 }),
  image: (id: string, assetId: string) => apiRequest('GET', `/attempts/${enc(id)}/images/${enc(assetId)}`, { schema: AssetViewUrl }),
  sync: (id: string, token: string, body: SyncAttemptRequest) =>
    apiRequest('POST', `/attempts/${enc(id)}/sync`, { schema: SyncAttemptResponse, body, headers: session(token) }),
  submit: (id: string, token: string, body: SyncAttemptRequest) =>
    apiRequest('POST', `/attempts/${enc(id)}/submit`, { schema: AttemptSummary, body, headers: session(token), timeoutMs: 30000 }),
  summary: (id: string) => apiRequest('GET', `/attempts/${enc(id)}/summary`, { schema: AttemptSummary }),
  mine: async () => (await apiRequest('GET', '/me/attempts', { schema: MyAttemptList })).items,
  review: (id: string) => apiRequest('GET', `/attempts/${enc(id)}/review`, { schema: AttemptReview, timeoutMs: 30000 }),
  progress: () => apiRequest('GET', '/me/progress', { schema: MyProgress }),
  practice: async (kind: PracticeKind) => (await apiRequest('GET', `/me/practice/${kind}`, { schema: PracticeList })).items,
  saveQuestion: (questionId: string, body: SaveQuestionRequest) => apiRequest('PUT', `/me/saved-questions/${enc(questionId)}`, { body }),
  report: (questionId: string, body: ReportQuestionRequest) =>
    apiRequest('POST', `/questions/${enc(questionId)}/reports`, { schema: ReportQuestionResponse, body }),
};

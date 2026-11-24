'use client';

import { z } from 'zod';
import {
  ATTEMPT_SESSION_HEADER,
  AssetViewUrl,
  AttemptPaper,
  AttemptSession,
  AttemptState,
  AttemptSummary,
  MyAttemptList,
  SyncAttemptResponse,
  type SyncAttemptRequest,
} from '@exam-prep/contracts';
import { apiRequest } from './http';

/** Student attempts (TEST_ENGINE). The session token proves this tab is the one writer. */
const enc = encodeURIComponent;
const session = (token: string | null) => (token ? { [ATTEMPT_SESSION_HEADER]: token } : undefined);

const StartReply = z.union([AttemptSession, z.object({ attemptId: z.uuid(), resume: z.literal(true) })]);

export const attemptsApi = {
  start: (testId: string) =>
    apiRequest('POST', '/attempts', { schema: StartReply, body: { testId, instructionsAccepted: true }, timeoutMs: 30000 }),
  get: (id: string, token: string | null) => {
    const headers = session(token);
    return apiRequest('GET', `/attempts/${enc(id)}`, { schema: AttemptState, ...(headers ? { headers } : {}) });
  },
  takeover: (id: string) => apiRequest('POST', `/attempts/${enc(id)}/takeover`, { schema: AttemptSession }),
  paper: (id: string) => apiRequest('GET', `/attempts/${enc(id)}/paper`, { schema: AttemptPaper, timeoutMs: 30000 }),
  image: (id: string, assetId: string) =>
    apiRequest('GET', `/attempts/${enc(id)}/images/${enc(assetId)}`, { schema: AssetViewUrl }),
  sync: (id: string, token: string, body: SyncAttemptRequest) =>
    apiRequest('POST', `/attempts/${enc(id)}/sync`, { schema: SyncAttemptResponse, body, headers: { [ATTEMPT_SESSION_HEADER]: token } }),
  submit: (id: string, token: string, body: SyncAttemptRequest) =>
    apiRequest('POST', `/attempts/${enc(id)}/submit`, {
      schema: AttemptSummary,
      body,
      headers: { [ATTEMPT_SESSION_HEADER]: token },
      timeoutMs: 30000,
    }),
  summary: (id: string) => apiRequest('GET', `/attempts/${enc(id)}/summary`, { schema: AttemptSummary }),
  mine: async () => (await apiRequest('GET', '/me/attempts', { schema: MyAttemptList })).items,
};

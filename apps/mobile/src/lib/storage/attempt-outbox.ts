import Storage from 'expo-sqlite/kv-store';
import type { AttemptEvent } from '@exam-prep/contracts';
import type { AnswerState } from '@exam-prep/engine';

/**
 * On-device copy of a running attempt (docs/TEST_ENGINE.md "Durable outbox protocol"): the
 * session token, the answers and every event the server has not acknowledged. Each write is a
 * committed SQLite transaction (expo-sqlite key-value store); the player shows "saved on this
 * device" only after it resolves. Records are removed once the server closes the attempt.
 */
export interface LocalAttempt {
  attemptId: string;
  token: string;
  epoch: number;
  /** Highest sequence the server confirmed for this epoch. */
  ackSeq: number;
  /** Sequence for the next event. */
  nextSeq: number;
  /** Events above `ackSeq`, oldest first. */
  events: AttemptEvent[];
  answers: Record<string, AnswerState>;
  current: string | null;
  submitPending: boolean;
  updatedAt: number;
}

const PREFIX = 'examprep.attempt.v1.';
const INDEX = 'examprep.attempts.v1';

async function index(): Promise<string[]> {
  try {
    const raw = await Storage.getItem(INDEX);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function loadAttempt(attemptId: string): Promise<LocalAttempt | null> {
  try {
    const raw = await Storage.getItem(PREFIX + attemptId);
    return raw ? (JSON.parse(raw) as LocalAttempt) : null;
  } catch {
    return null;
  }
}

/** Resolves once committed; rejects when the device refused the write. */
export async function saveAttempt(record: LocalAttempt): Promise<void> {
  await Storage.setItem(PREFIX + record.attemptId, JSON.stringify({ ...record, updatedAt: Date.now() }));
  const ids = await index();
  if (!ids.includes(record.attemptId)) await Storage.setItem(INDEX, JSON.stringify([...ids, record.attemptId]));
}

export async function removeAttempt(attemptId: string): Promise<void> {
  try {
    await Storage.removeItem(PREFIX + attemptId);
    const ids = await index();
    await Storage.setItem(INDEX, JSON.stringify(ids.filter((id) => id !== attemptId)));
  } catch {
    // Left behind: the next start or takeover replaces it.
  }
}

/** Sign-out: session tokens and unsent answers must not outlive the account on this device. */
export async function clearAttempts(): Promise<void> {
  const ids = await index();
  for (const id of ids) await Storage.removeItem(PREFIX + id).catch(() => undefined);
  await Storage.removeItem(INDEX).catch(() => undefined);
}

export function newLocalAttempt(attemptId: string, token: string, epoch: number, ackSeq: number): LocalAttempt {
  return { attemptId, token, epoch, ackSeq, nextSeq: ackSeq + 1, events: [], answers: {}, current: null, submitPending: false, updatedAt: Date.now() };
}

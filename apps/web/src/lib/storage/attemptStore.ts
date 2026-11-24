'use client';

import type { AttemptEvent } from '@exam-prep/contracts';
import type { AnswerState } from '@exam-prep/engine';

/**
 * On-device copy of a running attempt (TEST_ENGINE "Durable outbox protocol"): the session
 * token, the answers and every event the server has not acknowledged yet. Each change is one
 * IndexedDB transaction, and the player says "saved on this device" only after it commits.
 * Without IndexedDB (some private windows) it falls back to memory and says so.
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

const DB_NAME = 'mmp-attempts';
const STORE = 'attempts';
const memory = new Map<string, LocalAttempt>();
let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'attemptId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

/** True when answers survive a closed tab or a crash on this browser. */
export async function isDurable(): Promise<boolean> {
  return (await open()) !== null;
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    // Resolve on commit, not on request success: durability comes with the transaction.
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error ?? new Error('Storage failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Storage aborted'));
  });
}

export async function loadAttempt(attemptId: string): Promise<LocalAttempt | null> {
  const db = await open();
  if (!db) return memory.get(attemptId) ?? null;
  try {
    return ((await run<LocalAttempt>(db, 'readonly', (s) => s.get(attemptId))) as LocalAttempt | undefined) ?? null;
  } catch {
    return memory.get(attemptId) ?? null;
  }
}

/** Resolves once the record is committed; rejects when the browser refused to store it. */
export async function saveAttempt(record: LocalAttempt): Promise<void> {
  const copy: LocalAttempt = { ...record, updatedAt: Date.now() };
  const db = await open();
  if (!db) {
    memory.set(copy.attemptId, copy);
    return;
  }
  await run(db, 'readwrite', (s) => s.put(copy));
}

export async function removeAttempt(attemptId: string): Promise<void> {
  memory.delete(attemptId);
  const db = await open();
  if (!db) return;
  try {
    await run(db, 'readwrite', (s) => s.delete(attemptId));
  } catch {
    // Left behind: the next start or takeover replaces it.
  }
}

/** A fresh record for a new session (start or takeover). */
export function newLocalAttempt(attemptId: string, token: string, epoch: number, ackSeq: number): LocalAttempt {
  return { attemptId, token, epoch, ackSeq, nextSeq: ackSeq + 1, events: [], answers: {}, current: null, submitPending: false, updatedAt: Date.now() };
}

import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AttemptEvent, AttemptSection, AttemptState as ServerState, PaperQuestion, SyncAttemptResponse } from '@exam-prep/contracts';
import {
  answerChanged,
  crossedWarning,
  initialState,
  reduce,
  serverOffset,
  type AnswerState,
  type AttemptAction,
  type AttemptState,
} from '@exam-prep/engine';
import { announce } from '@/lib/a11y';
import { track } from '@/lib/analytics';
import { attemptsApi } from '@/lib/api/attempts';
import { ApiRequestError } from '@/lib/api/http';
import { loadAttempt, newLocalAttempt, removeAttempt, saveAttempt, type LocalAttempt } from '@/lib/storage/attempt-outbox';
import { openSectionIds } from './sections';

/*
 * Binds the pure engine to time, SQLite and the network (docs/TEST_ENGINE.md): every change is
 * committed on the device before it counts as saved, sent in numbered batches, and dropped only
 * once the server acknowledges it. After a restart the clock re-anchors to the server; the
 * server decides time, sections and the score.
 */

export type Phase =
  | { kind: 'loading' }
  /** Another device holds the session; `unsynced` changes here cannot be merged. */
  | { kind: 'takeover'; unsynced: number }
  | { kind: 'error'; error: unknown }
  | { kind: 'running' }
  | { kind: 'submitting'; waiting: boolean }
  | { kind: 'done' };

export type Net = 'synced' | 'saving' | 'offline';

export interface Meta {
  testId: string;
  testTitle: string;
  examName: string;
  hasHindi: boolean;
  sectional: boolean;
  watermark: string;
}

export const MY_ATTEMPTS_KEY = ['me', 'attempts'] as const;

// Monotonic clock (Hermes provides performance.now); wall-clock changes never add time.
const perf = (globalThis as { performance?: { now(): number } }).performance;
const monoNow = () => (perf ? perf.now() : Date.now());

const MAX_BATCH = 200;
const DIRTY_EVERY_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;
const jitter = () => Math.round(Math.random() * 1_000);
const toAnswer = (a: ServerState['answers'][number]): AnswerState => ({ selected: a.selected, marked: a.marked, visited: a.visited, timeMs: a.timeMs });
const sameChoice = (a: AnswerState | undefined, b: AnswerState | undefined) =>
  (a?.selected ?? null) === (b?.selected ?? null) && !!a?.marked === !!b?.marked && !!a?.visited === !!b?.visited;
const codeOf = (error: unknown) => (error instanceof ApiRequestError ? error.code : null);
const retryable = (error: unknown) => !(error instanceof ApiRequestError) || error.code === 'NETWORK' || error.status >= 500 || error.status === 429;
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function useAttempt(attemptId: string) {
  const queryClient = useQueryClient();
  const [phase, setPhaseState] = useState<Phase>({ kind: 'loading' });
  const [engine, setEngine] = useState<AttemptState | null>(null);
  const [questions, setQuestions] = useState<PaperQuestion[]>([]);
  const [sections, setSections] = useState<AttemptSection[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [net, setNet] = useState<Net>('synced');
  const [storageFailed, setStorageFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [pending, setPending] = useState(0);

  const phaseRef = useRef<Phase>(phase);
  const recRef = useRef<LocalAttempt | null>(null);
  const engineRef = useRef<AttemptState | null>(null);
  const sentRef = useRef<Record<string, AnswerState>>({});
  const sectionsRef = useRef<AttemptSection[]>([]);
  const offsetRef = useRef(0);
  const deadlineRef = useRef(0);
  const genRef = useRef(0);
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const sync = useRef({ busy: false, again: false, failures: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined, dueAt: 0, lastTime: 0 });

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const serverNow = useCallback(() => monoNow() + offsetRef.current, []);
  const live = useCallback((gen: number) => gen === genRef.current, []);

  // ---------- Device storage ----------

  const persist = useCallback(() => {
    const rec = recRef.current;
    const eng = engineRef.current;
    if (!rec || !eng) return writeChain.current;
    rec.answers = { ...eng.answers };
    rec.current = eng.items[eng.current]?.id ?? null;
    const snapshot: LocalAttempt = { ...rec, events: [...rec.events], answers: { ...rec.answers } };
    setPending(rec.events.length);
    writeChain.current = writeChain.current.then(() => saveAttempt(snapshot)).then(
      () => setStorageFailed(false),
      () => setStorageFailed(true),
    );
    return writeChain.current;
  }, []);

  const enqueue = useCallback((make: (seq: number) => AttemptEvent) => {
    const rec = recRef.current;
    if (!rec) return;
    rec.events.push(make(rec.nextSeq));
    rec.nextSeq += 1;
  }, []);

  /** Queues a full snapshot for every question that differs from what was last queued. */
  const queueChanges = useCallback(
    (includeTime: boolean) => {
      const eng = engineRef.current;
      if (!eng) return;
      for (const item of eng.items) {
        const now = eng.answers[item.id];
        if (!now) continue;
        const sent = sentRef.current[item.id];
        if (includeTime ? !answerChanged(sent, now) : sameChoice(sent, now)) continue;
        sentRef.current[item.id] = now;
        enqueue((seq) => ({
          seq,
          kind: 'answer',
          testQuestionId: item.id,
          selected: now.selected,
          marked: now.marked,
          visited: now.visited,
          timeMs: Math.min(Math.round(now.timeMs), 86_400_000),
        }));
      }
      if (includeTime) sync.current.lastTime = monoNow();
    },
    [enqueue],
  );

  // ---------- Server state ----------

  const finished = useCallback(() => {
    if (phaseRef.current.kind === 'done') return;
    genRef.current += 1;
    clearTimeout(sync.current.timer);
    setPhase({ kind: 'done' });
    void removeAttempt(attemptId);
    void queryClient.invalidateQueries({ queryKey: MY_ATTEMPTS_KEY });
    // The screen opens the summary once it has re-rendered without its leave guard.
  }, [attemptId, queryClient, setPhase]);

  const applySections = useCallback(
    (list: AttemptSection[], speak: boolean) => {
      sectionsRef.current = list;
      setSections(list);
      const eng = engineRef.current;
      if (!eng) return;
      const open = openSectionIds(list, serverNow());
      if (sameSet(open, eng.openSections)) return;
      const opened = open.filter((id) => !eng.openSections.includes(id));
      const next = reduce(eng, { type: 'sections', open });
      engineRef.current = next;
      setEngine(next);
      if (speak) {
        const name = list.find((s) => s.id === opened[0])?.name;
        announce(name ? `${name} is now open` : 'This section has closed');
      }
    },
    [serverNow],
  );

  const applyServer = useCallback(
    (reply: Pick<SyncAttemptResponse, 'status' | 'expiresAt' | 'sections'>) => {
      if (reply.status !== 'in_progress') return finished();
      deadlineRef.current = Date.parse(reply.expiresAt);
      setDeadline(deadlineRef.current);
      applySections(reply.sections, true);
    },
    [applySections, finished],
  );

  /** After a gap or conflict: take the server's answers and re-send whatever differs here. */
  const reconcile = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return;
    const sentAt = monoNow();
    const state = await attemptsApi.get(attemptId, rec.token);
    offsetRef.current = serverOffset(Date.parse(state.serverNow), sentAt, monoNow());
    if (state.status !== 'in_progress') return finished();
    rec.ackSeq = state.ackSeq;
    rec.events = [];
    rec.nextSeq = state.ackSeq + 1;
    sentRef.current = Object.fromEntries(state.answers.map((a) => [a.testQuestionId, toAnswer(a)]));
    applyServer(state);
    queueChanges(true);
    await persist();
  }, [applyServer, attemptId, finished, persist, queueChanges]);

  const noteRejected = useCallback((rejected: SyncAttemptResponse['rejected']) => {
    if (rejected.some((r) => r.reason === 'time_up' || r.reason === 'attempt_closed'))
      setNotice('Time was up when some answers reached the server, so they were not counted.');
    else if (rejected.some((r) => r.reason === 'section_closed'))
      setNotice('An answer reached the server after its section had closed, so it was not counted.');
  }, []);

  const acknowledge = useCallback((ackSeq: number) => {
    const rec = recRef.current;
    if (!rec) return;
    rec.ackSeq = Math.max(rec.ackSeq, ackSeq);
    rec.events = rec.events.filter((e) => e.seq > rec.ackSeq);
    setPending(rec.events.length);
  }, []);

  // ---------- Sync loop ----------

  const schedule = useCallback((delayMs: number, run: () => void) => {
    const s = sync.current;
    const due = monoNow() + delayMs;
    if (s.dueAt && s.dueAt <= due && s.dueAt > monoNow()) return;
    clearTimeout(s.timer);
    s.dueAt = due;
    s.timer = setTimeout(() => {
      s.dueAt = 0;
      run();
    }, delayMs);
  }, []);

  const flush = useCallback(
    async (force = false): Promise<void> => {
      const s = sync.current;
      const rec = recRef.current;
      const gen = genRef.current;
      if (!rec || phaseRef.current.kind !== 'running') return;
      if (s.busy) {
        s.again = true;
        return;
      }
      if (monoNow() - s.lastTime >= HEARTBEAT_MS) {
        queueChanges(true);
        void persist();
      }
      if (!rec.events.length && !force) {
        schedule(HEARTBEAT_MS, () => void flush(true));
        return;
      }
      s.busy = true;
      if (rec.events.length) setNet((n) => (n === 'offline' ? n : 'saving'));
      const batch = rec.events.slice(0, MAX_BATCH);
      const sentAt = monoNow();
      let delay = rec.events.length > MAX_BATCH ? 0 : DIRTY_EVERY_MS + jitter();
      try {
        const reply = await attemptsApi.sync(attemptId, rec.token, {
          epoch: rec.epoch,
          lastAckSeq: rec.ackSeq,
          events: batch,
          currentTestQuestionId: engineRef.current?.items[engineRef.current.current]?.id ?? null,
        });
        if (!live(gen)) return;
        offsetRef.current = serverOffset(Date.parse(reply.serverNow), sentAt, monoNow());
        acknowledge(reply.ackSeq);
        s.failures = 0;
        noteRejected(reply.rejected);
        applyServer(reply);
        setNet(rec.events.length ? 'saving' : 'synced');
        void persist();
      } catch (error) {
        if (!live(gen)) return;
        const code = codeOf(error);
        if (code === 'SESSION_REPLACED') {
          setPhase({ kind: 'takeover', unsynced: rec.events.length });
          return;
        }
        if (code === 'ATTEMPT_CLOSED') return finished();
        if (code === 'SYNC_GAP' || code === 'SYNC_CONFLICT') {
          try {
            await reconcile();
            delay = 0;
          } catch {
            s.failures += 1;
          }
        } else if (retryable(error)) {
          s.failures += 1;
          setNet('offline');
          delay = Math.min(MAX_BACKOFF_MS, DIRTY_EVERY_MS * 2 ** s.failures) + jitter();
        } else {
          setPhase({ kind: 'error', error });
          return;
        }
      } finally {
        s.busy = false;
      }
      if (!live(gen) || phaseRef.current.kind !== 'running') return;
      if (s.again) {
        s.again = false;
        delay = 0;
      }
      schedule(recRef.current?.events.length ? delay : HEARTBEAT_MS, () => void flush(true));
    },
    [acknowledge, applyServer, attemptId, finished, live, noteRejected, persist, queueChanges, reconcile, schedule, setPhase],
  );

  // ---------- Loading ----------

  const begin = useCallback(
    (state: ServerState, stored: LocalAttempt, paper: PaperQuestion[], sentAt: number, receivedAt: number) => {
      const list = [...paper].sort((a, b) => a.number - b.number);
      const items = list.map((q) => ({ id: q.testQuestionId, sectionId: q.sectionId }));
      const server = Object.fromEntries(state.answers.map((a) => [a.testQuestionId, toAnswer(a)]));

      let rec = stored.epoch === state.epoch ? stored : newLocalAttempt(attemptId, stored.token, state.epoch, state.ackSeq);
      const pendingEvents = rec.events.filter((e) => e.seq > state.ackSeq);
      const contiguous = pendingEvents.every((e, i) => e.seq === state.ackSeq + 1 + i);
      const answers: Record<string, AnswerState> = { ...server };
      for (const [id, local] of Object.entries(rec.answers)) {
        const remote = server[id];
        if (!remote) continue;
        // Unsent changes here are newer than the server's copy; otherwise keep the longer time.
        answers[id] = pendingEvents.length ? local : { ...remote, timeMs: Math.max(remote.timeMs, local.timeMs) };
      }
      rec = {
        ...rec,
        ackSeq: state.ackSeq,
        events: contiguous ? pendingEvents : [],
        nextSeq: state.ackSeq + (contiguous ? pendingEvents.length : 0) + 1,
      };

      sentRef.current = { ...server };
      for (const e of rec.events)
        if (e.kind === 'answer') sentRef.current[e.testQuestionId] = { selected: e.selected, marked: e.marked, visited: e.visited, timeMs: e.timeMs };

      offsetRef.current = serverOffset(Date.parse(state.serverNow), sentAt, receivedAt);
      deadlineRef.current = Date.parse(state.expiresAt);
      sectionsRef.current = state.sections;
      const eng = initialState(items, answers, openSectionIds(state.sections, serverNow()), rec.current ?? state.currentTestQuestionId);

      recRef.current = rec;
      engineRef.current = eng;
      sync.current.lastTime = monoNow();
      queueChanges(false);
      void persist();

      setMeta({
        testId: state.testId,
        testTitle: state.testTitle,
        examName: state.examName,
        hasHindi: state.hasHindi,
        sectional: state.sectional,
        watermark: state.watermark,
      });
      setQuestions(list);
      setSections(state.sections);
      setDeadline(deadlineRef.current);
      setClock(serverNow());
      setEngine(eng);
      setNet(rec.events.length ? 'saving' : 'synced');
      setPhase({ kind: 'running' });
      void flush(true);
    },
    [attemptId, flush, persist, queueChanges, serverNow, setPhase],
  );

  const boot = useCallback(async () => {
    const gen = ++genRef.current;
    setPhase({ kind: 'loading' });
    try {
      const stored = await loadAttempt(attemptId);
      const sentAt = monoNow();
      let state: ServerState;
      try {
        state = await attemptsApi.get(attemptId, stored?.token ?? null);
      } catch (error) {
        if (!live(gen)) return;
        if (codeOf(error) === 'SESSION_REPLACED') return setPhase({ kind: 'takeover', unsynced: stored?.events.length ?? 0 });
        throw error;
      }
      const receivedAt = monoNow();
      if (!live(gen)) return;
      if (state.status !== 'in_progress') return finished();
      if (!stored) return setPhase({ kind: 'takeover', unsynced: 0 });
      const paper = await attemptsApi.paper(attemptId);
      if (!live(gen)) return;
      begin(state, stored, paper.questions, sentAt, receivedAt);
    } catch (error) {
      if (live(gen)) setPhase({ kind: 'error', error });
    }
  }, [attemptId, begin, finished, live, setPhase]);

  /** Moves the session to this device; unsent changes on the other device are discarded. */
  const takeover = useCallback(async () => {
    const gen = ++genRef.current;
    setPhase({ kind: 'loading' });
    try {
      const sentAt = monoNow();
      const { state, sessionToken } = await attemptsApi.takeover(attemptId);
      const receivedAt = monoNow();
      const fresh = newLocalAttempt(attemptId, sessionToken, state.epoch, state.ackSeq);
      await saveAttempt(fresh).catch(() => setStorageFailed(true));
      if (state.status !== 'in_progress') return finished();
      const paper = await attemptsApi.paper(attemptId);
      if (!live(gen)) return;
      begin(state, fresh, paper.questions, sentAt, receivedAt);
    } catch (error) {
      if (!live(gen)) return;
      if (codeOf(error) === 'ATTEMPT_CLOSED') return finished();
      setPhase({ kind: 'error', error });
    }
  }, [attemptId, begin, finished, live, setPhase]);

  // ---------- Actions ----------

  const dispatch = useCallback(
    (action: AttemptAction) => {
      const eng = engineRef.current;
      if (!eng || phaseRef.current.kind !== 'running') return;
      const next = reduce(eng, action);
      if (next === eng) return;
      engineRef.current = next;
      setEngine(next);
      if (action.type === 'tick') return;
      const moved = action.type === 'go' || action.type === 'save_next' || action.type === 'mark_next';
      queueChanges(moved);
      void persist();
      schedule(DIRTY_EVERY_MS + jitter(), () => void flush(true));
    },
    [flush, persist, queueChanges, schedule],
  );

  /** Finishes the open section early; it locks and the next one opens on the server. */
  const finishSection = useCallback(
    (sectionId: string) => {
      if (phaseRef.current.kind !== 'running') return;
      queueChanges(true);
      enqueue((seq) => ({ seq, kind: 'next_section', fromSectionId: sectionId }));
      const closedAt = new Date(serverNow()).toISOString();
      applySections(
        sectionsRef.current.map((s) => (s.id === sectionId ? { ...s, closedAt, state: 'closed' as const } : s)),
        false,
      );
      void persist();
      void flush(true);
    },
    [applySections, enqueue, flush, persist, queueChanges, serverNow],
  );

  const submit = useCallback(async () => {
    if (phaseRef.current.kind !== 'running') return;
    const gen = genRef.current;
    clearTimeout(sync.current.timer);
    sync.current.dueAt = 0;
    queueChanges(true);
    const rec = recRef.current;
    if (!rec) return;
    rec.submitPending = true;
    setPhase({ kind: 'submitting', waiting: false });
    await persist();
    for (let failures = 0; ; ) {
      if (!live(gen)) return;
      const current = recRef.current!;
      const body = { epoch: current.epoch, lastAckSeq: current.ackSeq, events: current.events.slice(0, MAX_BATCH) };
      try {
        if (current.events.length > MAX_BATCH) {
          // Too many changes for one request: send them first, then submit.
          const reply = await attemptsApi.sync(attemptId, current.token, body);
          acknowledge(reply.ackSeq);
          await persist();
          continue;
        }
        await attemptsApi.submit(attemptId, current.token, body);
        track('attempt_submitted');
        return finished();
      } catch (error) {
        if (!live(gen)) return;
        const code = codeOf(error);
        if (code === 'SESSION_REPLACED') return setPhase({ kind: 'takeover', unsynced: current.events.length });
        if (code === 'ATTEMPT_CLOSED') return finished();
        if (code === 'SYNC_GAP' || code === 'SYNC_CONFLICT') {
          await reconcile().catch(() => undefined);
          continue;
        }
        if (!retryable(error)) return setPhase({ kind: 'error', error });
        // Offline: the submission stays pending; the server closes the attempt at the deadline anyway.
        failures += 1;
        setPhase({ kind: 'submitting', waiting: true });
        await new Promise<void>((resolve) => {
          const timer = setTimeout(done, Math.min(MAX_BACKOFF_MS, 3_000 * 2 ** failures) + jitter());
          const unsubscribe = NetInfo.addEventListener((s) => {
            if (s.isConnected) done();
          });
          function done() {
            clearTimeout(timer);
            unsubscribe();
            resolve();
          }
        });
      }
    }
  }, [acknowledge, attemptId, finished, live, persist, queueChanges, reconcile, setPhase]);

  const retryStorage = useCallback(() => void persist(), [persist]);

  // ---------- Clock ----------

  useEffect(() => {
    if (phase.kind !== 'running') return;
    let last = monoNow();
    let previousLeft = deadlineRef.current - serverNow();
    const id = setInterval(() => {
      const now = monoNow();
      const elapsed = now - last;
      last = now;
      if (AppState.currentState === 'active') dispatch({ type: 'tick', ms: elapsed });
      const t = serverNow();
      setClock(t);
      const left = deadlineRef.current - t;
      const warn = crossedWarning(previousLeft, left);
      if (warn) announce(`${warn} minute${warn === 1 ? '' : 's'} left`);
      previousLeft = left;
      if (left <= 0) {
        announce('Time is up. Submitting your test.');
        void submit();
        return;
      }
      // A section window ended on the clock: lock it now and ask the server what opens next.
      const eng = engineRef.current;
      if (eng && !sameSet(openSectionIds(sectionsRef.current, t), eng.openSections)) {
        applySections(sectionsRef.current, true);
        void flush(true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase.kind, applySections, dispatch, flush, serverNow, submit]);

  // Back online: send at once. App sent to the background: note it and send what we can.
  useEffect(() => {
    if (phase.kind !== 'running') return;
    let wasConnected = true;
    const unsubscribe = NetInfo.addEventListener((s) => {
      const connected = !!s.isConnected;
      if (connected && !wasConnected) {
        sync.current.failures = 0;
        void flush(true);
      }
      wasConnected = connected;
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        enqueue((seq) => ({ seq, kind: 'focus_lost' }));
        queueChanges(true);
        void persist();
        void flush(true);
      } else if (state === 'active') {
        // Re-anchor time and pick up section changes made while away.
        void flush(true);
      }
    });
    return () => {
      unsubscribe();
      sub.remove();
    };
  }, [phase.kind, enqueue, flush, persist, queueChanges]);

  useEffect(
    () => () => {
      genRef.current += 1;
      clearTimeout(sync.current.timer);
    },
    [],
  );

  return {
    phase,
    engine,
    questions,
    sections,
    meta,
    net,
    pending,
    storageFailed,
    notice,
    dismissNotice: () => setNotice(null),
    clock,
    deadline,
    boot,
    takeover,
    dispatch,
    finishSection,
    submit,
    retryStorage,
  };
}

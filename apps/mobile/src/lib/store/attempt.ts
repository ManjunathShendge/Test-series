import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildPaper, getTest, scoreDemoAttempt, type AnswerState, type AttemptStatus, type Language, type PaletteState, type Paper, type Result, type TestSummary } from '@/lib/demo';
import { persistOptions } from './storage';

/**
 * In-progress attempt state. Mirrors the pure engine contract in
 * docs/TEST_ENGINE.md: events (visit, select, clear, mark, section change,
 * language, zoom, submit) mutate a materialised state; palette states are
 * derived, never stored; marking never erases a selection.
 *
 * Persistence: every mutation is written to device storage, and absolute
 * timestamps (startedAt, deadlineAt, section windows) mean a restart resumes at
 * the same question with the same time left (PRD 6.4 autosave and resume).
 *
 * Demo limits, stated plainly: time is anchored to the device clock at start
 * (the real client anchors to server time and re-anchors after restart), the
 * store is JSON in AsyncStorage (the real client commits an event log to SQLite
 * before acknowledging a save), and scoring runs locally (the server is the
 * only authority).
 */

export type ZoomLevel = 1 | 1.15 | 1.3;
export type SyncState = 'saved' | 'syncing' | 'synced';

export interface SectionWindow {
  sectionId: string;
  startsAt: number;
  endsAt: number;
}

interface AttemptState {
  status: AttemptStatus | 'idle';
  attemptId: string;
  test: TestSummary | null;
  paper: Paper | null;
  startedAt: number;
  deadlineAt: number;
  /** Present only for tests with sectional timing; sections then open in order. */
  sectionWindows: SectionWindow[] | null;
  currentIndex: number;
  answers: Record<string, AnswerState>;
  language: Language;
  zoom: ZoomLevel;
  lastVisitAt: number;
  sync: SyncState;
  eventCount: number;
  result: Result | null;

  start: (testId: string, language: Language) => boolean;
  visit: (index: number) => void;
  select: (optionId: string) => void;
  clear: () => void;
  toggleMark: () => void;
  saveAndNext: () => void;
  setLanguage: (language: Language) => void;
  setZoom: (zoom: ZoomLevel) => void;
  submit: (reason: 'manual' | 'deadline') => Result | null;
  markSynced: () => void;
  /**
   * Called once after rehydration. Resets the per-question clock so time away
   * from the app is not charged to the current question, and reports whether an
   * in-progress attempt has outlived its deadline (the caller then submits it).
   */
  resume: () => 'none' | 'resumed' | 'expired';
  reset: () => void;
}

const sectionOf = (paper: Paper, index: number) => paper.questions[index]?.sectionId;

function touchTime(state: AttemptState, now: number): Record<string, AnswerState> {
  const q = state.paper?.questions[state.currentIndex];
  if (!q) return state.answers;
  const prev = state.answers[q.id] ?? { marked: false, visited: true, timeSpentMs: 0 };
  return { ...state.answers, [q.id]: { ...prev, visited: true, timeSpentMs: prev.timeSpentMs + Math.max(0, now - state.lastVisitAt) } };
}

export const useAttemptStore = create<AttemptState>()(
  persist(
    (set, get) => ({
  status: 'idle',
  attemptId: '',
  test: null,
  paper: null,
  startedAt: 0,
  deadlineAt: 0,
  sectionWindows: null,
  currentIndex: 0,
  answers: {},
  language: 'en',
  zoom: 1,
  lastVisitAt: 0,
  sync: 'synced',
  eventCount: 0,
  result: null,

  start: (testId, language) => {
    const test = getTest(testId);
    if (!test) return false;
    const paper = buildPaper(test);
    const now = Date.now();
    const sectional = test.sections.every((s) => s.durationMinutes !== undefined);
    let cursor = now;
    const windows: SectionWindow[] | null = sectional
      ? test.sections.map((s) => {
          const startsAt = cursor;
          cursor += (s.durationMinutes ?? 0) * 60_000;
          return { sectionId: s.id, startsAt, endsAt: cursor };
        })
      : null;
    const deadlineAt = sectional ? cursor : now + test.durationMinutes * 60_000;
    const first = paper.questions[0];
    set({
      status: 'in_progress',
      attemptId: `att-${now.toString(36)}`,
      test,
      paper,
      startedAt: now,
      deadlineAt,
      sectionWindows: windows,
      currentIndex: 0,
      answers: first ? { [first.id]: { marked: false, visited: true, timeSpentMs: 0 } } : {},
      language,
      zoom: 1,
      lastVisitAt: now,
      sync: 'synced',
      eventCount: 0,
      result: null,
    });
    return true;
  },

  visit: (index) => {
    const s = get();
    if (s.status !== 'in_progress' || !s.paper) return;
    const target = s.paper.questions[index];
    if (!target) return;
    if (s.sectionWindows && !isSectionOpen(s.sectionWindows, target.sectionId, Date.now())) return;
    const now = Date.now();
    const answers = touchTime(s, now);
    const prev = answers[target.id] ?? { marked: false, visited: false, timeSpentMs: 0 };
    set({ currentIndex: index, lastVisitAt: now, answers: { ...answers, [target.id]: { ...prev, visited: true } }, eventCount: s.eventCount + 1 });
  },

  select: (optionId) => {
    const s = get();
    const q = s.paper?.questions[s.currentIndex];
    if (s.status !== 'in_progress' || !q) return;
    const prev = s.answers[q.id] ?? { marked: false, visited: true, timeSpentMs: 0 };
    set({ answers: { ...s.answers, [q.id]: { ...prev, selectedOptionId: optionId, visited: true } }, sync: 'saved', eventCount: s.eventCount + 1 });
  },

  clear: () => {
    const s = get();
    const q = s.paper?.questions[s.currentIndex];
    if (s.status !== 'in_progress' || !q) return;
    const prev = s.answers[q.id];
    if (!prev?.selectedOptionId) return;
    const { selectedOptionId: _dropped, ...rest } = prev;
    set({ answers: { ...s.answers, [q.id]: rest }, sync: 'saved', eventCount: s.eventCount + 1 });
  },

  toggleMark: () => {
    const s = get();
    const q = s.paper?.questions[s.currentIndex];
    if (s.status !== 'in_progress' || !q) return;
    const prev = s.answers[q.id] ?? { marked: false, visited: true, timeSpentMs: 0 };
    set({ answers: { ...s.answers, [q.id]: { ...prev, marked: !prev.marked } }, sync: 'saved', eventCount: s.eventCount + 1 });
  },

  saveAndNext: () => {
    const s = get();
    if (!s.paper) return;
    const next = Math.min(s.paper.questions.length - 1, s.currentIndex + 1);
    const current = sectionOf(s.paper, s.currentIndex);
    const nextSection = sectionOf(s.paper, next);
    // Sectionally timed papers do not advance into a locked section.
    if (s.sectionWindows && nextSection !== current && !isSectionOpen(s.sectionWindows, nextSection ?? '', Date.now())) return;
    get().visit(next);
  },

  setLanguage: (language) => set({ language }),
  setZoom: (zoom) => set({ zoom }),

  submit: (reason) => {
    const s = get();
    if (s.status !== 'in_progress' || !s.test || !s.paper) return s.result;
    const now = Date.now();
    const answers = touchTime(s, now);
    const status: AttemptStatus = reason === 'deadline' ? 'auto_submitted' : 'submitted';
    const result = scoreDemoAttempt(s.test, s.paper, answers, status, s.attemptId);
    set({ status, answers, result, sync: 'synced', lastVisitAt: now });
    return result;
  },

  markSynced: () => set((s) => (s.sync === 'saved' ? { sync: 'synced' } : s)),

  resume: () => {
    const s = get();
    if (s.status !== 'in_progress') return 'none';
    const now = Date.now();
    if (now >= s.deadlineAt) return 'expired';
    set({ lastVisitAt: now, sync: 'synced' });
    return 'resumed';
  },

  reset: () => set({ status: 'idle', test: null, paper: null, answers: {}, result: null, sectionWindows: null, currentIndex: 0, eventCount: 0 }),
    }),
    persistOptions<AttemptState, PersistedAttempt>('attempt', (s) => ({
      status: s.status,
      attemptId: s.attemptId,
      test: s.test,
      paper: s.paper,
      startedAt: s.startedAt,
      deadlineAt: s.deadlineAt,
      sectionWindows: s.sectionWindows,
      currentIndex: s.currentIndex,
      answers: s.answers,
      language: s.language,
      zoom: s.zoom,
      lastVisitAt: s.lastVisitAt,
      eventCount: s.eventCount,
      result: s.result,
    })),
  ),
);

type PersistedAttempt = Pick<
  AttemptState,
  'status' | 'attemptId' | 'test' | 'paper' | 'startedAt' | 'deadlineAt' | 'sectionWindows' | 'currentIndex' | 'answers' | 'language' | 'zoom' | 'lastVisitAt' | 'eventCount' | 'result'
>;

export function isSectionOpen(windows: SectionWindow[], sectionId: string, now: number): boolean {
  const w = windows.find((x) => x.sectionId === sectionId);
  return !!w && now >= w.startsAt && now < w.endsAt;
}

export function paletteState(a: AnswerState | undefined): PaletteState {
  if (!a || !a.visited) return 'unvisited';
  if (a.marked) return a.selectedOptionId ? 'markedAnswered' : 'marked';
  return a.selectedOptionId ? 'answered' : 'visited';
}

export function paletteCounts(paper: Paper, answers: Record<string, AnswerState>): Record<PaletteState, number> {
  const counts: Record<PaletteState, number> = { unvisited: 0, visited: 0, answered: 0, marked: 0, markedAnswered: 0 };
  for (const q of paper.questions) counts[paletteState(answers[q.id])] += 1;
  return counts;
}

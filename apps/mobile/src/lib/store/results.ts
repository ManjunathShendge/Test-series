import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { pastResults, synthesizeReview, type Result } from '@/lib/demo';
import { persistOptions } from './storage';

/**
 * Results available to the student, keyed by attempt. Seeded from archived demo
 * results; the attempt flow inserts new ones after a terminal submission. The
 * server is the only authority for scores in the real product (docs/RESULTS.md).
 */
interface ResultsState {
  results: Record<string, Result>;
  addResult: (result: Result) => void;
  toggleBookmark: (attemptId: string, questionId: string) => void;
  reset: () => void;
}

/**
 * Seeded history. The newest archived attempt starts with two wrong answers
 * bookmarked so the Bookmarks practice list is not empty on first launch.
 */
function seedResults(): Record<string, Result> {
  const newest = [...pastResults].sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0]?.attemptId;
  return Object.fromEntries(
    pastResults.map((r) => {
      const review = r.review.length ? r.review : synthesizeReview(r);
      if (r.attemptId !== newest) return [r.attemptId, { ...r, review }];
      const wrongIds = review.filter((q) => q.selectedOptionId !== undefined && !q.isCorrect).slice(0, 2).map((q) => q.questionId);
      return [r.attemptId, { ...r, review: review.map((q) => (wrongIds.includes(q.questionId) ? { ...q, bookmarked: true } : q)) }];
    }),
  );
}

export const useResultsStore = create<ResultsState>()(
  persist(
    (set) => ({
  results: seedResults(),
  reset: () => set({ results: seedResults() }),
  addResult: (result) => set((s) => ({ results: { ...s.results, [result.attemptId]: result } })),
  toggleBookmark: (attemptId, questionId) =>
    set((s) => {
      const r = s.results[attemptId];
      if (!r) return s;
      return {
        results: {
          ...s.results,
          [attemptId]: {
            ...r,
            review: r.review.map((q) => (q.questionId === questionId ? { ...q, bookmarked: !q.bookmarked } : q)),
          },
        },
      };
    }),
    }),
    persistOptions<ResultsState, Pick<ResultsState, 'results'>>('results', (s) => ({ results: s.results })),
  ),
);

/** Newest first. */
export function useResultsList(): Result[] {
  // Select the stable record, derive the sorted list outside the selector so the
  // snapshot identity only changes when the store does.
  const results = useResultsStore((s) => s.results);
  return useMemo(() => Object.values(results).sort((a, b) => b.completedAt.localeCompare(a.completedAt)), [results]);
}

export type PracticeList = 'mistakes' | 'bookmarks';

export interface PracticeEntry {
  attemptId: string;
  testId: string;
  completedAt: string;
  review: Result['review'][number];
}

/** Questions across every attempt for a practice list (PRD 6.6), newest attempt first. */
export function practiceEntries(results: Result[], list: PracticeList): PracticeEntry[] {
  return results.flatMap((r) =>
    r.review
      .filter((q) => (list === 'bookmarks' ? q.bookmarked : q.selectedOptionId !== undefined && !q.isCorrect))
      .map((q) => ({ attemptId: r.attemptId, testId: r.testId, completedAt: r.completedAt, review: q })),
  );
}

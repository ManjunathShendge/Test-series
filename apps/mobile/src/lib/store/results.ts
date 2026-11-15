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
}

const seeded: Record<string, Result> = Object.fromEntries(
  pastResults.map((r) => [r.attemptId, { ...r, review: r.review.length ? r.review : synthesizeReview(r) }]),
);

export const useResultsStore = create<ResultsState>()(
  persist(
    (set) => ({
  results: seeded,
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

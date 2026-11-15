import { useQuery } from '@tanstack/react-query';
import {
  examiners,
  featuredFreeTests,
  getExam,
  getExaminer,
  getSeries,
  getTest,
  newFromFollowed,
  recommendedTests,
  searchTests,
  type SearchFilters,
} from '@/lib/demo';

/**
 * Query hooks for catalogue reads. Each one is the seam where the demo
 * repository is replaced by an API call to packages/contracts endpoints; the
 * screens do not change. The simulated latency makes the loading states real
 * in the demo and is removed with the swap.
 */
const DEMO_LATENCY_MS = 450;

function demo<T>(value: () => T): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(value());
      } catch (e) {
        reject(e);
      }
    }, DEMO_LATENCY_MS),
  );
}

export const queryKeys = {
  homeFeed: (examIds: string[], attempted: string[], followed: string[]) => ['home', { examIds, attempted, followed }] as const,
  search: (filters: SearchFilters) => ['search', filters] as const,
  test: (id: string) => ['test', id] as const,
};

export function useHomeFeed(examIds: string[], attempted: string[], followed: string[]) {
  return useQuery({
    queryKey: queryKeys.homeFeed(examIds, attempted, followed),
    queryFn: () =>
      demo(() => ({
        recommended: recommendedTests(examIds, new Set(attempted)),
        fromFollowed: newFromFollowed(new Set(followed)),
        featured: featuredFreeTests(),
        suggestedExaminers: examiners.filter((e) => !followed.includes(e.id)).slice(0, 2),
      })),
    // Follow and attempt changes reshuffle the feed; keep the old one on screen meanwhile.
    placeholderData: (prev) => prev,
  });
}

export function useSearch(filters: SearchFilters) {
  return useQuery({
    queryKey: queryKeys.search(filters),
    queryFn: () => demo(() => searchTests(filters)),
    placeholderData: (prev) => prev,
  });
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

export function useTestDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.test(id),
    queryFn: () =>
      demo(() => {
        const test = getTest(id);
        if (!test) throw new NotFoundError('Test');
        return {
          test,
          exam: getExam(test.examId),
          examiner: getExaminer(test.examinerId),
          series: test.seriesId ? getSeries(test.seriesId) : undefined,
        };
      }),
    retry: (count, error) => !(error instanceof NotFoundError) && count < 2,
  });
}

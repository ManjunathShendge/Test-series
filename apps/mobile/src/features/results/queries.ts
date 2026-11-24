import { useQuery } from '@tanstack/react-query';
import type { PracticeKind } from '@exam-prep/contracts';
import { attemptsApi } from '@/lib/api/attempts';
import { useAppStore } from '@/lib/store/app';

/** Server-side results (docs/RESULTS.md); nothing is scored or stored on the phone. */
export const resultKeys = {
  progress: ['me', 'progress'] as const,
  practice: (kind: PracticeKind) => ['me', 'practice', kind] as const,
  review: (attemptId: string) => ['attempt', attemptId, 'review'] as const,
};

export function useProgress() {
  const signedIn = useAppStore((s) => s.session.signedIn);
  return useQuery({ queryKey: resultKeys.progress, queryFn: attemptsApi.progress, enabled: signedIn, staleTime: 30_000 });
}

export function usePractice(kind: PracticeKind) {
  const signedIn = useAppStore((s) => s.session.signedIn);
  return useQuery({ queryKey: resultKeys.practice(kind), queryFn: () => attemptsApi.practice(kind), enabled: signedIn, staleTime: 30_000 });
}

export function useReview(attemptId: string) {
  return useQuery({ queryKey: resultKeys.review(attemptId), queryFn: () => attemptsApi.review(attemptId), staleTime: 60_000 });
}

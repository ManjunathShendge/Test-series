import { useQuery } from '@tanstack/react-query';
import type { MyAttempt } from '@exam-prep/contracts';
import { attemptsApi } from '@/lib/api/attempts';
import { useAppStore } from '@/lib/store/app';
import { MY_ATTEMPTS_KEY } from './useAttempt';

/** The student's attempts from the server (signed in only). */
export function useMyAttempts() {
  const signedIn = useAppStore((s) => s.session.signedIn);
  return useQuery({ queryKey: MY_ATTEMPTS_KEY, queryFn: attemptsApi.mine, enabled: signedIn, staleTime: 15_000 });
}

/** The attempt whose clock is running, if any (one at a time, enforced by the server). */
export function useRunningAttempt(): MyAttempt | null {
  const { data } = useMyAttempts();
  return data?.find((a) => a.status === 'in_progress' && Date.parse(a.expiresAt) > Date.now()) ?? null;
}

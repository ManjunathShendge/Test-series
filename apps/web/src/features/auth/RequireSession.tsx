'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import type { Profile } from '@exam-prep/contracts';
import { useAuth } from './AuthProvider';
import { Waiting } from './ui';

/**
 * Shows its content only to a signed-in, verified student on a registered device; anyone else
 * goes to /sign-in and comes back afterwards. First-time students finish onboarding first.
 * This is navigation, not security: the API authorizes every request on its own.
 */
export function RequireSession({
  children,
  allowIncompleteOnboarding = false,
}: {
  children: (profile: Profile) => ReactNode;
  allowIncompleteOnboarding?: boolean;
}) {
  const { state } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const here = `${pathname}${query ? `?${query}` : ''}`;

  const mustSignIn = state.status !== 'loading' && state.status !== 'ready';
  const mustOnboard = state.status === 'ready' && !state.profile.onboarded && !allowIncompleteOnboarding;

  useEffect(() => {
    if (mustSignIn) router.replace(`/sign-in?next=${encodeURIComponent(here)}`);
    else if (mustOnboard) router.replace(`/onboarding?next=${encodeURIComponent(here)}`);
  }, [mustSignIn, mustOnboard, here, router]);

  if (state.status !== 'ready' || mustOnboard) {
    return <Waiting label={state.status === 'loading' ? 'Checking your sign-in…' : 'Taking you to log in…'} />;
  }
  return <>{children(state.profile)}</>;
}

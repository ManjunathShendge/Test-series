'use client';

import type { Profile } from '@exam-prep/contracts';
import { ErrorScreen } from '@/ui/errors/ErrorScreen';
import { useAuth } from './AuthProvider';

/**
 * Full-page "no access" for a staff area: no console, menu or staff navigation is shown to
 * someone who cannot use it. Offers the website, going back, or switching account.
 */
export function StaffDenied({ profile, area, children }: { profile: Profile; area: string; children?: React.ReactNode }) {
  const { signOut } = useAuth();
  return (
    <main id="main">
      <ErrorScreen
        kind="forbidden"
        variant="page"
        title={`The ${area} is for MakeMePrepare staff`}
        home={{ href: '/', label: 'Go to the website' }}
        action={
          <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
            Sign in with another account
          </button>
        }
      >
        <p>
          {children ?? (
            <>
              You’re signed in as {profile.email ?? 'a student'}, and this account doesn’t have access. If it should, ask a
              super admin to grant it.
            </>
          )}
        </p>
      </ErrorScreen>
    </main>
  );
}

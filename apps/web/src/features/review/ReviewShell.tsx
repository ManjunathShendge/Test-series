'use client';

import { Suspense, type ReactNode } from 'react';
import { isReviewer } from '@/lib/auth/access';
import { RequireSession } from '@/features/auth/RequireSession';
import { StaffDenied } from '@/features/auth/StaffDenied';
import { Waiting } from '@/features/auth/ui';
import { ConsoleFrame, type ConsoleMenuGroup } from '@/ui/console/ConsoleFrame';

const MENU: ConsoleMenuGroup[] = [
  {
    group: 'Review',
    items: [
      { href: '/review', label: 'Review queue', icon: 'shield', lead: 'Tests assigned to you, fast lane and flags first' },
      { href: '/review/reports', label: 'Student reports', icon: 'flag', lead: 'Reported questions to resolve' },
    ],
  },
];

/**
 * QC reviewer workspace (PRD 5.3). Open to QC reviewers and operations admins; anyone else gets a
 * full-page "no access" screen. The API checks the role and the assignment on every call.
 */
export function ReviewShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Waiting label="Checking your sign-in…" />}>
      <RequireSession allowIncompleteOnboarding>
        {(profile) =>
          isReviewer(profile) ? (
            <ConsoleFrame
              menu={MENU}
              home="/review"
              workspace="QC review"
              profile={profile}
              status={profile.roles.includes('qc_reviewer') ? 'QC reviewer' : 'Admin'}
              enabled
              lockedHint=""
            >
              {children}
            </ConsoleFrame>
          ) : (
            <StaffDenied profile={profile} area="QC review area">
              You’re signed in as {profile.email ?? 'a student'}, and this account isn’t a QC reviewer. An operations admin can
              add it under QC operations.
            </StaffDenied>
          )
        }
      </RequireSession>
    </Suspense>
  );
}

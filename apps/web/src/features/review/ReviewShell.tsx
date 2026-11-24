'use client';

import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { RequireSession } from '@/features/auth/RequireSession';
import { Waiting } from '@/features/auth/ui';
import { State } from '@/features/admin/ui';
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
 * QC reviewer workspace (PRD 5.3). Open to QC reviewers and admins; the API checks the role and
 * the assignment on every call, so this is navigation only.
 */
export function ReviewShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Waiting label="Checking your sign-in…" />}>
      <RequireSession allowIncompleteOnboarding>
        {(profile) => {
          const allowed = profile.roles.includes('qc_reviewer') || profile.roles.includes('admin');
          return (
            <ConsoleFrame
              menu={MENU}
              home="/review"
              workspace="QC review"
              profile={profile}
              status={profile.roles.includes('qc_reviewer') ? 'QC reviewer' : allowed ? 'Admin' : 'No review access'}
              enabled={allowed}
              lockedHint="Needs the QC reviewer role"
            >
              {allowed ? (
                children
              ) : (
                <State
                  kind="forbidden"
                  title="This area is for QC reviewers"
                  action={
                    <Link className="btn btn-secondary" href="/">
                      Go to the website
                    </Link>
                  }
                >
                  Your account is not a QC reviewer. An admin can add {profile.email ?? 'your account'} under QC operations.
                </State>
              )}
            </ConsoleFrame>
          );
        }}
      </RequireSession>
    </Suspense>
  );
}

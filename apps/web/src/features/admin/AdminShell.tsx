'use client';

import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { RequireSession } from '@/features/auth/RequireSession';
import { Waiting } from '@/features/auth/ui';
import { ConsoleFrame, type ConsoleMenuGroup } from '@/ui/console/ConsoleFrame';
import { State } from './ui';

/** PRD 8 admin console modules, in PRD order, grouped for scanning. */
const MENU: ConsoleMenuGroup[] = [
  {
    group: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', icon: 'dashboard', lead: 'Platform at a glance' }],
  },
  {
    group: 'Content',
    items: [
      { href: '/admin/exams', label: 'Exams and templates', icon: 'grid', lead: 'Categories, exams, stages, syllabus and templates' },
      { href: '/admin/examiners', label: 'Examiners', icon: 'users', lead: 'Applications, samples, KYC, tier and status' },
      { href: '/admin/qc', label: 'QC operations', icon: 'shield', lead: 'Reviewers, queue by SLA and spot checks' },
      { href: '/admin/catalogue', label: 'Catalogue', icon: 'layers', lead: 'Feature or unpublish series and price bands' },
    ],
  },
  {
    group: 'Commerce',
    items: [
      { href: '/admin/students', label: 'Students', icon: 'user', lead: 'Search, purchases, attempts and access' },
      { href: '/admin/pricing', label: 'Pass and pricing', icon: 'tag', lead: 'Plans, prices and coupons' },
      { href: '/admin/payouts', label: 'Payouts', icon: 'wallet', lead: 'Monthly calculation, approval and bank export' },
    ],
  },
  {
    group: 'Insights and support',
    items: [
      { href: '/admin/reports', label: 'Reports', icon: 'chart', lead: 'Sales, revenue, attempts and QC turnaround' },
      { href: '/admin/support', label: 'Support', icon: 'help', lead: 'Question report queue' },
      { href: '/admin/cms', label: 'CMS', icon: 'image', lead: 'Website banners' },
    ],
  },
];

/**
 * Staff console frame. Shows the console only to signed-in accounts with the admin role; the
 * API still checks the role and the ops permission on every call, so this is navigation only.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    // RequireSession reads the query string, which needs a Suspense boundary when prerendered.
    <Suspense fallback={<Waiting label="Checking your sign-in…" />}>
      <RequireSession allowIncompleteOnboarding>
        {(profile) => {
          const isAdmin = profile.roles.includes('admin');
          return (
            <ConsoleFrame
              menu={MENU}
              home="/admin"
              workspace="Admin console"
              profile={profile}
              status={isAdmin ? 'Admin' : 'No admin access'}
              enabled={isAdmin}
              lockedHint="Needs the admin role"
            >
              {isAdmin ? (
                children
              ) : (
                <State
                  kind="forbidden"
                  title="This area is for MakeMePrepare staff"
                  action={
                    <Link className="btn btn-secondary" href="/">
                      Go to the website
                    </Link>
                  }
                >
                  Your account does not have admin access. If you should have it, ask a super admin to grant it to{' '}
                  {profile.email ?? 'your account'}.
                </State>
              )}
            </ConsoleFrame>
          );
        }}
      </RequireSession>
    </Suspense>
  );
}

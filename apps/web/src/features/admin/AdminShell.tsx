'use client';

import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import type { Profile } from '@exam-prep/contracts';
import { hasAdminPermission, isAdmin, type AdminPermission } from '@/lib/auth/access';
import { RequireSession } from '@/features/auth/RequireSession';
import { StaffDenied } from '@/features/auth/StaffDenied';
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
      { href: '/admin/catalogue', label: 'Catalogue', icon: 'layers', lead: 'Feature or unpublish tests and series' },
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
      { href: '/admin/cms', label: 'CMS', icon: 'image', lead: 'Website and app banners' },
      { href: '/admin/audit', label: 'Audit log', icon: 'clock', lead: 'Who changed what, with before and after' },
    ],
  },
];

/** Permission each section needs (the same one its API endpoints check); the dashboard needs any. */
function needFor(href: string): AdminPermission | null {
  if (href === '/admin') return null;
  return href === '/admin/payouts' || href.startsWith('/admin/payouts/') ? 'finance' : 'ops';
}

const allowed = (profile: Profile, href: string) => {
  const need = needFor(href);
  return need ? hasAdminPermission(profile, need) : isAdmin(profile);
};

/**
 * Admin console. Accounts without an admin permission get a full-page "no access" screen and never
 * see the console; admins see only the sections their permissions cover. The API checks the same
 * role and permission on every call.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    // RequireSession reads the query string, which needs a Suspense boundary when prerendered.
    <Suspense fallback={<Waiting label="Checking your sign-in…" />}>
      <RequireSession allowIncompleteOnboarding>
        {(profile) => (isAdmin(profile) ? <Console profile={profile}>{children}</Console> : <StaffDenied profile={profile} area="admin console" />)}
      </RequireSession>
    </Suspense>
  );
}

function Console({ profile, children }: { profile: Profile; children: ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const menu = MENU.map((group) => ({ ...group, items: group.items.filter((item) => allowed(profile, item.href)) })).filter(
    (group) => group.items.length,
  );
  const a = profile.adminAccess;
  const status = a?.super ? 'Super admin' : [a?.ops ? 'Operations' : null, a?.finance ? 'Finance' : null].filter(Boolean).join(' and ') + ' admin';
  return (
    <ConsoleFrame menu={menu} home="/admin" workspace="Admin console" profile={profile} status={status} enabled lockedHint="">
      {allowed(profile, pathname) ? (
        children
      ) : (
        <State kind="forbidden" title="Your admin account can’t open this section">
          {needFor(pathname) === 'finance'
            ? 'Payouts need the finance permission. A super admin can add it to your account.'
            : 'This section needs the operations permission. A super admin can add it to your account.'}
        </State>
      )}
    </ConsoleFrame>
  );
}

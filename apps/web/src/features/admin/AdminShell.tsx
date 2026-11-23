'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { RequireSession } from '@/features/auth/RequireSession';
import { Waiting } from '@/features/auth/ui';
import { State } from './ui';
import styles from './admin.module.css';

const NAV = [
  { href: '/admin/exams', label: 'Exams and templates' },
  { href: '/admin/examiners', label: 'Examiner applications' },
];

/**
 * Staff console frame. Shows the console only to signed-in accounts with the admin role; the
 * API still checks the role and the ops permission on every call, so this is navigation only.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/admin/exams" className={styles.brand}>
          <Image
            src="/brand/mark-inverse.png"
            alt=""
            width={32}
            height={28}
            style={{ objectFit: 'contain' }}
          />
          <b className={styles.brandName}>MakeMePrepare</b> <span>Admin</span>
        </Link>
        <nav aria-label="Admin" className={styles.nav}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname.startsWith(n.href) ? 'page' : undefined}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <RequireSessionName />
        <div className={styles.who}>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.replace('/sign-in?next=/admin/exams');
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {/* RequireSession reads the query string, which needs a Suspense boundary when prerendered. */}
        <Suspense fallback={<Waiting label="Checking your sign-in…" />}>
          <RequireSession allowIncompleteOnboarding>
            {(profile) =>
              profile.roles.includes('admin') ? (
                children
              ) : (
                <State
                  title="This area is for MakeMePrepare staff"
                  action={
                    <Link className="btn btn-secondary" href="/">
                      Go to the website
                    </Link>
                  }
                >
                  Your account does not have admin access. If you should have it, ask a super admin
                  to grant it to {profile.email ?? 'your account'}.
                </State>
              )
            }
          </RequireSession>
        </Suspense>
      </main>
    </div>
  );
}

function RequireSessionName() {
  const { state } = useAuth();
  if (state.status !== 'ready') return null;
  return (
    <span className={`${styles.who} ${styles.whoName}`} title={state.profile.email ?? undefined}>
      {state.profile.fullName}
    </span>
  );
}

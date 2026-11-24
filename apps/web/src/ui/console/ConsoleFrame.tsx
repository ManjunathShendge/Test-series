'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '@exam-prep/contracts';
import { useAuth } from '@/features/auth/AuthProvider';
import { Icon, type IconName } from '@/ui/icons/Icon';
import styles from './console.module.css';

export interface ConsoleMenuItem {
  href: string;
  label: string;
  icon: IconName;
  /** Shown under the page title in the top bar. */
  lead: string;
  /** Reachable before the account is cleared for the rest of the console. */
  open?: boolean;
}
export interface ConsoleMenuGroup {
  group: string;
  items: ConsoleMenuItem[];
}

/**
 * Staff console frame: gradient sidebar (drawer below 1024px), sticky top bar and content area.
 * Navigation only; the API authorizes every call.
 */
export function ConsoleFrame({
  menu,
  home,
  workspace,
  profile,
  status,
  enabled,
  lockedHint,
  children,
}: {
  menu: ConsoleMenuGroup[];
  /** Dashboard route; matched exactly, every other item also matches its sub-pages. */
  home: string;
  workspace: string;
  profile: Profile;
  status: string;
  /** When false only items marked `open` are links. */
  enabled: boolean;
  lockedHint: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const isCurrent = (href: string) =>
    href === home ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const items = menu.flatMap((group) => group.items);
  const page = items.find((item) => isCurrent(item.href)) ?? items[0]!;
  const initial = (profile.fullName.trim()[0] ?? profile.email?.[0] ?? 'M').toUpperCase();

  // The phone drawer closes on navigation and with Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={styles.shell}>
      {open ? <button type="button" className={styles.scrim} aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <aside className={styles.sidebar} data-open={open ? 'true' : undefined} aria-label={`${workspace} navigation`}>
        <div className={styles.sidebarHead}>
          <Link href={home} className={styles.brand}>
            <Image src="/brand/mark-inverse.png" alt="" width={34} height={30} style={{ objectFit: 'contain' }} />
            <span>
              <b>MakeMePrepare</b>
              <small>{workspace}</small>
            </span>
          </Link>
          <button type="button" className={styles.closeButton} aria-label="Close menu" onClick={() => setOpen(false)}>
            <Icon name="close" />
          </button>
        </div>
        <nav className={styles.nav} aria-label={workspace}>
          {menu.map((group) => (
            <div key={group.group}>
              <p className={styles.menuLabel}>{group.group}</p>
              <ul className={styles.menu}>
                {group.items.map((item) => (
                  <li key={item.href}>
                    {item.open || enabled ? (
                      <Link href={item.href} aria-current={isCurrent(item.href) ? 'page' : undefined}>
                        <Icon name={item.icon} />
                        {item.label}
                      </Link>
                    ) : (
                      <span aria-disabled="true" title={lockedHint}>
                        <Icon name={item.icon} />
                        {item.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className={styles.userCard}>
          <span className={styles.avatar} aria-hidden="true">
            {initial}
          </span>
          <div>
            <b>{profile.fullName}</b>
            <span>{profile.email}</span>
          </div>
          <button
            type="button"
            aria-label="Log out"
            title="Log out"
            onClick={async () => {
              await signOut();
              router.replace(`/sign-in?next=${encodeURIComponent(home)}`);
            }}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <div className={styles.frame}>
        <header className={styles.topbar}>
          <button type="button" className={styles.menuButton} aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
          <div className={styles.topTitle}>
            <b>{page.label}</b>
            <span>{page.lead}</span>
          </div>
          <div className={styles.topUser}>
            <span>{status}</span>
            <span className={styles.avatar} aria-hidden="true">
              {initial}
            </span>
          </div>
        </header>
        <main id="main" className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}

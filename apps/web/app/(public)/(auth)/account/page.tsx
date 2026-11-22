import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccountView } from '@/features/auth/AccountView';
import styles from '@/features/auth/auth.module.css';

export const metadata: Metadata = { title: 'Your account' };

export default function AccountPage() {
  return (
    <section className={styles.stage}>
      <div className="container">
        <Suspense fallback={<div className={styles.panel} aria-busy="true" style={{ minHeight: 320 }} />}>
          <AccountView />
        </Suspense>
      </div>
    </section>
  );
}

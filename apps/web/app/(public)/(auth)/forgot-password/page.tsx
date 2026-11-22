import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ForgotPasswordView } from '@/features/auth/ForgotPasswordView';
import styles from '@/features/auth/auth.module.css';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <section className={styles.stage}>
      <div className={`container ${styles.layout} ${styles.layoutNarrow}`} style={{ gridTemplateColumns: 'minmax(0, 460px)' }}>
        <Suspense fallback={<div className={styles.panel} aria-busy="true" style={{ minHeight: 320 }} />}>
          <ForgotPasswordView />
        </Suspense>
      </div>
    </section>
  );
}

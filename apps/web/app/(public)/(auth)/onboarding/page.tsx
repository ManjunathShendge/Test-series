import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OnboardingView } from '@/features/auth/OnboardingView';
import styles from '@/features/auth/auth.module.css';

export const metadata: Metadata = { title: 'Set up your practice' };

export default function OnboardingPage() {
  return (
    <section className={styles.stage}>
      <div className={`container ${styles.layout} ${styles.layoutNarrow}`}>
        <Suspense fallback={<div className={styles.panel} aria-busy="true" style={{ minHeight: 480 }} />}>
          <OnboardingView />
        </Suspense>
      </div>
    </section>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProgressView } from '@/features/results/ProgressView';
import styles from '@/features/auth/auth.module.css';

export const metadata: Metadata = { title: 'Your progress' };

export default function ProgressPage() {
  return (
    <section className={styles.stage}>
      <div className="container">
        <Suspense fallback={null}>
          <ProgressView />
        </Suspense>
      </div>
    </section>
  );
}

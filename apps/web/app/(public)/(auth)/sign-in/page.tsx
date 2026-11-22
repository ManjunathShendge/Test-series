import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignInView } from '@/features/auth/SignInView';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import styles from '@/features/auth/auth.module.css';

export const metadata: Metadata = {
  title: 'Log in or sign up',
  description: 'Log in or create a free MakeMePrepare account to practise reviewed mock tests.',
};

const POINTS = [
  { icon: 'check' as const, text: 'Every question reviewed by a subject expert before it goes live' },
  { icon: 'clock' as const, text: 'Real CBT timing, sections and marking scheme' },
  { icon: 'phone' as const, text: 'One login on the web and the app, on up to two devices' },
];

export default function SignInPage() {
  return (
    <section className={styles.stage}>
      <div className={`container ${styles.layout}`}>
        <div className={styles.pitch}>
          <p className="eyebrow eyebrow-static">MakeMePrepare</p>
          <p className="t-display" style={{ margin: 0 }}>
            Practise like it&apos;s exam day.
          </p>
          <ul className={styles.pitchList}>
            {POINTS.map((p) => (
              <li key={p.text}>
                <span className={styles.pitchIcon}>
                  <Glyph name={p.icon} size={16} />
                </span>
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <Suspense fallback={<div className={styles.panel} aria-busy="true" style={{ minHeight: 480 }} />}>
          <SignInView />
        </Suspense>
      </div>
    </section>
  );
}

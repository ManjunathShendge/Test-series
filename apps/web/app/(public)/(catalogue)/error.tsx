'use client';

import Link from 'next/link';
import styles from '@/features/catalogue/catalogue.module.css';

/** The catalogue API failed or answered unexpectedly. Offer a retry, never a blank page. */
export default function CatalogueError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <section className={styles.hero}>
        <div className={`container ${styles.heroMain}`}>
          <p className="eyebrow eyebrow-static">Something went wrong</p>
          <h1 className={`t-display ${styles.heroTitle}`}>We could not load the tests right now</h1>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className={`card ${styles.empty}`} role="alert">
            <h2 className="t-title">Please try again in a moment</h2>
            <p className="t-secondary">This is usually a brief connection issue on our side. Your progress is not affected.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={reset}>
                Try again
              </button>
              <Link href="/" className="btn btn-secondary">
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

import Link from 'next/link';
import styles from './landing.module.css';

/**
 * Placeholder for a policy that legal/CA review has not finalised (LAUNCH_CHECKLIST,
 * DECISIONS O05/O09). It never invents terms; the page is noindex until real text lands.
 */
export function PolicyPending({ title, summary }: { title: string; summary: string }) {
  return (
    <>
      <section className={styles.policyHero}>
        <div className="container">
          <p className="eyebrow">Policies</p>
          <h1 className="t-display">{title}</h1>
        </div>
      </section>
      <section className="section">
        <div className={`container ${styles.policyBody}`}>
          <div className="card">
            <h2 className="t-title">Being finalised</h2>
            <p className="t-secondary">{summary}</p>
            <p className="t-secondary">
              The full text is being reviewed by our legal advisers and will be published on this page before paid tests
              go on sale.
            </p>
            <Link href="/" className="btn btn-secondary">
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

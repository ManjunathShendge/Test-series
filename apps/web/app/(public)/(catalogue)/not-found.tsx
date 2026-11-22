import { EmptyState } from '@/features/catalogue/parts';
import styles from '@/features/catalogue/catalogue.module.css';

export default function CatalogueNotFound() {
  return (
    <>
      <section className={styles.hero}>
        <div className={`container ${styles.heroMain}`}>
          <p className="eyebrow eyebrow-static">Not found</p>
          <h1 className={`t-display ${styles.heroTitle}`}>This page is not available</h1>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <EmptyState
            title="It may have moved or been retired"
            body="Tests are sometimes replaced by a corrected version. Browse the exam to find the latest one."
            action={{ href: '/exams', label: 'Browse exams' }}
          />
        </div>
      </section>
    </>
  );
}

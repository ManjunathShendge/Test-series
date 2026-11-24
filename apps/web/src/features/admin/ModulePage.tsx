import type { ReactNode } from 'react';
import styles from './admin.module.css';

/**
 * A PRD dashboard module whose backend milestone has not shipped. It states what the module
 * does (PRD wording) and what it depends on; it never shows sample or invented figures.
 */
export function ModulePage({ title, scope, dependsOn }: { title: string; scope: ReactNode; dependsOn: ReactNode }) {
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>{title}</h1>
          <p>{scope}</p>
        </div>
      </div>
      <div className={styles.state} role="status">
        <h2>Nothing to show yet</h2>
        <p>{dependsOn}</p>
      </div>
    </>
  );
}

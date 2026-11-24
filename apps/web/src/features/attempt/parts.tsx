import type { ReactNode } from 'react';
import type { Palette, PaletteCounts } from '@exam-prep/engine';
import { Logo } from '@/ui/primitives/Logo';
import styles from './attempt.module.css';

/** What each palette state means, in the order CBT instructions list them. */
export const PALETTE_LABEL: Record<Palette, string> = {
  not_visited: 'Not visited',
  not_answered: 'Not answered',
  answered: 'Answered',
  marked_for_review: 'Marked for review',
  answered_and_marked: 'Answered and marked for review (will be evaluated)',
};

const ORDER: Palette[] = ['answered', 'not_answered', 'not_visited', 'marked_for_review', 'answered_and_marked'];

const COUNT_KEY: Record<Palette, keyof PaletteCounts> = {
  answered: 'answered',
  not_answered: 'notAnswered',
  not_visited: 'notVisited',
  marked_for_review: 'marked',
  answered_and_marked: 'answeredAndMarked',
};

export const cellClass = (palette: Palette) => `${styles.cell} ${styles[palette]}`;

/** The five states with their shapes; with `counts`, each cell shows how many questions are in it. */
export function PaletteLegend({ counts, compact = false }: { counts?: PaletteCounts; compact?: boolean }) {
  return (
    <ul className={`${styles.legend} ${compact ? styles.legendCompact : ''}`}>
      {ORDER.map((p) => (
        <li key={p}>
          <span className={cellClass(p)} aria-hidden="true">
            {counts ? counts[COUNT_KEY[p]] : ''}
          </span>
          <span>
            {compact && p === 'answered_and_marked' ? 'Answered & marked' : PALETTE_LABEL[p]}
            {counts ? <span className="visually-hidden">: {counts[COUNT_KEY[p]]}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Navy bar across the top of every test screen; no site navigation to wander off into. */
export function AttemptBar({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className={styles.bar}>
      <Logo tone="inverse" variant="mark" height={30} href={null} />
      <div className={styles.barTitle}>
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {children}
    </header>
  );
}

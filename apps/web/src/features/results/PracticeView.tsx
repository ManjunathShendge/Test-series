'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { PracticeItem, PracticeKind } from '@exam-prep/contracts';
import { attemptsApi } from '@/lib/api/attempts';
import { RequireSession } from '@/features/auth/RequireSession';
import { Waiting } from '@/features/auth/ui';
import { ErrorScreen, errorKind } from '@/ui/errors/ErrorScreen';
import { SolutionCard, type SolutionData } from './SolutionCard';
import styles from './results.module.css';

const COPY: Record<PracticeKind, { title: string; lead: string; empty: string }> = {
  mistakes: {
    title: 'Mistake notebook',
    lead: 'Every question you got wrong, with the right answer and solution. Remove one once you have it.',
    empty: 'No mistakes saved yet. Questions you get wrong in a test land here automatically.',
  },
  bookmarks: {
    title: 'Bookmarks',
    lead: 'Questions you bookmarked while reviewing your results.',
    empty: 'No bookmarks yet. Bookmark questions from any result’s solutions.',
  },
};

export function PracticeView({ kind }: { kind: PracticeKind }) {
  return <RequireSession>{() => <Practice kind={kind} />}</RequireSession>;
}

/** PRD 6.6 practice lists, read from the student's closed attempts only. */
function Practice({ kind }: { kind: PracticeKind }) {
  const [items, setItems] = useState<PracticeItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [hi, setHi] = useState(false);
  const load = useCallback(() => {
    setError(null);
    attemptsApi.practice(kind).then(setItems, setError);
  }, [kind]);
  useEffect(load, [load]);

  const copy = COPY[kind];
  return (
    <div className={styles.wrap} style={{ padding: 0 }}>
      <div className={styles.head}>
        <p className="eyebrow eyebrow-static">Practice</p>
        <h1>{copy.title}</h1>
        <p className={styles.muted}>{copy.lead}</p>
        <div className={styles.links}>
          <Link className="btn btn-ghost" href="/progress">
            Back to progress
          </Link>
          <Link className="btn btn-secondary" href={kind === 'mistakes' ? '/practice/bookmarks' : '/practice/mistakes'}>
            {kind === 'mistakes' ? 'Bookmarks' : 'Mistake notebook'}
          </Link>
          {items?.some((i) => i.stemHi) ? (
            <button type="button" className={styles.filter} aria-pressed={hi} onClick={() => setHi(!hi)} lang="hi">
              हिन्दी
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <ErrorScreen kind={errorKind(error)} onRetry={load} home={{ href: '/progress', label: 'Back to progress' }} />
      ) : !items ? (
        <Waiting label="Loading…" />
      ) : items.length ? (
        items.map((item, i) => (
          <SolutionCard
            key={item.questionId}
            q={toCard(item, i)}
            hi={hi}
            onChange={(next) => {
              // Taken off this list: drop it from view.
              if ((kind === 'mistakes' && !next.inNotebook) || (kind === 'bookmarks' && !next.bookmarked))
                setItems((list) => list?.filter((x) => x.questionId !== item.questionId) ?? null);
            }}
          />
        ))
      ) : (
        <section className={styles.card}>
          <p className={styles.muted}>{copy.empty}</p>
        </section>
      )}
    </div>
  );
}

function toCard(item: PracticeItem, index: number): SolutionData {
  return {
    questionId: item.questionId,
    attemptId: item.attemptId,
    label: `${index + 1}. ${item.testTitle}`,
    subject: item.subject,
    topic: item.topic,
    stemEn: item.stemEn,
    stemHi: item.stemHi,
    passageEn: item.passageEn,
    passageHi: item.passageHi,
    options: item.options,
    imageAssetIds: item.imageAssetIds,
    selected: item.selected,
    correctOption: item.correctOption,
    solutionEn: item.solutionEn,
    solutionHi: item.solutionHi,
    bookmarked: item.bookmarked,
    inNotebook: item.inNotebook,
  };
}

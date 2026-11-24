'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { AttemptSummary } from '@exam-prep/contracts';
import { attemptsApi } from '@/lib/api/attempts';
import { RequireSession } from '@/features/auth/RequireSession';
import { Waiting } from '@/features/auth/ui';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import { ErrorScreen, errorKind } from '@/ui/errors/ErrorScreen';
import { AttemptBar } from './parts';
import styles from './attempt.module.css';

const num = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const share = (score: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0);

export function SummaryView({ attemptId }: { attemptId: string }) {
  return <RequireSession>{() => <Summary attemptId={attemptId} />}</RequireSession>;
}

/** The server's score for a closed attempt. Nothing here is computed on the device. */
function Summary({ attemptId }: { attemptId: string }) {
  const [data, setData] = useState<AttemptSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    setError(null);
    attemptsApi.summary(attemptId).then(setData, setError);
  }, [attemptId]);
  useEffect(load, [load]);

  if (error)
    return (
      <main id="main" className={styles.page}>
        <ErrorScreen kind={errorKind(error)} variant="page" onRetry={load} home={{ href: '/account', label: 'Go to my account' }} />
      </main>
    );
  if (!data)
    return (
      <main id="main" className={styles.page} style={{ display: 'grid', placeItems: 'center' }}>
        <Waiting label="Loading your score…" />
      </main>
    );

  if (data.status === 'in_progress')
    return (
      <div className={styles.page}>
        <AttemptBar title={data.testTitle} />
        <main id="main" className={styles.wrap}>
          <h1 className={styles.h1}>This test is still running</h1>
          <p className="t-secondary">Your score appears here once you submit or the time runs out.</p>
          <div className={styles.startRow}>
            <Link href={`/attempt/${data.attemptId}`} className="btn btn-primary btn-lg">
              Continue the test <Glyph name="arrow" size={18} />
            </Link>
          </div>
        </main>
      </div>
    );

  const accuracy = data.attempted ? Math.round((data.correct / data.attempted) * 100) : 0;

  return (
    <div className={styles.page}>
      <AttemptBar title={data.testTitle} subtitle="Score summary" />
      <main id="main" className={styles.wrap}>
        <section className={styles.scoreCard} aria-labelledby="score-title">
          <div className={styles.ring} style={{ '--pct': share(data.score, data.maxScore) } as CSSProperties} aria-hidden="true">
            <div className={styles.ringInner}>
              <div>
                <strong>{num(data.score)}</strong>
                <br />
                <span>of {num(data.maxScore)}</span>
              </div>
            </div>
          </div>
          <div className={styles.scoreText}>
            <h1 id="score-title">
              You scored {num(data.score)} out of {num(data.maxScore)}
            </h1>
            <p>
              {data.status === 'timed_out' ? 'Time ran out, so your test was submitted automatically' : 'Submitted'}
              {data.submittedAt ? ` on ${when(data.submittedAt)}` : ''}.
            </p>
          </div>
        </section>

        <ul className={styles.stats} aria-label="Result details">
          <li className={styles.stat}>
            <strong>{data.rank !== null ? `#${data.rank}` : '—'}</strong>
            <span>{data.rank !== null ? `Rank of ${data.rankedAttempts}` : 'Rank counts first attempts only'}</span>
          </li>
          <li className={styles.stat}>
            <strong>{data.percentile !== null ? num(data.percentile) : '—'}</strong>
            <span>Percentile</span>
          </li>
          <li className={`${styles.stat} ${styles.statGood}`}>
            <strong>{data.correct}</strong>
            <span>Correct</span>
          </li>
          <li className={`${styles.stat} ${styles.statBad}`}>
            <strong>{data.incorrect}</strong>
            <span>Wrong</span>
          </li>
          <li className={styles.stat}>
            <strong>{data.skipped}</strong>
            <span>Not answered</span>
          </li>
          <li className={styles.stat}>
            <strong>{accuracy}%</strong>
            <span>Accuracy ({data.attempted} attempted)</span>
          </li>
        </ul>

        {data.lateEvents > 0 ? (
          <p className={styles.warn} role="status">
            <Glyph name="bell" size={16} />
            <span>
              {data.lateEvents} change{data.lateEvents === 1 ? '' : 's'} reached us after time was up and
              {data.lateEvents === 1 ? ' was' : ' were'} not counted.
            </span>
          </p>
        ) : null}

        {data.sections.length > 1 ? (
          <section className="card" aria-labelledby="sections-title">
            <h2 id="sections-title" className={styles.h2}>
              Section scores
            </h2>
            <div className={styles.tableScroll}>
              <table className={styles.countTable}>
                <thead>
                  <tr>
                    <th scope="col">Section</th>
                    <th scope="col">Score</th>
                    <th scope="col">Correct</th>
                    <th scope="col">Wrong</th>
                    <th scope="col">Attempted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sections.map((s) => (
                    <tr key={s.sectionId}>
                      <th scope="row">
                        {s.name}
                        <div className={styles.bar2} aria-hidden="true">
                          <span style={{ width: `${share(s.score, s.maxScore)}%` }} />
                        </div>
                      </th>
                      <td>
                        {num(s.score)} / {num(s.maxScore)}
                      </td>
                      <td>{s.correct}</td>
                      <td>{s.incorrect}</td>
                      <td>
                        {s.attempted} / {s.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <div className={styles.startRow}>
          <Link href={`/tests/${data.testSlug}`} className="btn btn-primary btn-lg">
            Back to the test
          </Link>
          <Link href="/account" className="btn btn-ghost btn-lg">
            My tests and account
          </Link>
        </div>
      </main>
    </div>
  );
}

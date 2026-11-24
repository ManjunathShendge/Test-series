'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { MIN_COHORT, type AttemptReview, type ReviewQuestion } from '@exam-prep/contracts';
import { track } from '@/lib/analytics';
import { attemptsApi } from '@/lib/api/attempts';
import { ApiRequestError } from '@/lib/api/http';
import { RequireSession } from '@/features/auth/RequireSession';
import { Waiting } from '@/features/auth/ui';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import { SolutionCard, type SolutionData } from '@/features/results/SolutionCard';
import r from '@/features/results/results.module.css';
import { ErrorScreen, errorKind } from '@/ui/errors/ErrorScreen';
import { AttemptBar } from './parts';
import styles from './attempt.module.css';

const num = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const share = (score: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0);
const mins = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.round(s / 60)} min`);

type Filter = 'all' | 'wrong' | 'right' | 'skipped' | 'marked';
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['wrong', 'Wrong'],
  ['right', 'Correct'],
  ['skipped', 'Not answered'],
  ['marked', 'Marked'],
];

export function SummaryView({ attemptId }: { attemptId: string }) {
  return <RequireSession>{() => <Result attemptId={attemptId} />}</RequireSession>;
}

/** PRD 6.5 result: the server's score, comparison, analysis and solutions. Nothing is scored here. */
function Result({ attemptId }: { attemptId: string }) {
  const [data, setData] = useState<AttemptReview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<'overview' | 'solutions'>('overview');
  const [filter, setFilter] = useState<Filter>('all');
  const [hi, setHi] = useState(false);
  const openSolutions = () => {
    if (tab !== 'solutions') track('review_opened');
    setTab('solutions');
  };

  const load = useCallback(() => {
    setError(null);
    attemptsApi.review(attemptId).then(setData, setError);
  }, [attemptId]);
  useEffect(load, [load]);

  const topics = useMemo(() => {
    const map = new Map<string, { subject: string; topic: string; attempted: number; correct: number; total: number }>();
    for (const q of data?.questions ?? []) {
      const key = `${q.subject ?? ''}|${q.topic ?? 'Other'}`;
      const t = map.get(key) ?? { subject: q.subject ?? '', topic: q.topic ?? 'Other', attempted: 0, correct: 0, total: 0 };
      t.total++;
      if (q.selected) t.attempted++;
      if (q.isCorrect) t.correct++;
      map.set(key, t);
    }
    return [...map.values()].sort((a, b) => a.subject.localeCompare(b.subject) || a.topic.localeCompare(b.topic));
  }, [data]);

  if (error instanceof ApiRequestError && error.code === 'ATTEMPT_IN_PROGRESS')
    return (
      <div className={styles.page}>
        <AttemptBar title="Your test" />
        <main id="main" className={styles.wrap}>
          <h1 className={styles.h1}>This test is still running</h1>
          <p className="t-secondary">Your result appears here once you submit or the time runs out.</p>
          <div className={styles.startRow}>
            <Link href={`/attempt/${attemptId}`} className="btn btn-primary btn-lg">
              Continue the test <Glyph name="arrow" size={18} />
            </Link>
          </div>
        </main>
      </div>
    );
  if (error)
    return (
      <main id="main" className={styles.page}>
        <ErrorScreen kind={errorKind(error)} variant="page" onRetry={load} home={{ href: '/account', label: 'Go to my account' }} />
      </main>
    );
  if (!data)
    return (
      <main id="main" className={styles.page} style={{ display: 'grid', placeItems: 'center' }}>
        <Waiting label="Loading your result…" />
      </main>
    );

  const s = data.summary;
  const accuracy = s.attempted ? Math.round((s.correct / s.attempted) * 100) : 0;
  const enough = data.cohort.size >= MIN_COHORT;
  const hasHindi = data.questions.some((q) => q.stemHi);
  const shown = data.questions.filter((q) =>
    filter === 'all'
      ? true
      : filter === 'wrong'
        ? q.isCorrect === false
        : filter === 'right'
          ? q.isCorrect === true
          : filter === 'skipped'
            ? !q.selected
            : q.marked,
  );
  const count = (f: Filter) => (f === 'all' ? data.questions.length : data.questions.filter((q) => (f === 'wrong' ? q.isCorrect === false : f === 'right' ? q.isCorrect === true : f === 'skipped' ? !q.selected : q.marked)).length);

  return (
    <div className={styles.page}>
      <AttemptBar title={s.testTitle} subtitle="Result" />
      <main id="main" className={styles.wrap}>
        <section className={styles.scoreCard} aria-labelledby="score-title">
          <div className={styles.ring} style={{ '--pct': share(s.score, s.maxScore) } as CSSProperties} aria-hidden="true">
            <div className={styles.ringInner}>
              <div>
                <strong>{num(s.score)}</strong>
                <br />
                <span>of {num(s.maxScore)}</span>
              </div>
            </div>
          </div>
          <div className={styles.scoreText}>
            <h1 id="score-title">
              You scored {num(s.score)} out of {num(s.maxScore)}
            </h1>
            <p>
              {s.status === 'timed_out' ? 'Time ran out, so your test was submitted automatically' : 'Submitted'}
              {s.submittedAt ? ` on ${when(s.submittedAt)}` : ''} · time taken {mins(data.timeSeconds)}.
            </p>
          </div>
        </section>

        <div className={r.tabs} role="tablist" aria-label="Result sections">
          <button type="button" role="tab" className={r.tab} aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>
            Overview
          </button>
          <button type="button" role="tab" className={r.tab} aria-selected={tab === 'solutions'} onClick={openSolutions}>
            Solutions ({data.questions.length})
          </button>
        </div>

        {tab === 'overview' ? (
          <>
            <ul className={styles.stats} aria-label="Result details">
              <li className={styles.stat}>
                <strong>{s.rank !== null ? `#${s.rank}` : '—'}</strong>
                <span>{s.rank !== null ? `Rank of ${s.rankedAttempts}` : 'Rank counts first attempts only'}</span>
              </li>
              <li className={styles.stat}>
                <strong>{s.percentile !== null ? num(s.percentile) : '—'}</strong>
                <span>Percentile (share of students who scored lower)</span>
              </li>
              <li className={`${styles.stat} ${styles.statGood}`}>
                <strong>{s.correct}</strong>
                <span>Correct</span>
              </li>
              <li className={`${styles.stat} ${styles.statBad}`}>
                <strong>{s.incorrect}</strong>
                <span>Wrong</span>
              </li>
              <li className={styles.stat}>
                <strong>{s.skipped}</strong>
                <span>Not answered</span>
              </li>
              <li className={styles.stat}>
                <strong>{accuracy}%</strong>
                <span>Accuracy ({s.attempted} attempted)</span>
              </li>
            </ul>

            {s.lateEvents > 0 ? (
              <p className={styles.warn} role="status">
                <Glyph name="bell" size={16} />
                <span>
                  {s.lateEvents} change{s.lateEvents === 1 ? '' : 's'} reached us after time was up and {s.lateEvents === 1 ? 'was' : 'were'} not counted.
                </span>
              </p>
            ) : null}

            <section className={r.card} aria-labelledby="compare-title">
              <h2 id="compare-title">How you compare</h2>
              {enough ? (
                <div className={r.compare}>
                  <CompareRow label="You" value={s.score} max={s.maxScore} tone={r.barYou} />
                  <CompareRow label="Average" value={data.cohort.averageScore ?? 0} max={s.maxScore} />
                  <CompareRow label="Topper" value={data.cohort.topperScore ?? 0} max={s.maxScore} tone={r.barTop} />
                  <p className={r.muted}>
                    Based on {data.cohort.size} students’ first attempts.
                    {data.cohort.averageSeconds ? ` Average time taken: ${mins(data.cohort.averageSeconds)}.` : ''}
                  </p>
                </div>
              ) : (
                <p className={r.muted}>
                  Not enough data yet: {data.cohort.size} student{data.cohort.size === 1 ? ' has' : 's have'} finished this test. Comparisons appear once {MIN_COHORT} have.
                </p>
              )}
            </section>

            {s.sections.length > 1 ? (
              <section className={r.card} aria-labelledby="sections-title">
                <h2 id="sections-title">Section scores</h2>
                <div className={r.scroll}>
                  <table className={r.table}>
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
                      {s.sections.map((x) => (
                        <tr key={x.sectionId}>
                          <th scope="row">{x.name}</th>
                          <td>
                            {num(x.score)} / {num(x.maxScore)}
                          </td>
                          <td>{x.correct}</td>
                          <td>{x.incorrect}</td>
                          <td>
                            {x.attempted} / {x.total}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section className={r.card} aria-labelledby="topics-title">
              <h2 id="topics-title">Topic analysis</h2>
              <div className={r.scroll}>
                <table className={r.table}>
                  <thead>
                    <tr>
                      <th scope="col">Topic</th>
                      <th scope="col">Questions</th>
                      <th scope="col">Attempted</th>
                      <th scope="col">Correct</th>
                      <th scope="col">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topics.map((t) => (
                      <tr key={`${t.subject}|${t.topic}`}>
                        <th scope="row">
                          {t.topic}
                          {t.subject ? <span className={r.muted} style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 400 }}>{t.subject}</span> : null}
                        </th>
                        <td>{t.total}</td>
                        <td>{t.attempted}</td>
                        <td>{t.correct}</td>
                        <td>{t.attempted ? `${Math.round((t.correct / t.attempted) * 100)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className={styles.startRow}>
              <button type="button" className="btn btn-primary btn-lg" onClick={openSolutions}>
                Review solutions
              </button>
              <Link href="/progress" className="btn btn-secondary btn-lg">
                My progress
              </Link>
              <Link href={`/tests/${s.testSlug}`} className="btn btn-ghost btn-lg">
                Back to the test
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className={r.filters} role="group" aria-label="Show questions">
              {FILTERS.map(([f, label]) => (
                <button key={f} type="button" className={r.filter} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {label} ({count(f)})
                </button>
              ))}
              {hasHindi ? (
                <button type="button" className={r.filter} aria-pressed={hi} onClick={() => setHi(!hi)} lang="hi">
                  हिन्दी
                </button>
              ) : null}
            </div>
            {shown.length ? (
              shown.map((q) => <SolutionCard key={q.testQuestionId} q={toCard(q, attemptId)} hi={hi} />)
            ) : (
              <p className={r.muted}>No questions in this view.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function CompareRow({ label, value, max, tone }: { label: string; value: number; max: number; tone?: string | undefined }) {
  return (
    <div className={r.compareRow}>
      <span>{label}</span>
      <div className={`${r.bar} ${tone ?? ''}`} aria-hidden="true">
        <span style={{ width: `${share(value, max)}%` }} />
      </div>
      <span className={r.num}>{num(value)}</span>
    </div>
  );
}

function toCard(q: ReviewQuestion, attemptId: string): SolutionData {
  return {
    questionId: q.questionId,
    attemptId,
    label: `Question ${q.number}`,
    subject: q.subject,
    topic: q.topic,
    stemEn: q.stemEn,
    stemHi: q.stemHi,
    passageEn: q.passageEn,
    passageHi: q.passageHi,
    options: q.options,
    imageAssetIds: q.imageAssetIds,
    selected: q.selected,
    correctOption: q.correctOption,
    solutionEn: q.solutionEn,
    solutionHi: q.solutionHi,
    bookmarked: q.bookmarked,
    inNotebook: q.inNotebook,
    reported: q.reported,
    keyCorrected: q.keyCorrected,
    marksAwarded: q.marksAwarded,
    timeSeconds: q.timeSeconds,
    cohort: q.cohort,
  };
}

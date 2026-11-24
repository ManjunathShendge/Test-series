'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { MyProgress } from '@exam-prep/contracts';
import { attemptsApi } from '@/lib/api/attempts';
import { RequireSession } from '@/features/auth/RequireSession';
import { Waiting } from '@/features/auth/ui';
import { formatDuration, formatPrice } from '@/features/catalogue/format';
import { ErrorScreen, errorKind } from '@/ui/errors/ErrorScreen';
import styles from './results.module.css';

export function ProgressView() {
  return <RequireSession>{() => <Progress />}</RequireSession>;
}

const date = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(iso));
const tone = (a: number | null) => (a === null ? '' : a >= 70 ? styles.barTop : a >= 40 ? styles.barMid : styles.barLow);

/** PRD 6.6 progress: topic accuracy, weakest topic, score trend and recommended tests. */
function Progress() {
  const [data, setData] = useState<MyProgress | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    setError(null);
    attemptsApi.progress().then(setData, setError);
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorScreen kind={errorKind(error)} onRetry={load} home={{ href: '/account', label: 'Go to my account' }} />;
  if (!data) return <Waiting label="Loading your progress…" />;

  const { totals } = data;
  const accuracy = totals.attempted ? Math.round((totals.correct / totals.attempted) * 100) : 0;

  return (
    <div className={styles.wrap} style={{ padding: 0 }}>
      <div className={styles.head}>
        <p className="eyebrow eyebrow-static">Progress</p>
        <h1>How you’re doing</h1>
        <p className={styles.muted}>Built from every test you have finished. Practice lists keep the questions to revisit.</p>
        <div className={styles.links}>
          <Link className="btn btn-secondary" href="/practice/mistakes">
            Mistake notebook
          </Link>
          <Link className="btn btn-secondary" href="/practice/bookmarks">
            Bookmarks
          </Link>
        </div>
      </div>

      {totals.tests === 0 ? (
        <section className={styles.card}>
          <h2>No finished tests yet</h2>
          <p className={styles.muted}>Take a test and your topic accuracy, score trend and suggestions appear here.</p>
          <div className={styles.links}>
            <Link className="btn btn-primary" href="/exams">
              Find a test
            </Link>
          </div>
        </section>
      ) : (
        <>
          <ul className={styles.kpis} aria-label="Totals">
            <li className={styles.kpi}>
              <strong>{totals.tests}</strong>
              <span>Tests finished</span>
            </li>
            <li className={styles.kpi}>
              <strong>{totals.attempted}</strong>
              <span>Questions answered of {totals.questions}</span>
            </li>
            <li className={styles.kpi}>
              <strong>{accuracy}%</strong>
              <span>Accuracy</span>
            </li>
          </ul>

          {data.weakest ? (
            <div className={styles.weak} role="status">
              <p>
                <strong>Focus next: {data.weakest.topic}</strong> ({data.weakest.subject}) — {data.weakest.accuracy}% accuracy over{' '}
                {data.weakest.attempted} answered questions.
              </p>
            </div>
          ) : null}

          {data.trend.length > 1 ? (
            <section className={styles.card} aria-labelledby="trend-title">
              <h2 id="trend-title">Score trend</h2>
              <Trend points={data.trend} />
            </section>
          ) : null}

          <section className={styles.card} aria-labelledby="topic-title">
            <h2 id="topic-title">Topic accuracy</h2>
            <div className={styles.compare}>
              {[...data.topics]
                .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101))
                .map((t) => (
                  <div key={`${t.subject}|${t.topic}`} className={styles.compareRow} style={{ gridTemplateColumns: 'minmax(120px, 220px) 1fr 64px' }}>
                    <span>
                      {t.topic}
                      <span className={styles.muted} style={{ display: 'block', fontSize: '0.75rem' }}>
                        {t.subject} · {t.attempted}/{t.total} answered
                      </span>
                    </span>
                    <div className={`${styles.bar} ${tone(t.accuracy)}`} aria-hidden="true">
                      <span style={{ width: `${t.accuracy ?? 0}%` }} />
                    </div>
                    <span className={styles.num}>{t.accuracy === null ? '—' : `${t.accuracy}%`}</span>
                  </div>
                ))}
            </div>
          </section>
        </>
      )}

      {data.recommended.length ? (
        <section className={styles.card} aria-labelledby="rec-title">
          <h2 id="rec-title">Recommended next</h2>
          <ul className={styles.recs}>
            {data.recommended.map((t) => (
              <li key={t.testId}>
                <Link className={styles.rec} href={`/tests/${t.slug}`}>
                  <strong>{t.title}</strong>
                  <span>
                    {t.examName} · {t.totalQuestions} questions · {formatDuration(t.durationSeconds)} · {formatPrice(t.pricePaise)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Percentage per test, oldest to newest; a plain SVG line with labelled points. */
function Trend({ points }: { points: MyProgress['trend'] }) {
  const w = 640;
  const h = 200;
  const pad = 28;
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
  const y = (p: number) => h - pad - (Math.max(0, Math.min(100, p)) * (h - pad * 2)) / 100;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.percentage).toFixed(1)}`).join(' ');
  return (
    <figure style={{ margin: 0 }}>
      <svg className={styles.chart} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Score trend over ${points.length} tests`}>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} stroke="var(--border)" />
            <text x={4} y={y(g) + 4} fontSize="11" fill="var(--text-secondary)">
              {g}%
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.attemptId}>
            <circle cx={x(i)} cy={y(p.percentage)} r="5" fill="var(--surface)" stroke="var(--brand)" strokeWidth="3" />
            <text x={x(i)} y={h - 6} fontSize="11" textAnchor="middle" fill="var(--text-secondary)">
              {date(p.submittedAt)}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="visually-hidden">
        {points.map((p) => `${p.testTitle}: ${p.percentage}%`).join('; ')}
      </figcaption>
    </figure>
  );
}

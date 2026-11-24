'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { MyAttempt } from '@exam-prep/contracts';
import { attemptsApi } from '@/lib/api/attempts';
import { ApiRequestError } from '@/lib/api/http';
import { Alert, Waiting } from '@/features/auth/ui';
import authStyles from '@/features/auth/auth.module.css';
import listStyles from '@/features/commerce/commerce.module.css';

const date = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

function line(a: MyAttempt): string {
  if (a.status === 'in_progress') return `Started ${date(a.startedAt)} · time runs until ${date(a.expiresAt)}`;
  const how = a.status === 'timed_out' ? 'Time ran out' : a.status === 'abandoned' ? 'Closed' : 'Submitted';
  return `${how} ${a.submittedAt ? date(a.submittedAt) : ''} · ${a.totalQuestions} questions`;
}

/** Account page: tests the student started, with a way back into a running one. */
export function AttemptsPanel() {
  const [items, setItems] = useState<MyAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    attemptsApi
      .mine()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof ApiRequestError ? e.message : 'Could not load your tests.'));
  }, []);

  return (
    <section className={authStyles.panel} aria-labelledby="attempts-title">
      <div className={authStyles.panelHead}>
        <h2 id="attempts-title" className="t-title">
          My tests
        </h2>
        <p className="t-small t-secondary">Tests you have started or finished.</p>
      </div>
      {error ? (
        <Alert>{error}</Alert>
      ) : !items ? (
        <Waiting label="Loading your tests…" />
      ) : items.length ? (
        <ul className={listStyles.list}>
          {items.map((a) => (
            <li key={a.attemptId} className={listStyles.purchase}>
              <Link href={`/tests/${a.testSlug}`}>{a.testTitle}</Link>
              {a.status === 'in_progress' ? (
                <Link href={`/attempt/${a.attemptId}`} className="btn btn-primary">
                  Resume
                </Link>
              ) : (
                <Link href={`/attempt/${a.attemptId}/summary`} className={listStyles.amount}>
                  Score {a.score.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </Link>
              )}
              <small>{line(a)}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-small t-secondary">
          No tests yet.{' '}
          <Link href="/exams" className="u-link">
            Find a test
          </Link>
        </p>
      )}
    </section>
  );
}

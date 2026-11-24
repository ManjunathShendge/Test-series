'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FollowingFeed } from '@exam-prep/contracts';
import { accountApi } from '@/lib/api/identity';
import { ApiRequestError } from '@/lib/api/http';
import { Alert, Waiting } from '@/features/auth/ui';
import authStyles from '@/features/auth/auth.module.css';
import styles from '@/features/commerce/commerce.module.css';

const date = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(iso));

/** Account page: examiners the student follows and their newest tests (PRD 6.2). */
export function FollowingPanel() {
  const [feed, setFeed] = useState<FollowingFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    accountApi
      .following()
      .then(setFeed)
      .catch((e: unknown) => setError(e instanceof ApiRequestError ? e.message : 'Could not load the examiners you follow.'));
  }, []);

  return (
    <section className={authStyles.panel} aria-labelledby="following-title">
      <div className={authStyles.panelHead}>
        <h2 id="following-title" className="t-title">
          New from examiners you follow
        </h2>
        <p className="t-small t-secondary">
          {feed?.examiners.length
            ? `Following ${feed.examiners.map((e) => e.name).join(', ')}.`
            : 'Follow examiners from their profile to see their new tests here.'}
        </p>
      </div>
      {error ? (
        <Alert>{error}</Alert>
      ) : !feed ? (
        <Waiting label="Loading…" />
      ) : feed.tests.length ? (
        <ul className={styles.list}>
          {feed.tests.slice(0, 8).map((t) => (
            <li key={t.id} className={styles.purchase}>
              <Link href={`/tests/${t.slug}`}>{t.title}</Link>
              <span className="t-small">{t.access === 'free' ? 'Free' : 'Paid'}</span>
              <small>
                {t.examiner.name} · {t.exam.name}
                {t.publishedAt ? ` · ${date(t.publishedAt)}` : ''}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-small t-secondary">No tests from them yet.</p>
      )}
      <Link href="/exams" className="btn btn-secondary">
        Find examiners
      </Link>
    </section>
  );
}

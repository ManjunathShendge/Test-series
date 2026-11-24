'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { MyPurchase } from '@exam-prep/contracts';
import { checkoutApi, inr } from '@/lib/api/commerce';
import { ApiRequestError } from '@/lib/api/http';
import { Alert, Waiting } from '@/features/auth/ui';
import authStyles from '@/features/auth/auth.module.css';
import styles from './commerce.module.css';

const date = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(iso));

function line(p: MyPurchase): string {
  if (p.status === 'refunded') return `Refunded ${p.refundedAt ? date(p.refundedAt) : ''}; access ended`;
  const parts = [p.channel === 'admin_grant' ? 'Granted by support' : `Paid ${p.capturedAt ? date(p.capturedAt) : ''}`];
  if (p.invoiceNumber) parts.push(`Invoice ${p.invoiceNumber}`);
  if (p.couponCode) parts.push(`Code ${p.couponCode}`);
  if (p.validUntil) parts.push(new Date(p.validUntil) > new Date() ? `Access until ${date(p.validUntil)}` : `Expired ${date(p.validUntil)}`);
  return parts.join(' · ');
}

/** Account page: tests and series the student bought or was given. */
export function PurchasesPanel() {
  const [items, setItems] = useState<MyPurchase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    checkoutApi
      .purchases()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof ApiRequestError ? e.message : 'Could not load your purchases.'));
  }, []);

  return (
    <section className={authStyles.panel} aria-labelledby="purchases-title">
      <div className={authStyles.panelHead}>
        <h2 id="purchases-title" className="t-title">
          Purchases
        </h2>
        <p className="t-small t-secondary">Full refund within 7 days if you have not started a covered test. Write to support to ask.</p>
      </div>
      {error ? (
        <Alert>{error}</Alert>
      ) : !items ? (
        <Waiting label="Loading purchases…" />
      ) : items.length ? (
        <ul className={styles.list}>
          {items.map((p) => (
            <li key={p.id} className={styles.purchase}>
              <Link href={`/${p.itemType === 'test_series' ? 'series' : 'tests'}/${p.itemSlug}`}>{p.itemTitle}</Link>
              <span className={`${styles.amount} ${p.status === 'refunded' ? styles.refunded : ''}`}>
                {p.channel === 'admin_grant' ? '—' : inr(p.totalPaise)}
              </span>
              <small>{line(p)}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-small t-secondary">
          Nothing yet. <Link href="/exams" className="u-link">Browse tests</Link>
        </p>
      )}
    </section>
  );
}

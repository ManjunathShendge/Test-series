'use client';

import { errorKind } from '@/ui/errors/ErrorScreen';
import { useState } from 'react';
import type { Coupon, ExaminerSalesResponse, Payout, PayoutStatus } from '@exam-prep/contracts';
import { earningsApi, inr, saveBlob } from '@/lib/api/commerce';
import { Alert, Waiting } from '@/features/auth/ui';
import { formatWhen, messageOf, State, useLoad } from '@/features/admin/ui';
import admin from '@/features/admin/admin.module.css';
import { StatCard } from '@/ui/console/Dashboard';
import ui from '@/ui/console/console.module.css';
import { PageHead } from './ExaminerShell';
import styles from './money.module.css';

const PERIODS = [7, 30, 90] as const;
const shortDay = (day: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(`${day}T12:00:00+05:30`));
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(`${month}-15T00:00:00Z`));

function Failed({ what, error, retry }: { what: string; error: unknown; retry: () => void }) {
  return (
    <State kind={errorKind(error)} title={`Could not load ${what}`} action={<button type="button" className="btn btn-primary" onClick={retry}>Try again</button>}>
      {messageOf(error)}
    </State>
  );
}

// Sales and revenue (PRD 4.4) -----------------------------------------------------------------

export function SalesView() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const { state, reload } = useLoad(() => earningsApi.sales(days), [days]);
  return (
    <div className={styles.stack}>
      <PageHead
        title="Sales and revenue"
        lead="Sales, attempts and your share by test and by day. Your share is 65% of net revenue, or 75% when a student used your own code (proposed rates)."
        action={
          <div className={admin.inlineActions} role="group" aria-label="Period">
            {PERIODS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={days === value}
                className={`btn ${days === value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDays(value)}
              >
                {value} days
              </button>
            ))}
          </div>
        }
      />
      {state.status === 'loading' ? (
        <Waiting label="Loading your sales…" />
      ) : state.status === 'error' ? (
        <Failed what="your sales" error={state.error} retry={() => void reload()} />
      ) : (
        <Sales data={state.data} />
      )}
    </div>
  );
}

function Sales({ data }: { data: ExaminerSalesResponse }) {
  const t = data.totals;
  return (
    <>
      <div className={ui.cards}>
        <StatCard icon="tag" chip={`${t.refunds} refunded`} value={t.sales} label="Sales" note="Tests and series bought" part={t.sales - t.refunds} whole={Math.max(t.sales, 1)} barLabel="Kept" />
        <StatCard icon="wallet" chip="After refunds" value={inr(t.sharePaise)} label="Your share" note={`Net revenue ${inr(t.netPaise)}`} part={t.sharePaise} whole={Math.max(t.netPaise, 1)} barLabel="Of net revenue" />
        <StatCard icon="ticket" chip="75% share" value={t.couponSales} label="With your code" note="Sales where students used your code" part={t.couponSales} whole={Math.max(t.sales, 1)} barLabel="Of sales" />
        <StatCard icon="users" chip="Finished" value={t.attempts} label="Attempts" note="Submitted attempts on your tests" part={t.attempts} whole={Math.max(t.attempts, 1)} barLabel="Counted" />
      </div>

      <section className={admin.card} aria-labelledby="chart-title">
        <div className={admin.cardHead}>
          <div>
            <h2 id="chart-title">Your share by day</h2>
            <p>India time. Refunds count on the day they happen, so a day can be negative.</p>
          </div>
        </div>
        <DayChart days={data.byDay} />
      </section>

      <section className={admin.card} aria-labelledby="by-test-title">
        <div className={admin.cardHead}>
          <div>
            <h2 id="by-test-title">By test and series</h2>
            <p>Gross is what students paid, GST included. Net is after GST and the payment fee.</p>
          </div>
        </div>
        {data.byTest.length ? (
          <div className={admin.tableWrap}>
            <table className={admin.table}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className={admin.num}>Sales</th>
                  <th scope="col" className={admin.num}>Refunds</th>
                  <th scope="col" className={admin.num}>Your code</th>
                  <th scope="col" className={admin.num}>Attempts</th>
                  <th scope="col" className={admin.num}>Gross</th>
                  <th scope="col" className={admin.num}>Net</th>
                  <th scope="col" className={admin.num}>Your share</th>
                </tr>
              </thead>
              <tbody>
                {data.byTest.map((row) => (
                  <tr key={row.itemId}>
                    <td className={admin.wrap}>
                      {row.title} <small className={styles.kind}>{row.itemType === 'test_series' ? 'Series' : 'Test'}</small>
                    </td>
                    <td className={admin.num}>{row.sales}</td>
                    <td className={admin.num}>{row.refunds}</td>
                    <td className={admin.num}>{row.couponSales}</td>
                    <td className={admin.num}>{row.attempts}</td>
                    <td className={admin.num}>{inr(row.grossPaise)}</td>
                    <td className={admin.num}>{inr(row.netPaise)}</td>
                    <td className={admin.num}>
                      <strong>{inr(row.sharePaise)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={admin.helper}>No sales or attempts in this period yet.</p>
        )}
      </section>

      <details className={admin.card}>
        <summary className={styles.summary}>By day (table)</summary>
        <div className={admin.tableWrap}>
          <table className={admin.table}>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col" className={admin.num}>Sales</th>
                <th scope="col" className={admin.num}>Refunds</th>
                <th scope="col" className={admin.num}>Attempts</th>
                <th scope="col" className={admin.num}>Net</th>
                <th scope="col" className={admin.num}>Your share</th>
              </tr>
            </thead>
            <tbody>
              {[...data.byDay].reverse().map((row) => (
                <tr key={row.day}>
                  <td>{shortDay(row.day)}</td>
                  <td className={admin.num}>{row.sales}</td>
                  <td className={admin.num}>{row.refunds}</td>
                  <td className={admin.num}>{row.attempts}</td>
                  <td className={admin.num}>{inr(row.netPaise)}</td>
                  <td className={admin.num}>{inr(row.sharePaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

/** Bar chart of the daily share; the table above carries the same numbers for screen readers. */
function DayChart({ days }: { days: ExaminerSalesResponse['byDay'] }) {
  const max = Math.max(1, ...days.map((d) => Math.abs(d.sharePaise)));
  const hasNegative = days.some((d) => d.sharePaise < 0);
  const step = days.length > 31 ? 14 : days.length > 7 ? 5 : 1;
  if (!days.some((d) => d.sharePaise !== 0)) return <p className={admin.helper}>No earnings in this period yet.</p>;
  return (
    <figure className={styles.chart} aria-label={`Daily share for the last ${days.length} days`}>
      <div className={styles.bars} aria-hidden="true">
        {days.map((d) => {
          const h = `${(Math.abs(d.sharePaise) / max) * 100}%`;
          return (
            <div key={d.day} className={styles.col} title={`${shortDay(d.day)}: ${inr(d.sharePaise)} (${d.sales} sales)`}>
              <div className={styles.pos}>{d.sharePaise > 0 ? <span className={styles.bar} style={{ height: h }} /> : null}</div>
              {hasNegative ? <div className={styles.neg}>{d.sharePaise < 0 ? <span className={styles.barNeg} style={{ height: h }} /> : null}</div> : null}
            </div>
          );
        })}
      </div>
      <div className={styles.axis} aria-hidden="true">
        {days.map((d, i) => (
          <span key={d.day}>{i % step === 0 || i === days.length - 1 ? shortDay(d.day) : ''}</span>
        ))}
      </div>
      <figcaption className={styles.caption}>Highest day {inr(max)}. Hover a bar for the day’s figures.</figcaption>
    </figure>
  );
}

// Earnings and payouts (PRD 4.4) --------------------------------------------------------------

const PAYOUT_LABEL: Record<PayoutStatus, string> = {
  calculated: 'Calculated',
  on_hold: 'On hold',
  approved: 'Approved',
  paid: 'Paid',
};
const PAYOUT_BADGE: Record<PayoutStatus, string> = {
  calculated: admin.badgeDraft!,
  on_hold: admin.badgeOff!,
  approved: admin.badgeDraft!,
  paid: admin.badgeOn!,
};

export function EarningsView() {
  const { state, reload } = useLoad(() => earningsApi.payouts(), []);
  return (
    <div className={styles.stack}>
      <PageHead
        title="Earnings and payouts"
        lead="Payouts are calculated monthly after the month ends. Your KYC must be verified, the first payout is held for one cycle, and amounts under ₹500 carry forward. TDS is deducted as applicable."
      />
      {state.status === 'loading' ? (
        <Waiting label="Loading your payouts…" />
      ) : state.status === 'error' ? (
        <Failed what="your payouts" error={state.error} retry={() => void reload()} />
      ) : (
        <Payouts items={state.data} />
      )}
    </div>
  );
}

function Payouts({ items }: { items: Payout[] }) {
  const paid = items.filter((p) => p.status === 'paid').reduce((n, p) => n + p.netPayablePaise, 0);
  const tds = items.filter((p) => p.status === 'paid').reduce((n, p) => n + p.tdsPaise, 0);
  const upcoming = items.filter((p) => p.status === 'calculated' || p.status === 'approved').reduce((n, p) => n + p.netPayablePaise, 0);
  const held = items.filter((p) => p.status === 'on_hold' && !p.carriedIntoMonth).reduce((n, p) => n + p.grossPaise, 0);
  if (!items.length)
    return (
      <State title="No payouts yet">
        Your first statement appears after the first month in which you make a sale. See live figures on Sales and revenue.
      </State>
    );
  return (
    <>
      <dl className={admin.totals}>
        <div>
          <dt>Paid to you</dt>
          <dd>{inr(paid)}</dd>
        </div>
        <div>
          <dt>TDS deducted</dt>
          <dd>{inr(tds)}</dd>
        </div>
        <div>
          <dt>Being processed</dt>
          <dd>{inr(upcoming)}</dd>
        </div>
        <div>
          <dt>Held, carries forward</dt>
          <dd>{inr(held)}</dd>
        </div>
      </dl>
      <div className={admin.rows}>
        {items.map((p) => (
          <PayoutRow key={p.id} payout={p} />
        ))}
      </div>
    </>
  );
}

function PayoutRow({ payout: p }: { payout: Payout }) {
  const [busy, setBusy] = useState<'statement' | 'tds' | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(kind: 'statement' | 'tds') {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'statement') saveBlob(await earningsApi.statement(p.id), `statement-${p.month}.csv`);
      else window.open((await earningsApi.tdsCertificate(p.id)).url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className={admin.row}>
      <div className={admin.rowMain}>
        <strong>
          {monthLabel(p.month)} <span className={`${admin.badge} ${PAYOUT_BADGE[p.status]}`}>{PAYOUT_LABEL[p.status]}</span>
        </strong>
        <small>
          Direct {inr(p.directSalesPaise)} · your code {inr(p.couponSalesPaise)}
          {p.refundDeductionsPaise ? ` · refunds −${inr(p.refundDeductionsPaise)}` : ''}
          {p.carriedForwardPaise ? ` · brought forward ${inr(p.carriedForwardPaise)}` : ''} · gross {inr(p.grossPaise)} · TDS {p.tdsRatePercent}%{' '}
          {inr(p.tdsPaise)}
        </small>
        <small>
          {p.status === 'paid'
            ? `Paid ${p.paidAt ? formatWhen(p.paidAt) : ''} · bank reference ${p.bankTransferRef ?? '—'}`
            : p.status === 'on_hold'
              ? `${p.holdReason ?? 'On hold'}${p.carriedIntoMonth ? ` · carried into ${monthLabel(p.carriedIntoMonth)}` : ''}`
              : p.status === 'approved'
                ? 'Approved; the bank transfer is on its way'
                : 'Calculated; waiting for finance approval'}
        </small>
        {error ? <Alert>{error}</Alert> : null}
      </div>
      <div className={admin.inline}>
        <span className={styles.payable}>{inr(p.netPayablePaise)}</span>
        <button type="button" className="btn btn-secondary" disabled={busy !== null} aria-busy={busy === 'statement' || undefined} onClick={() => void run('statement')}>
          Statement
        </button>
        {p.hasTdsCertificate ? (
          <button type="button" className="btn btn-secondary" disabled={busy !== null} aria-busy={busy === 'tds' || undefined} onClick={() => void run('tds')}>
            TDS certificate
          </button>
        ) : null}
      </div>
    </div>
  );
}

// Coupon code (PRD 4.4) -----------------------------------------------------------------------

export function CouponView() {
  const { state, reload } = useLoad(() => earningsApi.coupons(), []);
  return (
    <div className={styles.stack}>
      <PageHead
        title="Coupon code"
        lead="Share your code with your students. When they use it on your tests or series, your share rises to 75% (proposed rate). Codes are created by our team; ask support for one."
      />
      {state.status === 'loading' ? (
        <Waiting label="Loading your codes…" />
      ) : state.status === 'error' ? (
        <Failed what="your codes" error={state.error} retry={() => void reload()} />
      ) : state.data.length ? (
        <div className={styles.codes}>
          {state.data.map((c) => (
            <CouponCard key={c.id} coupon={c} />
          ))}
        </div>
      ) : (
        <State title="No code yet">Ask support to create your code. It works only on your own tests and series, once per student.</State>
      )}
    </div>
  );
}

function CouponCard({ coupon: c }: { coupon: Coupon }) {
  const [copied, setCopied] = useState(false);
  const expired = c.validUntil !== null && new Date(c.validUntil) <= new Date();
  const discount =
    c.discountPercent !== null
      ? `${c.discountPercent}% off${c.maxDiscountPaise ? ` (up to ${inr(c.maxDiscountPaise)})` : ''}`
      : c.flatDiscountPaise
        ? `${inr(c.flatDiscountPaise)} off`
        : 'No student discount';
  return (
    <div className={admin.card}>
      <div className={styles.codeHead}>
        <code className={styles.code}>{c.code}</code>
        <span className={`${admin.badge} ${c.isActive && !expired ? admin.badgeOn : admin.badgeOff}`}>
          {!c.isActive ? 'Switched off' : expired ? 'Expired' : 'Active'}
        </span>
      </div>
      <p className={styles.codeLine}>{discount}</p>
      <dl className={admin.totals}>
        <div>
          <dt>Uses</dt>
          <dd>
            {c.uses}
            {c.maxUses ? ` of ${c.maxUses}` : ''}
          </dd>
        </div>
        <div>
          <dt>Sales with it</dt>
          <dd>{inr(c.salesPaise)}</dd>
        </div>
      </dl>
      <p className={admin.helper}>{c.validUntil ? `Valid until ${formatWhen(c.validUntil)}` : 'No end date'}</p>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          void navigator.clipboard?.writeText(c.code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? 'Copied' : 'Copy code'}
      </button>
      <span className="visually-hidden" aria-live="polite">
        {copied ? 'Code copied' : ''}
      </span>
    </div>
  );
}

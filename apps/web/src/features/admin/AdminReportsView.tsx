'use client';

import { useId, useState, type FormEvent } from 'react';
import type { OpsReport, ReportExportKind } from '@exam-prep/contracts';
import { inr, saveBlob } from '@/lib/api/commerce';
import { opsApi } from '@/lib/api/ops';
import { Alert, Waiting } from '@/features/auth/ui';
import { errorKind } from '@/ui/errors/ErrorScreen';
import { isCode, messageOf, State, useLoad } from './ui';
import { addDays, formatDay, indiaDay, lastDays, niceMax } from './ops-format';
import styles from './admin.module.css';
import ops from './ops.module.css';

const num = (n: number) => n.toLocaleString('en-IN');

/** PRD 8 "Reports": sales, students, attempts and QC for an India date range, with CSV exports. */
export function AdminReportsView() {
  const id = useId();
  const [range, setRange] = useState(() => lastDays(30));
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const { state, reload } = useLoad(() => opsApi.report(range.from, range.to), [range.from, range.to]);
  const today = indiaDay();

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!from || !to) return setRangeError('Choose both dates.');
    if (from > to) return setRangeError('The start must be on or before the end.');
    if (addDays(from, 366) < to) return setRangeError('Choose at most one year.');
    setRangeError(null);
    setRange({ from, to });
  }
  function preset(days: number) {
    const next = lastDays(days);
    setFrom(next.from);
    setTo(next.to);
    setRangeError(null);
    setRange(next);
  }

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Reports</h1>
          <p>
            Sales, students, attempts and QC for India calendar days, both ends included. Funnels and cohorts live in PostHog. Amounts
            include GST unless marked net.
          </p>
        </div>
      </div>

      <form className={`${styles.card} ${ops.toolbar}`} onSubmit={apply} aria-label="Date range">
        <label className={styles.field} htmlFor={`${id}-from`}>
          <span className={styles.label}>From</span>
          <input id={`${id}-from`} type="date" className={styles.control} value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={styles.field} htmlFor={`${id}-to`}>
          <span className={styles.label}>To</span>
          <input id={`${id}-to`} type="date" className={styles.control} value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary">
          Show
        </button>
        <div className={ops.segs} role="group" aria-label="Quick ranges">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" className={ops.seg} aria-pressed={range.to === today && range.from === lastDays(d).from} onClick={() => preset(d)}>
              {d} days
            </button>
          ))}
        </div>
        {rangeError ? (
          <p className={`${styles.error} ${styles.span2}`} role="alert" style={{ flexBasis: '100%' }}>
            {rangeError}
          </p>
        ) : null}
      </form>

      <div style={{ marginTop: 'var(--space-xl)' }}>
        {state.status === 'loading' ? (
          <Waiting label="Loading the report…" />
        ) : state.status === 'error' ? (
          isCode(state.error, 'FORBIDDEN') ? (
            <State kind="forbidden" title="You do not have access to this">
              Reports need an admin account with the operations permission. Ask a super admin to grant it.
            </State>
          ) : (
            <State
              kind={errorKind(state.error)}
              title="Could not load the report"
              action={
                <button type="button" className="btn btn-primary" onClick={() => void reload()}>
                  Try again
                </button>
              }
            >
              {messageOf(state.error)}
            </State>
          )
        ) : (
          <Report report={state.data} />
        )}
      </div>
    </>
  );
}

function Report({ report: r }: { report: OpsReport }) {
  const period = `${formatDay(r.from, true)} to ${formatDay(r.to, true)}`;
  return (
    <div className={styles.sections} style={{ gap: 'var(--space-xl)' }}>
      <p className={styles.helper} role="status">
        Showing {period}.
      </p>
      <div className={ops.kpiGroup}>
        <h2>Sales</h2>
        <dl className={ops.kpis}>
          <Kpi label="Orders" value={num(r.sales.orders)} />
          <Kpi label="Gross sales" value={inr(r.sales.grossPaise)} note={r.sales.discountPaise ? `${inr(r.sales.discountPaise)} in discounts` : undefined} />
          <Kpi label="Net revenue" value={inr(r.sales.netRevenuePaise)} note="excluding GST" />
          <Kpi label="GST" value={inr(r.sales.gstPaise)} />
          <Kpi label="Refunds" value={num(r.sales.refunds)} note={inr(r.sales.refundedPaise)} />
          {r.sales.byChannel.map((c) => (
            <Kpi key={c.channel} label={`Via ${channelName(c.channel)}`} value={inr(c.paidPaise)} note={`${num(c.orders)} orders`} />
          ))}
        </dl>
      </div>
      <div className={ops.kpiGroup}>
        <h2>Students and attempts</h2>
        <dl className={ops.kpis}>
          <Kpi label="Sign-ups" value={num(r.students.signups)} />
          <Kpi label="Active students" value={num(r.students.active)} note="started an attempt" />
          <Kpi label="Paying students" value={num(r.students.paying)} />
          <Kpi label="Attempts started" value={num(r.attempts.started)} />
          <Kpi label="Attempts finished" value={num(r.attempts.finished)} />
          <Kpi label="Free test share" value={`${r.attempts.freeShare}%`} note="of attempts started" />
        </dl>
      </div>
      <div className={ops.kpiGroup}>
        <h2>Quality control and support</h2>
        <dl className={ops.kpis}>
          <Kpi label="QC decisions" value={num(r.qc.decided)} />
          <Kpi label="Waiting for QC" value={num(r.qc.pending)} note="now" />
          <Kpi
            label="Average QC turnaround"
            value={r.qc.avgTurnaroundHours === null ? 'No decisions' : `${Math.round(r.qc.avgTurnaroundHours * 10) / 10} h`}
          />
          <Kpi label="Open question reports" value={num(r.qc.openReports)} note="now" />
        </dl>
      </div>

      <DailyChart daily={r.daily} />

      <section className={styles.card} aria-labelledby="top-tests-title">
        <h2 id="top-tests-title">Top tests</h2>
        {r.topTests.length ? (
          <div className={styles.tableWrap} role="region" aria-label="Top tests" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Test</th>
                  <th scope="col" className={styles.num}>
                    Attempts
                  </th>
                  <th scope="col" className={styles.num}>
                    Sales
                  </th>
                  <th scope="col" className={styles.num}>
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.topTests.map((t) => (
                  <tr key={t.id}>
                    <td className={styles.wrap}>{t.title}</td>
                    <td className={styles.num}>{num(t.attempts)}</td>
                    <td className={styles.num}>{num(t.sales)}</td>
                    <td className={styles.num}>{inr(t.revenuePaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.helper}>No attempts or sales in this period.</p>
        )}
      </section>

      <Exports from={r.from} to={r.to} />
    </div>
  );
}

function channelName(channel: string): string {
  return ({ razorpay: 'website', apple_iap: 'App Store', google_play: 'Google Play', admin_grant: 'grants' } as Record<string, string>)[channel] ?? channel.replace(/_/g, ' ');
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string | undefined }) {
  return (
    <div className={ops.kpi}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

type Metric = 'paidPaise' | 'orders' | 'attempts' | 'signups';
const METRIC: Record<Metric, { label: string; format: (n: number) => string }> = {
  paidPaise: { label: 'Sales', format: inr },
  orders: { label: 'Orders', format: num },
  attempts: { label: 'Attempts', format: num },
  signups: { label: 'Sign-ups', format: num },
};

/** One measure at a time on one axis; a visually hidden table carries every value. */
function DailyChart({ daily }: { daily: OpsReport['daily'] }) {
  const id = useId();
  const [metric, setMetric] = useState<Metric>('paidPaise');
  const [active, setActive] = useState<number | null>(null);
  const { label, format } = METRIC[metric];
  const values = daily.map((d) => d[metric]);
  const max = niceMax(Math.max(0, ...values));
  const W = 720;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 64 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const slot = daily.length ? plotW / daily.length : plotW;
  const barW = Math.max(2, Math.min(28, slot - 2));
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const labelEvery = Math.max(1, Math.ceil(daily.length / 8));
  const shown = active !== null ? daily[active] : null;
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <section className={styles.card} aria-labelledby={`${id}-title`}>
      <div className={styles.cardHead}>
        <div>
          <h2 id={`${id}-title`}>Day by day</h2>
          <p>
            {label}: {format(total)} in total.
          </p>
        </div>
        <div className={ops.segs} role="group" aria-label="Measure">
          {(Object.keys(METRIC) as Metric[]).map((m) => (
            <button key={m} type="button" className={ops.seg} aria-pressed={metric === m} onClick={() => setMetric(m)}>
              {METRIC[m].label}
            </button>
          ))}
        </div>
      </div>
      {daily.length ? (
        <>
          <p className={ops.readout} aria-hidden="true">
            {shown ? `${formatDay(shown.day)}: ${format(shown[metric])}` : 'Point at a bar to see its value.'}
          </p>
          <svg className={ops.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} per day, ${daily.length} days. The table below lists each value.`} onMouseLeave={() => setActive(null)}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line className={ops.chartGrid} x1={pad.left} x2={W - pad.right} y1={y(max * f)} y2={y(max * f)} />
                <text className={ops.chartAxis} x={pad.left - 8} y={y(max * f) + 4} textAnchor="end">
                  {format(max * f)}
                </text>
              </g>
            ))}
            {daily.map((d, i) => {
              const v = d[metric];
              const x = pad.left + i * slot + (slot - barW) / 2;
              const top = y(v);
              const h = pad.top + plotH - top;
              return (
                <g key={d.day} onMouseEnter={() => setActive(i)}>
                  {/* Hit area wider and taller than the bar. */}
                  <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} fill="transparent" />
                  {v > 0 ? (
                    <path
                      className={active === i ? ops.chartBarActive : ops.chartBar}
                      d={roundedTop(x, top, barW, h, Math.min(4, barW / 2, h))}
                    />
                  ) : null}
                  {i % labelEvery === 0 ? (
                    <text className={ops.chartAxis} x={pad.left + i * slot + slot / 2} y={H - 8} textAnchor="middle">
                      {formatDay(d.day)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <table className={styles.srOnly}>
            <caption>Daily figures</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Orders</th>
                <th scope="col">Sales</th>
                <th scope="col">Attempts</th>
                <th scope="col">Sign-ups</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day}>
                  <th scope="row">{formatDay(d.day, true)}</th>
                  <td>{num(d.orders)}</td>
                  <td>{inr(d.paidPaise)}</td>
                  <td>{num(d.attempts)}</td>
                  <td>{num(d.signups)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className={styles.helper}>No days in this range.</p>
      )}
    </section>
  );
}

/** A bar with rounded top corners, square on the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const EXPORTS: { kind: ReportExportKind; label: string }[] = [
  { kind: 'sales', label: 'Sales CSV' },
  { kind: 'attempts', label: 'Attempts CSV' },
  { kind: 'daily', label: 'Daily summary CSV' },
];

function Exports({ from, to }: { from: string; to: string }) {
  const [busy, setBusy] = useState<ReportExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function download(kind: ReportExportKind) {
    setBusy(kind);
    setError(null);
    try {
      saveBlob(await opsApi.exportReport(from, to, kind), `${kind}-${from}-to-${to}.csv`);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className={styles.card} aria-labelledby="exports-title">
      <h2 id="exports-title">Exports</h2>
      <p className={styles.helper}>The same period as above, as CSV files for a spreadsheet. Each download is recorded in the audit log.</p>
      <div className={styles.inlineActions} style={{ marginTop: 'var(--space-md)' }}>
        {EXPORTS.map((e) => (
          <button key={e.kind} type="button" className="btn btn-secondary" disabled={busy !== null} aria-busy={busy === e.kind || undefined} onClick={() => void download(e.kind)}>
            {e.label}
          </button>
        ))}
      </div>
      <div aria-live="polite">{error ? <Alert>{error}</Alert> : null}</div>
    </section>
  );
}

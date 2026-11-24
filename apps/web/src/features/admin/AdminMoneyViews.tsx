'use client';

import { errorKind } from '@/ui/errors/ErrorScreen';
import { useId, useState, type FormEvent } from 'react';
import {
  SeriesDetail,
  TestDetail,
  type AdminPriceBand,
  type AdminStudent,
  type AdminStudentDetail,
  type Coupon,
  type CreateCouponRequest,
  type Payout,
  type PayoutActionRequest,
  type PayoutStatus,
  type PricingOverview,
  type PurchaseItemType,
} from '@exam-prep/contracts';
import { adminMoneyApi, inr, saveBlob } from '@/lib/api/commerce';
import { apiRequest } from '@/lib/api/http';
import { Alert, Notice, Waiting } from '@/features/auth/ui';
import { uploadExaminerFile } from '@/features/examiner/upload';
import { Confirm, formatWhen, isCode, messageOf, State, useLoad } from './ui';
import styles from './admin.module.css';

const toPaise = (rupees: string) => Math.round(Number(rupees) * 100);
const toRupees = (paise: number) => String(paise / 100);
const validRupees = (value: string) => /^\d+(\.\d{1,2})?$/.test(value.trim());

function Failed({ what, error, retry, permission }: { what: string; error: unknown; retry: () => void; permission: string }) {
  if (isCode(error, 'FORBIDDEN'))
    return <State kind="forbidden" title="You do not have access to this">{`${what} needs an admin account with the ${permission} permission. Ask a super admin to grant it.`}</State>;
  return (
    <State kind={errorKind(error)} title={`Could not load ${what.toLowerCase()}`} action={<button type="button" className="btn btn-primary" onClick={retry}>Try again</button>}>
      {messageOf(error)}
    </State>
  );
}

// Pass and pricing (PRD 8) --------------------------------------------------------------------

export function AdminPricingView() {
  const { state, reload, set } = useLoad(() => adminMoneyApi.pricing(), []);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Pass and pricing</h1>
          <p>
            Coupon codes and the price band for each exam. Examiners set their own prices inside the band for their tier. Pass plans
            arrive in Phase 2, so no Pass is sold yet. Prices include GST.
          </p>
        </div>
      </div>
      {state.status === 'loading' ? (
        <Waiting label="Loading pricing…" />
      ) : state.status === 'error' ? (
        <Failed what="Pricing" error={state.error} retry={() => void reload()} permission="operations" />
      ) : (
        <div className={styles.sections}>
          <Coupons data={state.data} onChange={set} />
          <Bands data={state.data} onChange={set} />
        </div>
      )}
    </>
  );
}

function Coupons({ data, onChange }: { data: PricingOverview; onChange: (d: PricingOverview) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function toggle(c: Coupon) {
    setBusy(c.id);
    setError(null);
    try {
      onChange(await adminMoneyApi.setCouponActive(c.id, !c.isActive));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className={styles.card} aria-labelledby="coupons-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="coupons-title">Coupon codes</h2>
          <p>
            Platform codes work on every test. An examiner’s code works only on their items and raises their share to 75%. Each
            student can use a code once.
          </p>
        </div>
      </div>
      <NewCoupon examiners={data.examiners} onCreated={onChange} />
      {error ? <Alert>{error}</Alert> : null}
      {data.coupons.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Owner</th>
                <th scope="col">Discount</th>
                <th scope="col" className={styles.num}>Uses</th>
                <th scope="col" className={styles.num}>Sales</th>
                <th scope="col">Ends</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.coupons.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.code}</strong>
                  </td>
                  <td>{c.examinerName ?? 'Platform'}</td>
                  <td>
                    {c.discountPercent !== null
                      ? `${c.discountPercent}%${c.maxDiscountPaise ? ` up to ${inr(c.maxDiscountPaise)}` : ''}`
                      : c.flatDiscountPaise
                        ? inr(c.flatDiscountPaise)
                        : 'None'}
                  </td>
                  <td className={styles.num}>
                    {c.uses}
                    {c.maxUses ? ` / ${c.maxUses}` : ''}
                  </td>
                  <td className={styles.num}>{inr(c.salesPaise)}</td>
                  <td>{c.validUntil ? formatWhen(c.validUntil) : 'No end'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy !== null}
                      aria-busy={busy === c.id || undefined}
                      aria-label={`${c.isActive ? 'Switch off' : 'Switch on'} ${c.code}`}
                      onClick={() => void toggle(c)}
                    >
                      {c.isActive ? 'Switch off' : 'Switch on'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.helper}>No codes yet.</p>
      )}
    </section>
  );
}

function NewCoupon({ examiners, onCreated }: { examiners: PricingOverview['examiners']; onCreated: (d: PricingOverview) => void }) {
  const id = useId();
  const [code, setCode] = useState('');
  const [owner, setOwner] = useState('');
  const [kind, setKind] = useState<'percent' | 'flat' | 'none'>('percent');
  const [value, setValue] = useState('10');
  const [cap, setCap] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(normalized)) return setError('Codes are 4 to 20 letters or digits.');
    if (kind === 'none' && !owner) return setError('A platform code needs a discount.');
    if (kind === 'percent' && !(Number(value) > 0 && Number(value) <= 100)) return setError('Use a percentage between 1 and 100.');
    if (kind === 'flat' && !(validRupees(value) && Number(value) > 0)) return setError('Enter the flat discount in rupees.');
    if (cap && !validRupees(cap)) return setError('Enter the maximum discount in rupees.');
    if (maxUses && !(Number.isInteger(Number(maxUses)) && Number(maxUses) > 0)) return setError('Maximum uses must be a whole number.');
    const end = until ? new Date(`${until}T23:59:59+05:30`) : null;
    if (end && end <= new Date()) return setError('The end date must be in the future.');
    const body: CreateCouponRequest = {
      code: normalized,
      examinerId: owner || null,
      discountPercent: kind === 'percent' ? Number(value) : null,
      maxDiscountPaise: kind === 'percent' && cap ? toPaise(cap) : null,
      flatDiscountPaise: kind === 'flat' ? toPaise(value) : null,
      validUntil: end ? end.toISOString() : null,
      maxUses: maxUses ? Number(maxUses) : null,
    };
    setBusy(true);
    try {
      onCreated(await adminMoneyApi.createCoupon(body));
      setNotice(`${normalized} created.`);
      setCode('');
      setCap('');
      setMaxUses('');
      setUntil('');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`${styles.formGrid} ${styles.formGrid4}`} onSubmit={(e) => void submit(e)} aria-label="New coupon code">
      <label className={styles.field} htmlFor={`${id}-code`}>
        <span>Code</span>
        <input id={`${id}-code`} className={styles.control} value={code} maxLength={20} autoComplete="off" onChange={(e) => setCode(e.target.value.toUpperCase())} />
      </label>
      <label className={styles.field} htmlFor={`${id}-owner`}>
        <span>Owner</span>
        <select id={`${id}-owner`} className={styles.control} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Platform (all tests)</option>
          {examiners.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field} htmlFor={`${id}-kind`}>
        <span>Student discount</span>
        <select id={`${id}-kind`} className={styles.control} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="percent">Percentage</option>
          <option value="flat">Flat amount</option>
          {owner ? <option value="none">None (share only)</option> : null}
        </select>
      </label>
      {kind === 'none' ? (
        <span />
      ) : (
        <label className={styles.field} htmlFor={`${id}-value`}>
          <span>{kind === 'percent' ? 'Percent off' : 'Rupees off'}</span>
          <input id={`${id}-value`} className={styles.control} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
      )}
      {kind === 'percent' ? (
        <label className={styles.field} htmlFor={`${id}-cap`}>
          <span>Maximum discount, ₹ (optional)</span>
          <input id={`${id}-cap`} className={styles.control} inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
        </label>
      ) : null}
      <label className={styles.field} htmlFor={`${id}-uses`}>
        <span>Maximum uses (optional)</span>
        <input id={`${id}-uses`} className={styles.control} inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
      </label>
      <label className={styles.field} htmlFor={`${id}-until`}>
        <span>Last day (optional)</span>
        <input id={`${id}-until`} type="date" className={styles.control} value={until} onChange={(e) => setUntil(e.target.value)} />
      </label>
      <div className={styles.field}>
        <span aria-hidden="true">&nbsp;</span>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined}>
          Create code
        </button>
      </div>
      <div className={styles.span2} aria-live="polite">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Notice>{notice}</Notice> : null}
      </div>
    </form>
  );
}

function Bands({ data, onChange }: { data: PricingOverview; onChange: (d: PricingOverview) => void }) {
  return (
    <section className={styles.card} aria-labelledby="bands-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="bands-title">Price bands</h2>
          <p>Lowest price, and the highest price for New, Verified and Top examiners, per exam. Existing tests keep their prices.</p>
        </div>
      </div>
      <div className={styles.rows}>
        {data.bands.map((band) => (
          <BandRow key={`${band.examId}-${band.updatedAt}`} band={band} onSaved={onChange} />
        ))}
      </div>
    </section>
  );
}

function BandRow({ band, onSaved }: { band: AdminPriceBand; onSaved: (d: PricingOverview) => void }) {
  const id = useId();
  const initial = [band.minPaise, band.maxNewPaise, band.maxVerifiedPaise, band.maxTopPaise].map(toRupees);
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = values.some((v, i) => v !== initial[i]);
  const labels = ['Lowest', 'New max', 'Verified max', 'Top max'];

  async function save() {
    setError(null);
    if (!values.every(validRupees)) return setError('Enter each price in rupees.');
    const [minPaise, maxNewPaise, maxVerifiedPaise, maxTopPaise] = values.map(toPaise) as [number, number, number, number];
    if (!(minPaise >= 100 && minPaise <= maxNewPaise && maxNewPaise <= maxVerifiedPaise && maxVerifiedPaise <= maxTopPaise))
      return setError('Use at least ₹1, and lowest ≤ New ≤ Verified ≤ Top.');
    setBusy(true);
    try {
      onSaved(await adminMoneyApi.updateBand(band.examId, { expectedUpdatedAt: band.updatedAt, minPaise, maxNewPaise, maxVerifiedPaise, maxTopPaise }));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <strong>{band.examName}</strong>
        <small>Updated {formatWhen(band.updatedAt)}</small>
        {error ? <Alert>{error}</Alert> : null}
      </div>
      <div className={styles.inline}>
        {values.map((v, i) => (
          <label key={labels[i]} className={styles.field} htmlFor={`${id}-${i}`}>
            <span>{labels[i]}, ₹</span>
            <input
              id={`${id}-${i}`}
              className={styles.control}
              inputMode="decimal"
              size={6}
              value={v}
              onChange={(e) => setValues(values.map((old, j) => (j === i ? e.target.value : old)))}
            />
          </label>
        ))}
        <button type="button" className="btn btn-primary" disabled={!dirty || busy} aria-busy={busy || undefined} onClick={() => void save()}>
          Save
        </button>
      </div>
    </div>
  );
}

// Payouts (PRD 8) -----------------------------------------------------------------------------

const STATUS_LABEL: Record<PayoutStatus, string> = { calculated: 'Calculated', on_hold: 'On hold', approved: 'Approved', paid: 'Paid' };
const STATUS_BADGE: Record<PayoutStatus, string | undefined> = {
  calculated: styles.badgeDraft,
  on_hold: styles.badgeOff,
  approved: styles.badgeDraft,
  paid: styles.badgeOn,
};

/** The last finished month in India time, as YYYY-MM. */
function lastMonth(): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

export function AdminPayoutsView() {
  const id = useId();
  const [month, setMonth] = useState(lastMonth);
  const [tds, setTds] = useState('10');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<'calc' | 'export' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { state, reload, set } = useLoad(() => adminMoneyApi.payouts(month), [month]);
  const finished = month <= lastMonth();

  async function calculate() {
    setBusy('calc');
    setError(null);
    try {
      set(await adminMoneyApi.calculate({ month, tdsRatePercent: Number(tds) }));
      setConfirm(false);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  }
  async function exportCsv() {
    setBusy('export');
    setError(null);
    try {
      saveBlob(await adminMoneyApi.exportPayouts(month), `payouts-${month}.csv`);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Payouts</h1>
          <p>
            Calculate a finished month, check holds, approve, pay by bank transfer and record the reference. Recalculating updates only
            rows not yet approved. KYC must be verified; first payouts wait one cycle; under ₹500 carries forward.
          </p>
        </div>
      </div>
      <div className={`${styles.card} ${styles.inline}`}>
        <label className={styles.field} htmlFor={`${id}-month`}>
          <span>Month</span>
          <input id={`${id}-month`} type="month" className={styles.control} value={month} max={lastMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
        <label className={styles.field} htmlFor={`${id}-tds`}>
          <span>TDS rate, %</span>
          <input id={`${id}-tds`} className={styles.control} inputMode="decimal" size={4} value={tds} onChange={(e) => setTds(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!finished || busy !== null || !(Number(tds) >= 0 && Number(tds) <= 50) || tds.trim() === ''}
          onClick={() => setConfirm(true)}
        >
          Calculate
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy !== null} aria-busy={busy === 'export' || undefined} onClick={() => void exportCsv()}>
          Export CSV
        </button>
      </div>
      {!finished ? <p className={styles.helper}>Only a finished month can be calculated.</p> : null}
      {error ? <Alert>{error}</Alert> : null}
      {state.status === 'loading' ? (
        <Waiting label="Loading payouts…" />
      ) : state.status === 'error' ? (
        <Failed what="Payouts" error={state.error} retry={() => void reload()} permission="finance" />
      ) : state.data.length ? (
        <>
          <PayoutTotals items={state.data} />
          <div className={styles.rows}>
            {state.data.map((p) => (
              <PayoutRow key={p.id} payout={p} onSaved={(saved) => set(state.data.map((x) => (x.id === saved.id ? saved : x)))} />
            ))}
          </div>
        </>
      ) : (
        <p className={styles.helper}>No payouts for this month yet. Calculate it once the month has ended.</p>
      )}
      <Confirm
        open={confirm}
        title={`Calculate payouts for ${month}?`}
        confirmLabel="Calculate"
        busy={busy === 'calc'}
        onClose={() => setConfirm(false)}
        onConfirm={() => void calculate()}
      >
        <span>
          Sales captured and refunds made in {month} (India time), at {tds}% TDS. Approved and paid rows are not changed. This is
          recorded in the audit log.
        </span>
      </Confirm>
    </>
  );
}

function PayoutTotals({ items }: { items: Payout[] }) {
  const sum = (status: PayoutStatus) => items.filter((p) => p.status === status).reduce((n, p) => n + p.netPayablePaise, 0);
  return (
    <dl className={styles.totals}>
      <div>
        <dt>To approve</dt>
        <dd>{inr(sum('calculated'))}</dd>
      </div>
      <div>
        <dt>Approved, to pay</dt>
        <dd>{inr(sum('approved'))}</dd>
      </div>
      <div>
        <dt>Paid</dt>
        <dd>{inr(sum('paid'))}</dd>
      </div>
      <div>
        <dt>On hold</dt>
        <dd>{items.filter((p) => p.status === 'on_hold').length}</dd>
      </div>
    </dl>
  );
}

type Pending = 'approve' | 'hold' | 'release' | 'mark_paid' | 'attach_tds';
const ACTION_TITLE: Record<Pending, string> = {
  approve: 'Approve this payout?',
  hold: 'Hold this payout?',
  release: 'Release this hold?',
  mark_paid: 'Mark as paid?',
  attach_tds: 'Attach the TDS certificate',
};

function PayoutRow({ payout: p, onSaved }: { payout: Payout; onSaved: (p: Payout) => void }) {
  const id = useId();
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!pending) return;
    setError(null);
    const base = { expectedUpdatedAt: p.updatedAt };
    let body: PayoutActionRequest;
    if (pending === 'hold') {
      if (text.trim().length < 3) return setError('Give a reason for the hold.');
      body = { action: 'hold', reason: text.trim(), ...base };
    } else if (pending === 'mark_paid') {
      if (!/^[A-Za-z0-9/-]{4,64}$/.test(text.trim())) return setError('Enter the bank reference (letters, digits, / and -).');
      body = { action: 'mark_paid', bankTransferRef: text.trim(), ...base };
    } else if (pending === 'attach_tds') {
      if (!file) return setError('Choose the PDF certificate.');
      if (file.type && file.type !== 'application/pdf') return setError('The certificate must be a PDF.');
      if (file.size > 10 * 1024 * 1024) return setError('The PDF must be 10 MB or smaller.');
      setBusy(true);
      try {
        body = { action: 'attach_tds', assetId: await uploadExaminerFile(file, 'payout_document'), ...base };
      } catch (caught) {
        setBusy(false);
        return setError(caught instanceof Error && !('code' in caught) ? caught.message : messageOf(caught));
      }
    } else {
      body = { action: pending, ...base };
    }
    setBusy(true);
    try {
      onSaved(await adminMoneyApi.act(p.id, body));
      setPending(null);
      setText('');
      setFile(null);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  const actions: Pending[] = [];
  if (p.status === 'calculated') actions.push('approve', 'hold');
  if (p.status === 'approved') actions.push('mark_paid', 'hold');
  if (p.status === 'on_hold' && !p.carriedIntoMonth) actions.push('release');
  if (p.status === 'approved' || p.status === 'paid') actions.push('attach_tds');
  const label: Record<Pending, string> = {
    approve: 'Approve',
    hold: 'Hold',
    release: 'Release',
    mark_paid: 'Mark paid',
    attach_tds: p.hasTdsCertificate ? 'Replace TDS' : 'Attach TDS',
  };

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <strong>
          {p.examinerName} <span className={`${styles.badge} ${STATUS_BADGE[p.status] ?? ''}`}>{STATUS_LABEL[p.status]}</span>
          {!p.kycVerified ? <span className={`${styles.badge} ${styles.badgeOff}`}>KYC pending</span> : null}
        </strong>
        <small>
          Direct {inr(p.directSalesPaise)} · code {inr(p.couponSalesPaise)} · refunds −{inr(p.refundDeductionsPaise)} · carried{' '}
          {inr(p.carriedForwardPaise)} · gross {inr(p.grossPaise)} · TDS {p.tdsRatePercent}% {inr(p.tdsPaise)}
        </small>
        <small>
          {p.holdReason ? `${p.holdReason}${p.carriedIntoMonth ? ` · carried into ${p.carriedIntoMonth}` : ''}` : null}
          {p.status === 'paid' ? `Paid ${p.paidAt ? formatWhen(p.paidAt) : ''} · ref ${p.bankTransferRef ?? '—'}` : null}
          {p.hasTdsCertificate ? ' · TDS certificate attached' : ''}
        </small>
        {error && !pending ? <Alert>{error}</Alert> : null}
      </div>
      <div className={styles.inline}>
        <strong className={styles.num}>{inr(p.netPayablePaise)}</strong>
        {actions.map((a) => (
          <button
            key={a}
            type="button"
            className={`btn ${a === 'approve' || a === 'mark_paid' ? 'btn-primary' : 'btn-secondary'}`}
            disabled={busy}
            onClick={() => {
              setPending(a);
              setText('');
              setError(null);
            }}
          >
            {label[a]}
          </button>
        ))}
      </div>
      <Confirm
        open={pending !== null}
        title={pending ? ACTION_TITLE[pending] : ''}
        confirmLabel={pending ? label[pending] : 'Save'}
        danger={pending === 'hold'}
        busy={busy}
        onClose={() => {
          setPending(null);
          setError(null);
        }}
        onConfirm={() => void run()}
      >
        <span>
          {p.examinerName}, {p.month}: {inr(p.netPayablePaise)} net. Recorded in the audit log.
          {pending === 'mark_paid' ? ' Only after the bank transfer has succeeded.' : ''}
        </span>
        {pending === 'hold' || pending === 'mark_paid' ? (
          <label className={styles.field} htmlFor={`${id}-text`}>
            <span>{pending === 'hold' ? 'Reason' : 'Bank reference (UTR)'}</span>
            <input id={`${id}-text`} className={styles.control} maxLength={pending === 'hold' ? 500 : 64} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        ) : null}
        {pending === 'attach_tds' ? (
          <label className={styles.field} htmlFor={`${id}-file`}>
            <span>Certificate (PDF, up to 10 MB)</span>
            <input id={`${id}-file`} type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
      </Confirm>
    </div>
  );
}

// Students (PRD 8) ----------------------------------------------------------------------------

export function AdminStudentsView() {
  const id = useId();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AdminStudent[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (q.trim().length < 2) return setError('Type at least 2 characters.');
    setBusy(true);
    setError(null);
    try {
      setResults(await adminMoneyApi.students(q.trim()));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Students</h1>
          <p>Find a student by name, email, phone or ID. See purchases, refund within policy, grant access or block the account.</p>
        </div>
      </div>
      <form className={`${styles.card} ${styles.inline}`} onSubmit={(e) => void search(e)} role="search">
        <label className={styles.field} htmlFor={`${id}-q`}>
          <span>Search</span>
          <input id={`${id}-q`} className={styles.control} type="search" value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined}>
          Search
        </button>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {results ? (
        results.length ? (
          <div className={styles.rows}>
            {results.map((s) => (
              <div key={s.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <strong>
                    {s.name} {s.isBlocked ? <span className={`${styles.badge} ${styles.badgeOff}`}>Blocked</span> : null}
                  </strong>
                  <small>
                    {s.email ?? 'No email'} · joined {formatWhen(s.createdAt)} · {s.attempts} attempts
                  </small>
                </div>
                <button type="button" className="btn btn-secondary" aria-expanded={selected === s.id} onClick={() => setSelected(selected === s.id ? null : s.id)}>
                  {selected === s.id ? 'Close' : 'Open'}
                </button>
                {selected === s.id ? (
                  <div className={styles.span2}>
                    <StudentDetail
                      id={s.id}
                      onChanged={(d) => setResults(results.map((r) => (r.id === d.id ? { ...r, isBlocked: d.isBlocked } : r)))}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.helper}>No students match.</p>
        )
      ) : null}
    </>
  );
}

function StudentDetail({ id, onChanged }: { id: string; onChanged: (d: AdminStudentDetail) => void }) {
  const { state, reload, set } = useLoad(() => adminMoneyApi.student(id), [id]);
  const update = (d: AdminStudentDetail) => {
    set(d);
    onChanged(d);
  };
  if (state.status === 'loading') return <Waiting label="Loading student…" />;
  if (state.status === 'error') return <Failed what="Student" error={state.error} retry={() => void reload()} permission="operations" />;
  const s = state.data;
  return (
    <div className={styles.sections}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>Purchases of {s.name}</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Status</th>
              <th scope="col" className={styles.num}>Paid</th>
              <th scope="col">When</th>
              <th scope="col">Refund</th>
            </tr>
          </thead>
          <tbody>
            {s.purchases.length ? (
              s.purchases.map((p) => (
                <tr key={p.id}>
                  <td className={styles.wrap}>
                    {p.itemTitle}
                    <br />
                    <small>
                      {p.itemType === 'test_series' ? 'Series' : 'Test'}
                      {p.invoiceNumber ? ` · ${p.invoiceNumber}` : ''}
                      {p.couponCode ? ` · ${p.couponCode}` : ''}
                      {p.channel === 'admin_grant' ? ' · granted' : ''}
                    </small>
                  </td>
                  <td>{p.status === 'refunded' ? 'Refunded' : 'Active'}</td>
                  <td className={styles.num}>{inr(p.totalPaise)}</td>
                  <td>{formatWhen(p.capturedAt ?? p.createdAt)}</td>
                  <td className={styles.wrap}>
                    {p.refundable ? <RefundButton purchaseId={p.id} amount={p.totalPaise} title={p.itemTitle} onDone={update} /> : <small>{p.refundBlockedReason}</small>}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>No purchases.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Grant studentId={s.id} onDone={update} />
      <Block student={s} onDone={update} />
    </div>
  );
}

function RefundButton({ purchaseId, amount, title, onDone }: { purchaseId: string; amount: number; title: string; onDone: (d: AdminStudentDetail) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    if (reason.trim().length < 3) return setError('Give a reason for the refund.');
    setBusy(true);
    setError(null);
    try {
      onDone(await adminMoneyApi.refund(purchaseId, reason.trim()));
      setOpen(false);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Refund
      </button>
      <Confirm open={open} title={`Refund ${inr(amount)}?`} confirmLabel="Refund in full" danger busy={busy} onClose={() => setOpen(false)} onConfirm={() => void run()}>
        <span>{title}. The money goes back through Razorpay and access ends at once. This cannot be undone.</span>
        <label className={styles.field} htmlFor={`${id}-reason`}>
          <span>Reason</span>
          <input id={`${id}-reason`} className={styles.control} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error ? <Alert>{error}</Alert> : null}
      </Confirm>
    </>
  );
}

/** Accepts a test or series link (or slug) and resolves it before granting. */
function parseItem(input: string): { itemType: PurchaseItemType; slug: string } | null {
  const match = input.trim().match(/(?:^|\/)(tests|series)\/([a-z0-9-]+)\/?(?:[?#].*)?$/i);
  if (!match) return null;
  return { itemType: match[1]!.toLowerCase() === 'series' ? 'test_series' : 'single_test', slug: match[2]!.toLowerCase() };
}

function Grant({ studentId, onDone }: { studentId: string; onDone: (d: AdminStudentDetail) => void }) {
  const id = useId();
  const [link, setLink] = useState('');
  const [reason, setReason] = useState('');
  const [item, setItem] = useState<{ itemType: PurchaseItemType; itemId: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function find(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const parsed = parseItem(link);
    if (!parsed) return setError('Paste a test or series link, such as /tests/ssc-cgl-mock-1.');
    if (reason.trim().length < 3) return setError('Give a reason for the grant.');
    setBusy(true);
    try {
      const found =
        parsed.itemType === 'single_test'
          ? await apiRequest('GET', `/tests/${encodeURIComponent(parsed.slug)}`, { schema: TestDetail })
          : await apiRequest('GET', `/series/${encodeURIComponent(parsed.slug)}`, { schema: SeriesDetail });
      setItem({ itemType: parsed.itemType, itemId: found.id, title: found.title });
    } catch (caught) {
      setError(isCode(caught, 'NOT_FOUND') ? 'No published test or series has that link.' : messageOf(caught));
    } finally {
      setBusy(false);
    }
  }
  async function grant() {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await adminMoneyApi.grant(studentId, { itemType: item.itemType, itemId: item.itemId, reason: reason.trim() }));
      setNotice(`Access to ${item.title} granted.`);
      setItem(null);
      setLink('');
      setReason('');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={(e) => void find(e)} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Grant access</h2>
      <p className={styles.helper}>For support cases. A grant is free, is recorded in the audit log and never counts as a sale.</p>
      <div className={`${styles.formGrid} ${styles.formGrid2}`}>
        <label className={styles.field} htmlFor={`${id}-link`}>
          <span>Test or series link</span>
          <input id={`${id}-link`} className={styles.control} value={link} onChange={(e) => setLink(e.target.value)} />
        </label>
        <label className={styles.field} htmlFor={`${id}-reason`}>
          <span>Reason</span>
          <input id={`${id}-reason`} className={styles.control} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <div className={styles.inlineActions}>
        <button type="submit" className="btn btn-secondary" disabled={busy} aria-busy={busy && !item ? true : undefined}>
          Find
        </button>
      </div>
      <div aria-live="polite">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Notice>{notice}</Notice> : null}
      </div>
      <Confirm open={item !== null} title="Grant access?" confirmLabel="Grant" busy={busy} onClose={() => setItem(null)} onConfirm={() => void grant()}>
        <span>
          {item?.itemType === 'test_series' ? 'Series' : 'Test'}: {item?.title}. Reason: {reason}
        </span>
        {error ? <Alert>{error}</Alert> : null}
      </Confirm>
    </form>
  );
}

function Block({ student, onDone }: { student: AdminStudentDetail; onDone: (d: AdminStudentDetail) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocking = !student.isBlocked;
  async function run() {
    if (reason.trim().length < 3) return setError('Give a reason.');
    setBusy(true);
    setError(null);
    try {
      onDone(await adminMoneyApi.block(student.id, { blocked: blocking, reason: reason.trim() }));
      setOpen(false);
      setReason('');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.inlineActions}>
      <button type="button" className={`btn btn-secondary ${blocking ? styles.btnDanger : ''}`} onClick={() => setOpen(true)}>
        {blocking ? 'Block account' : 'Unblock account'}
      </button>
      <Confirm
        open={open}
        title={blocking ? `Block ${student.name}?` : `Unblock ${student.name}?`}
        confirmLabel={blocking ? 'Block' : 'Unblock'}
        danger={blocking}
        busy={busy}
        onClose={() => setOpen(false)}
        onConfirm={() => void run()}
      >
        <span>
          {blocking
            ? 'They are signed out everywhere on their next request and cannot sign in or buy. Purchases are kept.'
            : 'They can sign in and use their purchases again.'}
        </span>
        <label className={styles.field} htmlFor={`${id}-reason`}>
          <span>Reason</span>
          <input id={`${id}-reason`} className={styles.control} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error ? <Alert>{error}</Alert> : null}
      </Confirm>
    </div>
  );
}

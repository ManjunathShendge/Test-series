'use client';

import { errorKind } from '@/ui/errors/ErrorScreen';
import { useState, type FormEvent } from 'react';
import type { QcOverview, QcQueueItem, QcSettings, QcReviewer } from '@exam-prep/contracts';
import { adminQcApi } from '@/lib/api/qc';
import { Alert, Waiting } from '@/features/auth/ui';
import { QueueTable } from '@/features/review/ReviewViews';
import { formatWhen, messageOf, State, useLoad } from './ui';
import styles from './admin.module.css';

/**
 * PRD 8 "QC operations": reviewer list and exam mapping, queue by SLA with reassignment,
 * second reviews (spot checks) and duplicate thresholds. Every change is audited server-side.
 */
export function AdminQcView() {
  const { state, reload, set } = useLoad(() => adminQcApi.overview(), []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: () => Promise<QcOverview>) {
    setBusy(true);
    setError(null);
    try {
      set(await action());
      return true;
    } catch (caught) {
      setError(messageOf(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading') return <Waiting label="Loading QC operations…" />;
  if (state.status === 'error')
    return (
      <State kind={errorKind(state.error)} title="Could not load QC operations" action={<button type="button" className="btn btn-primary" onClick={() => void reload()}>Try again</button>}>
        {messageOf(state.error)}
      </State>
    );
  const data = state.data;
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>QC operations</h1>
          <p>
            Map reviewers to exams; new submissions go to the least busy mapped reviewer. The queue runs fast lane (Top tier)
            first, then flag count, then the 48-hour deadline.
          </p>
        </div>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <QueueSection queue={data.queue} reviewers={data.reviewers} busy={busy} act={act} />
      <ReviewersSection reviewers={data.reviewers} settings={data.settings} busy={busy} act={act} />
      <SpotCheckSection data={data} busy={busy} act={act} />
      <SettingsSection settings={data.settings} busy={busy} act={act} />
    </>
  );
}

type Act = (action: () => Promise<QcOverview>) => Promise<boolean>;

function QueueSection({ queue, reviewers, busy, act }: { queue: QcQueueItem[]; reviewers: QcReviewer[]; busy: boolean; act: Act }) {
  const [target, setTarget] = useState<QcQueueItem | null>(null);
  const [reviewerId, setReviewerId] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const unassigned = queue.filter((item) => !item.reviewerId).length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    if (!reviewerId) return setProblem('Choose a reviewer.');
    if (reason.trim().length < 3) return setProblem('Give a reason for the record.');
    setProblem(null);
    if (await act(() => adminQcApi.assign(target.reviewId, { reviewerId, reason: reason.trim() }))) {
      setTarget(null);
      setReason('');
    }
  }

  return (
    <section className={styles.card} aria-labelledby="queue-title">
      <div className={styles.cardHead}>
        <h2 id="queue-title">Review queue</h2>
        <span className={`${styles.badge} ${unassigned ? styles.badgeOff : styles.badgeOn}`}>{unassigned} unassigned</span>
      </div>
      {queue.length ? (
        <QueueTable
          items={queue}
          hrefFor={(item) => `/review/${item.reviewId}`}
          extra={(item) => (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setTarget(item);
                setReviewerId(item.reviewerId ?? '');
              }}
            >
              {item.reviewerId ? 'Reassign' : 'Assign'}
            </button>
          )}
        />
      ) : (
        <p className={styles.helper}>Nothing is waiting for review.</p>
      )}
      {target ? (
        <form className={styles.inline} onSubmit={(event) => void submit(event)} noValidate>
          <label className={styles.field}>
            <span>Reviewer for “{target.testTitle}”</span>
            <select className={styles.control} value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}>
              <option value="">Choose a reviewer</option>
              {reviewers
                .filter((reviewer) => !reviewer.isBlocked)
                .map((reviewer) => (
                  <option key={reviewer.id} value={reviewer.id}>
                    {reviewer.name} ({reviewer.openReviews} open)
                  </option>
                ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Reason</span>
            <input className={styles.control} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Save
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setTarget(null)}>
            Cancel
          </button>
          {problem ? <p className={styles.error}>{problem}</p> : null}
        </form>
      ) : null}
    </section>
  );
}

function ReviewersSection({ reviewers, settings, busy, act }: { reviewers: QcReviewer[]; settings: QcSettings[]; busy: boolean; act: Act }) {
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [examFor, setExamFor] = useState<Record<string, string>>({});

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setProblem('Enter the reviewer’s email address.');
    setProblem(null);
    if (await act(() => adminQcApi.addReviewer(email.trim().toLowerCase()))) setEmail('');
  }

  return (
    <section className={styles.card} aria-labelledby="reviewers-title">
      <h2 id="reviewers-title">Reviewers</h2>
      <form className={styles.inline} onSubmit={(event) => void add(event)} noValidate>
        <label className={styles.field}>
          <span>Add a reviewer by email (they must have signed in once)</span>
          <input className={styles.control} type="email" maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Add reviewer
        </button>
        {problem ? <p className={styles.error}>{problem}</p> : null}
      </form>
      {reviewers.length ? (
        <div className={styles.rows}>
          {reviewers.map((reviewer) => {
            const mapped = new Set(reviewer.exams.map((exam) => exam.examId));
            const choice = examFor[reviewer.id] ?? '';
            return (
              <div key={reviewer.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <strong>{reviewer.name}</strong>
                  <small>
                    {reviewer.email} · {reviewer.openReviews} open review{reviewer.openReviews === 1 ? '' : 's'}
                    {reviewer.isBlocked ? ' · blocked' : ''}
                  </small>
                  <div className={styles.inlineActions}>
                    {reviewer.exams.length ? (
                      reviewer.exams.map((exam) => (
                        <button
                          key={exam.mappingId}
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          aria-label={`Unmap ${exam.examName} from ${reviewer.name}`}
                          onClick={() => void act(() => adminQcApi.unmap(exam.mappingId))}
                        >
                          {exam.examName} ✕
                        </button>
                      ))
                    ) : (
                      <small>No exams mapped: no tests are routed to this reviewer.</small>
                    )}
                  </div>
                </div>
                <div className={styles.inline}>
                  <label className={styles.field}>
                    <span className={styles.srOnly}>Exam to map</span>
                    <select className={styles.control} value={choice} onChange={(event) => setExamFor({ ...examFor, [reviewer.id]: event.target.value })}>
                      <option value="">Map an exam…</option>
                      {settings
                        .filter((exam) => !mapped.has(exam.examId))
                        .map((exam) => (
                          <option key={exam.examId} value={exam.examId}>
                            {exam.examName}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button type="button" className="btn btn-secondary" disabled={busy || !choice} onClick={() => void act(() => adminQcApi.mapReviewer(reviewer.id, choice))}>
                    Map
                  </button>
                  <button
                    type="button"
                    className={`btn btn-ghost ${styles.btnDanger ?? ''}`}
                    disabled={busy}
                    onClick={() => void act(() => adminQcApi.removeReviewer(reviewer.id))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className={styles.helper}>No reviewers yet. Submitted tests wait unassigned until you add one.</p>
      )}
    </section>
  );
}

function SpotCheckSection({ data, busy, act }: { data: QcOverview; busy: boolean; act: Act }) {
  const [reviewerFor, setReviewerFor] = useState<Record<string, string>>({});
  const checked = data.approved.filter((item) => item.spotCheck !== 'none').length;
  const label = { none: 'Not checked', open: 'In second review', passed: 'Passed', failed: 'Failed' } as const;
  return (
    <section className={styles.card} aria-labelledby="spot-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="spot-title">Second reviews</h2>
          <p>Assign a second reviewer to about 10% of approved tests (PRD 5.3.7).</p>
        </div>
        <span className={`${styles.badge} ${styles.badgeDraft}`}>
          {checked} of {data.approved.length} checked
        </span>
      </div>
      {data.approved.length ? (
        <div className={styles.tableWrap} role="region" aria-label="Approved tests" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Test</th>
                <th scope="col">Published</th>
                <th scope="col">Second review</th>
                <th scope="col">
                  <span className={styles.srOnly}>Assign</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.approved.map((test) => (
                <tr key={test.testId}>
                  <td className={styles.wrap}>
                    <b>{test.title}</b>
                    <div className="t-small t-secondary">
                      {test.examName} · {test.examinerName}
                    </div>
                  </td>
                  <td>{test.publishedAt ? formatWhen(test.publishedAt) : '—'}</td>
                  <td>
                    <span className={`${styles.badge} ${test.spotCheck === 'failed' ? styles.badgeOff : test.spotCheck === 'passed' ? styles.badgeOn : styles.badgeDraft}`}>
                      {label[test.spotCheck]}
                    </span>
                  </td>
                  <td>
                    {test.spotCheck === 'open' ? null : (
                      <span className={styles.inlineActions}>
                        <select
                          className={styles.control}
                          aria-label={`Second reviewer for ${test.title}`}
                          value={reviewerFor[test.testId] ?? ''}
                          onChange={(event) => setReviewerFor({ ...reviewerFor, [test.testId]: event.target.value })}
                        >
                          <option value="">Reviewer…</option>
                          {data.reviewers
                            .filter((reviewer) => !reviewer.isBlocked)
                            .map((reviewer) => (
                              <option key={reviewer.id} value={reviewer.id}>
                                {reviewer.name}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy || !reviewerFor[test.testId]}
                          onClick={() => void act(() => adminQcApi.spotCheck({ testId: test.testId, reviewerId: reviewerFor[test.testId]! }))}
                        >
                          Assign
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.helper}>No approved tests yet.</p>
      )}
    </section>
  );
}

function SettingsSection({ settings, busy, act }: { settings: QcSettings[]; busy: boolean; act: Act }) {
  return (
    <section className={styles.card} aria-labelledby="settings-title">
      <h2 id="settings-title">Duplicate thresholds</h2>
      <p className={styles.helper}>
        Trigram similarity on the English stem, within the same exam: at or above “likely duplicate” and between the two is
        “similar”. Starting values are to be calibrated on about 200 labelled question pairs (PRD 5.2).
      </p>
      <div className={styles.rows}>
        {settings.map((exam) => (
          <SettingsRow key={`${exam.examId}-${exam.updatedAt}`} exam={exam} busy={busy} act={act} />
        ))}
      </div>
    </section>
  );
}

function SettingsRow({ exam, busy, act }: { exam: QcSettings; busy: boolean; act: Act }) {
  const [high, setHigh] = useState(String(exam.trigramHigh));
  const [mid, setMid] = useState(String(exam.trigramMid));
  const [pyq, setPyq] = useState(String(exam.pyqMaxPercentage));
  const [problem, setProblem] = useState<string | null>(null);
  const values = { trigramHigh: Number(high), trigramMid: Number(mid), pyqMaxPercentage: Number(pyq) };
  const dirty =
    values.trigramHigh !== exam.trigramHigh || values.trigramMid !== exam.trigramMid || values.pyqMaxPercentage !== exam.pyqMaxPercentage;

  function save() {
    const { trigramHigh, trigramMid, pyqMaxPercentage } = values;
    if (![trigramHigh, trigramMid].every((v) => Number.isFinite(v) && v >= 0.05 && v <= 1))
      return setProblem('Thresholds are between 0.05 and 1.');
    if (trigramMid >= trigramHigh) return setProblem('“Similar” must be below “likely duplicate”.');
    if (!Number.isFinite(pyqMaxPercentage) || pyqMaxPercentage < 0 || pyqMaxPercentage > 100)
      return setProblem('The PYQ cap is a percentage from 0 to 100.');
    setProblem(null);
    void act(() => adminQcApi.settings(exam.examId, { expectedUpdatedAt: exam.updatedAt, ...values }));
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <strong>{exam.examName}</strong>
        {problem ? <small className={styles.error}>{problem}</small> : null}
      </div>
      <div className={styles.inline}>
        <label className={styles.field}>
          <span>Likely duplicate</span>
          <input className={styles.control} inputMode="decimal" value={high} onChange={(event) => setHigh(event.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Similar</span>
          <input className={styles.control} inputMode="decimal" value={mid} onChange={(event) => setMid(event.target.value)} />
        </label>
        <label className={styles.field}>
          <span>PYQ cap in mocks (%)</span>
          <input className={styles.control} inputMode="decimal" value={pyq} onChange={(event) => setPyq(event.target.value)} />
        </label>
        <button type="button" className="btn btn-secondary" disabled={busy || !dirty} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

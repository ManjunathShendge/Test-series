'use client';

import { useState } from 'react';
import type { AdminExaminer, ExaminerAccountStatus, ExaminerTier, UpdateAdminExaminerRequest } from '@exam-prep/contracts';
import { adminQcApi } from '@/lib/api/qc';
import { Alert } from '@/features/auth/ui';
import { ExaminerApplicationsView } from './ExaminerApplicationsView';
import { Confirm, formatWhen, LoadGate, messageOf, useLoad } from './ui';
import styles from './admin.module.css';

const TIER: Record<ExaminerTier, string> = { new: 'New', verified: 'Verified', top: 'Top' };
const STATUS: Record<ExaminerAccountStatus, string> = { approved: 'Active', suspended: 'Suspended', banned: 'Banned' };

/** PRD 8 "Examiners": applications and samples, then approved examiners with KYC, tier and status. */
export function AdminExaminersPage() {
  const [tab, setTab] = useState<'examiners' | 'applications'>('examiners');
  return (
    <>
      <div className={styles.inlineActions} role="tablist" aria-label="Examiners">
        {(['examiners', 'applications'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`btn ${tab === value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(value)}
          >
            {value === 'examiners' ? 'Examiners' : 'Applications'}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === 'examiners' ? <AdminExaminersView /> : <ExaminerApplicationsView />}</div>
    </>
  );
}

function AdminExaminersView() {
  const { state, reload, set } = useLoad(() => adminQcApi.examiners(), []);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Examiners</h1>
          <p>
            Set the tier monthly from the quality inputs (PRD 5.5): it sets the price ceiling and the review lane. Mark KYC
            verified after checking the documents by eye. Suspended or banned examiners cannot author and their tests leave the
            website.
          </p>
        </div>
      </div>
      <LoadGate state={state} reload={() => void reload()} what="examiners">
        {(items) =>
          items.length ? (
            <div className={styles.rows}>
              {items.map((examiner) => (
                <ExaminerRow
                  key={examiner.id}
                  examiner={examiner}
                  onSaved={(saved) => set(items.map((item) => (item.id === saved.id ? saved : item)))}
                />
              ))}
            </div>
          ) : (
            <p className={styles.helper}>No approved examiners yet. Approve an application first.</p>
          )
        }
      </LoadGate>
    </>
  );
}

function ExaminerRow({ examiner, onSaved }: { examiner: AdminExaminer; onSaved: (examiner: AdminExaminer) => void }) {
  const [pending, setPending] = useState<Omit<UpdateAdminExaminerRequest, 'reason'> | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = examiner.quality;
  const needsReason = pending?.status !== undefined && pending.status !== 'approved';

  async function save() {
    if (!pending) return;
    if (needsReason && reason.trim().length < 3) return setError('Give a reason for suspending or banning.');
    setBusy(true);
    setError(null);
    try {
      onSaved(await adminQcApi.updateExaminer(examiner.id, { ...pending, reason: reason.trim() }));
      setPending(null);
      setReason('');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  const describe = (change: Omit<UpdateAdminExaminerRequest, 'reason'>) =>
    change.tier ? `Set the tier to ${TIER[change.tier]}` : change.status ? `${change.status === 'approved' ? 'Reactivate' : change.status === 'suspended' ? 'Suspend' : 'Ban'} this examiner` : 'Mark KYC as verified';

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <strong>
          {examiner.instituteName ?? examiner.name}{' '}
          <span className={`${styles.badge} ${examiner.status === 'approved' ? styles.badgeOn : styles.badgeOff}`}>{STATUS[examiner.status]}</span>
        </strong>
        <small>
          {examiner.email} · {examiner.examNames.join(', ') || 'no exams'} · {q.liveTests} live tests
        </small>
        <small>
          QC pass rate {q.qcPassRate === null ? '—' : `${q.qcPassRate}%`} of {q.reviewedQuestions} · duplicate rejects {q.duplicateRejects} · key
          corrections {q.keyCorrections} · report response {q.avgReportResponseHours === null ? '—' : `${q.avgReportResponseHours} h`} ·{' '}
          {q.openReports} open reports
        </small>
        <small>{examiner.kycVerifiedAt ? `KYC verified ${formatWhen(examiner.kycVerifiedAt)}` : 'KYC not verified'}</small>
        {error && !pending ? <Alert>{error}</Alert> : null}
      </div>
      <div className={styles.inline}>
        <label className={styles.field}>
          <span>Tier</span>
          <select
            className={styles.control}
            value={examiner.tier}
            disabled={busy}
            onChange={(event) => setPending({ tier: event.target.value as ExaminerTier })}
          >
            {(Object.keys(TIER) as ExaminerTier[]).map((tier) => (
              <option key={tier} value={tier}>
                {TIER[tier]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Status</span>
          <select
            className={styles.control}
            value={examiner.status}
            disabled={busy}
            onChange={(event) => setPending({ status: event.target.value as ExaminerAccountStatus })}
          >
            {(Object.keys(STATUS) as ExaminerAccountStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS[status]}
              </option>
            ))}
          </select>
        </label>
        {examiner.kycVerifiedAt ? null : (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setPending({ kycVerified: true })}>
            Mark KYC verified
          </button>
        )}
      </div>
      <Confirm
        open={pending !== null}
        title={pending ? `${describe(pending)}?` : ''}
        confirmLabel="Save"
        danger={needsReason}
        busy={busy}
        onClose={() => {
          setPending(null);
          setError(null);
        }}
        onConfirm={() => void save()}
      >
        <span>
          {examiner.name}. This is recorded in the audit log.
          {pending?.kycVerified ? ' Confirm you checked the PAN and bank proof by eye.' : ''}
        </span>
        <label className={styles.field}>
          <span>Reason{needsReason ? '' : ' (optional)'}</span>
          <input className={styles.control} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        {error ? <Alert>{error}</Alert> : null}
      </Confirm>
    </div>
  );
}

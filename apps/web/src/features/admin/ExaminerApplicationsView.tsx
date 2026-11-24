'use client';

import { useState } from 'react';
import type {
  ExaminerApplication,
  DecideExaminerApplicationRequest,
  ExaminerAuthoringOptions,
} from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { RichText } from '@/ui/patterns/RichText';
import { Alert } from '@/features/auth/ui';
import { Confirm, LoadGate, State, messageOf, useLoad } from './ui';
import styles from './admin.module.css';

/** Exam, subject and topic names by id, so reviewers never read raw UUIDs. */
type Names = Map<string, string>;
function namesOf(options: ExaminerAuthoringOptions): Names {
  const names: Names = new Map();
  for (const exam of options.exams) {
    names.set(exam.id, exam.name);
    for (const subject of exam.subjects) {
      names.set(subject.id, subject.name);
      for (const topic of subject.topics) names.set(topic.id, topic.name);
    }
  }
  return names;
}

export function ExaminerApplicationsView() {
  const { state, reload, set } = useLoad(async () => {
    const [items, options] = await Promise.all([
      adminApi.examinerApplications(),
      adminApi.examinerOptions(),
    ]);
    return { items, names: namesOf(options) };
  }, []);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Examiner applications</h1>
          <p>
            Review the applicant, agreement and ten pinned sample questions. Approval does not
            publish questions.
          </p>
        </div>
      </div>
      <LoadGate state={state} reload={() => void reload()} what="examiner applications">
        {({ items, names }) =>
          items.length ? (
            <div className={styles.card}>
              <div
                className={styles.tableWrap}
                role="region"
                aria-label="Examiner applications"
                tabIndex={0}
              >
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Applicant</th>
                      <th scope="col">Type</th>
                      <th scope="col">Status</th>
                      <th scope="col">Agreement</th>
                      <th scope="col">Samples</th>
                      <th scope="col">
                        <span className={styles.srOnly}>Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((application) => (
                      <ApplicationRow
                        key={application.id}
                        application={application}
                        names={names}
                        onChange={(next) =>
                          set({
                            items: items.map((item) => (item.id === next.id ? next : item)),
                            names,
                          })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <State title="No examiner applications">
              Applications submitted by examiner accounts will appear here.
            </State>
          )
        }
      </LoadGate>
    </>
  );
}

function ApplicationRow({
  application,
  names,
  onChange,
}: {
  application: ExaminerApplication;
  names: Names;
  onChange: (application: ExaminerApplication) => void;
}) {
  const name = (id: string) => names.get(id) ?? id;
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function decide() {
    setBusy(true);
    setError(null);
    try {
      const body: DecideExaminerApplicationRequest =
        decision === 'rejected'
          ? { status: 'rejected', rejectionReason: reason }
          : { status: 'approved' };
      onChange(await adminApi.decideExaminerApplication(application.id, body));
      setDecision(null);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr>
        <td>
          <b>{application.examinerName}</b>
          <div className="t-small t-secondary">
            {application.examinerEmail ?? 'Email unavailable'}
          </div>
          <div className="t-small">{application.bio}</div>
        </td>
        <td>
          {application.accountType === 'institute'
            ? (application.instituteName ?? 'Institute')
            : 'Individual'}
        </td>
        <td>
          <span
            className={
              application.status === 'approved'
                ? styles.badgeOn
                : application.status === 'rejected'
                  ? styles.badgeOff
                  : styles.badgeDraft
            }
          >
            {application.status}
          </span>
        </td>
        <td>
          {application.agreementVersion ?? 'Missing'}
          <div className="t-small t-secondary">
            {application.agreementAcceptedAt ? 'Accepted' : 'Not accepted'}
          </div>
        </td>
        <td>{application.samples.length} / 10</td>
        <td>
          {application.status === 'pending' ? (
            <div className={styles.inlineActions}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setDecision('approved')}
              >
                Approve
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setDecision('rejected')}
              >
                Reject
              </button>
            </div>
          ) : (
            (application.rejectionReason ?? 'Reviewed')
          )}
        </td>
      </tr>
      <tr>
        <td colSpan={6}>
          <details>
            <summary>Review {application.samples.length} sample questions and attachments</summary>
            <p>
              <b>Experience:</b> {application.experienceYears ?? 'Not provided'} years ·{' '}
              <b>Exams:</b> {application.examIds.map(name).join(', ')} · <b>Subjects:</b>{' '}
              {application.subjectIds.map(name).join(', ')}
            </p>
            <section aria-label="KYC documents">
              <h3>KYC documents</h3>
              {(
                [
                  ['Photo', application.photoAssetId],
                  ['PAN', application.panDocAssetId],
                  ['Bank proof', application.bankProofAssetId],
                  ['Business proof', application.businessProofAssetId],
                ] as const
              ).map(([label, assetId]) => (
                <KycDocument
                  key={label}
                  applicationId={application.id}
                  label={label}
                  assetId={assetId}
                />
              ))}
            </section>
            <p className="t-small t-secondary">
              A clean malware scan does not mean KYC is verified. Record no verification decision
              here until the owner/legal KYC policy is approved.
            </p>
            {application.samples.map((sample) => (
              <article key={sample.position} className={styles.card}>
                <h3>
                  Sample {sample.position} · {sample.difficulty}
                </h3>
                <RichText text={sample.stemEn} lang="en" />
                {sample.stemHi ? <RichText text={sample.stemHi} lang="hi" /> : null}
                <ol type="A">
                  {sample.options.map((option) => (
                    <li key={option.id}>
                      <RichText text={option.textEn} lang="en" />
                      {option.textHi ? <RichText text={option.textHi} lang="hi" /> : null}
                    </li>
                  ))}
                </ol>
                <p>
                  <b>Key:</b> {sample.correctOption}
                </p>
                <b>Solution</b>
                <RichText text={sample.solutionEn} lang="en" />
                {sample.solutionHi ? <RichText text={sample.solutionHi} lang="hi" /> : null}
                <p className="t-small t-secondary">
                  {name(sample.examId)} · {name(sample.subjectId)} · {name(sample.topicId)}
                </p>
              </article>
            ))}
          </details>
        </td>
      </tr>
      {error ? (
        <tr>
          <td colSpan={6}>
            <Alert>{messageOf(error)}</Alert>
          </td>
        </tr>
      ) : null}
      <Confirm
        open={decision !== null}
        title={
          decision === 'rejected' ? 'Reject examiner application?' : 'Approve examiner application?'
        }
        confirmLabel={decision === 'rejected' ? 'Reject' : 'Approve'}
        danger={decision === 'rejected'}
        busy={busy}
        onClose={() => setDecision(null)}
        onConfirm={() => void decide()}
      >
        {decision === 'rejected' ? (
          <label className={styles.field}>
            <span>Rejection reason</span>
            <textarea
              className={styles.control}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
              rows={4}
            />
          </label>
        ) : (
          <p>
            The applicant will receive examiner access. Sample question approval is separate; none
            will be published.
          </p>
        )}
      </Confirm>
    </>
  );
}

function KycDocument({
  applicationId,
  label,
  assetId,
}: {
  applicationId: string;
  label: string;
  assetId: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function createDownloadUrl() {
    if (!assetId) return;
    setBusy(true);
    setError(null);
    setUrl(null);
    try {
      const result = await adminApi.examinerKycDownloadUrl(applicationId, assetId);
      setUrl(result.url);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <p>
      <b>{label}:</b>{' '}
      {!assetId ? (
        'not supplied'
      ) : url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          Download scanned document
        </a>
      ) : (
        <button
          className="btn btn-secondary"
          type="button"
          disabled={busy}
          onClick={() => void createDownloadUrl()}
        >
          {busy ? 'Checking...' : 'Request secure download'}
        </button>
      )}
      {error ? <Alert>{messageOf(error)}</Alert> : null}
    </p>
  );
}

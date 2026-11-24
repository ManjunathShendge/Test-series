'use client';

import { errorKind } from '@/ui/errors/ErrorScreen';
import Link from 'next/link';
import { useState } from 'react';
import {
  MATCH_LABELS,
  QC_CHECKLIST_LABELS,
  QC_REASON_LABELS,
  QcReasonCode,
  REPORT_REASON_LABELS,
  type QcAction,
  type QcChecklist,
  type QcQueueItem,
  type QcReviewDetail,
  type QcReviewQuestion,
  type QuestionReport,
} from '@exam-prep/contracts';
import { qcApi } from '@/lib/api/qc';
import { Alert, Waiting } from '@/features/auth/ui';
import { Confirm, formatWhen, isCode, messageOf, State, useLoad } from '@/features/admin/ui';
import admin from '@/features/admin/admin.module.css';
import { ImageList } from '@/features/examiner/ImageList';
import { RichText } from '@/ui/patterns/RichText';
import styles from './review.module.css';

const TIER = { new: 'New', verified: 'Verified', top: 'Top' } as const;
const ACTION_LABEL: Record<string, string> = {
  pending: 'Not decided',
  approve: 'Approved',
  minor_edit: 'Approved with edit',
  request_change: 'Change requested',
  reject: 'Rejected',
};
const EMPTY_CHECKLIST: QcChecklist = {
  keyMatchesSolution: false,
  singleDefensibleOption: false,
  bilingualMatch: false,
  inSyllabus: false,
  noWatermarks: false,
};

function Head({ title, lead, action }: { title: string; lead?: string; action?: React.ReactNode }) {
  return (
    <div className={admin.pageHead}>
      <div>
        <h1>{title}</h1>
        {lead ? <p>{lead}</p> : null}
      </div>
      {action}
    </div>
  );
}

function Sla({ deadline }: { deadline: string }) {
  const late = new Date(deadline).getTime() < Date.now();
  return (
    <span className={`${admin.badge} ${late ? admin.badgeOff : admin.badgeDraft}`}>
      {late ? 'Past SLA' : `Due ${formatWhen(deadline)}`}
    </span>
  );
}

/** Review queue table, shared with the admin QC console. */
export function QueueTable({
  items,
  hrefFor,
  extra,
}: {
  items: QcQueueItem[];
  hrefFor?: (item: QcQueueItem) => string;
  extra?: (item: QcQueueItem) => React.ReactNode;
}) {
  return (
    <div className={admin.tableWrap} role="region" aria-label="Review queue" tabIndex={0}>
      <table className={admin.table}>
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th scope="col">Examiner</th>
            <th scope="col">Flags</th>
            <th scope="col">Decided</th>
            <th scope="col">SLA</th>
            <th scope="col">
              <span className={admin.srOnly}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.reviewId}>
              <td className={admin.wrap}>
                <b>{item.testTitle}</b>
                <div className="t-small t-secondary">
                  {item.examName}
                  {item.isSecondReview ? ' · second review' : ''}
                  {item.reviewerName ? ` · ${item.reviewerName}` : ' · unassigned'}
                </div>
              </td>
              <td>
                {item.examinerName}
                <div className="t-small t-secondary">
                  {TIER[item.examinerTier]}
                  {item.fastLane ? ' · fast lane' : ''}
                </div>
              </td>
              <td>{item.flagCount}</td>
              <td>
                {item.decidedCount} / {item.questionCount}
              </td>
              <td>
                <Sla deadline={item.slaDeadlineAt} />
              </td>
              <td>
                <span className={admin.inlineActions}>
                  {hrefFor ? (
                    <Link className="btn btn-secondary" href={hrefFor(item)}>
                      Open
                    </Link>
                  ) : null}
                  {extra?.(item)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReviewQueueView() {
  const { state, reload } = useLoad(() => qcApi.queue(), []);
  return (
    <div className={styles.stack}>
      <Head
        title="Review queue"
        lead="Tests assigned to you. Top tier examiners come first, then the most flags, then the nearest deadline (48 hours from submission)."
      />
      {state.status === 'loading' ? <Waiting label="Loading your queue…" /> : null}
      {state.status === 'error' ? (
        <State kind={errorKind(state.error)} title="Could not load the queue" action={<button type="button" className="btn btn-primary" onClick={() => void reload()}>Try again</button>}>
          {messageOf(state.error)}
        </State>
      ) : null}
      {state.status === 'ready' ? (
        state.data.length ? (
          <section className={admin.card}>
            <QueueTable items={state.data} hrefFor={(item) => `/review/${item.reviewId}`} />
          </section>
        ) : (
          <State title="Nothing to review">New submissions for your exams are assigned to you automatically.</State>
        )
      ) : null}
    </div>
  );
}

// One review ---------------------------------------------------------------------------------

export function ReviewView({ id }: { id: string }) {
  const { state, reload, set } = useLoad(() => qcApi.review(id), [id]);
  const [onlyOpen, setOnlyOpen] = useState(false);

  if (state.status === 'loading') return <Waiting label="Loading the review…" />;
  if (state.status === 'error')
    return (
      <State kind={errorKind(state.error)}
        title={isCode(state.error, 'NOT_FOUND') ? 'Review not found' : 'Could not load the review'}
        action={
          <Link className="btn btn-secondary" href="/review">
            Back to the queue
          </Link>
        }
      >
        {isCode(state.error, 'NOT_FOUND') ? 'It may be assigned to someone else or finished.' : messageOf(state.error)}
      </State>
    );

  const detail = state.data;
  const { review } = detail;
  const open = review.completedAt === null;
  const shown = onlyOpen
    ? detail.questions.filter((item) => item.action === 'pending' || item.completenessError || item.match)
    : detail.questions;
  const offTarget = detail.patternFit.filter((row) => row.target !== null && row.target !== row.actual);

  return (
    <div className={styles.stack}>
      <p className={admin.crumbs}>
        <Link href="/review">Review queue</Link> / {review.testTitle}
      </p>
      <Head
        title={review.testTitle}
        action={open ? <Sla deadline={review.slaDeadlineAt} /> : <span className={`${admin.badge} ${admin.badgeOn}`}>Finished</span>}
      />
      <div className={styles.meta}>
        <span>{review.examName}</span>
        <span>
          {review.examinerName} ({TIER[review.examinerTier]} tier{review.fastLane ? ', fast lane' : ''})
        </span>
        <span>{review.testType}</span>
        <span>{review.hasHindi ? 'English and Hindi' : 'English only'}</span>
        <span>PYQ share {review.pyqPercentage}%</span>
        <span>{review.flagCount} automated flags</span>
        <span>
          {review.decidedCount} of {review.questionCount} decided
        </span>
      </div>

      {review.isSecondReview ? (
        <SpotCheckForm review={detail} onDone={() => void reload()} />
      ) : null}

      {offTarget.length ? (
        <section className={admin.card} aria-labelledby="fit-title">
          <h2 id="fit-title">Topic mix against the pattern</h2>
          <p className={admin.helper}>A warning, never a block (PRD 5.2 check 8).</p>
          <div className={admin.tableWrap} role="region" aria-label="Topic mix" tabIndex={0}>
            <table className={admin.table}>
              <thead>
                <tr>
                  <th scope="col">Section</th>
                  <th scope="col">Topic</th>
                  <th scope="col">Target</th>
                  <th scope="col">Placed</th>
                </tr>
              </thead>
              <tbody>
                {offTarget.map((row) => (
                  <tr key={`${row.sectionName}-${row.topicName}`}>
                    <td>{row.sectionName}</td>
                    <td>{row.topicName}</td>
                    <td>{row.target}</td>
                    <td>{row.actual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <label className={admin.check}>
        <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} />
        <span>Show only flagged or undecided questions</span>
      </label>

      {shown.map((question) => (
        <QuestionCard
          key={question.itemId}
          reviewId={id}
          question={question}
          hasHindi={review.hasHindi}
          editable={open && !review.isSecondReview && !question.carriedOver}
          onSaved={set}
        />
      ))}

      {open && !review.isSecondReview ? <FinishPanel detail={detail} onDone={() => void reload()} /> : null}
    </div>
  );
}

function QuestionCard({
  reviewId,
  question,
  hasHindi,
  editable,
  onSaved,
}: {
  reviewId: string;
  question: QcReviewQuestion;
  hasHindi: boolean;
  editable: boolean;
  onSaved: (detail: QcReviewDetail) => void;
}) {
  const [checklist, setChecklist] = useState<QcChecklist>(
    question.checklist ?? { ...EMPTY_CHECKLIST, bilingualMatch: !hasHindi },
  );
  const [reason, setReason] = useState<string>(question.reasonCode ?? '');
  const [comment, setComment] = useState(question.comment ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<QcAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function decide(action: QcAction) {
    const found: Record<string, string> = {};
    if (action === 'approve' && !Object.values(checklist).every(Boolean)) found['checklist'] = 'Confirm every checklist item to approve.';
    if (action !== 'approve' && !reason) found['reason'] = 'Choose a reason.';
    if (action !== 'approve' && comment.trim().length < 3) found['comment'] = 'Tell the examiner what to fix.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(action);
    setError(null);
    try {
      onSaved(
        await qcApi.decide(reviewId, question.itemId, {
          action,
          reasonCode: action === 'approve' ? null : QcReasonCode.parse(reason),
          comment: comment.trim(),
          checklist,
        }),
      );
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className={`${admin.card} ${styles.question}`} data-state={question.action} aria-labelledby={`q-${question.itemId}`}>
      <div className={admin.cardHead}>
        <div>
          <h2 id={`q-${question.itemId}`}>
            {question.sectionName} · question {question.position}
          </h2>
          <p className={admin.helper}>
            {question.subjectName} · {question.topicName} · {question.difficulty} · version {question.versionNumber}
            {question.editedFromVersion !== null ? ` (your edit of version ${question.editedFromVersion})` : ''}
            {question.isPyq ? ` · PYQ ${question.pyqYear ?? 'year missing'}` : ''}
          </p>
        </div>
        <div className={styles.flags}>
          {question.completenessError ? <span className={`${admin.badge} ${admin.badgeOff}`}>Hindi missing</span> : null}
          {question.match ? <span className={`${admin.badge} ${admin.badgeOff}`}>{MATCH_LABELS[question.match.kind]}</span> : null}
          <span className={`${admin.badge} ${question.action === 'approve' ? admin.badgeOn : question.action === 'pending' ? admin.badgeDraft : admin.badgeOff}`}>
            {question.carriedOver ? 'Approved earlier' : ACTION_LABEL[question.action]}
          </span>
        </div>
      </div>

      <RichText text={question.stemEn} lang="en" />
      {question.stemHi ? <RichText text={question.stemHi} lang="hi" /> : null}
      <ImageList ids={question.imageAssetIds} load={(assetId) => qcApi.image(reviewId, assetId)} />
      <ol className={styles.options}>
        {question.options.map((option) => (
          <li key={option.id} data-key={option.id === question.correctOption ? 'true' : undefined}>
            <span className={styles.optionId}>
              {option.id}
              {option.id === question.correctOption ? ' ✓' : ''}
            </span>
            <div>
              <RichText text={option.textEn} lang="en" />
              {option.textHi ? <RichText text={option.textHi} lang="hi" /> : null}
            </div>
          </li>
        ))}
      </ol>
      <div className={styles.solution}>
        <b>Solution (key {question.correctOption})</b>
        <RichText text={question.solutionEn} lang="en" />
        {question.solutionHi ? <RichText text={question.solutionHi} lang="hi" /> : null}
      </div>

      {question.match ? (
        <div className={styles.compare}>
          <p>
            <b>{MATCH_LABELS[question.match.kind]}</b>
            {question.match.similarity !== null ? ` · similarity ${Math.round(question.match.similarity * 100)}%` : ''}
            {' · '}
            {question.match.sameExaminer ? 'same examiner' : `by ${question.match.matchedExaminerName ?? 'another examiner'}`}
            {question.match.matchedIsPyq ? ' · previous year question' : ''}
          </p>
          <div>
            <b>This question</b>
            <RichText text={question.stemEn} lang="en" />
          </div>
          <div>
            <b>Approved question it matches</b>
            <RichText text={question.match.matchedStemEn} lang="en" />
          </div>
        </div>
      ) : null}

      {question.comment && !editable ? (
        <p>
          <b>Reviewer note:</b> {question.reasonCode ? `${QC_REASON_LABELS[question.reasonCode]} · ` : ''}
          {question.comment}
        </p>
      ) : null}

      {editable ? (
        <div className={styles.decision}>
          {error ? <Alert>{error}</Alert> : null}
          <fieldset className={styles.checklist}>
            <legend>Manual checklist</legend>
            {(Object.keys(QC_CHECKLIST_LABELS) as (keyof QcChecklist)[]).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={checklist[key]}
                  onChange={(event) => setChecklist({ ...checklist, [key]: event.target.checked })}
                />
                <span>{QC_CHECKLIST_LABELS[key]}</span>
              </label>
            ))}
            {errors['checklist'] ? <p className={styles.error}>{errors['checklist']}</p> : null}
          </fieldset>
          <div className={`${admin.formGrid} ${admin.formGrid2}`}>
            <label className={admin.field}>
              <span>Reason (for change or reject)</span>
              <select className={admin.control} value={reason} onChange={(event) => setReason(event.target.value)}>
                <option value="">Choose a reason</option>
                {QcReasonCode.options.map((code) => (
                  <option key={code} value={code}>
                    {QC_REASON_LABELS[code]}
                  </option>
                ))}
              </select>
              {errors['reason'] ? <p className={styles.error}>{errors['reason']}</p> : null}
            </label>
            <label className={admin.field}>
              <span>Comment to the examiner</span>
              <textarea className={admin.control} rows={2} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} />
              {errors['comment'] ? <p className={styles.error}>{errors['comment']}</p> : null}
            </label>
          </div>
          <div className={admin.actions}>
            <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void decide('approve')}>
              {busy === 'approve' ? 'Saving…' : 'Approve'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void decide('request_change')}>
              {busy === 'request_change' ? 'Saving…' : 'Request change'}
            </button>
            <button type="button" className={`btn btn-secondary ${admin.btnDanger ?? ''}`} disabled={busy !== null} onClick={() => void decide('reject')}>
              {busy === 'reject' ? 'Saving…' : 'Reject'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy !== null} aria-expanded={editing} onClick={() => setEditing(!editing)}>
              {editing ? 'Close the edit' : 'Minor edit'}
            </button>
          </div>
          {editing ? (
            <MinorEditForm
              reviewId={reviewId}
              question={question}
              hasHindi={hasHindi}
              checklist={checklist}
              onSaved={(detail) => {
                setEditing(false);
                onSaved(detail);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

const KEYS = ['A', 'B', 'C', 'D'] as const;

/**
 * PRD 5.3.4 minor edit: the reviewer fixes wording, an option, the key or the solution. The edit
 * becomes a new version of the question in this test and counts as approved when the review is
 * finished. The server re-runs content, bilingual and copy checks.
 */
function MinorEditForm({
  reviewId,
  question,
  hasHindi,
  checklist,
  onSaved,
}: {
  reviewId: string;
  question: QcReviewQuestion;
  hasHindi: boolean;
  checklist: QcChecklist;
  onSaved: (detail: QcReviewDetail) => void;
}) {
  const [stemEn, setStemEn] = useState(question.stemEn);
  const [stemHi, setStemHi] = useState(question.stemHi ?? '');
  const [options, setOptions] = useState(question.options.map((o) => ({ id: o.id as (typeof KEYS)[number], textEn: o.textEn, textHi: o.textHi ?? '' })));
  const [key, setKey] = useState(question.correctOption as (typeof KEYS)[number]);
  const [solutionEn, setSolutionEn] = useState(question.solutionEn);
  const [solutionHi, setSolutionHi] = useState(question.solutionHi ?? '');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed =
    stemEn !== question.stemEn ||
    stemHi !== (question.stemHi ?? '') ||
    key !== question.correctOption ||
    solutionEn !== question.solutionEn ||
    solutionHi !== (question.solutionHi ?? '') ||
    options.some((o, i) => o.textEn !== question.options[i]?.textEn || o.textHi !== (question.options[i]?.textHi ?? ''));

  async function save() {
    setError(null);
    if (!changed) return setError('Nothing has changed yet. Edit the question, then save.');
    if (!Object.values(checklist).every(Boolean)) return setError('Confirm every checklist item above for the edited question.');
    if (!stemEn.trim() || !solutionEn.trim() || options.some((o) => !o.textEn.trim()))
      return setError('The question, every option and the solution need English text.');
    if (hasHindi && (!stemHi.trim() || !solutionHi.trim() || options.some((o) => !o.textHi.trim())))
      return setError('This test is bilingual: keep the Hindi for the question, every option and the solution.');
    if (comment.trim().length < 3) return setError('Say what you changed; the examiner sees this note.');
    setBusy(true);
    try {
      onSaved(
        await qcApi.minorEdit(reviewId, question.itemId, {
          stemEn: stemEn.trim(),
          stemHi: stemHi.trim() || null,
          options: options.map((o) => ({ id: o.id, textEn: o.textEn.trim(), ...(o.textHi.trim() ? { textHi: o.textHi.trim() } : {}) })),
          correctOption: key,
          solutionEn: solutionEn.trim(),
          solutionHi: solutionHi.trim() || null,
          comment: comment.trim(),
          checklist,
        }),
      );
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  const area = (label: string, value: string, set: (v: string) => void, lang: 'en' | 'hi', rows = 3) => (
    <label className={admin.field}>
      <span>{label}</span>
      <textarea className={admin.control} lang={lang} rows={rows} maxLength={20000} value={value} onChange={(event) => set(event.target.value)} />
    </label>
  );

  return (
    <fieldset className={styles.checklist}>
      <legend>Minor edit</legend>
      <p className={admin.helper}>
        For small fixes only. The examiner&rsquo;s original stays on record; your version is used in this test and is approved when you
        finish the review. Larger problems: request a change instead.
      </p>
      <div className={`${admin.formGrid} ${hasHindi ? admin.formGrid2 : ''}`}>
        {area('Question (English)', stemEn, setStemEn, 'en', 4)}
        {hasHindi ? area('Question (Hindi)', stemHi, setStemHi, 'hi', 4) : null}
        {options.map((o, i) => (
          <div key={o.id} className={hasHindi ? admin.span2 : undefined}>
            <div className={`${admin.formGrid} ${hasHindi ? admin.formGrid2 : ''}`}>
              {area(`Option ${o.id} (English)`, o.textEn, (v) => setOptions(options.map((x, j) => (j === i ? { ...x, textEn: v } : x))), 'en', 1)}
              {hasHindi
                ? area(`Option ${o.id} (Hindi)`, o.textHi, (v) => setOptions(options.map((x, j) => (j === i ? { ...x, textHi: v } : x))), 'hi', 1)
                : null}
            </div>
          </div>
        ))}
        <label className={admin.field}>
          <span>Correct option</span>
          <select className={admin.control} value={key} onChange={(event) => setKey(event.target.value as typeof key)}>
            {KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        {hasHindi ? <span /> : null}
        {area('Solution (English)', solutionEn, setSolutionEn, 'en', 4)}
        {hasHindi ? area('Solution (Hindi)', solutionHi, setSolutionHi, 'hi', 4) : null}
        <label className={`${admin.field} ${admin.span2}`}>
          <span>What you changed (shown to the examiner)</span>
          <textarea className={admin.control} rows={2} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} />
        </label>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <div className={admin.actions}>
        <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save the edit and approve'}
        </button>
      </div>
    </fieldset>
  );
}

function FinishPanel({ detail, onDone }: { detail: QcReviewDetail; onDone: () => void }) {
  const [comments, setComments] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const pending = detail.questions.filter((item) => item.action === 'pending').length;
  const flagged = detail.questions.filter((item) => item.action === 'request_change' || item.action === 'reject').length;

  if (result)
    return (
      <section className={admin.card} role="status">
        <b>{result === 'live' ? 'Approved. The test is now live.' : 'Returned to the examiner with the flagged questions unlocked.'}</b>
        <div className={admin.actions}>
          <Link className="btn btn-primary" href="/review">
            Back to the queue
          </Link>
        </div>
      </section>
    );

  return (
    <section className={`${admin.card} ${styles.sticky}`} aria-labelledby="finish-title">
      <h2 id="finish-title">Finish the review</h2>
      <p className={admin.helper}>
        {pending
          ? `${pending} question${pending === 1 ? '' : 's'} still need a decision.`
          : flagged
            ? `${flagged} question${flagged === 1 ? '' : 's'} flagged: the test returns to the examiner. Approved questions stay locked.`
            : 'Every question is approved: the test goes live when you finish.'}
      </p>
      {error ? <Alert>{error}</Alert> : null}
      <label className={admin.field}>
        <span>Overall comments (optional)</span>
        <textarea className={admin.control} rows={2} maxLength={2000} value={comments} onChange={(event) => setComments(event.target.value)} />
      </label>
      <div className={admin.actions}>
        <button type="button" className="btn btn-primary" disabled={pending > 0 || busy} onClick={() => setConfirm(true)}>
          Finish review
        </button>
      </div>
      <Confirm
        open={confirm}
        title={flagged ? 'Return the test to the examiner?' : 'Approve and publish the test?'}
        confirmLabel={flagged ? 'Return to examiner' : 'Approve and publish'}
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          setError(null);
          try {
            const outcome = await qcApi.finish(detail.review.reviewId, comments.trim());
            setResult(outcome.status);
            setConfirm(false);
            onDone();
          } catch (caught) {
            setError(messageOf(caught));
            setConfirm(false);
          } finally {
            setBusy(false);
          }
        }}
      >
        {flagged
          ? 'The examiner sees your reason and comment on each flagged question and can resubmit.'
          : 'Every question joins the approved bank and the test goes on sale now.'}
      </Confirm>
    </section>
  );
}

function SpotCheckForm({ review, onDone }: { review: QcReviewDetail; onDone: () => void }) {
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (review.review.completedAt)
    return (
      <section className={admin.card} role="status">
        <b>Second review recorded: {review.review.status === 'approved' ? 'passed' : 'failed'}.</b>
        {review.review.overallComments ? <p>{review.review.overallComments}</p> : null}
      </section>
    );

  async function record(passed: boolean) {
    if (!passed && comments.trim().length < 3) return setError('Say what the second review found.');
    setBusy(true);
    setError(null);
    try {
      await qcApi.spotCheck(review.review.reviewId, { passed, comments: comments.trim() });
      onDone();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={admin.card} aria-labelledby="spot-title">
      <h2 id="spot-title">Second review</h2>
      <p className={admin.helper}>
        This test is already approved and live. Read the questions below and record whether the first review holds. A failed
        second review is passed to the admin team; it does not unpublish the test by itself.
      </p>
      {error ? <Alert>{error}</Alert> : null}
      <label className={admin.field}>
        <span>Findings</span>
        <textarea className={admin.control} rows={3} maxLength={2000} value={comments} onChange={(event) => setComments(event.target.value)} />
      </label>
      <div className={admin.actions}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void record(true)}>
          Passes
        </button>
        <button type="button" className={`btn btn-secondary ${admin.btnDanger ?? ''}`} disabled={busy} onClick={() => void record(false)}>
          Does not pass
        </button>
      </div>
    </section>
  );
}

// Student reports (reviewer and admin Support) ---------------------------------------------------

export function ReportQueueView({ title, lead }: { title: string; lead: string }) {
  const { state, reload, set } = useLoad(() => qcApi.reports(), []);
  return (
    <div className={styles.stack}>
      <Head title={title} lead={lead} />
      {state.status === 'loading' ? <Waiting label="Loading reports…" /> : null}
      {state.status === 'error' ? (
        <State kind={errorKind(state.error)} title="Could not load reports" action={<button type="button" className="btn btn-primary" onClick={() => void reload()}>Try again</button>}>
          {messageOf(state.error)}
        </State>
      ) : null}
      {state.status === 'ready' ? (
        state.data.length ? (
          state.data.map((report) => <ReportResolveCard key={report.id} report={report} onResolved={set} />)
        ) : (
          <State title="No open reports">Reports from students on live questions appear here.</State>
        )
      ) : null}
    </div>
  );
}

function ReportResolveCard({ report, onResolved }: { report: QuestionReport; onResolved: (items: QuestionReport[]) => void }) {
  const [resolution, setResolution] = useState<'resolved_no_change' | 'dismissed'>('resolved_no_change');
  const [notes, setNotes] = useState('');
  const [unhide, setUnhide] = useState(report.questionHidden);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    if (notes.trim().length < 3) return setError('Add a short note for the record.');
    setBusy(true);
    setError(null);
    try {
      onResolved(await qcApi.resolve(report.id, { resolution, notes: notes.trim(), unhideQuestion: unhide }));
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  }

  return (
    <section className={admin.card} aria-label={`Report on ${report.testTitle}`}>
      <div className={admin.cardHead}>
        <div>
          <b>{REPORT_REASON_LABELS[report.reason]}</b>
          <p className={admin.helper}>
            {report.testTitle} · {report.examinerName ?? 'examiner'} · {report.openReportCount} student
            {report.openReportCount === 1 ? '' : 's'} reported · {formatWhen(report.createdAt)}
          </p>
        </div>
        {report.questionHidden ? <span className={`${admin.badge} ${admin.badgeOff}`}>Hidden from new attempts</span> : null}
      </div>
      <RichText text={report.stemEn} lang="en" />
      {report.question ? (
        <ol className={styles.options}>
          {report.question.options.map((option) => (
            <li key={option.id} data-key={option.id === report.question?.correctOption ? 'true' : undefined}>
              <span className={styles.optionId}>
                {option.id}
                {option.id === report.question?.correctOption ? ' ✓' : ''}
              </span>
              <div>
                <RichText text={option.textEn} lang="en" />
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {report.correctedTo ? (
        <p className={admin.helper}>The key of this question was already corrected to {report.correctedTo}.</p>
      ) : null}
      {report.studentComment ? <p>Student: “{report.studentComment}”</p> : null}
      <p>{report.examinerResponse ? `Examiner: ${report.examinerResponse}` : 'The examiner has not answered yet.'}</p>
      {error ? <Alert>{error}</Alert> : null}
      <div className={`${admin.formGrid} ${admin.formGrid2}`}>
        <label className={admin.field}>
          <span>Outcome</span>
          <select className={admin.control} value={resolution} onChange={(event) => setResolution(event.target.value as typeof resolution)}>
            <option value="resolved_no_change">Checked: no change needed</option>
            <option value="dismissed">Dismiss the report</option>
          </select>
          <span className={admin.helper}>If the key is wrong, use “Correct the answer key” below instead.</span>
        </label>
        <label className={admin.field}>
          <span>Notes</span>
          <textarea className={admin.control} rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </div>
      {report.questionHidden ? (
        <label className={admin.check}>
          <input type="checkbox" checked={unhide} onChange={(event) => setUnhide(event.target.checked)} />
          <span>Show the question to new attempts again</span>
        </label>
      ) : null}
      <div className={admin.actions}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void resolve()}>
          {busy ? 'Saving…' : 'Resolve all reports on this question'}
        </button>
      </div>
      {report.question ? <CorrectKey report={report} onDone={onResolved} /> : null}
    </section>
  );
}

/**
 * PRD 5.4: a confirmed wrong key becomes a corrected version of the question. Every finished
 * attempt is re-scored, ranks are rebuilt, affected students are notified and all reports on the
 * question are closed. New attempts get the corrected version.
 */
function CorrectKey({ report, onDone }: { report: QuestionReport; onDone: (items: QuestionReport[]) => void }) {
  const question = report.question!;
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<(typeof KEYS)[number]>(KEYS.find((k) => k !== question.correctOption) ?? 'A');
  const [solutionEn, setSolutionEn] = useState(question.solutionEn);
  const [solutionHi, setSolutionHi] = useState(question.solutionHi ?? '');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function check() {
    setError(null);
    if (key === question.correctOption) return setError(`The key is already ${key}.`);
    if (!solutionEn.trim()) return setError('Update the solution to explain the correct answer.');
    if (question.solutionHi && !solutionHi.trim()) return setError('Keep the Hindi solution for this bilingual question.');
    if (reason.trim().length < 3) return setError('Give the reason for the correction.');
    setConfirm(true);
  }
  async function run() {
    setBusy(true);
    setError(null);
    try {
      onDone(
        await qcApi.correctKey(report.id, {
          correctOption: key,
          solutionEn: solutionEn.trim(),
          solutionHi: solutionHi.trim() || null,
          reason: reason.trim(),
        }),
      );
    } catch (caught) {
      setError(messageOf(caught));
      setConfirm(false);
      setBusy(false);
    }
  }

  if (!open)
    return (
      <div className={admin.actions}>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          Correct the answer key
        </button>
      </div>
    );
  return (
    <fieldset className={styles.checklist}>
      <legend>Correct the answer key</legend>
      <p className={admin.helper}>Current key {question.correctOption}. Past attempts are re-scored and ranks rebuilt; students are notified.</p>
      <div className={`${admin.formGrid} ${admin.formGrid2}`}>
        <label className={admin.field}>
          <span>Correct option</span>
          <select className={admin.control} value={key} onChange={(event) => setKey(event.target.value as typeof key)}>
            {KEYS.map((k) => (
              <option key={k} value={k} disabled={k === question.correctOption}>
                {k}
                {k === question.correctOption ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className={admin.field}>
          <span>Reason (kept on record)</span>
          <input className={admin.control} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <label className={admin.field}>
          <span>Solution (English)</span>
          <textarea className={admin.control} lang="en" rows={4} maxLength={20000} value={solutionEn} onChange={(event) => setSolutionEn(event.target.value)} />
        </label>
        {question.solutionHi !== null ? (
          <label className={admin.field}>
            <span>Solution (Hindi)</span>
            <textarea className={admin.control} lang="hi" rows={4} maxLength={20000} value={solutionHi} onChange={(event) => setSolutionHi(event.target.value)} />
          </label>
        ) : null}
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <div className={admin.actions}>
        <button type="button" className="btn btn-primary" onClick={check}>
          Correct the key
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <Confirm
        open={confirm}
        title={`Change the key from ${question.correctOption} to ${key}?`}
        confirmLabel="Correct and re-score"
        danger
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={() => void run()}
      >
        <span>
          {report.testTitle}. Every finished attempt on tests with this question is re-scored and ranks are rebuilt. This is recorded in
          the audit log and cannot be undone except by another correction.
        </span>
      </Confirm>
    </fieldset>
  );
}

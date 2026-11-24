'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { REPORT_REASON_LABELS, ReportReason, type AttemptOption } from '@exam-prep/contracts';
import { attemptsApi } from '@/lib/api/attempts';
import { ApiRequestError } from '@/lib/api/http';
import { RichText } from '@/ui/patterns/RichText';
import styles from './results.module.css';

/** What a solution card shows; filled from a result review or a practice list. */
export interface SolutionData {
  questionId: string;
  attemptId: string;
  label: string;
  subject: string | null;
  topic: string | null;
  stemEn: string;
  stemHi: string | null;
  passageEn: string | null;
  passageHi: string | null;
  options: { id: AttemptOption; textEn: string; textHi?: string | undefined }[];
  imageAssetIds: string[];
  selected: AttemptOption | null;
  correctOption: AttemptOption;
  solutionEn: string | null;
  solutionHi: string | null;
  bookmarked: boolean;
  inNotebook: boolean;
  reported?: boolean;
  keyCorrected?: boolean;
  marksAwarded?: number;
  timeSeconds?: number;
  cohort?: { attempted: number; correct: number; avgSeconds: number | null };
}

const secs = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}m ${Math.round(n % 60)}s` : `${Math.round(n)}s`);

/** One question with the student's answer, the key in force and the worked solution. */
export function SolutionCard({ q, hi, onChange }: { q: SolutionData; hi: boolean; onChange?: (next: SolutionData) => void }) {
  const [data, setData] = useState(q);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  useEffect(() => setData(q), [q]);

  const useHi = hi && !!data.stemHi;
  const lang = useHi ? 'hi' : 'en';
  const outcome = data.selected === null ? 'skip' : data.selected === data.correctOption ? 'right' : 'wrong';

  async function save(change: { bookmarked?: boolean; inNotebook?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      await attemptsApi.saveQuestion(data.questionId, change);
      const next = { ...data, ...change };
      setData(next);
      onChange?.(next);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const passage = useHi ? (data.passageHi ?? data.passageEn) : data.passageEn;
  const solution = useHi ? (data.solutionHi ?? data.solutionEn) : data.solutionEn;

  return (
    <article className={`${styles.sol} ${outcome === 'right' ? styles.solRight : outcome === 'wrong' ? styles.solWrong : styles.solSkip}`}>
      <div className={styles.solHead}>
        <h3>{data.label}</h3>
        <span className={`${styles.pill} ${outcome === 'right' ? styles.pillRight : outcome === 'wrong' ? styles.pillWrong : ''}`}>
          {outcome === 'right' ? 'Correct' : outcome === 'wrong' ? 'Wrong' : 'Not answered'}
          {data.marksAwarded !== undefined ? ` · ${data.marksAwarded > 0 ? '+' : ''}${data.marksAwarded}` : ''}
        </span>
        {data.keyCorrected ? <span className={`${styles.pill} ${styles.pillInfo}`}>Answer key corrected</span> : null}
        {data.topic ? (
          <span className={styles.meta}>
            {data.subject ? `${data.subject} · ` : ''}
            {data.topic}
          </span>
        ) : null}
      </div>
      {passage ? (
        <div className={styles.passage}>
          <RichText text={passage} lang={lang} />
        </div>
      ) : null}
      <RichText text={useHi ? data.stemHi! : data.stemEn} lang={lang} />
      {data.imageAssetIds.length ? (
        <div className={styles.images}>
          {data.imageAssetIds.map((id, i) => (
            <Figure key={id} attemptId={data.attemptId} assetId={id} alt={`Figure ${i + 1} for ${data.label}`} />
          ))}
        </div>
      ) : null}
      <ul className={styles.options} aria-label="Options">
        {data.options.map((o) => {
          const correct = o.id === data.correctOption;
          const chosen = o.id === data.selected;
          return (
            <li key={o.id} className={`${styles.opt} ${correct ? styles.optCorrect : chosen ? styles.optChosenWrong : ''}`}>
              <span className={styles.optKey} aria-hidden="true">
                {o.id}
              </span>
              <span className={styles.optText}>
                <RichText text={useHi && o.textHi ? o.textHi : o.textEn} lang={lang} />
              </span>
              {correct || chosen ? (
                <span className={styles.optTag} style={{ color: correct ? 'var(--success)' : 'var(--error)' }}>
                  {correct && chosen ? 'Your answer, correct' : correct ? 'Correct answer' : 'Your answer'}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {solution ? (
        <div className={styles.solution}>
          <strong>Solution</strong>
          <RichText text={solution} lang={lang} />
        </div>
      ) : (
        <p className={styles.muted}>No worked solution was provided for this question.</p>
      )}
      {data.timeSeconds !== undefined || data.cohort ? (
        <div className={styles.stats}>
          {data.timeSeconds !== undefined ? <span>Your time: {secs(data.timeSeconds)}</span> : null}
          {data.cohort?.avgSeconds !== null && data.cohort?.avgSeconds !== undefined ? <span>Average: {secs(data.cohort.avgSeconds)}</span> : null}
          {data.cohort && data.cohort.attempted > 0 ? (
            <span>
              {Math.round((data.cohort.correct / data.cohort.attempted) * 100)}% of {data.cohort.attempted} who answered got it right
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className="btn btn-secondary" aria-pressed={data.bookmarked} disabled={busy} onClick={() => void save({ bookmarked: !data.bookmarked })}>
          {data.bookmarked ? 'Bookmarked' : 'Bookmark'}
        </button>
        {data.inNotebook ? (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void save({ inNotebook: false })}>
            Remove from mistake notebook
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" disabled={data.reported} onClick={() => setReporting(true)}>
          {data.reported ? 'Reported' : 'Report a problem'}
        </button>
      </div>
      {error ? (
        <p role="alert" className={styles.muted} style={{ color: 'var(--error)' }}>
          {error}
        </p>
      ) : null}
      <ReportDialog
        open={reporting}
        questionId={data.questionId}
        attemptId={data.attemptId}
        label={data.label}
        onClose={() => setReporting(false)}
        onDone={() => {
          const next = { ...data, reported: true };
          setData(next);
          onChange?.(next);
          setReporting(false);
        }}
      />
    </article>
  );
}

function Figure({ attemptId, assetId, alt }: { attemptId: string; assetId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    attemptsApi.image(attemptId, assetId).then(
      (r) => live && setUrl(r.url),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [attemptId, assetId]);
  if (url) return <img src={url} alt={alt} />;
  return <p className={styles.muted}>{failed ? 'This image could not be loaded.' : 'Loading image…'}</p>;
}

/** PRD 6.5 "Report question": reason and an optional note; one report per question. */
function ReportDialog({
  open,
  questionId,
  attemptId,
  label,
  onClose,
  onDone,
}: {
  open: boolean;
  questionId: string;
  attemptId: string;
  label: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [reason, setReason] = useState<ReportReason>('wrong_answer');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await attemptsApi.report(questionId, { attemptId, reason, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      onDone();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not send the report. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={`${id}-t`} onClose={onClose}>
      {open ? (
        <div className={styles.dialogBody}>
          <h2 id={`${id}-t`}>Report {label}</h2>
          <p className={styles.muted}>The examiner and our reviewers check every report. If the answer key was wrong, scores are corrected for everyone.</p>
          <label className={styles.field}>
            What is wrong?
            <select value={reason} onChange={(e) => setReason(ReportReason.parse(e.target.value))}>
              {ReportReason.options.map((r) => (
                <option key={r} value={r}>
                  {REPORT_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Details (optional)
            <textarea rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          {error ? (
            <p role="alert" style={{ margin: 0, color: 'var(--error)' }}>
              {error}
            </p>
          ) : null}
          <div className={styles.dialogActions}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send()}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

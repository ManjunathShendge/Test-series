'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  missingHindiFields,
  type BankQuestion,
  type QuestionBankQuery,
  type DraftQuestion,
  type DraftQuestionInput,
  type ExaminerAuthoringOptions,
  type ImportPreview,
} from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { Alert } from '@/features/auth/ui';
import { isCode, LoadGate, State, messageOf, useLoad } from '@/features/admin/ui';
import { RichText } from '@/ui/patterns/RichText';
import { uploadExaminerFile } from './upload';
import styles from '@/features/admin/admin.module.css';

type QuestionFormData = Omit<DraftQuestionInput, 'expectedRevision'>;

const optionIds = ['A', 'B', 'C', 'D'] as const;
function emptyQuestion(
  options: ExaminerAuthoringOptions,
  allowedExamIds: string[],
): QuestionFormData {
  const exam = options.exams.find((item) => allowedExamIds.includes(item.id));
  const subject = exam?.subjects[0];
  return {
    examId: exam?.id ?? '',
    subjectId: subject?.id ?? '',
    topicId: subject?.topics[0]?.id ?? '',
    difficulty: 'medium',
    stemEn: '',
    options: optionIds.map((id) => ({ id, textEn: '' })),
    correctOption: 'A',
    solutionEn: '',
    isPyq: false,
    imageAssetIds: [],
  };
}

function questionForm(question: DraftQuestion): QuestionFormData {
  return {
    examId: question.examId,
    subjectId: question.subjectId,
    topicId: question.topicId,
    difficulty: question.difficulty,
    passageId: question.passageId,
    stemEn: question.stemEn,
    ...(question.stemHi ? { stemHi: question.stemHi } : {}),
    options: question.options.map((option) => ({ ...option })),
    correctOption: question.correctOption,
    solutionEn: question.solutionEn,
    ...(question.solutionHi ? { solutionHi: question.solutionHi } : {}),
    isPyq: question.isPyq,
    ...(question.pyqYear ? { pyqYear: question.pyqYear } : {}),
    ...(question.pyqShift ? { pyqShift: question.pyqShift } : {}),
    imageAssetIds: question.imageAssetIds,
  };
}

export function ExaminerAuthoringView() {
  const { state, reload } = useLoad(async () => {
    const [options, application] = await Promise.all([
      adminApi.examinerOptions(),
      adminApi.examinerApplication(),
    ]);
    return { options, application };
  }, []);
  const [editing, setEditing] = useState<BankQuestion | null>(null);
  const [newFormKey, setNewFormKey] = useState(0);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [bankKey, setBankKey] = useState(0);

  return (
    <LoadGate state={state} reload={() => void reload()} what="examiner workspace">
      {({ options, application }) => {
        if (!application || application.status !== 'approved') {
          return (
            <section className={styles.card}>
              <h1>Question authoring</h1>
              <p>
                {application?.status === 'pending'
                  ? 'Your application is awaiting human review. Draft authoring is enabled only after approval.'
                  : application?.rejectionReason
                    ? `Your application was not approved: ${application.rejectionReason}`
                    : 'Submit an examiner application and ten sample questions to request access.'}
              </p>
              <Link className="btn btn-primary" href="/examiner/apply">
                {application?.status === 'pending'
                  ? 'View application'
                  : 'Apply to become an examiner'}
              </Link>
            </section>
          );
        }
        const allowedExamIds = application.examIds;
        const assignedOptions: ExaminerAuthoringOptions = {
          ...options,
          exams: options.exams.filter((exam) => allowedExamIds.includes(exam.id)),
        };
        const newQuestion = () => {
          setEditing(null);
          setNewFormKey((key) => key + 1);
          setSavedVersion(null);
        };
        const saveQuestion = (saved: DraftQuestion) => {
          setEditing(null);
          setNewFormKey((key) => key + 1);
          setBankKey((key) => key + 1);
          setSavedVersion(saved.versionNumber);
        };
        return (
          <>
            <div className={styles.pageHead}>
              <div>
                <h1>Question authoring</h1>
                <p>
                  Create and revise drafts. Human QC approval is separate from examiner approval.
                </p>
              </div>
              <button type="button" className="btn btn-primary" onClick={newQuestion}>
                New question
              </button>
            </div>
            {savedVersion !== null ? (
              <p role="status">
                Saved as draft version {savedVersion}. It is not yet approved or published.
              </p>
            ) : null}
            <QuestionEditor
              key={editing ? `${editing.id}-${editing.versionNumber}` : `new-${newFormKey}`}
              options={assignedOptions}
              question={editing}
              onSaved={saveQuestion}
              onConflict={() => {
                setEditing(null);
                setSavedVersion(null);
                setNewFormKey((key) => key + 1);
                setBankKey((key) => key + 1);
              }}
            />
            <ImportPanel
              options={assignedOptions}
              onCommitted={() => setBankKey((key) => key + 1)}
            />
            <QuestionBank
              options={assignedOptions}
              refreshKey={bankKey}
              onOpen={(question) => {
                setSavedVersion(null);
                setEditing(question);
                document.getElementById('question-editor')?.scrollIntoView({ block: 'start' });
              }}
            />
          </>
        );
      }}
    </LoadGate>
  );
}

const ALL = '';

/** The examiner's own bank: latest version of every question, drafts editable, approved read-only. */
function QuestionBank({
  options,
  refreshKey,
  onOpen,
}: {
  options: ExaminerAuthoringOptions;
  refreshKey: number;
  onOpen: (question: BankQuestion) => void;
}) {
  const [query, setQuery] = useState<Partial<QuestionBankQuery>>({ status: 'all', page: 1 });
  const [search, setSearch] = useState('');
  const { state, reload } = useLoad(() => adminApi.examinerQuestions(query), [query, refreshKey]);
  const exam = options.exams.find((item) => item.id === query.examId);
  const subject = exam?.subjects.find((item) => item.id === query.subjectId);
  const filter = (patch: Partial<QuestionBankQuery>) =>
    setQuery((current) => ({ ...current, ...patch, page: 1 }));
  const anyFilter = Boolean(
    query.examId || query.difficulty || query.q || (query.status && query.status !== 'all'),
  );

  return (
    <section className={styles.card} aria-labelledby="bank-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="bank-title">Your question bank</h2>
          <p>Latest version of each question. Approved questions are locked and open read-only.</p>
        </div>
      </div>
      <form
        className={`${styles.formGrid} ${styles.formGrid3}`}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          filter({ q: search.trim() || undefined });
        }}
      >
        <label className={styles.field}>
          <span>Status</span>
          <select
            className={styles.control}
            value={query.status ?? 'all'}
            onChange={(event) =>
              filter({ status: event.target.value as QuestionBankQuery['status'] })
            }
          >
            <option value="all">All</option>
            <option value="draft">Drafts</option>
            <option value="approved">Approved</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Exam</span>
          <select
            className={styles.control}
            value={query.examId ?? ALL}
            onChange={(event) =>
              filter({
                examId: event.target.value || undefined,
                subjectId: undefined,
                topicId: undefined,
              })
            }
          >
            <option value={ALL}>All exams</option>
            {options.exams.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Subject</span>
          <select
            className={styles.control}
            value={query.subjectId ?? ALL}
            disabled={!exam}
            onChange={(event) =>
              filter({ subjectId: event.target.value || undefined, topicId: undefined })
            }
          >
            <option value={ALL}>All subjects</option>
            {exam?.subjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Topic</span>
          <select
            className={styles.control}
            value={query.topicId ?? ALL}
            disabled={!subject}
            onChange={(event) => filter({ topicId: event.target.value || undefined })}
          >
            <option value={ALL}>All topics</option>
            {subject?.topics.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Difficulty</span>
          <select
            className={styles.control}
            value={query.difficulty ?? ALL}
            onChange={(event) =>
              filter({
                difficulty: (event.target.value || undefined) as QuestionBankQuery['difficulty'],
              })
            }
          >
            <option value={ALL}>Any</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Search question text</span>
          <span className={styles.inline}>
            <input
              className={styles.control}
              type="search"
              maxLength={200}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" className="btn btn-secondary">
              Search
            </button>
          </span>
        </label>
      </form>
      <LoadGate state={state} reload={() => void reload()} what="your questions">
        {({ items, total, page, pageSize }) => {
          const pages = Math.max(1, Math.ceil(total / pageSize));
          if (!items.length) {
            return (
              <State
                title={anyFilter ? 'No questions match' : 'No questions yet'}
                action={
                  anyFilter ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setSearch('');
                        setQuery({ status: 'all', page: 1 });
                      }}
                    >
                      Clear filters
                    </button>
                  ) : undefined
                }
              >
                {anyFilter
                  ? 'Change or clear the filters to see more of your bank.'
                  : 'Use the form above to create a draft or import a validated workbook.'}
              </State>
            );
          }
          return (
            <>
              <div
                className={styles.tableWrap}
                role="region"
                aria-label="Your questions"
                tabIndex={0}
              >
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Status</th>
                      <th>Version</th>
                      <th>Difficulty</th>
                      <th>PYQ</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((question) => (
                      <tr key={question.id}>
                        <td className={styles.wrap}>
                          {question.stemEn.length > 140
                            ? `${question.stemEn.slice(0, 140)}…`
                            : question.stemEn}
                          {question.passage ? ' · in a passage group' : ''}
                        </td>
                        <td>
                          <span
                            className={`${styles.badge} ${question.isApproved ? styles.badgeOn : styles.badgeDraft}`}
                          >
                            {question.isApproved ? 'Approved' : 'Draft'}
                          </span>
                        </td>
                        <td>{question.versionNumber}</td>
                        <td>{question.difficulty}</td>
                        <td>
                          {question.isPyq
                            ? `${question.pyqYear ?? ''} ${question.pyqShift ?? ''}`
                            : 'No'}
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => onOpen(question)}
                          >
                            {question.isApproved ? 'View' : 'Edit'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <nav className={styles.actions} aria-label="Question bank pages">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setQuery((current) => ({ ...current, page: page - 1 }))}
                >
                  Previous
                </button>
                <span>
                  Page {Math.min(page, pages)} of {pages} · {total} question
                  {total === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page >= pages}
                  onClick={() => setQuery((current) => ({ ...current, page: page + 1 }))}
                >
                  Next
                </button>
              </nav>
            </>
          );
        }}
      </LoadGate>
    </section>
  );
}

function QuestionEditor({
  options,
  question,
  onSaved,
  onConflict,
}: {
  options: ExaminerAuthoringOptions;
  question: BankQuestion | null;
  onSaved: (saved: DraftQuestion) => void;
  onConflict: () => void;
}) {
  const readOnly = Boolean(question?.isApproved);
  const [form, setForm] = useState<QuestionFormData>(() =>
    question
      ? questionForm(question)
      : emptyQuestion(
          options,
          options.exams.map((exam) => exam.id),
        ),
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [stale, setStale] = useState(false);
  const exam = options.exams.find((item) => item.id === form.examId);
  const subject = exam?.subjects.find((item) => item.id === form.subjectId);
  const field = <K extends keyof QuestionFormData>(key: K, value: QuestionFormData[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStale(false);
    if (!form.examId || !form.subjectId || !form.topicId)
      return setError(new Error('Choose an exam, subject and topic.'));
    if (form.isPyq && !form.pyqYear)
      return setError(new Error('Enter the year for a previous-year question.'));
    if (missingHindiFields(form).length)
      return setError(
        new Error(
          'Hindi is partial. Add Hindi to the question, all four options and the solution, or remove it.',
        ),
      );
    const body: DraftQuestionInput = {
      ...form,
      ...(question ? { expectedRevision: question.versionNumber } : {}),
    };
    setBusy(true);
    try {
      const saved = question
        ? await adminApi.updateExaminerQuestion(question.id, body)
        : await adminApi.createExaminerQuestion(body);
      onSaved(saved);
    } catch (caught) {
      setError(caught);
      if (isCode(caught, 'STALE_EDIT')) setStale(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} id="question-editor">
      <div className={styles.cardHead}>
        <div>
          <h2>
            {readOnly
              ? `Approved question · version ${question?.versionNumber} (read-only)`
              : question
                ? `Edit draft · version ${question.versionNumber}`
                : 'Create a question draft'}
          </h2>
          <p>
            {readOnly
              ? 'Approved questions are locked. Corrections go through QC as a new version.'
              : 'English single-MCQ authoring with optional Hindi text and PYQ provenance.'}
          </p>
        </div>
      </div>
      {error ? <Alert>{error instanceof Error ? error.message : messageOf(error)}</Alert> : null}
      {stale ? (
        <button type="button" className="btn btn-secondary" onClick={onConflict}>
          Reload current drafts
        </button>
      ) : null}
      {!options.exams.length ? (
        <State title="No assigned exam">
          Ask an operations administrator to assign an exam with a published template.
        </State>
      ) : (
        <form className={styles.formGrid} onSubmit={(event) => void submit(event)} noValidate>
          <fieldset className={`${styles.formGrid} ${styles.plainFieldset}`} disabled={readOnly}>
            <div className={`${styles.formGrid} ${styles.formGrid3}`}>
              <label className={styles.field}>
                <span>Exam</span>
                <select
                  className={styles.control}
                  value={form.examId}
                  onChange={(event) => {
                    const next = options.exams.find((item) => item.id === event.target.value);
                    const firstSubject = next?.subjects[0];
                    setForm((current) => ({
                      ...current,
                      examId: event.target.value,
                      subjectId: firstSubject?.id ?? '',
                      topicId: firstSubject?.topics[0]?.id ?? '',
                    }));
                  }}
                >
                  {options.exams.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Subject</span>
                <select
                  className={styles.control}
                  value={form.subjectId}
                  onChange={(event) => {
                    const next = exam?.subjects.find((item) => item.id === event.target.value);
                    setForm((current) => ({
                      ...current,
                      subjectId: event.target.value,
                      topicId: next?.topics[0]?.id ?? '',
                    }));
                  }}
                >
                  {exam?.subjects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Topic</span>
                <select
                  className={styles.control}
                  value={form.topicId}
                  onChange={(event) => field('topicId', event.target.value)}
                >
                  {subject?.topics.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className={styles.helper}>
              Write plain text. Math: <code>{String.raw`\(x^2 + 1\)`}</code> inline or{' '}
              <code>{String.raw`\[ \frac{a}{b} \]`}</code> on its own line. Table: a{' '}
              <code>| Year | Sales |</code> line, then <code>| --- | --- |</code>, then one line per
              row.
            </p>
            <label className={styles.field}>
              <span>Question (English)</span>
              <textarea
                className={styles.control}
                rows={3}
                maxLength={20_000}
                value={form.stemEn}
                onChange={(event) => field('stemEn', event.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span>Question (Hindi, optional)</span>
              <textarea
                className={styles.control}
                rows={2}
                maxLength={20_000}
                value={form.stemHi ?? ''}
                onChange={(event) => field('stemHi', event.target.value)}
              />
            </label>
            <div className={styles.formGrid}>
              {form.options.map((option, index) => (
                <div className={styles.inline} key={option.id}>
                  <label className={styles.field}>
                    <span>Option {option.id} (English)</span>
                    <input
                      className={styles.control}
                      value={option.textEn}
                      maxLength={10_000}
                      onChange={(event) =>
                        field(
                          'options',
                          form.options.map((item, i) =>
                            i === index ? { ...item, textEn: event.target.value } : item,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Option {option.id} (Hindi, optional)</span>
                    <input
                      className={styles.control}
                      value={option.textHi ?? ''}
                      maxLength={10_000}
                      onChange={(event) =>
                        field(
                          'options',
                          form.options.map((item, i) =>
                            i === index ? { ...item, textHi: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className={`${styles.formGrid} ${styles.formGrid3}`}>
              <label className={styles.field}>
                <span>Correct option</span>
                <select
                  className={styles.control}
                  value={form.correctOption}
                  onChange={(event) =>
                    field('correctOption', event.target.value as QuestionFormData['correctOption'])
                  }
                >
                  {optionIds.map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Difficulty</span>
                <select
                  className={styles.control}
                  value={form.difficulty}
                  onChange={(event) =>
                    field('difficulty', event.target.value as QuestionFormData['difficulty'])
                  }
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <div className={styles.field}>
                <span>Question type</span>
                <span className={styles.control}>Single-choice MCQ</span>
              </div>
            </div>
            <label className={styles.field}>
              <span>Solution (English)</span>
              <textarea
                className={styles.control}
                rows={3}
                maxLength={20_000}
                value={form.solutionEn}
                onChange={(event) => field('solutionEn', event.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span>Solution (Hindi, optional)</span>
              <textarea
                className={styles.control}
                rows={2}
                maxLength={20_000}
                value={form.solutionHi ?? ''}
                onChange={(event) => field('solutionHi', event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>
                Question images (optional, up to 20)
                {uploading ? ' · uploading and scanning…' : ''}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy || uploading || form.imageAssetIds.length >= 20}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  setUploading(true);
                  setError(null);
                  void uploadExaminerFile(file, 'question_asset')
                    .then((id) =>
                      setForm((current) => ({
                        ...current,
                        imageAssetIds: [...current.imageAssetIds, id],
                      })),
                    )
                    .catch(setError)
                    .finally(() => setUploading(false));
                }}
              />
            </label>
            <ImageList
              ids={form.imageAssetIds}
              onRemove={
                readOnly
                  ? undefined
                  : (id) =>
                      field(
                        'imageAssetIds',
                        form.imageAssetIds.filter((item) => item !== id),
                      )
              }
            />
            <label>
              <input
                type="checkbox"
                checked={form.isPyq}
                onChange={(event) => field('isPyq', event.target.checked)}
              />{' '}
              Previous-year question
            </label>
            {form.isPyq ? (
              <div className={styles.inline}>
                <label className={styles.field}>
                  <span>Exam year</span>
                  <input
                    className={styles.control}
                    type="number"
                    min={1900}
                    max={2100}
                    value={form.pyqYear ?? ''}
                    onChange={(event) =>
                      field('pyqYear', event.target.value ? Number(event.target.value) : undefined)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>Shift (optional)</span>
                  <input
                    className={styles.control}
                    maxLength={100}
                    value={form.pyqShift ?? ''}
                    onChange={(event) => field('pyqShift', event.target.value || undefined)}
                  />
                </label>
              </div>
            ) : null}
          </fieldset>
          <QuestionPreview form={form} passage={question?.passage ?? null} />
          {readOnly ? null : (
            <div className={styles.actions}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || uploading}
                aria-busy={busy || undefined}
              >
                {busy ? 'Saving…' : question ? 'Save new version' : 'Save draft'}
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

function ImportPanel({
  options,
  onCommitted,
}: {
  options: ExaminerAuthoringOptions;
  onCommitted: () => void;
}) {
  const [examId, setExamId] = useState(options.exams[0]?.id ?? '');
  const exam = options.exams.find((item) => item.id === examId);
  const [stageId, setStageId] = useState(exam?.stages[0]?.id ?? '');
  const stage = exam?.stages.find((item) => item.id === stageId);
  const [templateId, setTemplateId] = useState(stage?.templates[0]?.id ?? '');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function previewImport(file: File) {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error('Import archives must be 20 MB or smaller.');
      if (!examId || !stageId || !templateId)
        throw new Error('Choose an exam, stage, and published template.');
      const assetId = await uploadExaminerFile(file, 'import_archive');
      setPreview(
        await adminApi.previewExaminerImport({
          examId,
          stageId,
          templateId,
          idempotencyKey: crypto.randomUUID(),
          assetId,
        }),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function commitPreview() {
    if (!preview || preview.status !== 'accepted') return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.commitExaminerImport(preview.id, {
        manifestHash: preview.manifestHash,
        idempotencyKey: preview.idempotencyKey,
      });
      setPreview(null);
      onCommitted();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2>Import workbook</h2>
      <p>
        Upload an XLSX or ZIP (20 MB max). Add a Groups sheet for shared passages and include
        referenced JPEG, PNG or WebP files in the ZIP. Use safe relative paths in image_refs,
        separated with semicolons.
      </p>
      {error ? <Alert>{error instanceof Error ? error.message : messageOf(error)}</Alert> : null}
      <div className={styles.inline}>
        <label className={styles.field}>
          <span>Exam</span>
          <select
            className={styles.control}
            value={examId}
            onChange={(event) => {
              const next = options.exams.find((item) => item.id === event.target.value);
              setExamId(event.target.value);
              setStageId(next?.stages[0]?.id ?? '');
              setTemplateId(next?.stages[0]?.templates[0]?.id ?? '');
            }}
          >
            {options.exams.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Stage</span>
          <select
            className={styles.control}
            value={stageId}
            onChange={(event) => {
              const next = exam?.stages.find((item) => item.id === event.target.value);
              setStageId(event.target.value);
              setTemplateId(next?.templates[0]?.id ?? '');
            }}
          >
            {exam?.stages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Published template</span>
          <select
            className={styles.control}
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            {stage?.templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · v{item.version}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={styles.field}>
        <span>Workbook/archive</span>
        <input
          type="file"
          accept=".zip,.xlsx,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void previewImport(file);
            event.target.value = '';
          }}
        />
      </label>
      {busy ? <p role="status">Uploading or validating…</p> : null}
      {preview ? (
        <div className={styles.tableWrap}>
          <p>
            <b>Status:</b> {preview.status} · <b>Questions:</b> {preview.parsedCount} ·{' '}
            <b>Errors:</b> {preview.errorCount}
          </p>
          {preview.errors.length ? (
            <ol>
              {preview.errors.map((item, index) => (
                <li key={`${item.row}-${item.cell}-${index}`}>
                  {item.sheet ?? 'Questions'} row {item.row}
                  {item.cell ? ` · ${item.cell}` : ''}: {item.message}
                </li>
              ))}
            </ol>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || preview.status !== 'accepted'}
            onClick={() => void commitPreview()}
          >
            Commit all accepted questions
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** What a student sees, rendered with the shared content format; key and solution come after. */
function QuestionPreview({
  form,
  passage,
}: {
  form: QuestionFormData;
  passage: BankQuestion['passage'];
}) {
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const hasHindi = Boolean(form.stemHi?.trim());
  const lang = hasHindi ? language : 'en';
  const pick = (en: string, hi: string | undefined) => (lang === 'hi' ? (hi ?? '') : en);
  const solution = pick(form.solutionEn, form.solutionHi);
  return (
    <section className={styles.card} aria-labelledby="question-preview-title">
      <div className={styles.cardHead}>
        <h3 id="question-preview-title">Student preview</h3>
        {hasHindi ? (
          <div className={styles.inlineActions} role="group" aria-label="Preview language">
            {(['en', 'hi'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`btn ${language === value ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={language === value}
                onClick={() => setLanguage(value)}
              >
                {value === 'en' ? 'English' : 'हिन्दी'}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {passage ? (
        <div className={styles.card}>
          <RichText text={pick(passage.contentEn, passage.contentHi ?? undefined)} lang={lang} />
          <ImageList ids={passage.imageAssetIds} />
        </div>
      ) : null}
      {form.stemEn.trim() ? (
        <RichText text={pick(form.stemEn, form.stemHi)} lang={lang} showIssues />
      ) : (
        <p className={styles.helper}>Your question will appear here.</p>
      )}
      <ImageList ids={form.imageAssetIds} />
      <ol type="A">
        {form.options.map((option) => (
          <li key={option.id}>
            <RichText text={pick(option.textEn, option.textHi) || '—'} lang={lang} showIssues />
          </li>
        ))}
      </ol>
      <h4>After submission</h4>
      <p>
        <b>Correct answer:</b> {form.correctOption}
      </p>
      {solution.trim() ? (
        <RichText text={solution} lang={lang} showIssues />
      ) : (
        <p className={styles.helper}>No solution entered yet.</p>
      )}
    </section>
  );
}

/** Thumbnails of the caller's own scanned images, via short-lived signed links. */
function ImageList({
  ids,
  onRemove,
}: {
  ids: string[];
  onRemove?: ((id: string) => void) | undefined;
}) {
  if (!ids.length) return null;
  return (
    <ul className={styles.thumbs}>
      {ids.map((id, index) => (
        <li key={id}>
          <Thumb id={id} label={`Image ${index + 1}`} />
          {onRemove ? (
            <button type="button" className="btn btn-ghost" onClick={() => onRemove(id)}>
              Remove image {index + 1}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Thumb({ id, label }: { id: string; label: string }) {
  const { state } = useLoad(() => adminApi.questionImageUrl(id), [id]);
  if (state.status === 'ready') {
    // Signed, expiring object-storage URL: next/image optimisation would cache it server-side.
    return <img src={state.data.url} alt={label} className={styles.thumb} />;
  }
  return (
    <span className={`${styles.thumb} ${styles.helper}`} role="img" aria-label={label}>
      {state.status === 'loading' ? 'Loading…' : 'Preview unavailable'}
    </span>
  );
}

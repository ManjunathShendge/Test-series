'use client';

import { errorKind } from '@/ui/errors/ErrorScreen';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  BankQuestion,
  ExaminerSeries,
  ExaminerTestDetail,
  ExaminerTestSection,
  ExaminerTestAccess,
  ExaminerTestStatus,
  ExaminerTestSummary,
  PriceBand,
  TestPrecheck,
  UpdateExaminerTestRequest,
} from '@exam-prep/contracts';
import { QC_REASON_LABELS } from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { examinerApi, rupees } from '@/lib/api/examiner';
import { Alert, Waiting } from '@/features/auth/ui';
import { Confirm, isCode, messageOf, State, useLoad } from '@/features/admin/ui';
import admin from '@/features/admin/admin.module.css';
import { ImportPanel } from './ExaminerAuthoringView';
import { PageHead, useExaminer } from './ExaminerShell';
import styles from './examiner.module.css';

const STATUS: Record<ExaminerTestStatus, [string, string]> = {
  draft: ['Draft', admin.badgeDraft!],
  changes_requested: ['Changes requested', admin.badgeOff!],
  submitted: ['Submitted for review', admin.badgeOn!],
  in_qc: ['In review', admin.badgeOn!],
  approved: ['Approved', admin.badgeOn!],
  scheduled: ['Scheduled', admin.badgeOn!],
  live: ['Live', admin.badgeOn!],
  archived: ['Archived', admin.badgeOff!],
};
const TYPES = [
  { value: 'mock', label: 'Full mock test' },
  { value: 'sectional', label: 'Sectional test' },
  { value: 'pyq', label: 'Previous year paper' },
] as const;
export const isEditable = (status: ExaminerTestStatus) => status === 'draft' || status === 'changes_requested';

/** PRD 4.2 step 6. */
const ACCESS: { value: ExaminerTestAccess; label: string; help: string }[] = [
  { value: 'paid', label: 'Paid', help: 'Students buy it on its own, at a price inside your band.' },
  { value: 'free', label: 'Free', help: 'Anyone can take it. Good for bringing students to your paid tests.' },
  { value: 'pass_included', label: 'Pass only', help: 'Only students with a Pass can take it.' },
  { value: 'series_only', label: 'Series only', help: 'Sold only as part of one of your series.' },
];
const accessLabel = (value: string) => ACCESS.find((item) => item.value === value)?.label ?? value;
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Price check shared by create and settings: paise inside the tier band, or a message. */
function priceError(text: string, band: { minPaise: number; maxPaise: number } | undefined): string | null {
  const paise = toPaise(text);
  if (paise === null) return 'Enter a price in rupees, with up to two decimals.';
  if (band && (paise < band.minPaise || paise > band.maxPaise))
    return `Set a price from ${rupees(band.minPaise)} to ${rupees(band.maxPaise)} for your tier.`;
  return null;
}

/** Access, price and Pass inclusion fields used by create and settings. */
function AccessFields({
  accessType,
  setAccessType,
  price,
  setPrice,
  includedInPass,
  setIncludedInPass,
  band,
  error,
}: {
  accessType: ExaminerTestAccess;
  setAccessType: (value: ExaminerTestAccess) => void;
  price: string;
  setPrice: (value: string) => void;
  includedInPass: boolean;
  setIncludedInPass: (value: boolean) => void;
  band: { minPaise: number; maxPaise: number } | undefined;
  error: string | undefined;
}) {
  const help = ACCESS.find((item) => item.value === accessType)?.help;
  return (
    <>
      <div className={`${admin.formGrid} ${admin.formGrid2}`}>
        <label className={admin.field}>
          <span>Access</span>
          <select className={admin.control} value={accessType} onChange={(event) => setAccessType(event.target.value as ExaminerTestAccess)}>
            {ACCESS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <span className={admin.helper}>{help}</span>
        </label>
        {accessType === 'paid' ? (
          <label className={admin.field}>
            <span>Price (₹)</span>
            <input
              className={`${admin.control} ${error ? styles.invalid : ''}`}
              inputMode="decimal"
              value={price}
              placeholder={band ? String(band.minPaise / 100) : '49'}
              aria-invalid={error ? true : undefined}
              onChange={(event) => setPrice(event.target.value.replace(/[^\d.]/g, ''))}
            />
            {error ? (
              <p className={styles.fieldError}>{error}</p>
            ) : band ? (
              <span className={admin.helper}>
                Your tier allows {rupees(band.minPaise)} to {rupees(band.maxPaise)}.
              </span>
            ) : null}
          </label>
        ) : null}
      </div>
      {accessType === 'paid' || accessType === 'series_only' ? (
        <label className={styles.check}>
          <input type="checkbox" checked={includedInPass} onChange={(event) => setIncludedInPass(event.target.checked)} />
          <span>Also include it in the Pass</span>
        </label>
      ) : null}
    </>
  );
}

export function StatusBadge({ status }: { status: ExaminerTestStatus }) {
  const [label, cls] = STATUS[status];
  return <span className={`${admin.badge} ${cls}`}>{label}</span>;
}

/** ₹ text → paise; null when it is not a valid amount with at most two decimals. */
export function toPaise(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}
const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;

export function Progress({ filled, total }: { filled: number; total: number }) {
  const percent = total ? Math.round((filled / total) * 100) : 0;
  return (
    <div className={admin.field}>
      <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={filled} aria-label="Questions placed">
        <span style={{ width: `${percent}%` }} />
      </div>
      <span className={admin.helper}>
        {filled} of {total} questions placed
      </span>
    </div>
  );
}

export function TestTable({ tests, showSeries = true }: { tests: ExaminerTestSummary[]; showSeries?: boolean }) {
  return (
    <div className={admin.tableWrap} role="region" aria-label="Tests" tabIndex={0}>
      <table className={admin.table}>
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th scope="col">Status</th>
            <th scope="col">Questions</th>
            <th scope="col">Price</th>
            {showSeries ? <th scope="col">Series</th> : null}
            <th scope="col">
              <span className={admin.srOnly}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test) => (
            <tr key={test.id}>
              <td className={admin.wrap}>
                <b>{test.title}</b>
                <div className="t-small t-secondary">
                  {test.examName} · {test.stageName} · {test.templateName} v{test.templateVersion}
                </div>
              </td>
              <td>
                <StatusBadge status={test.status} />
              </td>
              <td>
                {test.filledQuestions} / {test.totalQuestions}
              </td>
              <td>{test.accessType === 'paid' ? rupees(test.pricePaise) : accessLabel(test.accessType)}</td>
              {showSeries ? <td>{test.seriesTitle ?? '—'}</td> : null}
              <td>
                <Link className="btn btn-secondary" href={`/examiner/tests/${test.id}`}>
                  {isEditable(test.status) ? 'Build' : 'View'}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// List and create ---------------------------------------------------------------------------

export function TestsView() {
  const params = useSearchParams();
  const presetSeries = params.get('series');
  const { state, reload } = useLoad(async () => {
    const [tests, series, quality] = await Promise.all([examinerApi.tests(), examinerApi.series(), examinerApi.quality()]);
    return { tests, series, bands: quality.priceBands };
  }, []);
  const [creating, setCreating] = useState(Boolean(presetSeries) || params.get('new') === '1');

  return (
    <div className={styles.stack}>
      <PageHead
        title="Tests"
        lead="Build a test from an exam pattern, fill every section with your questions, then submit it for QC review."
        action={
          creating ? null : (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Create test
            </button>
          )
        }
      />
      {state.status === 'loading' ? <Waiting label="Loading your tests…" /> : null}
      {state.status === 'error' ? (
        <State kind={errorKind(state.error)} title="Could not load your tests" action={<button type="button" className="btn btn-primary" onClick={() => void reload()}>Try again</button>}>
          {messageOf(state.error)}
        </State>
      ) : null}
      {state.status === 'ready' ? (
        <>
          {creating ? <CreateTestForm series={state.data.series} bands={state.data.bands} presetSeries={presetSeries} onCancel={() => setCreating(false)} /> : null}
          {state.data.tests.length ? (
            <section className={`${admin.card} ${styles.section}`} aria-label="Your tests">
              <TestTable tests={state.data.tests} />
            </section>
          ) : creating ? null : (
            <State
              title="No tests yet"
              action={
                <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                  Create your first test
                </button>
              }
            >
              A test follows an official exam pattern. You choose the pattern, then place your questions in each section.
            </State>
          )}
        </>
      ) : null}
    </div>
  );
}

function CreateTestForm({
  series,
  bands,
  presetSeries,
  onCancel,
}: {
  series: ExaminerSeries[];
  bands: PriceBand[];
  presetSeries: string | null;
  onCancel: () => void;
}) {
  const router = useRouter();
  const { assigned } = useExaminer();
  const preset = series.find((item) => item.id === presetSeries);
  const firstExam = assigned.exams.find((exam) => exam.id === preset?.examId) ?? assigned.exams[0];
  const [title, setTitle] = useState('');
  const [examId, setExamId] = useState(firstExam?.id ?? '');
  const exam = assigned.exams.find((item) => item.id === examId);
  const [stageId, setStageId] = useState(firstExam?.stages[0]?.id ?? '');
  const stage = exam?.stages.find((item) => item.id === stageId);
  const [templateId, setTemplateId] = useState(firstExam?.stages[0]?.templates[0]?.id ?? '');
  const [testType, setTestType] = useState<(typeof TYPES)[number]['value']>('mock');
  const [accessType, setAccessType] = useState<ExaminerTestAccess>('paid');
  const [price, setPrice] = useState('');
  const [includedInPass, setIncludedInPass] = useState(true);
  const [hasHindi, setHasHindi] = useState(false);
  const [seriesId, setSeriesId] = useState(preset?.id ?? '');
  const band = bands.find((item) => item.examId === examId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const examSeries = series.filter((item) => item.examId === examId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (title.trim().length < 3) found['title'] = 'Give the test a title of at least 3 characters.';
    if (!exam || !stageId || !templateId) found['template'] = 'Choose the exam, stage and pattern.';
    const pricePaise = accessType === 'paid' ? toPaise(price) : 0;
    const priceProblem = accessType === 'paid' ? priceError(price, band) : null;
    if (priceProblem) found['price'] = priceProblem;
    if (accessType === 'series_only' && !seriesId) found['series'] = 'Choose the series this test is sold in.';
    setErrors(found);
    if (Object.keys(found).length || pricePaise === null) return;
    setBusy(true);
    setError(null);
    try {
      const created = await examinerApi.createTest({
        examId,
        stageId,
        templateId,
        title: title.trim(),
        testType,
        accessType,
        pricePaise,
        includedInPass,
        hasHindi,
        seriesId: seriesId || null,
      });
      router.push(`/examiner/tests/${created.id}`);
    } catch (caught) {
      const issue = fieldIssue(caught, 'pricePaise') ?? fieldIssue(caught, 'seriesId');
      if (issue) setErrors({ [issue.field === 'pricePaise' ? 'price' : 'series']: issue.message });
      else setError(caught);
      setBusy(false);
    }
  }

  if (!assigned.exams.length)
    return <State title="No exam assigned">Your approved exams have no published pattern yet. Our team will publish one soon.</State>;

  return (
    <section className={`${admin.card} ${styles.section}`} aria-labelledby="create-test-title">
      <h2 id="create-test-title">Create a test</h2>
      {error ? <Alert>{messageOf(error)}</Alert> : null}
      <form className={styles.section} onSubmit={(event) => void submit(event)} noValidate>
        <label className={admin.field}>
          <span>Title</span>
          <input
            className={`${admin.control} ${errors['title'] ? styles.invalid : ''}`}
            value={title}
            maxLength={200}
            placeholder="SSC CGL Tier 1 Full Mock 1"
            aria-invalid={errors['title'] ? true : undefined}
            onChange={(event) => setTitle(event.target.value)}
          />
          {errors['title'] ? <p className={styles.fieldError}>{errors['title']}</p> : null}
        </label>
        <div className={`${admin.formGrid} ${admin.formGrid3}`}>
          <label className={admin.field}>
            <span>Exam</span>
            <select
              className={admin.control}
              value={examId}
              onChange={(event) => {
                const next = assigned.exams.find((item) => item.id === event.target.value);
                setExamId(event.target.value);
                setStageId(next?.stages[0]?.id ?? '');
                setTemplateId(next?.stages[0]?.templates[0]?.id ?? '');
                setSeriesId('');
              }}
            >
              {assigned.exams.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className={admin.field}>
            <span>Stage</span>
            <select
              className={admin.control}
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
          <label className={admin.field}>
            <span>Exam pattern</span>
            <select className={`${admin.control} ${errors['template'] ? styles.invalid : ''}`} value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {stage?.templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · v{item.version}
                </option>
              ))}
            </select>
            {errors['template'] ? <p className={styles.fieldError}>{errors['template']}</p> : null}
          </label>
        </div>
        <div className={`${admin.formGrid} ${admin.formGrid3}`}>
          <label className={admin.field}>
            <span>Type</span>
            <select className={admin.control} value={testType} onChange={(event) => setTestType(event.target.value as typeof testType)}>
              {TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <AccessFields
          accessType={accessType}
          setAccessType={setAccessType}
          price={price}
          setPrice={setPrice}
          includedInPass={includedInPass}
          setIncludedInPass={setIncludedInPass}
          band={band}
          error={errors['price']}
        />
        <div className={`${admin.formGrid} ${admin.formGrid2}`}>
          <label className={admin.field}>
            <span>Test series{accessType === 'series_only' ? '' : ' (optional)'}</span>
            <select
              className={`${admin.control} ${errors['series'] ? styles.invalid : ''}`}
              value={seriesId}
              aria-invalid={errors['series'] ? true : undefined}
              onChange={(event) => setSeriesId(event.target.value)}
            >
              <option value="">Not in a series</option>
              {examSeries.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            {errors['series'] ? <p className={styles.fieldError}>{errors['series']}</p> : null}
          </label>
          <label className={styles.check} style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={hasHindi} onChange={(event) => setHasHindi(event.target.checked)} />
            <span>Bilingual (every question also in Hindi)</span>
          </label>
        </div>
        <div className={admin.actions}>
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined}>
            {busy ? 'Creating…' : 'Create and start building'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

// Builder ----------------------------------------------------------------------------------

export function TestBuilderView({ id }: { id: string }) {
  const router = useRouter();
  const { assigned } = useExaminer();
  const { state, reload, set } = useLoad(async () => {
    const [test, series] = await Promise.all([examinerApi.test(id), examinerApi.series()]);
    return { test, series };
  }, [id]);
  const latest = useRef<ExaminerTestDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [precheck, setPrecheck] = useState<TestPrecheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'submit' | 'delete' | null>(null);
  const [picking, setPicking] = useState<{ section: ExaminerTestSection; position: number } | null>(null);

  if (state.status === 'ready') latest.current = state.data.test;
  const update = (test: ExaminerTestDetail) => {
    latest.current = test;
    if (state.status === 'ready') set({ ...state.data, test });
  };

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  const saveSlots = (section: ExaminerTestSection, slots: (string | null)[]) =>
    run('slots', async () => {
      update(await examinerApi.setSection(id, section.id, { expectedUpdatedAt: latest.current!.updatedAt, questionIds: slots }));
    });

  if (state.status === 'loading') return <Waiting label="Loading the test…" />;
  if (state.status === 'error') {
    return (
      <State kind={errorKind(state.error)}
        title={isCode(state.error, 'NOT_FOUND') ? 'This test does not exist' : 'Could not load the test'}
        action={
          <Link className="btn btn-secondary" href="/examiner/tests">
            Back to tests
          </Link>
        }
      >
        {isCode(state.error, 'NOT_FOUND') ? 'It may have been deleted.' : messageOf(state.error)}
      </State>
    );
  }

  const { test, series } = state.data;
  const editable = isEditable(test.status);
  const inTest = new Set(test.sections.flatMap((section) => section.slots.flatMap((slot) => (slot.item ? [slot.item.questionId] : []))));
  const stale = isCode(error, 'STALE_EDIT');
  const updated = test.sections.flatMap((section) => section.slots).filter((slot) => slot.item?.newerVersionId).length;
  const flagged = test.sections.flatMap((section) =>
    section.slots
      .filter((slot) => slot.item?.qc && (slot.item.qc.action === 'request_change' || slot.item.qc.action === 'reject'))
      .map((slot) => ({ section: section.name, position: slot.position })),
  );

  return (
    <div className={styles.stack}>
      <p className={admin.crumbs}>
        <Link href="/examiner/tests">Tests</Link> / {test.title}
      </p>
      <PageHead
        title={test.title}
        lead={
          <>
            {test.examName} · {test.stageName} · {test.templateName} v{test.templateVersion} · {minutes(test.totalDurationSeconds)} · {test.totalMarks} marks
          </>
        }
        action={<StatusBadge status={test.status} />}
      />
      {error ? (
        <div className={styles.section}>
          <Alert>{messageOf(error)}</Alert>
          {stale ? (
            <button type="button" className="btn btn-secondary" onClick={() => { setError(null); void reload(); }}>
              Reload the latest version
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? <p role="status" className={styles.uploadOk}>{notice}</p> : null}
      {test.status === 'submitted' || test.status === 'in_qc' ? (
        <div className={admin.card} role="status">
          <b>With QC review.</b> A reviewer checks every question
          {test.qcDeadlineAt ? `, normally by ${dateTime(test.qcDeadlineAt)}` : ''}. You can edit the test again only if
          changes are requested.
        </div>
      ) : null}
      {test.status === 'live' || test.status === 'approved' || test.status === 'scheduled' ? (
        <div className={admin.card} role="status">
          <b>Approved and live.</b> The test is frozen; corrections become a new version through our team.
        </div>
      ) : null}
      {test.status === 'changes_requested' ? (
        <div className={styles.summary} role="alert">
          <h2>The reviewer asked for changes</h2>
          {test.review?.comments ? <p>{test.review.comments}</p> : null}
          <p>
            Approved questions are locked. Fix the {flagged.length} flagged question{flagged.length === 1 ? '' : 's'} below: edit it
            in your <Link href="/examiner/questions">question bank</Link> and use the updated version here, or replace it. Then
            submit again.
          </p>
        </div>
      ) : null}
      {editable && updated ? (
        <div className={admin.card} role="status">
          <div className={admin.cardHead}>
            <span>
              {updated} question{updated === 1 ? ' has' : 's have'} a newer version in your bank.
            </span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={() =>
                void run('latest', async () => {
                  update(await examinerApi.useLatestVersions(id, latest.current!.updatedAt));
                  setNotice('Updated versions placed.');
                })
              }
            >
              {busy === 'latest' ? 'Updating…' : 'Use updated versions'}
            </button>
          </div>
        </div>
      ) : null}

      <section className={`${admin.card} ${styles.section}`} aria-labelledby="progress-title">
        <div className={admin.cardHead}>
          <h2 id="progress-title">Progress</h2>
          {editable ? (
            <div className={admin.actions}>
              <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void run('check', async () => { const result = await examinerApi.precheck(id); update(result.test); setPrecheck(result.precheck); })}>
                {busy === 'check' ? 'Checking…' : 'Run checks'}
              </button>
              <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => setConfirm('submit')}>
                Submit for review
              </button>
            </div>
          ) : null}
        </div>
        <Progress filled={test.filledQuestions} total={test.totalQuestions} />
        {precheck ? <PrecheckReport precheck={precheck} /> : null}
      </section>

      {editable ? <SettingsForm test={test} series={series} busy={busy !== null} onSave={(body) => run('settings', async () => { update(await examinerApi.updateTest(id, { ...body, expectedUpdatedAt: latest.current!.updatedAt })); setNotice('Settings saved.'); })} /> : null}

      {editable ? (
        <ImportPanel
          title="Upload a test paper"
          options={assigned}
          fixed={{ examId: test.examId, stageId: test.stageId, templateId: test.templateId, label: `${test.examName} ${test.templateName} v${test.templateVersion}` }}
          onCommitted={async (result) => {
            update(await examinerApi.fillFromImport(id, { expectedUpdatedAt: latest.current!.updatedAt, importId: result.id }));
          }}
        />
      ) : null}

      {test.sections.map((section) => {
        const filled = section.slots.filter((slot) => slot.item).length;
        const slots = section.slots.map((slot) => slot.item?.questionId ?? null);
        return (
          <section key={section.id} className={`${admin.card} ${styles.section}`} aria-labelledby={`section-${section.id}`}>
            <div className={admin.cardHead}>
              <div>
                <h2 id={`section-${section.id}`}>
                  {section.order}. {section.name}
                </h2>
                <p className={admin.helper}>
                  {section.subjectName ? `${section.subjectName} · ` : ''}
                  {section.questionCount} questions · +{section.positiveMarks} / −{section.negativeMarks}
                  {section.durationSeconds ? ` · ${minutes(section.durationSeconds)}` : ''}
                </p>
              </div>
              <span className={`${admin.badge} ${filled === section.questionCount ? admin.badgeOn : admin.badgeDraft}`}>
                {filled} / {section.questionCount}
              </span>
            </div>
            <ol className={styles.slots}>
              {section.slots.map((slot) => (
                <li key={slot.position} className={styles.slot} data-empty={slot.item ? undefined : 'true'}>
                  <span className={styles.slotNo}>{slot.position}</span>
                  <span className={styles.slotText} title={slot.item?.stemEn}>
                    {slot.item ? slot.item.stemEn : 'Empty position'}
                    {slot.item?.qc && slot.item.qc.action !== 'approve' && slot.item.qc.action !== 'pending' && !slot.item.qcLocked ? (
                      <span className={styles.qcNote}>
                        <b>{slot.item.qc.action === 'reject' ? 'Rejected' : 'Change requested'}</b>
                        {slot.item.qc.reasonCode ? ` · ${QC_REASON_LABELS[slot.item.qc.reasonCode]}` : ''}
                        {slot.item.qc.comment ? `: ${slot.item.qc.comment}` : ''}
                      </span>
                    ) : null}
                    {slot.item?.newerVersionId && editable ? <span className={styles.qcHint}>Newer version in your bank</span> : null}
                  </span>
                  {editable ? (
                    <span className={admin.inlineActions}>
                      {slot.item?.qcLocked ? (
                        <span className={`${admin.badge} ${admin.badgeOn}`}>QC approved</span>
                      ) : (
                        <>
                          <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => setPicking({ section, position: slot.position })}>
                            {slot.item ? 'Replace' : 'Choose'}
                          </button>
                          {slot.item ? (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={busy !== null}
                              aria-label={`Remove question ${slot.position} from ${section.name}`}
                              onClick={() => void saveSlots(section, slots.map((value, index) => (index === slot.position - 1 ? null : value)))}
                            >
                              Remove
                            </button>
                          ) : null}
                        </>
                      )}
                    </span>
                  ) : slot.item ? (
                    <span className={`${admin.badge} ${slot.item.isApproved ? admin.badgeOn : admin.badgeDraft}`}>{slot.item.isApproved ? 'Approved' : 'Draft'}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      {editable && test.status === 'draft' ? (
        <section className={`${admin.card} ${styles.section}`} aria-labelledby="danger-title">
          <h2 id="danger-title">Delete this test</h2>
          <p className={styles.lead}>Deleting removes the test and its placements. Your questions stay in your bank.</p>
          <div className={admin.actions}>
            <button type="button" className={`btn btn-secondary ${admin.btnDanger ?? ''}`} disabled={busy !== null} onClick={() => setConfirm('delete')}>
              Delete test
            </button>
          </div>
        </section>
      ) : null}

      {picking ? (
        <QuestionPicker
          examId={test.examId}
          section={picking.section}
          position={picking.position}
          exclude={inTest}
          onClose={() => setPicking(null)}
          onPick={(question) => {
            const target = picking;
            setPicking(null);
            void saveSlots(
              target.section,
              target.section.slots.map((slot) => (slot.position === target.position ? question.id : (slot.item?.questionId ?? null))),
            );
          }}
        />
      ) : null}

      <Confirm
        open={confirm === 'submit'}
        title="Submit this test for review?"
        confirmLabel="Submit for review"
        busy={busy === 'submit'}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          void run('submit', async () => {
            const result = await examinerApi.submit(id, latest.current!.updatedAt);
            update(result.test);
            setPrecheck(result.precheck);
            setConfirm(null);
            if (result.precheck.canSubmit) setNotice('Submitted. QC review will check every question before the test goes live.');
          })
        }
      >
        We run the checks first. If they pass, the test is locked while QC reviews it.
      </Confirm>
      <Confirm
        open={confirm === 'delete'}
        title="Delete this test?"
        confirmLabel="Delete test"
        danger
        busy={busy === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          void run('delete', async () => {
            await examinerApi.deleteTest(id);
            router.replace('/examiner/tests');
          })
        }
      >
        This cannot be undone. Your questions stay in your question bank.
      </Confirm>
    </div>
  );
}

/** ISO time as the value of a datetime-local input, in the browser's own time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SettingsForm({
  test,
  series,
  busy,
  onSave,
}: {
  test: ExaminerTestDetail;
  series: ExaminerSeries[];
  busy: boolean;
  onSave: (body: Omit<UpdateExaminerTestRequest, 'expectedUpdatedAt'>) => void;
}) {
  const [title, setTitle] = useState(test.title);
  const [testType, setTestType] = useState(test.testType);
  const [accessType, setAccessType] = useState<ExaminerTestAccess>(test.accessType as ExaminerTestAccess);
  const [price, setPrice] = useState(test.pricePaise ? String(test.pricePaise / 100) : '');
  const [includedInPass, setIncludedInPass] = useState(test.includedInPass);
  const [hasHindi, setHasHindi] = useState(test.hasHindi);
  const [seriesId, setSeriesId] = useState(test.seriesId ?? '');
  const [schedule, setSchedule] = useState(toLocalInput(test.scheduledPublishAt));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Keep the form in step with the saved test (for example after a reload) without remounting.
  useEffect(() => {
    setTitle(test.title);
    setTestType(test.testType);
    setAccessType(test.accessType as ExaminerTestAccess);
    setPrice(test.pricePaise ? String(test.pricePaise / 100) : '');
    setIncludedInPass(test.includedInPass);
    setHasHindi(test.hasHindi);
    setSeriesId(test.seriesId ?? '');
    setSchedule(toLocalInput(test.scheduledPublishAt));
  }, [test.title, test.testType, test.accessType, test.pricePaise, test.includedInPass, test.hasHindi, test.seriesId, test.scheduledPublishAt]);

  const pricePaise = accessType === 'paid' ? toPaise(price) : 0;
  const dirty =
    title.trim() !== test.title ||
    testType !== test.testType ||
    accessType !== test.accessType ||
    pricePaise !== test.pricePaise ||
    includedInPass !== test.includedInPass ||
    hasHindi !== test.hasHindi ||
    (seriesId || null) !== test.seriesId ||
    schedule !== toLocalInput(test.scheduledPublishAt);
  const scheduleChanged = schedule !== toLocalInput(test.scheduledPublishAt);

  function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (title.trim().length < 3) found['title'] = 'Give the test a title of at least 3 characters.';
    const priceProblem = accessType === 'paid' ? priceError(price, test.priceBand) : null;
    if (priceProblem) found['price'] = priceProblem;
    if (accessType === 'series_only' && !seriesId) found['series'] = 'Choose the series this test is sold in.';
    if (scheduleChanged && schedule) {
      const at = new Date(schedule).getTime();
      if (Number.isNaN(at)) found['schedule'] = 'Choose a date and time.';
      else if (at < Date.now() + 10 * 60_000) found['schedule'] = 'Choose a time at least 10 minutes from now.';
      else if (at > Date.now() + 366 * 86_400_000) found['schedule'] = 'Choose a time within the next year.';
    }
    setErrors(found);
    if (Object.keys(found).length || pricePaise === null) return;
    onSave({
      title: title.trim(),
      testType: testType as 'mock' | 'pyq' | 'sectional',
      accessType,
      pricePaise,
      includedInPass,
      hasHindi,
      seriesId: seriesId || null,
      // Sent only when changed, so an older time that has passed never blocks other edits.
      ...(scheduleChanged ? { scheduledPublishAt: schedule ? new Date(schedule).toISOString() : null } : {}),
    });
  }

  return (
    <section className={`${admin.card} ${styles.section}`} aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>
      <form className={styles.section} onSubmit={submit} noValidate>
        <div className={`${admin.formGrid} ${admin.formGrid2}`}>
          <label className={admin.field}>
            <span>Title</span>
            <input className={`${admin.control} ${errors['title'] ? styles.invalid : ''}`} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
            {errors['title'] ? <p className={styles.fieldError}>{errors['title']}</p> : null}
          </label>
          <label className={admin.field}>
            <span>Test series</span>
            <select
              className={`${admin.control} ${errors['series'] ? styles.invalid : ''}`}
              value={seriesId}
              aria-invalid={errors['series'] ? true : undefined}
              onChange={(event) => setSeriesId(event.target.value)}
            >
              <option value="">Not in a series</option>
              {series
                .filter((item) => item.examId === test.examId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
            {errors['series'] ? <p className={styles.fieldError}>{errors['series']}</p> : null}
          </label>
        </div>
        <label className={admin.field}>
          <span>Type</span>
          <select className={admin.control} value={testType} onChange={(event) => setTestType(event.target.value)}>
            {TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <AccessFields
          accessType={accessType}
          setAccessType={setAccessType}
          price={price}
          setPrice={setPrice}
          includedInPass={includedInPass}
          setIncludedInPass={setIncludedInPass}
          band={test.priceBand}
          error={errors['price']}
        />
        <label className={styles.check}>
          <input type="checkbox" checked={hasHindi} onChange={(event) => setHasHindi(event.target.checked)} />
          <span>Bilingual (every question also in Hindi)</span>
        </label>
        <label className={admin.field}>
          <span>Publish at (optional)</span>
          <input
            type="datetime-local"
            className={`${admin.control} ${errors['schedule'] ? styles.invalid : ''}`}
            value={schedule}
            aria-invalid={errors['schedule'] ? true : undefined}
            aria-describedby="schedule-help"
            onChange={(event) => setSchedule(event.target.value)}
          />
          <span id="schedule-help" className={admin.helper}>
            Leave empty to publish as soon as review approves the test. If review finishes after this time, it publishes at once.
          </span>
          {errors['schedule'] ? <p className={styles.fieldError}>{errors['schedule']}</p> : null}
          {schedule ? (
            <button type="button" className="btn btn-secondary" onClick={() => setSchedule('')}>
              Clear the time
            </button>
          ) : null}
        </label>
        <div className={admin.actions}>
          <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>
            Save settings
          </button>
        </div>
      </form>
    </section>
  );
}

function QuestionPicker({
  examId,
  section,
  position,
  exclude,
  onClose,
  onPick,
}: {
  examId: string;
  section: ExaminerTestSection;
  position: number;
  exclude: Set<string>;
  onClose: () => void;
  onPick: (question: BankQuestion) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { state } = useLoad(
    () =>
      adminApi.examinerQuestions({
        status: 'all',
        examId,
        ...(section.subjectId ? { subjectId: section.subjectId } : {}),
        ...(query ? { q: query } : {}),
        page,
      }),
    [examId, section.subjectId, query, page],
  );
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={ref} className={admin.dialog} onClose={onClose} aria-labelledby="picker-title">
      <div className={admin.dialogBody}>
        <h2 id="picker-title">
          Choose question {position} for {section.name}
        </h2>
        <form
          className={admin.inline}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <label className={admin.field}>
            <span>Search your {section.subjectName ?? ''} questions</span>
            <input className={admin.control} type="search" maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>
        {state.status === 'loading' ? <Waiting label="Loading your questions…" /> : null}
        {state.status === 'error' ? <Alert>{messageOf(state.error)}</Alert> : null}
        {state.status === 'ready' ? (
          (() => {
            const items = state.data.items.filter((item) => !exclude.has(item.id));
            const pages = Math.max(1, Math.ceil(state.data.total / state.data.pageSize));
            return (
              <>
                {items.length ? (
                  <ul className={styles.pickList}>
                    {items.map((item) => (
                      <li key={item.id}>
                        <button type="button" onClick={() => onPick(item)}>
                          <span className={styles.slotText}>{item.stemEn}</span>
                          <span className={admin.helper}>
                            {item.isApproved ? 'Approved' : 'Draft'} · {item.difficulty}
                            {item.isPyq ? ` · PYQ ${item.pyqYear ?? ''}` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.lead}>
                    No unused questions here.{' '}
                    <Link href="/examiner/questions">Write a question</Link> or <Link href="/examiner/imports">upload a workbook</Link>.
                  </p>
                )}
                {pages > 1 ? (
                  <div className={admin.actions}>
                    <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      Previous
                    </button>
                    <span>
                      Page {page} of {pages}
                    </span>
                    <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                      Next
                    </button>
                  </div>
                ) : null}
              </>
            );
          })()
        ) : null}
        <div className={admin.dialogActions}>
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** A server field issue from a VALIDATION_FAILED reply, if it names this field. */
function fieldIssue(error: unknown, field: string): { field: string; message: string } | null {
  if (!isCode(error, 'VALIDATION_FAILED')) return null;
  const issues = (error as { details?: { issues?: { path?: unknown; message?: unknown }[] } }).details?.issues ?? [];
  const found = issues.find((issue) => issue.path === field);
  return found && typeof found.message === 'string' ? { field, message: found.message } : null;
}

/** Pre-submit results: blocking problems, policy warnings and the topic table (PRD 4.2 step 5). */
function PrecheckReport({ precheck }: { precheck: TestPrecheck }) {
  const blocks = precheck.issues.filter((issue) => issue.severity === 'block');
  const warnings = precheck.issues.filter((issue) => issue.severity === 'warn');
  const offTarget = precheck.patternFit.filter((row) => row.target !== null && row.target !== row.actual);
  return (
    <div className={styles.stack}>
      {precheck.canSubmit ? (
        <p className={styles.uploadOk}>✓ All checks passed. PYQ share {precheck.pyqPercentage}%. Ready to submit.</p>
      ) : (
        <div className={styles.summary} role="alert">
          <h2>Fix these before submitting</h2>
          <ul>
            {precheck.blockingErrors.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {precheck.sectionMismatches.map((item) => (
              <li key={item.sectionName}>
                {item.sectionName}: {item.actualCount} of {item.expectedCount} questions placed
              </li>
            ))}
            {blocks.map((issue) => (
              <li key={`${issue.questionId}-${issue.message}`}>
                {issue.sectionName} · question {issue.position}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length ? (
        <div className={admin.card}>
          <b>For the reviewer to decide ({warnings.length})</b>
          <p className={admin.helper}>These do not stop you submitting. The reviewer sees the matching questions side by side.</p>
          <ul className={styles.issueList}>
            {warnings.map((issue) => (
              <li key={`${issue.questionId}-${issue.message}`}>
                {issue.sectionName} · question {issue.position}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {offTarget.length ? (
        <div className={admin.card}>
          <b>Topic mix compared with the pattern</b>
          <p className={admin.helper}>A guide, not a rule: the reviewer sees the same table.</p>
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
        </div>
      ) : null}
    </div>
  );
}

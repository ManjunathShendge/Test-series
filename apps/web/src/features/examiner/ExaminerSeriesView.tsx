'use client';

import { errorKind } from '@/ui/errors/ErrorScreen';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { ExaminerSeries, ExaminerSeriesDetail } from '@exam-prep/contracts';
import { examinerApi, rupees } from '@/lib/api/examiner';
import { Alert, Waiting } from '@/features/auth/ui';
import { Confirm, isCode, messageOf, State, useLoad } from '@/features/admin/ui';
import admin from '@/features/admin/admin.module.css';
import { PageHead, useExaminer } from './ExaminerShell';
import { isEditable, TestTable, toPaise } from './ExaminerTestsView';
import styles from './examiner.module.css';

type SeriesForm = { title: string; examId: string; stageId: string; description: string; price: string; validityDays: string; totalPlannedTests: string };

function validateSeries(form: SeriesForm): { errors: Record<string, string>; pricePaise: number | null } {
  const errors: Record<string, string> = {};
  if (form.title.trim().length < 3) errors['title'] = 'Give the series a title of at least 3 characters.';
  const pricePaise = form.price.trim() === '' ? 0 : toPaise(form.price);
  if (pricePaise === null || pricePaise > 1_000_000) errors['price'] = 'Enter a price from ₹0 to ₹10,000, with up to two decimals.';
  const validity = Number(form.validityDays);
  if (!Number.isInteger(validity) || validity < 1 || validity > 1095) errors['validityDays'] = 'Enter validity from 1 to 1095 days.';
  const planned = Number(form.totalPlannedTests);
  if (!Number.isInteger(planned) || planned < 1 || planned > 200) errors['totalPlannedTests'] = 'Enter from 1 to 200 planned tests.';
  if (form.description.length > 2000) errors['description'] = 'Keep the description under 2000 characters.';
  return { errors, pricePaise };
}

function SeriesFields({ form, set, errors, examLocked }: { form: SeriesForm; set: (patch: Partial<SeriesForm>) => void; errors: Record<string, string>; examLocked: boolean }) {
  const { assigned } = useExaminer();
  const exam = assigned.exams.find((item) => item.id === form.examId);
  const error = (key: string) => (errors[key] ? <p className={styles.fieldError}>{errors[key]}</p> : null);
  const cls = (key: string) => `${admin.control} ${errors[key] ? styles.invalid : ''}`;
  return (
    <>
      <label className={admin.field}>
        <span>Title</span>
        <input className={cls('title')} value={form.title} maxLength={200} placeholder="SSC CGL Tier 1 Full Mock Series" onChange={(event) => set({ title: event.target.value })} />
        {error('title')}
      </label>
      <div className={`${admin.formGrid} ${admin.formGrid2}`}>
        <label className={admin.field}>
          <span>Exam</span>
          <select className={admin.control} value={form.examId} disabled={examLocked} onChange={(event) => set({ examId: event.target.value, stageId: '' })}>
            {assigned.exams.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className={admin.field}>
          <span>Stage (optional)</span>
          <select className={admin.control} value={form.stageId} disabled={examLocked} onChange={(event) => set({ stageId: event.target.value })}>
            <option value="">All stages</option>
            {exam?.stages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={admin.field}>
        <span>Description (optional)</span>
        <textarea className={cls('description')} rows={3} maxLength={2000} value={form.description} onChange={(event) => set({ description: event.target.value })} />
        {error('description')}
      </label>
      <div className={`${admin.formGrid} ${admin.formGrid3}`}>
        <label className={admin.field}>
          <span>Proposed price (₹, 0 for free)</span>
          <input className={cls('price')} inputMode="decimal" value={form.price} onChange={(event) => set({ price: event.target.value.replace(/[^\d.]/g, '') })} />
          {error('price')}
        </label>
        <label className={admin.field}>
          <span>Validity (days)</span>
          <input className={cls('validityDays')} inputMode="numeric" value={form.validityDays} onChange={(event) => set({ validityDays: event.target.value.replace(/\D/g, '').slice(0, 4) })} />
          {error('validityDays')}
        </label>
        <label className={admin.field}>
          <span>Planned tests</span>
          <input className={cls('totalPlannedTests')} inputMode="numeric" value={form.totalPlannedTests} onChange={(event) => set({ totalPlannedTests: event.target.value.replace(/\D/g, '').slice(0, 3) })} />
          {error('totalPlannedTests')}
        </label>
      </div>
    </>
  );
}

function SeriesTable({ series }: { series: ExaminerSeries[] }) {
  return (
    <div className={admin.tableWrap} role="region" aria-label="Test series" tabIndex={0}>
      <table className={admin.table}>
        <thead>
          <tr>
            <th scope="col">Series</th>
            <th scope="col">Tests</th>
            <th scope="col">Price</th>
            <th scope="col">Validity</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className={admin.srOnly}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {series.map((item) => (
            <tr key={item.id}>
              <td className={admin.wrap}>
                <b>{item.title}</b>
                <div className="t-small t-secondary">
                  {item.examName}
                  {item.stageName ? ` · ${item.stageName}` : ''}
                </div>
              </td>
              <td>
                {item.testCount} / {item.totalPlannedTests}
              </td>
              <td>{rupees(item.pricePaise)}</td>
              <td>{item.validityDays} days</td>
              <td>
                <span className={`${admin.badge} ${item.isPublished ? admin.badgeOn : admin.badgeDraft}`}>{item.isPublished ? 'Published' : 'Draft'}</span>
              </td>
              <td>
                <Link className="btn btn-secondary" href={`/examiner/series/${item.id}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SeriesView() {
  const router = useRouter();
  const { assigned } = useExaminer();
  const { state, reload } = useLoad(() => examinerApi.series(), []);
  const [creating, setCreating] = useState(false);
  const blank: SeriesForm = { title: '', examId: assigned.exams[0]?.id ?? '', stageId: '', description: '', price: '', validityDays: '365', totalPlannedTests: '10' };
  const [form, setForm] = useState<SeriesForm>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    const { errors: found, pricePaise } = validateSeries(form);
    setErrors(found);
    if (Object.keys(found).length || pricePaise === null || !form.examId) return;
    setBusy(true);
    setError(null);
    try {
      const created = await examinerApi.createSeries({
        examId: form.examId,
        stageId: form.stageId || null,
        title: form.title.trim(),
        description: form.description.trim(),
        pricePaise,
        validityDays: Number(form.validityDays),
        totalPlannedTests: Number(form.totalPlannedTests),
      });
      router.push(`/examiner/series/${created.id}`);
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  return (
    <div className={styles.stack}>
      <PageHead
        title="Test series"
        lead="Group tests for one exam into a series students buy together. Our team publishes a series after its tests pass QC."
        action={
          creating ? null : (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)} disabled={!assigned.exams.length}>
              Create series
            </button>
          )
        }
      />
      {creating ? (
        <section className={`${admin.card} ${styles.section}`} aria-labelledby="create-series-title">
          <h2 id="create-series-title">Create a test series</h2>
          {error ? <Alert>{messageOf(error)}</Alert> : null}
          <form className={styles.section} onSubmit={(event) => void create(event)} noValidate>
            <SeriesFields form={form} set={(patch) => setForm((current) => ({ ...current, ...patch }))} errors={errors} examLocked={false} />
            <div className={admin.actions}>
              <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined}>
                {busy ? 'Creating…' : 'Create series'}
              </button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setCreating(false); setForm(blank); setErrors({}); }}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}
      {state.status === 'loading' ? <Waiting label="Loading your series…" /> : null}
      {state.status === 'error' ? (
        <State kind={errorKind(state.error)} title="Could not load your series" action={<button type="button" className="btn btn-primary" onClick={() => void reload()}>Try again</button>}>
          {messageOf(state.error)}
        </State>
      ) : null}
      {state.status === 'ready' ? (
        state.data.length ? (
          <section className={`${admin.card} ${styles.section}`} aria-label="Your series">
            <SeriesTable series={state.data} />
          </section>
        ) : creating ? null : (
          <State title="No series yet" action={<button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>Create your first series</button>}>
            A series bundles several tests for one exam, for example ten full mocks.
          </State>
        )
      ) : null}
    </div>
  );
}

export function SeriesDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { state, reload, set } = useLoad(async () => {
    const [series, tests] = await Promise.all([examinerApi.oneSeries(id), examinerApi.tests()]);
    return { series, tests };
  }, [id]);
  const [form, setForm] = useState<SeriesForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addId, setAddId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const series = state.status === 'ready' ? state.data.series : null;
  useEffect(() => {
    if (!series) return;
    setForm({
      title: series.title,
      examId: series.examId,
      stageId: series.stageId ?? '',
      description: series.description,
      price: series.pricePaise ? String(series.pricePaise / 100) : '0',
      validityDays: String(series.validityDays),
      totalPlannedTests: String(series.totalPlannedTests),
    });
  }, [series]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }
  const replaceSeries = (next: ExaminerSeriesDetail) => {
    if (state.status === 'ready') set({ ...state.data, series: next });
  };
  const refresh = async () => {
    const [next, tests] = await Promise.all([examinerApi.oneSeries(id), examinerApi.tests()]);
    set({ series: next, tests });
  };

  if (state.status === 'loading' || (state.status === 'ready' && !form)) return <Waiting label="Loading the series…" />;
  if (state.status === 'error')
    return (
      <State kind={errorKind(state.error)} title={isCode(state.error, 'NOT_FOUND') ? 'This series does not exist' : 'Could not load the series'} action={<Link className="btn btn-secondary" href="/examiner/series">Back to series</Link>}>
        {isCode(state.error, 'NOT_FOUND') ? 'It may have been deleted.' : messageOf(state.error)}
      </State>
    );
  const detail = state.data.series;
  const candidates = state.data.tests.filter((test) => test.examId === detail.examId && test.seriesId !== detail.id && isEditable(test.status));

  function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const { errors: found, pricePaise } = validateSeries(form);
    setErrors(found);
    if (Object.keys(found).length || pricePaise === null) return;
    void run(async () => {
      replaceSeries(
        await examinerApi.updateSeries(id, {
          expectedUpdatedAt: detail.updatedAt,
          title: form.title.trim(),
          description: form.description.trim(),
          pricePaise,
          validityDays: Number(form.validityDays),
          totalPlannedTests: Number(form.totalPlannedTests),
        }),
      );
      setNotice('Series saved.');
    });
  }

  return (
    <div className={styles.stack}>
      <p className={admin.crumbs}>
        <Link href="/examiner/series">Test series</Link> / {detail.title}
      </p>
      <PageHead
        title={detail.title}
        lead={`${detail.examName}${detail.stageName ? ` · ${detail.stageName}` : ''} · ${detail.testCount} of ${detail.totalPlannedTests} planned tests · ${rupees(detail.pricePaise)} · ${detail.validityDays} days`}
        action={<span className={`${admin.badge} ${detail.isPublished ? admin.badgeOn : admin.badgeDraft}`}>{detail.isPublished ? 'Published' : 'Draft'}</span>}
      />
      {error ? (
        <div className={styles.section}>
          <Alert>{messageOf(error)}</Alert>
          {isCode(error, 'STALE_EDIT') ? (
            <button type="button" className="btn btn-secondary" onClick={() => { setError(null); void reload(); }}>
              Reload the latest version
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? <p role="status" className={styles.uploadOk}>{notice}</p> : null}

      <section className={`${admin.card} ${styles.section}`} aria-labelledby="series-tests-title">
        <div className={admin.cardHead}>
          <h2 id="series-tests-title">Tests in this series</h2>
          <Link className="btn btn-primary" href={`/examiner/tests?series=${detail.id}`}>
            Create a test in this series
          </Link>
        </div>
        {detail.tests.length ? <TestTable tests={detail.tests} showSeries={false} /> : <p className={styles.lead}>No tests yet. Create one, or add an existing draft below.</p>}
        {candidates.length ? (
          <div className={admin.inline}>
            <label className={admin.field}>
              <span>Add an existing draft test</span>
              <select className={admin.control} value={addId} onChange={(event) => setAddId(event.target.value)}>
                <option value="">Choose a test</option>
                {candidates.map((test) => (
                  <option key={test.id} value={test.id}>
                    {test.title}
                    {test.seriesTitle ? ` (now in ${test.seriesTitle})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !addId}
              onClick={() =>
                void run(async () => {
                  const test = candidates.find((item) => item.id === addId)!;
                  await examinerApi.updateTest(test.id, { expectedUpdatedAt: test.updatedAt, seriesId: detail.id });
                  setAddId('');
                  await refresh();
                  setNotice('Test added to the series.');
                })
              }
            >
              Add to series
            </button>
          </div>
        ) : null}
        {detail.tests.some((test) => isEditable(test.status)) ? (
          <ul className={styles.slots}>
            {detail.tests
              .filter((test) => isEditable(test.status))
              .map((test) => (
                <li key={test.id} className={styles.slot}>
                  <span className={styles.slotNo}>—</span>
                  <span className={styles.slotText}>{test.title}</span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await examinerApi.updateTest(test.id, { expectedUpdatedAt: test.updatedAt, seriesId: null });
                        await refresh();
                        setNotice('Test removed from the series. It is still in your tests.');
                      })
                    }
                  >
                    Remove from series
                  </button>
                </li>
              ))}
          </ul>
        ) : null}
      </section>

      <section className={`${admin.card} ${styles.section}`} aria-labelledby="series-publish-title">
        <div className={admin.cardHead}>
          <div>
            <h2 id="series-publish-title">{detail.isPublished ? 'Published' : 'Publish'}</h2>
            <p>
              {detail.isPublished
                ? 'Students can see and buy this series on the website and app. New tests join it as they pass review. Unpublish to edit the details or stop new sales; buyers keep their access.'
                : detail.liveTestCount
                  ? `${detail.liveTestCount} of its tests passed review and ${detail.liveTestCount === 1 ? 'is' : 'are'} live. Publish to show the series to students.`
                  : 'You can publish once at least one test in this series has passed review and is live.'}
            </p>
          </div>
          <button
            type="button"
            className={`btn ${detail.isPublished ? 'btn-secondary' : 'btn-primary'}`}
            disabled={busy || (!detail.isPublished && detail.liveTestCount === 0)}
            onClick={() => setConfirmPublish(true)}
          >
            {detail.isPublished ? 'Unpublish' : 'Publish series'}
          </button>
        </div>
      </section>
      <Confirm
        open={confirmPublish}
        title={detail.isPublished ? 'Unpublish this series?' : 'Publish this series?'}
        confirmLabel={detail.isPublished ? 'Unpublish' : 'Publish'}
        danger={detail.isPublished}
        busy={busy}
        onClose={() => setConfirmPublish(false)}
        onConfirm={() =>
          void run(async () => {
            const next = !detail.isPublished;
            replaceSeries(await examinerApi.publishSeries(id, next, detail.updatedAt));
            setConfirmPublish(false);
            setNotice(next ? 'Series published. Students can now buy it.' : 'Series unpublished. It is hidden and no longer sold.');
          })
        }
      >
        {detail.isPublished
          ? 'It leaves the website and app and cannot be bought. Students who already bought it keep access until their validity ends.'
          : `${rupees(detail.pricePaise)} for ${detail.validityDays} days of access. Price and validity are locked while it is published.`}
      </Confirm>

      {detail.isPublished ? null : form ? (
        <section className={`${admin.card} ${styles.section}`} aria-labelledby="series-settings-title">
          <h2 id="series-settings-title">Series details</h2>
          <form className={styles.section} onSubmit={save} noValidate>
            <SeriesFields form={form} set={(patch) => setForm((current) => (current ? { ...current, ...patch } : current))} errors={errors} examLocked />
            <div className={admin.actions}>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Save series
              </button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmDelete(true)}>
                Delete series
              </button>
            </div>
          </form>
        </section>
      ) : null}
      <Confirm
        open={confirmDelete}
        title="Delete this series?"
        confirmLabel="Delete series"
        danger
        busy={busy}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          void run(async () => {
            await examinerApi.deleteSeries(id);
            router.replace('/examiner/series');
          })
        }
      >
        The tests stay in your tests list; they are only taken out of this series.
      </Confirm>
    </div>
  );
}

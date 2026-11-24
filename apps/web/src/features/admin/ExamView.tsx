'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AdminCategory, AdminExam, AuditEntry, ExamCutoff, ExamDateInput } from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { Alert, BusyButton, Notice } from '@/features/auth/ui';
import { InlineRename } from './ExamsView';
import { Confirm, LoadGate, StatusBadge, formatWhen, isCode, messageOf, minutes, slugify, useLoad, useUnsavedWarning } from './ui';
import styles from './admin.module.css';

/** /admin/exams/[id]: everything an admin owns for one exam (PRD 3, 6 "Exam page", 8). */
export function ExamView({ id }: { id: string }) {
  const { state, reload, set } = useLoad(async () => {
    const [exam, categories] = await Promise.all([adminApi.exam(id), adminApi.categories()]);
    return { exam, categories };
  }, [id]);
  // Bumped after every change so the history panel re-reads the audit log.
  const [changes, setChanges] = useState(0);

  return (
    <LoadGate state={state} reload={() => void reload()} what="exam">
      {({ exam, categories }) => {
        const update = (next: AdminExam) => {
          set({ exam: next, categories });
          setChanges((n) => n + 1);
        };
        return (
          <>
            <nav aria-label="Breadcrumb">
              <ol className={styles.crumbs}>
                <li><Link href="/admin/exams">Exams</Link></li>
                <li aria-current="page">{exam.name}</li>
              </ol>
            </nav>
            <div className={styles.pageHead}>
              <div>
                <h1>{exam.name}</h1>
                <p>
                  {exam.category.name} · <StatusBadge status={exam.isActive ? 'shown' : 'hidden'} />
                </p>
              </div>
              {exam.isActive ? (
                <a className="btn btn-secondary" href={`/exams/${exam.slug}`} target="_blank" rel="noreferrer">
                  View on website
                </a>
              ) : null}
            </div>
            <div className={`${styles.grid} ${styles.gridSide}`}>
              <div className={styles.grid}>
                <Templates exam={exam} />
                <Stages exam={exam} onChange={update} />
                <Syllabus exam={exam} onChange={update} />
                <Details exam={exam} categories={categories} onChange={update} onReload={() => void reload()} />
              </div>
              <History examId={exam.id} version={changes} />
            </div>
          </>
        );
      }}
    </LoadGate>
  );
}

// Details ----------------------------------------------------------------------------
function Details({
  exam,
  categories,
  onChange,
  onReload,
}: {
  exam: AdminExam;
  categories: AdminCategory[];
  onChange: (e: AdminExam) => void;
  onReload: () => void;
}) {
  const initial = useMemo(
    () => ({
      name: exam.name,
      slug: exam.slug,
      categoryId: exam.category.id,
      isActive: exam.isActive,
      syllabus: exam.syllabusMarkdown ?? '',
      lastCutoff: exam.lastCutoffScore === null ? '' : String(exam.lastCutoffScore),
      dates: exam.importantDates,
      cutoffs: exam.previousCutoffs.map((c) => ({ label: c.label, score: String(c.score) })),
      ai: exam.aiChecks,
    }),
    [exam],
  );
  const [form, setForm] = useState(initial);
  // After a save (here or a reload), show what the server stored; keep the "Saved." note.
  const [syncedAt, setSyncedAt] = useState(exam.updatedAt);
  if (exam.updatedAt !== syncedAt) {
    setSyncedAt(exam.updatedAt);
    setForm(initial);
  }
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsavedWarning(dirty);
  const slugLocked = exam.isActive && exam.liveTestCount > 0;
  const hasPublished = exam.templates.some((t) => t.status === 'published');
  const field = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const lastCutoff = form.lastCutoff.trim() === '' ? null : Number(form.lastCutoff);
    if (lastCutoff !== null && !(lastCutoff >= 0 && lastCutoff <= 1000)) return setError('The last cutoff must be a number from 0 to 1000.');
    const dates: ExamDateInput[] = form.dates.filter((d) => d.label.trim() || d.date);
    if (dates.some((d) => !d.label.trim() || !d.date)) return setError('Each important date needs a label and a date.');
    const cutoffs: ExamCutoff[] = [];
    for (const c of form.cutoffs.filter((x) => x.label.trim() || x.score.trim())) {
      const score = Number(c.score);
      if (!c.label.trim() || c.score.trim() === '' || !(score >= 0 && score <= 1000)) return setError('Each previous cutoff needs a label and a score from 0 to 1000.');
      cutoffs.push({ label: c.label.trim(), score: Math.round(score * 100) / 100 });
    }
    setBusy(true);
    try {
      const next = await adminApi.updateExam(exam.id, {
        expectedUpdatedAt: exam.updatedAt,
        name: form.name.trim(),
        ...(slugLocked ? {} : { slug: form.slug }),
        categoryId: form.categoryId,
        isActive: form.isActive,
        syllabusMarkdown: form.syllabus.trim() || null,
        lastCutoffScore: lastCutoff === null ? null : Math.round(lastCutoff * 100) / 100,
        importantDates: dates.map((d) => ({ label: d.label.trim(), date: d.date })),
        previousCutoffs: cutoffs,
        aiChecks: form.ai,
      });
      onChange(next);
      setSaved(true);
    } catch (err) {
      if (isCode(err, 'STALE_EDIT')) setStale(true);
      else setError(isCode(err, 'ALREADY_EXISTS') ? 'Another exam already uses this web address.' : messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="details-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="details-title">Exam page details</h2>
          <p>Shown on the public exam page: syllabus, important dates and cutoffs.</p>
        </div>
        {dirty ? <span className={styles.dirty}>Unsaved changes</span> : null}
      </div>
      <form className={styles.formGrid} onSubmit={(e) => void submit(e)} noValidate>
        <div className={`${styles.formGrid} ${styles.formGrid3}`}>
          <TextField id="exam-name" label="Exam name" value={form.name} onChange={(v) => field('name', v)} />
          <div className={styles.field}>
            <label className={styles.label} htmlFor="exam-slug">Web address</label>
            <input
              id="exam-slug"
              className={styles.control}
              value={form.slug}
              disabled={slugLocked}
              aria-describedby="exam-slug-help"
              onChange={(e) => field('slug', e.target.value.toLowerCase())}
            />
            <p id="exam-slug-help" className={styles.helper}>
              {slugLocked ? 'Locked while the exam is on the website with live tests.' : `/exams/${form.slug}`}
            </p>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="exam-category">Category</label>
            <select id="exam-category" className={styles.control} value={form.categoryId} onChange={(e) => field('categoryId', e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.isActive}
            disabled={!form.isActive && !hasPublished}
            onChange={(e) => field('isActive', e.target.checked)}
            aria-describedby="exam-active-help"
          />
          Show this exam on the website
        </label>
        <p id="exam-active-help" className={styles.helper} style={{ marginTop: '-12px' }}>
          {hasPublished ? 'Students see the exam page and its live tests.' : 'Publish a template first; the exam page shows its pattern.'}
        </p>

        <fieldset className={styles.field} aria-describedby="exam-ai-help">
          <legend className={styles.label}>AI suggestions for QC reviewers</legend>
          <p id="exam-ai-help" className={styles.helper}>
            Advisory only: AI never approves, rejects or edits a question. It never sees the answer key. Runs when a test enters QC and only
            when the server has an AI key.
          </p>
          {(
            [
              ['answer', 'Blind answer check (flags a possible wrong key; skipped for questions with figures)'],
              ['ambiguity', 'Ambiguity check (more than one or no defensible option)'],
              ['language', 'Hindi and English equivalence (bilingual questions)'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className={styles.check}>
              <input type="checkbox" checked={form.ai[key]} onChange={(e) => field('ai', { ...form.ai, [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </fieldset>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="exam-syllabus">Syllabus</label>
          <textarea
            id="exam-syllabus"
            className={styles.control}
            value={form.syllabus}
            maxLength={20000}
            aria-describedby="exam-syllabus-help"
            onChange={(e) => field('syllabus', e.target.value)}
          />
          <p id="exam-syllabus-help" className={styles.helper}>Start a line with “- ” for a bullet. Shown as plain text, never as HTML.</p>
        </div>

        <RowsEditor
          legend="Important dates"
          rows={form.dates}
          empty={{ label: '', date: '' }}
          max={20}
          onChange={(rows) => field('dates', rows)}
          render={(row, set, i) => (
            <>
              <TextField id={`date-label-${i}`} label="Label" value={row.label} placeholder="Tier 1 exam" onChange={(v) => set({ ...row, label: v })} />
              <TextField id={`date-date-${i}`} label="Date" type="date" value={row.date} onChange={(v) => set({ ...row, date: v })} />
            </>
          )}
        />
        <div className={`${styles.formGrid} ${styles.formGrid3}`}>
          <TextField id="exam-last-cutoff" label="Last cutoff score" type="number" inputMode="decimal" value={form.lastCutoff} onChange={(v) => field('lastCutoff', v)} />
        </div>
        <RowsEditor
          legend="Previous cutoffs"
          rows={form.cutoffs}
          empty={{ label: '', score: '' }}
          max={30}
          onChange={(rows) => field('cutoffs', rows)}
          render={(row, set, i) => (
            <>
              <TextField id={`cutoff-label-${i}`} label="Year and category" value={row.label} placeholder="2025, General" onChange={(v) => set({ ...row, label: v })} />
              <TextField id={`cutoff-score-${i}`} label="Score" type="number" inputMode="decimal" value={row.score} onChange={(v) => set({ ...row, score: v })} />
            </>
          )}
        />

        {stale ? (
          <Alert>
            Someone else saved this exam after you opened it.{' '}
            <button type="button" className={styles.link} onClick={onReload}>Reload their version</button> and make your change again.
          </Alert>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
        {saved && !dirty ? <Notice>Saved.</Notice> : null}
        <div className={styles.actions}>
          <BusyButton busy={busy} type="submit" className="btn btn-primary" disabled={!dirty || stale}>Save details</BusyButton>
          {dirty ? (
            <button type="button" className="btn btn-secondary" onClick={() => setForm(initial)} disabled={busy}>Discard changes</button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: 'decimal' | 'numeric';
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <input id={id} className={styles.control} type={type} value={value} placeholder={placeholder} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function RowsEditor<T>({
  legend,
  rows,
  empty,
  max,
  onChange,
  render,
}: {
  legend: string;
  rows: T[];
  empty: T;
  max: number;
  onChange: (rows: T[]) => void;
  render: (row: T, set: (row: T) => void, index: number) => React.ReactNode;
}) {
  return (
    <fieldset className={styles.formGrid} style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className={styles.label} style={{ marginBottom: 'var(--space-sm)' }}>{legend}</legend>
      {rows.map((row, i) => (
        <div key={i} className={styles.inline}>
          {render(row, (next) => onChange(rows.map((r, j) => (j === i ? next : r))), i)}
          <button type="button" className={`${styles.link} ${styles.danger}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <div>
        <button type="button" className={`btn btn-secondary ${styles.small}`} onClick={() => onChange([...rows, empty])} disabled={rows.length >= max}>
          Add {legend.toLowerCase().replace(/s$/, '')}
        </button>
      </div>
    </fieldset>
  );
}

// Stages -----------------------------------------------------------------------------
function Stages({ exam, onChange }: { exam: AdminExam; onChange: (e: AdminExam) => void }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<AdminExam>) => {
    setError(null);
    try {
      onChange(await work());
      return true;
    } catch (err) {
      setError(isCode(err, 'ALREADY_EXISTS') ? 'This exam already has a stage with that name.' : messageOf(err));
      return false;
    }
  };
  return (
    <section className={styles.card} aria-labelledby="stages-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="stages-title">Stages</h2>
          <p>Each stage (Prelims, Mains, Tier 1…) has its own pattern template.</p>
        </div>
      </div>
      {exam.stages.length ? (
        <ul className={styles.rows}>
          {exam.stages.map((s) => (
            <li key={s.id} className={styles.row}>
              {editing === s.id ? (
                <InlineRename
                  initial={s.name}
                  label="Stage name"
                  onSave={async (n) => {
                    if (await act(() => adminApi.updateStage(s.id, { name: n, slug: slugify(n) }))) setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <>
                  <div className={styles.rowMain}>
                    <strong>{s.name}</strong>
                    {s.inUse ? <small>Used by a template</small> : null}
                  </div>
                  <button className={styles.link} onClick={() => setEditing(s.id)}>Rename</button>
                  <button
                    className={`${styles.link} ${styles.danger}`}
                    disabled={s.inUse}
                    title={s.inUse ? 'Used by a template or test' : undefined}
                    onClick={() => void act(() => adminApi.deleteStage(s.id))}
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className={styles.inline}
        style={{ marginTop: 'var(--space-lg)' }}
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return setError('Enter a stage name.');
          setBusy(true);
          if (await act(() => adminApi.addStage(exam.id, { name: name.trim(), slug: slugify(name) }))) setName('');
          setBusy(false);
        }}
      >
        <div className={styles.field}>
          <label className={styles.label} htmlFor="new-stage">New stage</label>
          <input id="new-stage" className={styles.control} value={name} placeholder="Tier 1" onChange={(e) => setName(e.target.value)} />
        </div>
        <BusyButton busy={busy} type="submit" className="btn btn-secondary">Add stage</BusyButton>
      </form>
      {error ? <div style={{ marginTop: 'var(--space-md)' }}><Alert>{error}</Alert></div> : null}
    </section>
  );
}

// Syllabus tree ----------------------------------------------------------------------
function Syllabus({ exam, onChange }: { exam: AdminExam; onChange: (e: AdminExam) => void }) {
  const [subject, setSubject] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<{ kind: 'subject' | 'topic'; id: string; name: string } | null>(null);
  const act = async (work: () => Promise<AdminExam>, duplicate = 'That name is already used here.') => {
    setError(null);
    try {
      onChange(await work());
      return true;
    } catch (err) {
      setError(isCode(err, 'ALREADY_EXISTS') ? duplicate : messageOf(err));
      return false;
    }
  };
  return (
    <section className={styles.card} aria-labelledby="syllabus-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="syllabus-title">Syllabus tree</h2>
          <p>Subjects and topics. Examiners tag every question from this list, and templates set topic targets from it.</p>
        </div>
      </div>
      {exam.subjects.map((s) => (
        <SubjectBlock key={s.id} subject={s} act={act} onRemove={setRemoving} />
      ))}
      <form
        className={styles.inline}
        style={{ marginTop: 'var(--space-lg)' }}
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!subject.trim()) return setError('Enter a subject name.');
          setBusy(true);
          if (await act(() => adminApi.addSubject(exam.id, subject.trim()), 'This exam already has that subject.')) setSubject('');
          setBusy(false);
        }}
      >
        <div className={styles.field}>
          <label className={styles.label} htmlFor="new-subject">New subject</label>
          <input id="new-subject" className={styles.control} value={subject} placeholder="Quantitative Aptitude" onChange={(e) => setSubject(e.target.value)} />
        </div>
        <BusyButton busy={busy} type="submit" className="btn btn-secondary">Add subject</BusyButton>
      </form>
      {error ? <div style={{ marginTop: 'var(--space-md)' }}><Alert>{error}</Alert></div> : null}
      <Confirm
        open={removing !== null}
        title={`Delete ${removing?.name ?? ''}?`}
        confirmLabel={`Delete ${removing?.kind ?? ''}`}
        danger
        onConfirm={async () => {
          if (!removing) return;
          const r = removing;
          setRemoving(null);
          await act(() => (r.kind === 'subject' ? adminApi.deleteSubject(r.id) : adminApi.deleteTopic(r.id)));
        }}
        onClose={() => setRemoving(null)}
      >
        {removing?.kind === 'subject' ? 'The subject and all its topics are removed.' : 'The topic is removed from this subject.'} Nothing uses it yet.
      </Confirm>
    </section>
  );
}

function SubjectBlock({
  subject,
  act,
  onRemove,
}: {
  subject: AdminExam['subjects'][number];
  act: (work: () => Promise<AdminExam>, duplicate?: string) => Promise<boolean>;
  onRemove: (r: { kind: 'subject' | 'topic'; id: string; name: string }) => void;
}) {
  const [topics, setTopics] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  // Open new (empty) subjects; after that the admin decides, and adding topics never collapses it.
  const [open, setOpen] = useState(subject.topics.length === 0);
  return (
    <details className={styles.subject} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className={styles.rowMain}>
          <strong>{subject.name}</strong>
          <small>{subject.topics.length} {subject.topics.length === 1 ? 'topic' : 'topics'}</small>
        </span>
      </summary>
      <div className={styles.subjectBody}>
        {renaming === subject.id ? (
          <InlineRename
            initial={subject.name}
            label="Subject name"
            onSave={async (n) => {
              if (await act(() => adminApi.renameSubject(subject.id, n), 'This exam already has that subject.')) setRenaming(null);
            }}
            onCancel={() => setRenaming(null)}
          />
        ) : (
          <div className={styles.actions}>
            <button className={styles.link} onClick={() => setRenaming(subject.id)}>Rename subject</button>
            <button
              className={`${styles.link} ${styles.danger}`}
              disabled={subject.inUse}
              title={subject.inUse ? 'Questions or templates use it' : undefined}
              onClick={() => onRemove({ kind: 'subject', id: subject.id, name: subject.name })}
            >
              Delete subject
            </button>
          </div>
        )}
        {subject.topics.length ? (
          <ul className={styles.topics} aria-label={`Topics in ${subject.name}`}>
            {subject.topics.map((t) =>
              renaming === t.id ? (
                <li key={t.id} style={{ flex: '1 1 100%' }}>
                  <InlineRename
                    initial={t.name}
                    label="Topic name"
                    onSave={async (n) => {
                      if (await act(() => adminApi.renameTopic(t.id, n), 'This subject already has that topic.')) setRenaming(null);
                    }}
                    onCancel={() => setRenaming(null)}
                  />
                </li>
              ) : (
                <li key={t.id} className={styles.topic}>
                  <button type="button" onClick={() => setRenaming(t.id)} aria-label={`Rename ${t.name}`} style={{ width: 'auto', borderRadius: 0, padding: 0, color: 'inherit', background: 'none' }}>
                    {t.name}
                  </button>
                  <button
                    type="button"
                    disabled={t.inUse}
                    aria-label={t.inUse ? `${t.name} is in use and cannot be deleted` : `Delete ${t.name}`}
                    title={t.inUse ? 'Questions or template targets use it' : 'Delete'}
                    onClick={() => onRemove({ kind: 'topic', id: t.id, name: t.name })}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                  </button>
                </li>
              ),
            )}
          </ul>
        ) : null}
        <form
          className={styles.inline}
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const names = topics.split('\n').map((x) => x.trim()).filter(Boolean);
            if (!names.length) return;
            if (names.length > 100) return setAdded('Add up to 100 topics at a time.');
            setBusy(true);
            const ok = await act(() => adminApi.addTopics(subject.id, names));
            setBusy(false);
            if (ok) {
              setTopics('');
              setAdded('Topics added. Any that were already in the list were skipped.');
            }
          }}
        >
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`topics-${subject.id}`}>Add topics</label>
            <textarea
              id={`topics-${subject.id}`}
              className={styles.control}
              style={{ minHeight: 88 }}
              value={topics}
              placeholder={'Percentages\nProfit and loss\nTime and work'}
              aria-describedby={`topics-help-${subject.id}`}
              onChange={(e) => {
                setTopics(e.target.value);
                setAdded(null);
              }}
            />
            <p id={`topics-help-${subject.id}`} className={styles.helper}>One topic per line. Click a topic to rename it.</p>
          </div>
          <BusyButton busy={busy} type="submit" className="btn btn-secondary">Add topics</BusyButton>
        </form>
        {added ? <p className={styles.helper} role="status">{added}</p> : null}
      </div>
    </details>
  );
}

// Templates --------------------------------------------------------------------------
function Templates({ exam }: { exam: AdminExam }) {
  return (
    <section className={styles.card} aria-labelledby="templates-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="templates-title">Pattern templates</h2>
          <p>Sections, question counts, timing and marking. Examiners build every test on a published template.</p>
        </div>
        {exam.stages.length ? (
          <Link className="btn btn-primary" href={`/admin/exams/${exam.id}/templates/new`}>New template</Link>
        ) : null}
      </div>
      {!exam.stages.length ? (
        <p className={styles.helper}>Add a stage below first; each template belongs to a stage.</p>
      ) : !exam.templates.length ? (
        <p className={styles.helper}>No templates yet. Create one for each stage.</p>
      ) : (
        <div className={styles.tableWrap} role="region" aria-label="Templates" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Template</th>
                <th scope="col">Stage</th>
                <th scope="col">Status</th>
                <th scope="col" className={styles.num}>Questions</th>
                <th scope="col" className={styles.num}>Minutes</th>
                <th scope="col" className={styles.num}>Tests</th>
              </tr>
            </thead>
            <tbody>
              {exam.templates.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/admin/exams/${exam.id}/templates/${t.id}`}>{t.name}</Link>
                    <div className="t-small t-secondary">Version {t.version}</div>
                  </td>
                  <td>{t.stage.name}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td className={styles.num}>{t.totalQuestions}</td>
                  <td className={styles.num}>{minutes(t.totalDurationSeconds)}</td>
                  <td className={styles.num}>{t.testCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// History ----------------------------------------------------------------------------
const ACTIONS: Record<string, string> = {
  'catalogue.exam.create': 'Created the exam',
  'catalogue.exam.update': 'Edited exam details',
  'catalogue.stage.create': 'Added a stage',
  'catalogue.stage.update': 'Renamed a stage',
  'catalogue.stage.delete': 'Deleted a stage',
  'catalogue.subject.create': 'Added a subject',
  'catalogue.subject.rename': 'Renamed a subject',
  'catalogue.subject.delete': 'Deleted a subject',
  'catalogue.topic.create': 'Added a topic',
  'catalogue.topic.rename': 'Renamed a topic',
  'catalogue.topic.delete': 'Deleted a topic',
  'catalogue.template.create': 'Created a template draft',
  'catalogue.template.save_draft': 'Saved a template draft',
  'catalogue.template.publish': 'Published a template',
  'catalogue.template.new_version': 'Started a new template version',
  'catalogue.template.retire_superseded': 'Retired the previous version',
  'catalogue.template.retire': 'Retired a template',
  'catalogue.template.reinstate': 'Reinstated a template',
  'catalogue.template.delete_draft': 'Deleted a template draft',
};
const FIELD: Record<string, string> = {
  name: 'name', slug: 'web address', category_id: 'category', is_active: 'visibility', syllabus_markdown: 'syllabus',
  important_dates: 'dates', previous_cutoffs: 'cutoffs', last_cutoff_score: 'last cutoff', published_at: 'published',
  stage_id: 'stage', total_questions: 'questions', total_duration_seconds: 'duration', has_sectional_timing: 'timing',
  default_positive_marks: 'marks', default_negative_marks: 'negative marks', display_order: 'order',
};

function History({ examId, version }: { examId: string; version: number }) {
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    adminApi
      .history(examId)
      .then((r) => live && (setItems(r), setError(false)))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [examId, version]);
  return (
    <aside className={styles.card} aria-labelledby="history-title" style={{ position: 'sticky', top: 76 }}>
      <div className={styles.cardHead}>
        <div>
          <h2 id="history-title">Recent changes</h2>
          <p>From the audit log: who changed what, and when.</p>
        </div>
      </div>
      {error ? (
        <p className={styles.helper}>Could not load the history.</p>
      ) : !items ? (
        <p className={styles.helper}>Loading…</p>
      ) : !items.length ? (
        <p className={styles.helper}>No changes recorded yet.</p>
      ) : (
        <ol className={styles.history}>
          {items.map((i) => {
            const fields = i.changedFields.map((f) => FIELD[f]).filter(Boolean);
            return (
              <li key={i.id}>
                <strong>{ACTIONS[i.action] ?? i.action}</strong>
                {fields.length ? <small>Changed {[...new Set(fields)].join(', ')}</small> : null}
                <small>
                  {i.actor.name} · <time dateTime={i.at}>{formatWhen(i.at)}</time>
                </small>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

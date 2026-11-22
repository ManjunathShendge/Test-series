'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { templateIssues, type AdminExam, type AdminTemplate, type CreateTemplateRequest, type TemplateSectionInput } from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { ApiRequestError } from '@/lib/api/http';
import { Alert, BusyButton, Notice } from '@/features/auth/ui';
import { Confirm, LoadGate, StatusBadge, formatWhen, isCode, messageOf, minutes, useLoad, useUnsavedWarning } from './ui';
import styles from './admin.module.css';

/*
 * Pattern template editor (PRD 3 "Exam template": sections, counts, timing, marking scheme and
 * target topic counts per section). Drafts save even when incomplete; the same checks the API
 * uses on publish (templateIssues) are shown live. Published templates are read-only.
 */

interface SectionForm {
  key: string;
  name: string;
  subjectId: string;
  questions: string;
  minutes: string;
  positive: string;
  negative: string;
  targets: Record<string, string>;
}
interface TemplateForm {
  stageId: string;
  name: string;
  questions: string;
  minutes: string;
  sectional: boolean;
  positive: string;
  negative: string;
  sections: SectionForm[];
}

let keySeq = 0;
const key = () => `s${++keySeq}`;
const asText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
const marks = (v: string) => (/^\d+(\.\d{1,2})?$/.test(v.trim()) ? Number(v) : NaN);
/** Form content without the editor-only section keys, for change detection. */
const comparable = (f: TemplateForm) => JSON.stringify({ ...f, sections: f.sections.map(({ key: _k, ...rest }) => rest) });
const mins = (v: string) => (/^\d+(\.\d+)?$/.test(v.trim()) ? Math.round(Number(v) * 60) : NaN);

function toForm(t: AdminTemplate | null, exam: AdminExam): TemplateForm {
  if (!t) {
    return { stageId: exam.stages[0]?.id ?? '', name: '', questions: '100', minutes: '60', sectional: false, positive: '2', negative: '0.5', sections: [] };
  }
  return {
    stageId: t.stage.id,
    name: t.name,
    questions: String(t.totalQuestions),
    minutes: String(minutes(t.totalDurationSeconds)),
    sectional: t.hasSectionalTiming,
    positive: String(t.defaultPositiveMarks),
    negative: String(t.defaultNegativeMarks),
    sections: t.sections.map((s) => ({
      key: key(),
      name: s.name,
      subjectId: s.subjectId ?? '',
      questions: String(s.questionCount),
      minutes: s.durationSeconds === null ? '' : String(minutes(s.durationSeconds)),
      positive: String(s.positiveMarks),
      negative: String(s.negativeMarks),
      targets: Object.fromEntries(Object.entries(s.targetTopicCounts).map(([k, v]) => [k, asText(v)])),
    })),
  };
}

/** Converts the form to a request, or explains the first field that is not a valid number. */
function toRequest(f: TemplateForm): { ok: true; value: CreateTemplateRequest } | { ok: false; error: string } {
  const totalQuestions = int(f.questions);
  const totalDurationSeconds = mins(f.minutes);
  const defaultPositiveMarks = marks(f.positive);
  const defaultNegativeMarks = marks(f.negative);
  if (!f.name.trim()) return { ok: false, error: 'Give the template a name.' };
  if (!f.stageId) return { ok: false, error: 'Choose a stage.' };
  if (!(totalQuestions >= 1 && totalQuestions <= 500)) return { ok: false, error: 'Total questions must be a whole number from 1 to 500.' };
  if (!(totalDurationSeconds >= 60 && totalDurationSeconds <= 21600)) return { ok: false, error: 'Total time must be from 1 to 360 minutes.' };
  if (!(defaultPositiveMarks <= 100) || !(defaultNegativeMarks <= 100)) return { ok: false, error: 'Default marks must be numbers with up to two decimals.' };
  const sections: TemplateSectionInput[] = [];
  for (const [i, s] of f.sections.entries()) {
    const label = s.name.trim() || `Section ${i + 1}`;
    const questionCount = int(s.questions);
    const positiveMarks = marks(s.positive);
    const negativeMarks = marks(s.negative);
    const durationSeconds = f.sectional && s.minutes.trim() ? mins(s.minutes) : null;
    if (!s.name.trim()) return { ok: false, error: `Name section ${i + 1}.` };
    if (!(questionCount >= 1 && questionCount <= 500)) return { ok: false, error: `${label}: questions must be a whole number from 1 to 500.` };
    if (durationSeconds !== null && !(durationSeconds >= 60 && durationSeconds <= 21600)) return { ok: false, error: `${label}: time must be from 1 to 360 minutes.` };
    if (!(positiveMarks <= 100) || !(negativeMarks <= 100)) return { ok: false, error: `${label}: marks must be numbers with up to two decimals.` };
    const targetTopicCounts: Record<string, number> = {};
    for (const [topic, v] of Object.entries(s.targets)) {
      if (!v.trim()) continue;
      const n = int(v);
      if (!(n >= 1 && n <= 500)) return { ok: false, error: `${label}: topic targets must be whole numbers from 1 to 500, or left empty.` };
      targetTopicCounts[topic] = n;
    }
    sections.push({ name: s.name.trim(), subjectId: s.subjectId || null, questionCount, durationSeconds, positiveMarks, negativeMarks, targetTopicCounts });
  }
  return {
    ok: true,
    value: { stageId: f.stageId, name: f.name.trim(), totalQuestions, totalDurationSeconds, hasSectionalTiming: f.sectional, defaultPositiveMarks, defaultNegativeMarks, sections },
  };
}

export function TemplateEditor({ examId, templateId }: { examId: string; templateId?: string }) {
  const { state, reload, set } = useLoad(async () => {
    const [exam, template] = await Promise.all([adminApi.exam(examId), templateId ? adminApi.template(templateId) : Promise.resolve(null)]);
    if (template && template.examId !== exam.id) throw new ApiRequestError(404, 'NOT_FOUND', 'Template not found');
    return { exam, template };
  }, [examId, templateId]);
  return (
    <LoadGate state={state} reload={() => void reload()} what="template">
      {({ exam, template }) => (
        <Editor
          key={template ? template.id : 'new'}
          exam={exam}
          template={template}
          onSaved={(t) => set({ exam, template: t })}
          onReload={() => void reload()}
        />
      )}
    </LoadGate>
  );
}

function Editor({
  exam,
  template,
  onSaved,
  onReload,
}: {
  exam: AdminExam;
  template: AdminTemplate | null;
  onSaved: (t: AdminTemplate) => void;
  onReload: () => void;
}) {
  const router = useRouter();
  const initial = useMemo(() => toForm(template, exam), [template, exam]);
  const [form, setForm] = useState(initial);
  // After a save, publish or reinstate, show what the server stored.
  const [syncedAt, setSyncedAt] = useState(template?.updatedAt);
  if (template?.updatedAt !== syncedAt) {
    setSyncedAt(template?.updatedAt);
    setForm(initial);
  }
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'version' | 'availability' | 'delete'>(null);
  const [confirm, setConfirm] = useState<null | 'publish' | 'retire' | 'delete'>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const readOnly = template !== null && template.status !== 'draft';
  const dirty = !readOnly && comparable(form) !== comparable(initial);
  useUnsavedWarning(dirty);

  const topicSubject = useMemo(() => new Map(exam.subjects.flatMap((s) => s.topics.map((t) => [t.id, s.id] as const))), [exam]);
  const parsed = toRequest(form);
  const issues = parsed.ok ? templateIssues(parsed.value, topicSubject) : [parsed.error];
  const sumQuestions = form.sections.reduce((n, s) => n + (int(s.questions) || 0), 0);
  const sumMinutes = form.sections.reduce((n, s) => n + (Number(s.minutes) || 0), 0);

  const fail = (err: unknown) => {
    if (isCode(err, 'STALE_EDIT')) setStale(true);
    else if (isCode(err, 'TEMPLATE_NOT_PUBLISHABLE')) setError('Fix the items listed under “Before publishing”.');
    else setError(messageOf(err));
    requestAnimationFrame(() => errorRef.current?.focus());
  };
  const patch = (changes: Partial<TemplateForm>) => {
    setNotice(null);
    setForm((f) => ({ ...f, ...changes }));
  };
  const patchSection = (k: string, changes: Partial<SectionForm>) =>
    patch({ sections: form.sections.map((s) => (s.key === k ? { ...s, ...changes } : s)) });

  /** Saves the draft (creating it the first time); returns the saved template. */
  const save = async (): Promise<AdminTemplate | null> => {
    setError(null);
    if (!parsed.ok) {
      setError(parsed.error);
      requestAnimationFrame(() => errorRef.current?.focus());
      return null;
    }
    try {
      if (!template) {
        const created = await adminApi.createTemplate(exam.id, parsed.value);
        router.replace(`/admin/exams/${exam.id}/templates/${created.id}`);
        return created;
      }
      const saved = await adminApi.updateTemplate(template.id, { ...parsed.value, expectedUpdatedAt: template.updatedAt });
      onSaved(saved);
      return saved;
    } catch (err) {
      fail(err);
      return null;
    }
  };

  const run = async (kind: NonNullable<typeof busy>, work: () => Promise<void>) => {
    if (busy) return; // double clicks
    setBusy(kind);
    setError(null);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  };

  const title = template ? template.name : 'New template';
  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol className={styles.crumbs}>
          <li><Link href="/admin/exams">Exams</Link></li>
          <li><Link href={`/admin/exams/${exam.id}`}>{exam.name}</Link></li>
          <li aria-current="page">{title}</li>
        </ol>
      </nav>
      <div className={styles.pageHead}>
        <div>
          <h1>{title}</h1>
          <p>
            {template ? (
              <>
                Version {template.version} · <StatusBadge status={template.status} />
                {template.publishedAt ? ` · published ${formatWhen(template.publishedAt)}` : ''}
              </>
            ) : (
              'A draft until you publish it. Examiners only see published templates.'
            )}
          </p>
        </div>
        {dirty ? <span className={styles.dirty}>Unsaved changes</span> : null}
      </div>

      <div className={`${styles.grid} ${styles.gridSide}`}>
        <div className={styles.grid}>
          <section className={styles.card} aria-labelledby="pattern-title">
            <div className={styles.cardHead}>
              <div>
                <h2 id="pattern-title">Pattern</h2>
                <p>The whole paper. Section totals must match these before publishing.</p>
              </div>
            </div>
            <fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <div className={`${styles.formGrid} ${styles.formGrid2}`}>
                <Input id="t-name" label="Template name" value={form.name} placeholder="SSC CGL Tier 1 (official pattern)" onChange={(v) => patch({ name: v })} />
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="t-stage">Stage</label>
                  <select id="t-stage" className={styles.control} value={form.stageId} onChange={(e) => patch({ stageId: e.target.value })}>
                    {exam.stages.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={`${styles.formGrid} ${styles.formGrid4}`} style={{ marginTop: 'var(--space-lg)' }}>
                <Input id="t-questions" label="Total questions" inputMode="numeric" value={form.questions} onChange={(v) => patch({ questions: v })} />
                <Input id="t-minutes" label="Total time (minutes)" inputMode="decimal" value={form.minutes} onChange={(v) => patch({ minutes: v })} />
                <Input id="t-positive" label="Default marks, correct" inputMode="decimal" value={form.positive} onChange={(v) => patch({ positive: v })} />
                <Input id="t-negative" label="Default marks, wrong (−)" inputMode="decimal" value={form.negative} onChange={(v) => patch({ negative: v })} />
              </div>
              <label className={styles.check} style={{ marginTop: 'var(--space-md)' }}>
                <input type="checkbox" checked={form.sectional} onChange={(e) => patch({ sectional: e.target.checked })} />
                Each section has its own time limit
              </label>
            </fieldset>
          </section>

          <section className={styles.card} aria-labelledby="sections-title">
            <div className={styles.cardHead}>
              <div>
                <h2 id="sections-title">Sections</h2>
                <p>In paper order. Topic targets drive the pattern-fit warning examiners see.</p>
              </div>
            </div>
            {form.sections.length ? (
              <ol className={styles.sections}>
                {form.sections.map((s, i) => (
                  <SectionCard
                    key={s.key}
                    index={i}
                    count={form.sections.length}
                    section={s}
                    exam={exam}
                    sectional={form.sectional}
                    readOnly={readOnly}
                    onChange={(c) => patchSection(s.key, c)}
                    onMove={(d) => {
                      const next = [...form.sections];
                      const [moved] = next.splice(i, 1);
                      next.splice(i + d, 0, moved!);
                      patch({ sections: next });
                    }}
                    onRemove={() => patch({ sections: form.sections.filter((x) => x.key !== s.key) })}
                  />
                ))}
              </ol>
            ) : (
              <p className={styles.helper}>No sections yet.</p>
            )}
            {!readOnly ? (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 'var(--space-lg)' }}
                disabled={form.sections.length >= 20}
                onClick={() =>
                  patch({
                    sections: [
                      ...form.sections,
                      { key: key(), name: '', subjectId: '', questions: '', minutes: '', positive: form.positive, negative: form.negative, targets: {} },
                    ],
                  })
                }
              >
                Add section
              </button>
            ) : null}
          </section>
        </div>

        <aside className={styles.summary} aria-label="Template summary and actions">
          <section className={styles.card}>
            <h2>Summary</h2>
            <dl className={styles.totals}>
              <div>
                <dt>Questions</dt>
                <dd>{sumQuestions} / {form.questions || '—'}</dd>
              </div>
              <div>
                <dt>Minutes</dt>
                <dd>{form.sectional ? `${Math.round(sumMinutes * 100) / 100} / ` : ''}{form.minutes || '—'}</dd>
              </div>
            </dl>
            <div style={{ marginTop: 'var(--space-lg)' }}>
              {readOnly ? (
                <p className={styles.lockNote}>
                  {template?.status === 'retired' ? 'Retired: examiners cannot start new tests on it. ' : 'Published and locked. '}
                  {template?.testCount ? `${template.testCount} ${template.testCount === 1 ? 'test uses' : 'tests use'} it.` : 'No tests use it yet.'}
                </p>
              ) : issues.length ? (
                <>
                  <h3 className={styles.label} id="issues-title">Before publishing</h3>
                  <ul className={styles.issues} aria-labelledby="issues-title">
                    {issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className={styles.ready}>Ready to publish.</p>
              )}
            </div>
            <div ref={errorRef} tabIndex={-1} style={{ marginTop: 'var(--space-md)', outline: 'none' }}>
              {stale ? (
                <Alert>
                  Someone else saved this template after you opened it.{' '}
                  <button type="button" className={styles.link} onClick={onReload}>Reload their version</button>
                </Alert>
              ) : null}
              {error ? <Alert>{error}</Alert> : null}
              {notice ? <Notice>{notice}</Notice> : null}
            </div>
            <div className={styles.grid} style={{ gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
              {!readOnly ? (
                <>
                  <BusyButton
                    busy={busy === 'save'}
                    className="btn btn-secondary btn-full"
                    disabled={(!dirty && template !== null) || busy !== null || stale}
                    onClick={() =>
                      void run('save', async () => {
                        if (await save()) setNotice('Draft saved.');
                      })
                    }
                  >
                    {template ? 'Save draft' : 'Create draft'}
                  </BusyButton>
                  {template ? (
                    <BusyButton
                      busy={busy === 'publish'}
                      className="btn btn-primary btn-full"
                      disabled={issues.length > 0 || busy !== null || stale}
                      onClick={() => setConfirm('publish')}
                    >
                      {dirty ? 'Save and publish' : 'Publish'}
                    </BusyButton>
                  ) : null}
                  {template ? (
                    <button type="button" className={`${styles.link} ${styles.danger}`} disabled={busy !== null} onClick={() => setConfirm('delete')}>
                      Delete draft
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <BusyButton
                    busy={busy === 'version'}
                    className="btn btn-primary btn-full"
                    disabled={busy !== null}
                    onClick={() =>
                      void run('version', async () => {
                        try {
                          const draft = await adminApi.newVersion(template!.id);
                          router.push(`/admin/exams/${exam.id}/templates/${draft.id}`);
                        } catch (err) {
                          fail(err);
                        }
                      })
                    }
                  >
                    Create new version
                  </BusyButton>
                  {template?.status === 'published' ? (
                    <button type="button" className="btn btn-secondary btn-full" disabled={busy !== null} onClick={() => setConfirm('retire')}>
                      Retire
                    </button>
                  ) : (
                    <BusyButton
                      busy={busy === 'availability'}
                      className="btn btn-secondary btn-full"
                      disabled={busy !== null}
                      onClick={() =>
                        void run('availability', async () => {
                          try {
                            onSaved(await adminApi.reinstateTemplate(template!.id));
                          } catch (err) {
                            fail(err);
                          }
                        })
                      }
                    >
                      Reinstate
                    </BusyButton>
                  )}
                </>
              )}
            </div>
          </section>
        </aside>
      </div>

      <Confirm
        open={confirm === 'publish'}
        title="Publish this template?"
        confirmLabel="Publish"
        busy={busy === 'publish'}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          void run('publish', async () => {
            const current = dirty ? await save() : template;
            if (!current) return setConfirm(null);
            try {
              onSaved(await adminApi.publishTemplate(current.id, current.updatedAt));
              setNotice('Published. Examiners can now build tests on it.');
            } catch (err) {
              fail(err);
            }
            setConfirm(null);
          })
        }
      >
        Examiners can build tests on it straight away. After publishing it is locked: to change it you create a new version
        {template?.supersedesTemplateId ? ', and publishing this one retires the version it replaces' : ''}.
      </Confirm>
      <Confirm
        open={confirm === 'retire'}
        title="Retire this template?"
        confirmLabel="Retire"
        danger
        busy={busy === 'availability'}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          void run('availability', async () => {
            try {
              onSaved(await adminApi.retireTemplate(template!.id));
            } catch (err) {
              fail(err);
            }
            setConfirm(null);
          })
        }
      >
        Examiners will not be able to start new tests on it. Tests already built on it are not affected. You can reinstate it later.
      </Confirm>
      <Confirm
        open={confirm === 'delete'}
        title="Delete this draft?"
        confirmLabel="Delete draft"
        danger
        busy={busy === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          void run('delete', async () => {
            try {
              await adminApi.deleteTemplate(template!.id);
              router.replace(`/admin/exams/${exam.id}`);
            } catch (err) {
              fail(err);
              setConfirm(null);
            }
          })
        }
      >
        The draft and its sections are removed. This cannot be undone.
      </Confirm>
    </>
  );
}

function SectionCard({
  index,
  count,
  section: s,
  exam,
  sectional,
  readOnly,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  section: SectionForm;
  exam: AdminExam;
  sectional: boolean;
  readOnly: boolean;
  onChange: (c: Partial<SectionForm>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const id = `sec-${s.key}`;
  const subject = exam.subjects.find((x) => x.id === s.subjectId);
  const targeted = Object.values(s.targets).reduce((n, v) => n + (int(v) || 0), 0);
  return (
    <li className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.sectionHead}>
        <strong id={`${id}-title`}>
          {index + 1}. {s.name.trim() || 'Untitled section'}
        </strong>
        {!readOnly ? (
          <>
            <button type="button" className={styles.link} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move section ${index + 1} up`}>
              Move up
            </button>
            <button type="button" className={styles.link} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move section ${index + 1} down`}>
              Move down
            </button>
            <button type="button" className={`${styles.link} ${styles.danger}`} onClick={onRemove}>
              Remove
            </button>
          </>
        ) : null}
      </div>
      <fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <legend className="visually-hidden">Section {index + 1}</legend>
        <div className={`${styles.formGrid} ${styles.formGrid2}`}>
          <Input id={`${id}-name`} label="Section name" value={s.name} placeholder="Quantitative Aptitude" onChange={(v) => onChange({ name: v })} />
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-subject`}>Subject</label>
            <select
              id={`${id}-subject`}
              className={styles.control}
              value={s.subjectId}
              onChange={(e) => onChange({ subjectId: e.target.value, targets: {} })}
              aria-describedby={`${id}-subject-help`}
            >
              <option value="">No subject</option>
              {exam.subjects.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
            <p id={`${id}-subject-help`} className={styles.helper}>Questions are tagged from its topics.</p>
          </div>
        </div>
        <div className={`${styles.formGrid} ${sectional ? styles.formGrid4 : styles.formGrid3}`} style={{ marginTop: 'var(--space-md)' }}>
          <Input id={`${id}-questions`} label="Questions" inputMode="numeric" value={s.questions} onChange={(v) => onChange({ questions: v })} />
          {sectional ? <Input id={`${id}-minutes`} label="Time (minutes)" inputMode="decimal" value={s.minutes} onChange={(v) => onChange({ minutes: v })} /> : null}
          <Input id={`${id}-positive`} label="Marks, correct" inputMode="decimal" value={s.positive} onChange={(v) => onChange({ positive: v })} />
          <Input id={`${id}-negative`} label="Marks, wrong (−)" inputMode="decimal" value={s.negative} onChange={(v) => onChange({ negative: v })} />
        </div>
        {subject && subject.topics.length ? (
          <details style={{ marginTop: 'var(--space-md)' }} open={Object.keys(s.targets).length > 0 || undefined}>
            <summary className={styles.label} style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
              Topic targets ({targeted} of {s.questions || 0} questions)
            </summary>
            <div className={styles.targets} style={{ marginTop: 'var(--space-sm)' }}>
              {subject.topics.map((t) => (
                <label key={t.id} className={styles.target}>
                  <span>{t.name}</span>
                  <input
                    className={styles.control}
                    inputMode="numeric"
                    value={s.targets[t.id] ?? ''}
                    aria-label={`Target questions for ${t.name}`}
                    onChange={(e) => {
                      const next = { ...s.targets };
                      if (e.target.value.trim()) next[t.id] = e.target.value;
                      else delete next[t.id];
                      onChange({ targets: next });
                    }}
                  />
                </label>
              ))}
            </div>
          </details>
        ) : subject ? (
          <p className={styles.helper} style={{ marginTop: 'var(--space-md)' }}>
            {subject.name} has no topics yet. Add them on the <Link href={`/admin/exams/${exam.id}`}>exam page</Link> to set targets.
          </p>
        ) : null}
      </fieldset>
    </li>
  );
}

function Input({
  id,
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: 'numeric' | 'decimal';
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <input id={id} className={styles.control} value={value} placeholder={placeholder} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { AdminCategory, AdminExamSummary } from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { Alert, BusyButton } from '@/features/auth/ui';
import { Confirm, LoadGate, State, StatusBadge, isCode, messageOf, slugify, useLoad } from './ui';
import styles from './admin.module.css';

/** /admin/exams: categories and exams, with "new exam" as the way into template setup. */
export function ExamsView() {
  const { state, reload, set } = useLoad(async () => {
    const [categories, exams] = await Promise.all([adminApi.categories(), adminApi.exams()]);
    return { categories, exams };
  }, []);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Exams and templates</h1>
          <p>Set up categories, exams, stages, the syllabus and the official pattern examiners build tests on.</p>
        </div>
      </div>
      <LoadGate state={state} reload={() => void reload()} what="exams">
        {(data) => (
          <div className={`${styles.grid} ${styles.gridSide}`}>
            <Exams exams={data.exams} categories={data.categories} />
            <Categories
              categories={data.categories}
              onChange={(categories) => set({ ...data, categories })}
              refresh={() => void reload(true)}
            />
          </div>
        )}
      </LoadGate>
    </>
  );
}

function Exams({ exams, categories }: { exams: AdminExamSummary[]; categories: AdminCategory[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className={styles.card} aria-labelledby="exams-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="exams-title">Exams</h2>
          <p>New exams stay hidden from the website until they have a published template and you show them.</p>
        </div>
        {!adding ? (
          <button className="btn btn-primary" onClick={() => setAdding(true)} disabled={!categories.length}>
            New exam
          </button>
        ) : null}
      </div>
      {adding ? <NewExam categories={categories} onCancel={() => setAdding(false)} /> : null}
      {!categories.length ? (
        <State title="Add a category first">Exams sit inside a category such as SSC, Banking or Railways. Add one on the right.</State>
      ) : !exams.length ? (
        <State title="No exams yet">Add the first exam, then its stages, syllabus and template.</State>
      ) : (
        <div className={styles.tableWrap} role="region" aria-label="Exams" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Exam</th>
                <th scope="col">Category</th>
                <th scope="col">Website</th>
                <th scope="col" className={styles.num}>Stages</th>
                <th scope="col" className={styles.num}>Subjects</th>
                <th scope="col">Templates</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/admin/exams/${e.id}`}>{e.name}</Link>
                    <div className="t-small t-secondary">/exams/{e.slug}</div>
                  </td>
                  <td>{e.category.name}</td>
                  <td>
                    <StatusBadge status={e.isActive ? 'shown' : 'hidden'} />
                  </td>
                  <td className={styles.num}>{e.stageCount}</td>
                  <td className={styles.num}>{e.subjectCount}</td>
                  <td>
                    {e.publishedTemplateCount} published
                    {e.draftTemplateCount ? `, ${e.draftTemplateCount} draft` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NewExam({ categories, onCancel }: { categories: AdminCategory[]; onCancel: () => void }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (!name.trim()) found.name = 'Enter the exam name.';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2) found.slug = 'Use lowercase letters, numbers and single hyphens.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setError(null);
    try {
      const exam = await adminApi.createExam({ categoryId, name: name.trim(), slug });
      router.push(`/admin/exams/${exam.id}`);
    } catch (err) {
      if (isCode(err, 'ALREADY_EXISTS')) setErrors({ slug: 'Another exam already uses this web address.' });
      else setError(messageOf(err));
      setBusy(false);
    }
  };

  return (
    <form className={`${styles.formGrid} ${styles.formGrid3}`} onSubmit={(e) => void submit(e)} noValidate style={{ marginBottom: 'var(--space-xl)' }}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="new-exam-category">Category</label>
        <select id="new-exam-category" className={styles.control} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="new-exam-name">Exam name</label>
        <input
          id="new-exam-name"
          className={styles.control}
          value={name}
          placeholder="SSC CHSL"
          autoFocus
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'new-exam-name-error' : undefined}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
        {errors.name ? <p id="new-exam-name-error" className={styles.error}>{errors.name}</p> : null}
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="new-exam-slug">Web address</label>
        <input
          id="new-exam-slug"
          className={styles.control}
          value={slug}
          aria-invalid={errors.slug ? true : undefined}
          aria-describedby={`new-exam-slug-help${errors.slug ? ' new-exam-slug-error' : ''}`}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
        />
        <p id="new-exam-slug-help" className={styles.helper}>/exams/{slug || '…'}</p>
        {errors.slug ? <p id="new-exam-slug-error" className={styles.error}>{errors.slug}</p> : null}
      </div>
      {error ? <div className={styles.span2}><Alert>{error}</Alert></div> : null}
      <div className={`${styles.actions} ${styles.span2}`}>
        <BusyButton busy={busy} type="submit" className="btn btn-primary">Create exam</BusyButton>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function Categories({ categories, onChange, refresh }: { categories: AdminCategory[]; onChange: (c: AdminCategory[]) => void; refresh: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AdminCategory | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter a category name.');
    setBusy(true);
    setError(null);
    try {
      const created = await adminApi.createCategory({ name: trimmed, slug: slugify(trimmed), displayOrder: categories.length + 1 });
      onChange([...categories, created]);
      setName('');
    } catch (err) {
      setError(isCode(err, 'ALREADY_EXISTS') ? 'A category with this name already exists.' : messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const update = async (c: AdminCategory, changes: { name?: string; isActive?: boolean }) => {
    setError(null);
    try {
      const updated = await adminApi.updateCategory(c.id, changes.name ? { ...changes, slug: slugify(changes.name) } : changes);
      onChange(categories.map((x) => (x.id === c.id ? updated : x)));
      setEditing(null);
    } catch (err) {
      setError(isCode(err, 'ALREADY_EXISTS') ? 'A category with this name already exists.' : messageOf(err));
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await adminApi.deleteCategory(removing.id);
      onChange(categories.filter((x) => x.id !== removing.id));
      setRemoving(null);
    } catch (err) {
      setError(messageOf(err));
      setRemoving(null);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="categories-title">
      <div className={styles.cardHead}>
        <div>
          <h2 id="categories-title">Categories</h2>
          <p>Hidden categories hide all their exams from the website.</p>
        </div>
      </div>
      {categories.length ? (
        <ul className={styles.rows}>
          {categories.map((c) => (
            <li key={c.id} className={styles.row}>
              {editing === c.id ? (
                <InlineRename initial={c.name} label="Category name" onSave={(n) => update(c, { name: n })} onCancel={() => setEditing(null)} />
              ) : (
                <>
                  <div className={styles.rowMain}>
                    <strong>{c.name}</strong>
                    <small>
                      {c.examCount} {c.examCount === 1 ? 'exam' : 'exams'} · {c.isActive ? 'Shown' : 'Hidden'}
                    </small>
                  </div>
                  <button className={styles.link} onClick={() => setEditing(c.id)}>Rename</button>
                  <button className={styles.link} onClick={() => void update(c, { isActive: !c.isActive })}>
                    {c.isActive ? 'Hide' : 'Show'}
                  </button>
                  <button
                    className={`${styles.link} ${styles.danger}`}
                    onClick={() => setRemoving(c)}
                    disabled={c.examCount > 0}
                    title={c.examCount > 0 ? 'Categories with exams cannot be deleted' : undefined}
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <form className={styles.inline} onSubmit={(e) => void add(e)} style={{ marginTop: 'var(--space-lg)' }} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="new-category">New category</label>
          <input id="new-category" className={styles.control} value={name} placeholder="Defence" onChange={(e) => setName(e.target.value)} />
        </div>
        <BusyButton busy={busy} type="submit" className="btn btn-secondary">Add</BusyButton>
      </form>
      {error ? <div style={{ marginTop: 'var(--space-md)' }}><Alert>{error}</Alert></div> : null}
      <Confirm
        open={removing !== null}
        title={`Delete ${removing?.name ?? 'category'}?`}
        confirmLabel="Delete category"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setRemoving(null)}
      >
        It has no exams. This cannot be undone, but you can add it again later.
      </Confirm>
    </section>
  );
}

/** One-line rename form used for categories, stages, subjects and topics. */
export function InlineRename({
  initial,
  label,
  onSave,
  onCancel,
}: {
  initial: string;
  label: string;
  onSave: (name: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={styles.inline}
      style={{ flex: '1 1 100%' }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim() || value.trim() === initial) return onCancel();
        setBusy(true);
        await onSave(value.trim());
        setBusy(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div className={styles.field}>
        <label className="visually-hidden" htmlFor={`rename-${initial}`}>{label}</label>
        <input id={`rename-${initial}`} className={styles.control} value={value} autoFocus onChange={(e) => setValue(e.target.value)} />
      </div>
      <BusyButton busy={busy} type="submit" className={`btn btn-primary ${styles.small}`}>Save</BusyButton>
      <button type="button" className={styles.link} onClick={onCancel} disabled={busy}>Cancel</button>
    </form>
  );
}

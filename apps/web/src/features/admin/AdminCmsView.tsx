'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CreateBannerRequest, UpdateBannerRequest, type AdminExamSummary, type Banner, type BannerPlacement } from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { ApiRequestError } from '@/lib/api/http';
import { opsApi } from '@/lib/api/ops';
import { Alert, Notice, Waiting } from '@/features/auth/ui';
import { errorKind } from '@/ui/errors/ErrorScreen';
import { Confirm, isCode, messageOf, State, useLoad } from './ui';
import { bannerWindow, fieldErrors, formatIndia, isoToLocal, localToIso } from './ops-format';
import styles from './admin.module.css';
import ops from './ops.module.css';

const PLACEMENT: Record<BannerPlacement, string> = { web: 'Website', app: 'App', both: 'Website and app' };
const WINDOW_BADGE = {
  live: [styles.badgeOn, 'Showing'],
  scheduled: [styles.badgeDraft, 'Scheduled'],
  ended: [styles.badgeOff, 'Ended'],
  off: [styles.badgeOff, 'Off'],
} as const;

const byOrder = (a: Banner, b: Banner) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title);

/** PRD 8 "CMS": website and app banners (image, link, order, optional exam and schedule). */
export function AdminCmsView() {
  const { state, reload, set } = useLoad(() => opsApi.banners(), []);
  // Exams only label and target banners; the list still works if they fail to load.
  const exams = useLoad(() => adminApi.exams(), []);
  const examList = exams.state.status === 'ready' ? exams.state.data : [];
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>CMS</h1>
          <p>
            Banners on the website home and the app Home, shown in order while active and inside their dates. Use a wide 3:1 image
            (for example 1200 × 400) on an https address.
          </p>
        </div>
        {state.status === 'ready' && !creating ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setNotice(null);
              setCreating(true);
            }}
          >
            New banner
          </button>
        ) : null}
      </div>

      {state.status === 'loading' ? (
        <Waiting label="Loading banners…" />
      ) : state.status === 'error' ? (
        isCode(state.error, 'FORBIDDEN') ? (
          <State kind="forbidden" title="You do not have access to this">
            Banners need an admin account with the operations permission. Ask a super admin to grant it.
          </State>
        ) : (
          <State
            kind={errorKind(state.error)}
            title="Could not load banners"
            action={
              <button type="button" className="btn btn-primary" onClick={() => void reload()}>
                Try again
              </button>
            }
          >
            {messageOf(state.error)}
          </State>
        )
      ) : (
        <div className={styles.sections}>
          <div aria-live="polite">{notice ? <Notice>{notice}</Notice> : null}</div>
          {creating ? (
            <section className={styles.card} aria-labelledby="new-banner-title">
              <h2 id="new-banner-title">New banner</h2>
              <BannerForm
                exams={examList}
                nextOrder={state.data.reduce((n, b) => Math.max(n, b.displayOrder + 1), 0)}
                onCancel={() => setCreating(false)}
                onSaved={(saved) => {
                  set([...state.data, saved]);
                  setCreating(false);
                  setNotice(`“${saved.title}” created.`);
                }}
              />
            </section>
          ) : null}
          {state.data.length ? (
            <ul className={ops.bannerList} aria-label="Banners in display order">
              {[...state.data].sort(byOrder).map((banner) => (
                <BannerRow
                  key={banner.id}
                  banner={banner}
                  exams={examList}
                  onSaved={(saved) => set(state.data.map((b) => (b.id === saved.id ? saved : b)))}
                  onDeleted={() => {
                    set(state.data.filter((b) => b.id !== banner.id));
                    setNotice(`“${banner.title}” deleted.`);
                  }}
                />
              ))}
            </ul>
          ) : !creating ? (
            <State
              title="No banners yet"
              action={
                <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                  New banner
                </button>
              }
            >
              Without banners the website and app simply show nothing in that spot.
            </State>
          ) : null}
        </div>
      )}
    </>
  );
}

function BannerRow({
  banner: b,
  exams,
  onSaved,
  onDeleted,
}: {
  banner: Banner;
  exams: AdminExamSummary[];
  onSaved: (b: Banner) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const windowState = bannerWindow(b);
  const [badgeClass, badgeLabel] = WINDOW_BADGE[windowState];
  const exam = b.examId ? exams.find((e) => e.id === b.examId) : null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await opsApi.updateBanner(b.id, { active: !b.active }));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await opsApi.deleteBanner(b.id);
      onDeleted();
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  }

  if (editing)
    return (
      <li className={styles.card}>
        <h2>Edit “{b.title}”</h2>
        <BannerForm
          banner={b}
          exams={exams}
          nextOrder={b.displayOrder}
          onCancel={() => {
            setEditing(false);
            requestAnimationFrame(() => editRef.current?.focus());
          }}
          onSaved={(saved) => {
            onSaved(saved);
            setEditing(false);
          }}
        />
      </li>
    );

  return (
    <li className={ops.banner}>
      <div className={ops.preview}>
        {/* Admin-entered https image of any size; a fixed 3:1 box keeps the layout steady. */}
        <img src={b.imageUrl} alt={b.title} loading="lazy" width={240} height={80} />
      </div>
      <div className={ops.bannerMeta}>
        <strong>
          {b.title} <span className={`${styles.badge} ${badgeClass}`}>{badgeLabel}</span>
        </strong>
        <small>Opens {b.link}</small>
        <ul className={ops.chips} aria-label="Details">
          <li className={ops.chip}>{PLACEMENT[b.placement]}</li>
          <li className={ops.chip}>{exam ? exam.name : b.examId ? 'One exam' : 'All exams'}</li>
          <li className={ops.chip}>Order {b.displayOrder}</li>
          <li className={ops.chip}>
            {b.startsAt || b.endsAt
              ? `${b.startsAt ? formatIndia(b.startsAt) : 'Now'} to ${b.endsAt ? formatIndia(b.endsAt) : 'no end'}`
              : 'No dates'}
          </li>
        </ul>
        {error && !deleting ? <Alert>{error}</Alert> : null}
      </div>
      <div className={styles.inline}>
        <button
          type="button"
          role="switch"
          aria-checked={b.active}
          className={ops.switch}
          disabled={busy}
          aria-busy={busy || undefined}
          aria-label={`${b.title} active`}
          onClick={() => void toggle()}
        >
          <span className={ops.track} aria-hidden="true" />
          <span aria-hidden="true">{b.active ? 'Active' : 'Off'}</span>
        </button>
        <button ref={editRef} type="button" className={`btn btn-secondary ${styles.small}`} disabled={busy} onClick={() => setEditing(true)} aria-label={`Edit ${b.title}`}>
          Edit
        </button>
        <button type="button" className={`${styles.link} ${styles.danger}`} disabled={busy} onClick={() => setDeleting(true)} aria-label={`Delete ${b.title}`}>
          Delete
        </button>
      </div>
      <Confirm open={deleting} title={`Delete “${b.title}”?`} confirmLabel="Delete" danger busy={busy} onClose={() => setDeleting(false)} onConfirm={() => void remove()}>
        <p>It disappears from the website and app at once. To pause it instead, switch it off.</p>
        {error ? <Alert>{error}</Alert> : null}
      </Confirm>
    </li>
  );
}

type Fields = 'title' | 'imageUrl' | 'link' | 'placement' | 'examId' | 'displayOrder' | 'startsAt' | 'endsAt';
const FIELD_LABEL: Record<Fields, string> = {
  title: 'Title',
  imageUrl: 'Image address',
  link: 'Link',
  placement: 'Where',
  examId: 'Exam',
  displayOrder: 'Order',
  startsAt: 'Starts',
  endsAt: 'Ends',
};

/** The only form-level rule is the date order, so a root issue is shown on the end field. */
function onEndField(found: Record<string, string>): Record<string, string> {
  const root = found[''];
  if (!root) return found;
  const { '': _root, ...rest } = found;
  return { ...rest, endsAt: rest['endsAt'] ?? root };
}

function BannerForm({
  banner,
  exams,
  nextOrder,
  onCancel,
  onSaved,
}: {
  banner?: Banner;
  exams: AdminExamSummary[];
  nextOrder: number;
  onCancel: () => void;
  onSaved: (b: Banner) => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(banner?.title ?? '');
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? '');
  const [link, setLink] = useState(banner?.link ?? '');
  const [placement, setPlacement] = useState<BannerPlacement>(banner?.placement ?? 'both');
  const [examId, setExamId] = useState(banner?.examId ?? '');
  const [order, setOrder] = useState(String(banner?.displayOrder ?? nextOrder));
  const [active, setActive] = useState(banner?.active ?? true);
  const [startsAt, setStartsAt] = useState(isoToLocal(banner?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(isoToLocal(banner?.endsAt ?? null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const fid = (f: Fields) => `${id}-${f}`;

  useEffect(() => firstRef.current?.focus(), []);
  const hasErrors = Object.keys(errors).length > 0;
  useEffect(() => {
    if (hasErrors) summaryRef.current?.focus();
  }, [errors, hasErrors]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const local: Record<string, string> = {};
    const start = startsAt ? localToIso(startsAt) : null;
    const end = endsAt ? localToIso(endsAt) : null;
    if (startsAt && !start) local['startsAt'] = 'Enter a full date and time.';
    if (endsAt && !end) local['endsAt'] = 'Enter a full date and time.';
    const displayOrder = Number(order);
    const body = {
      title: title.trim(),
      imageUrl: imageUrl.trim(),
      link: link.trim(),
      placement,
      examId: examId || null,
      displayOrder: order.trim() === '' ? Number.NaN : displayOrder,
      active,
      startsAt: start,
      endsAt: end,
    };
    const parsed = (banner ? UpdateBannerRequest : CreateBannerRequest).safeParse(body);
    const found = { ...(parsed.success ? {} : fieldErrors({ issues: parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })) })), ...local };
    if (found['displayOrder']) found['displayOrder'] = 'Use a whole number from 0 to 1000.';
    if (!parsed.success || Object.keys(local).length) return setErrors(onEndField(found));
    setErrors({});
    setBusy(true);
    try {
      onSaved(banner ? await opsApi.updateBanner(banner.id, body) : await opsApi.createBanner(body));
    } catch (caught) {
      const server = caught instanceof ApiRequestError && caught.code === 'VALIDATION_FAILED' ? fieldErrors(caught.details) : {};
      setErrors(Object.keys(server).length > (server[''] ? 1 : 0) ? onEndField(server) : { '': server[''] ?? messageOf(caught) });
    } finally {
      setBusy(false);
    }
  }

  const err = (f: Fields) =>
    errors[f] ? (
      <p id={`${fid(f)}-error`} className={styles.error}>
        {errors[f]}
      </p>
    ) : null;
  const aria = (f: Fields, hint?: string) => ({
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby': [errors[f] ? `${fid(f)}-error` : '', hint ?? ''].filter(Boolean).join(' ') || undefined,
  });
  const fieldKeys = Object.keys(errors).filter((k): k is Fields => k in FIELD_LABEL);
  const showPreview = /^https:\/\/\S+$/.test(imageUrl.trim());

  return (
    <form className={styles.formGrid} onSubmit={(e) => void submit(e)} noValidate aria-label={banner ? `Edit ${banner.title}` : 'New banner'}>
      {hasErrors ? (
        <div ref={summaryRef} className={ops.errorSummary} tabIndex={-1} role="alert">
          <strong>{fieldKeys.length ? 'Fix these to save the banner:' : (errors[''] ?? 'The banner was not saved.')}</strong>
          {fieldKeys.length ? (
            <ul>
              {fieldKeys.map((f) => (
                <li key={f}>
                  <a href={`#${fid(f)}`}>
                    {FIELD_LABEL[f]}: {errors[f]}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className={`${styles.formGrid} ${styles.formGrid2}`}>
        <label className={styles.field} htmlFor={fid('title')}>
          <span className={styles.label}>Title (also the image description)</span>
          <input ref={firstRef} id={fid('title')} className={styles.control} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} {...aria('title')} />
          {err('title')}
        </label>
        <label className={styles.field} htmlFor={fid('imageUrl')}>
          <span className={styles.label}>Image address (https)</span>
          <input
            id={fid('imageUrl')}
            type="url"
            inputMode="url"
            className={styles.control}
            value={imageUrl}
            placeholder="https://"
            onChange={(e) => setImageUrl(e.target.value)}
            {...aria('imageUrl')}
          />
          {err('imageUrl')}
        </label>
        <label className={styles.field} htmlFor={fid('link')}>
          <span className={styles.label}>Link</span>
          <input
            id={fid('link')}
            className={styles.control}
            value={link}
            maxLength={500}
            placeholder="/exams/ssc-cgl"
            onChange={(e) => setLink(e.target.value)}
            {...aria('link', `${fid('link')}-hint`)}
          />
          <small id={`${fid('link')}-hint`} className={styles.helper}>
            A page path such as /exams/ssc-cgl, /tests/…, /series/… or /examiners/…, or an https:// address.
          </small>
          {err('link')}
        </label>
        <label className={styles.field} htmlFor={fid('placement')}>
          <span className={styles.label}>Where</span>
          <select id={fid('placement')} className={styles.control} value={placement} onChange={(e) => setPlacement(e.target.value as BannerPlacement)} {...aria('placement')}>
            <option value="both">Website and app</option>
            <option value="web">Website only</option>
            <option value="app">App only</option>
          </select>
          {err('placement')}
        </label>
        <label className={styles.field} htmlFor={fid('examId')}>
          <span className={styles.label}>Exam (optional)</span>
          <select id={fid('examId')} className={styles.control} value={examId} onChange={(e) => setExamId(e.target.value)} {...aria('examId')}>
            <option value="">All exams</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
            {examId && !exams.some((e) => e.id === examId) ? <option value={examId}>Current exam</option> : null}
          </select>
          {err('examId')}
        </label>
        <label className={styles.field} htmlFor={fid('displayOrder')}>
          <span className={styles.label}>Order (lower shows first)</span>
          <input id={fid('displayOrder')} className={styles.control} inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} {...aria('displayOrder')} />
          {err('displayOrder')}
        </label>
        <label className={styles.field} htmlFor={fid('startsAt')}>
          <span className={styles.label}>Starts, India time (optional)</span>
          <input id={fid('startsAt')} type="datetime-local" className={styles.control} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} {...aria('startsAt')} />
          {err('startsAt')}
        </label>
        <label className={styles.field} htmlFor={fid('endsAt')}>
          <span className={styles.label}>Ends, India time (optional)</span>
          <input id={fid('endsAt')} type="datetime-local" className={styles.control} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} {...aria('endsAt')} />
          {err('endsAt')}
        </label>
        <label className={styles.check} htmlFor={`${id}-active`}>
          <input id={`${id}-active`} type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      </div>
      {showPreview ? (
        <figure className={ops.formPreview} style={{ margin: 0 }}>
          <div className={ops.preview}>
            <img src={imageUrl.trim()} alt={title.trim() || 'Banner preview'} width={360} height={120} />
          </div>
          <figcaption className={styles.helper}>Preview at the 3:1 shape students see.</figcaption>
        </figure>
      ) : null}
      <div className={styles.inlineActions}>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined}>
          {banner ? 'Save changes' : 'Create banner'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

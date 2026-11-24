'use client';

import { useId, useState, type FormEvent } from 'react';
import type { CatalogueAction, CatalogueKind, CatalogueRow } from '@exam-prep/contracts';
import { inr } from '@/lib/api/commerce';
import { opsApi } from '@/lib/api/ops';
import { Alert, Waiting } from '@/features/auth/ui';
import { errorKind } from '@/ui/errors/ErrorScreen';
import { Confirm, isCode, messageOf, State, useLoad } from './ui';
import { formatIndia } from './ops-format';
import styles from './admin.module.css';
import ops from './ops.module.css';

type Status = 'published' | 'unpublished' | 'all';

const STATUS_LABEL: Record<string, string> = {
  live: 'Live',
  scheduled: 'Scheduled',
  approved: 'Approved',
  archived: 'Unpublished',
  published: 'Published',
  unpublished: 'Unpublished',
};

function statusBadge(row: CatalogueRow) {
  const cls = row.published ? styles.badgeOn : row.status === 'archived' || row.status === 'unpublished' ? styles.badgeOff : styles.badgeDraft;
  return <span className={`${styles.badge} ${cls}`}>{STATUS_LABEL[row.status] ?? row.status}</span>;
}

/** PRD 8 "Catalogue": feature free tests and series on Home, unpublish (and republish series) with a reason. */
export function AdminCatalogueView() {
  const id = useId();
  const [kind, setKind] = useState<CatalogueKind>('tests');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [searchError, setSearchError] = useState<string | null>(null);
  const { state, reload, set } = useLoad(() => opsApi.catalogue(kind, q, status), [kind, q, status]);

  function search(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (value.length === 1) return setSearchError('Type at least 2 characters, or clear the box to see everything.');
    setSearchError(null);
    setQ(value);
  }

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Catalogue</h1>
          <p>
            Feature free tests and series on the student Home, or take something off the website. Unpublishing needs a reason and is kept
            in the audit log; students who bought keep their purchase records.
          </p>
        </div>
      </div>

      <section className={styles.card} aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className={styles.srOnly}>
          {kind === 'tests' ? 'Tests' : 'Series'}
        </h2>
        <div className={ops.toolbar}>
          <div className={ops.tabs} role="tablist" aria-label="Catalogue">
            {(['tests', 'series'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={`${id}-tab-${value}`}
                aria-selected={kind === value}
                aria-controls={`${id}-panel`}
                className={ops.tab}
                onClick={() => setKind(value)}
              >
                {value === 'tests' ? 'Tests' : 'Series'}
              </button>
            ))}
          </div>
        </div>
        <form className={ops.toolbar} role="search" onSubmit={search}>
          <label className={styles.field} htmlFor={`${id}-q`}>
            <span className={styles.label}>Search title, exam or examiner</span>
            <input
              id={`${id}-q`}
              type="search"
              className={styles.control}
              value={draft}
              maxLength={80}
              aria-invalid={searchError ? true : undefined}
              aria-describedby={searchError ? `${id}-q-error` : undefined}
              onChange={(e) => {
                setDraft(e.target.value);
                if (!e.target.value.trim() && q) setQ('');
              }}
            />
          </label>
          <label className={styles.field} htmlFor={`${id}-status`} style={{ flex: '0 1 200px' }}>
            <span className={styles.label}>Status</span>
            <select id={`${id}-status`} className={styles.control} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="all">All</option>
              <option value="published">On the website</option>
              <option value="unpublished">Not on the website</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
        {searchError ? (
          <p id={`${id}-q-error`} className={styles.error} role="alert">
            {searchError}
          </p>
        ) : null}

        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${kind}`}>
          {state.status === 'loading' ? (
            <Waiting label={`Loading ${kind}…`} />
          ) : state.status === 'error' ? (
            isCode(state.error, 'FORBIDDEN') ? (
              <State kind="forbidden" title="You do not have access to this">
                The catalogue needs an admin account with the operations permission. Ask a super admin to grant it.
              </State>
            ) : (
              <State
                kind={errorKind(state.error)}
                title={`Could not load ${kind}`}
                action={
                  <button type="button" className="btn btn-primary" onClick={() => void reload()}>
                    Try again
                  </button>
                }
              >
                {messageOf(state.error)}
              </State>
            )
          ) : state.data.length ? (
            <CatalogueTable kind={kind} rows={state.data} onSaved={(saved) => set(state.data.map((r) => (r.id === saved.id ? saved : r)))} />
          ) : (
            <p className={styles.helper} role="status">
              {q ? `No ${kind} match “${q}”.` : status === 'all' ? `No ${kind} yet. They appear once examiners publish after QC.` : `No ${kind} with this status.`}
            </p>
          )}
        </div>
      </section>
    </>
  );
}

function CatalogueTable({ kind, rows, onSaved }: { kind: CatalogueKind; rows: CatalogueRow[]; onSaved: (row: CatalogueRow) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ row: CatalogueRow; action: 'unpublish' | 'republish' } | null>(null);

  async function run(row: CatalogueRow, body: CatalogueAction): Promise<boolean> {
    setBusy(row.id);
    setError(null);
    try {
      onSaved(await opsApi.catalogueAction(kind, row.id, body));
      return true;
    } catch (caught) {
      setError(`${row.title}: ${messageOf(caught)}`);
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div aria-live="polite">{error && !pending ? <Alert>{error}</Alert> : null}</div>
      <div className={styles.tableWrap} role="region" aria-label={kind === 'tests' ? 'Tests' : 'Series'} tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{kind === 'tests' ? 'Test' : 'Series'}</th>
              <th scope="col">Examiner</th>
              <th scope="col">Status</th>
              <th scope="col" className={styles.num}>
                Price
              </th>
              <th scope="col" className={styles.num}>
                Attempts
              </th>
              <th scope="col" className={styles.num}>
                Sales
              </th>
              <th scope="col">Featured on Home</th>
              <th scope="col">
                <span className={styles.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const whyId = `why-${row.id}`;
              const rowBusy = busy === row.id;
              return (
                <tr key={row.id}>
                  <td className={ops.titleCell}>
                    <strong>{row.title}</strong>
                    <small>
                      {row.examName}
                      {row.publishedAt ? ` · published ${formatIndia(row.publishedAt)}` : ''}
                    </small>
                  </td>
                  <td>{row.examinerName}</td>
                  <td>{statusBadge(row)}</td>
                  <td className={styles.num}>{row.pricePaise === 0 ? 'Free' : inr(row.pricePaise)}</td>
                  <td className={styles.num}>{row.attempts.toLocaleString('en-IN')}</td>
                  <td className={styles.num}>{row.sales.toLocaleString('en-IN')}</td>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={row.featured}
                      className={ops.switch}
                      disabled={!row.canFeature || busy !== null}
                      aria-busy={rowBusy || undefined}
                      aria-label={`Feature ${row.title} on Home`}
                      aria-describedby={!row.canFeature ? whyId : undefined}
                      onClick={() => void run(row, { action: 'feature', featured: !row.featured })}
                    >
                      <span className={ops.track} aria-hidden="true" />
                      <span aria-hidden="true">{row.featured ? 'Featured' : 'Not featured'}</span>
                    </button>
                    {!row.canFeature ? (
                      <small id={whyId} className={ops.why}>
                        {kind === 'tests'
                          ? row.published
                            ? 'Only free live tests can be featured.'
                            : 'Not on the website.'
                          : 'Only published series can be featured.'}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    {row.published ? (
                      <button
                        type="button"
                        className={`btn btn-secondary ${styles.small}`}
                        disabled={busy !== null}
                        aria-label={`Unpublish ${row.title}`}
                        onClick={() => {
                          setError(null);
                          setPending({ row, action: 'unpublish' });
                        }}
                      >
                        Unpublish
                      </button>
                    ) : kind === 'series' ? (
                      <button
                        type="button"
                        className={`btn btn-secondary ${styles.small}`}
                        disabled={busy !== null}
                        aria-label={`Republish ${row.title}`}
                        onClick={() => {
                          setError(null);
                          setPending({ row, action: 'republish' });
                        }}
                      >
                        Republish
                      </button>
                    ) : (
                      <small className={ops.why}>Unpublished tests stay off; the examiner publishes a new test.</small>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pending ? (
        <ReasonDialog
          key={`${pending.row.id}-${pending.action}`}
          kind={kind}
          row={pending.row}
          action={pending.action}
          busy={busy === pending.row.id}
          error={error}
          onClose={() => {
            setPending(null);
            setError(null);
          }}
          onConfirm={async (reason) => {
            if (await run(pending.row, { action: pending.action, reason })) setPending(null);
          }}
        />
      ) : null}
    </>
  );
}

function ReasonDialog({
  kind,
  row,
  action,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  kind: CatalogueKind;
  row: CatalogueRow;
  action: 'unpublish' | 'republish';
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const unpublish = action === 'unpublish';
  const what = kind === 'tests' ? 'test' : 'series';
  return (
    <Confirm
      open
      title={`${unpublish ? 'Unpublish' : 'Republish'} “${row.title}”?`}
      confirmLabel={unpublish ? 'Unpublish' : 'Republish'}
      danger={unpublish}
      busy={busy}
      onClose={onClose}
      onConfirm={() => {
        if (reason.trim().length < 5) return setInvalid(true);
        setInvalid(false);
        void onConfirm(reason.trim());
      }}
    >
      <p>
        {unpublish
          ? kind === 'tests'
            ? 'The test leaves the catalogue at once and cannot be republished: published tests never change. Students who bought it keep their purchase records.'
            : 'The series leaves the catalogue at once. Students who bought it keep their purchase records. You can republish it later.'
          : `The ${what} returns to the catalogue for students to find and buy.`}
      </p>
      <label className={styles.field} htmlFor={`${id}-reason`}>
        <span className={styles.label}>Reason (kept in the audit log)</span>
        <textarea
          id={`${id}-reason`}
          className={styles.control}
          style={{ minHeight: 96 }}
          maxLength={500}
          value={reason}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-reason-error` : undefined}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {invalid ? (
        <p id={`${id}-reason-error`} className={styles.error} role="alert">
          Give a reason of at least 5 characters.
        </p>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
    </Confirm>
  );
}

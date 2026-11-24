'use client';

import { useId, useState, type FormEvent } from 'react';
import type { AuditLogEntry } from '@exam-prep/contracts';
import { opsApi } from '@/lib/api/ops';
import { Alert, Waiting } from '@/features/auth/ui';
import { errorKind } from '@/ui/errors/ErrorScreen';
import { isCode, messageOf, State, useLoad } from './ui';
import { changedKeys, formatIndia, showValue } from './ops-format';
import styles from './admin.module.css';
import ops from './ops.module.css';

const TABLES: { value: string; label: string }[] = [
  { value: 'exams', label: 'Exams' },
  { value: 'tests', label: 'Tests' },
  { value: 'test_series', label: 'Test series' },
  { value: 'cms_banners', label: 'Banners' },
  { value: 'profiles', label: 'Profiles' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'examiner_payouts', label: 'Payouts' },
  { value: 'coupons', label: 'Coupons' },
  { value: 'questions', label: 'Questions' },
  { value: 'qc_reviews', label: 'QC reviews' },
  { value: 'assets', label: 'Files' },
];
const PAGE = 50;

interface Filters {
  table: string;
  action: string;
  actor: string;
}

/** Who changed what, newest first, with the before and after of each changed field. */
export function AdminAuditView() {
  const id = useId();
  const [draft, setDraft] = useState<Filters>({ table: '', action: '', actor: '' });
  const [filters, setFilters] = useState<Filters>(draft);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [more, setMore] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const { state, reload, set } = useLoad(
    () => opsApi.audit({ table: filters.table, action: filters.action, actor: filters.actor, limit: PAGE }),
    [filters.table, filters.action, filters.actor],
  );

  function apply(event: FormEvent) {
    event.preventDefault();
    const next = { table: draft.table, action: draft.action.trim(), actor: draft.actor.trim() };
    if (next.action.length === 1 || next.actor.length === 1) return setFilterError('Type at least 2 characters, or leave the box empty.');
    setFilterError(null);
    setMore({ busy: false, error: null });
    setFilters(next);
  }

  async function loadOlder() {
    if (state.status !== 'ready' || !state.data.nextBefore) return;
    const current = state.data;
    setMore({ busy: true, error: null });
    try {
      // The cursor is opaque: it goes back to the API exactly as received.
      const page = await opsApi.audit({ ...filters, before: current.nextBefore ?? undefined, limit: PAGE });
      const seen = new Set(current.items.map((e) => e.id));
      set({ items: [...current.items, ...page.items.filter((e) => !seen.has(e.id))], nextBefore: page.nextBefore });
      setMore({ busy: false, error: null });
    } catch (caught) {
      setMore({ busy: false, error: messageOf(caught) });
    }
  }

  const filtered = Boolean(filters.table || filters.action || filters.actor);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Audit log</h1>
          <p>Every staff change, newest first: who made it, when (India time), and the before and after of each field. Entries cannot be edited.</p>
        </div>
      </div>

      <form className={`${styles.card} ${ops.toolbar}`} role="search" aria-label="Filter the audit log" onSubmit={apply}>
        <label className={styles.field} htmlFor={`${id}-table`}>
          <span className={styles.label}>Record type</span>
          <select id={`${id}-table`} className={styles.control} value={draft.table} onChange={(e) => setDraft({ ...draft, table: e.target.value })}>
            <option value="">All</option>
            {TABLES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field} htmlFor={`${id}-action`}>
          <span className={styles.label}>Action contains</span>
          <input
            id={`${id}-action`}
            className={styles.control}
            value={draft.action}
            maxLength={80}
            placeholder="e.g. unpublish"
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
          />
        </label>
        <label className={styles.field} htmlFor={`${id}-actor`}>
          <span className={styles.label}>Staff name or email</span>
          <input id={`${id}-actor`} className={styles.control} value={draft.actor} maxLength={120} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} />
        </label>
        <button type="submit" className="btn btn-primary">
          Filter
        </button>
        {filtered ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const empty = { table: '', action: '', actor: '' };
              setDraft(empty);
              setFilters(empty);
              setFilterError(null);
            }}
          >
            Clear
          </button>
        ) : null}
        {filterError ? (
          <p className={styles.error} role="alert" style={{ flexBasis: '100%' }}>
            {filterError}
          </p>
        ) : null}
      </form>

      <div style={{ marginTop: 'var(--space-xl)' }}>
        {state.status === 'loading' ? (
          <Waiting label="Loading the audit log…" />
        ) : state.status === 'error' ? (
          isCode(state.error, 'FORBIDDEN') ? (
            <State kind="forbidden" title="You do not have access to this">
              The audit log needs an admin account with the operations permission. Ask a super admin to grant it.
            </State>
          ) : (
            <State
              kind={errorKind(state.error)}
              title="Could not load the audit log"
              action={
                <button type="button" className="btn btn-primary" onClick={() => void reload()}>
                  Try again
                </button>
              }
            >
              {messageOf(state.error)}
            </State>
          )
        ) : state.data.items.length ? (
          <>
            <ol className={ops.entries} aria-label="Audit entries, newest first">
              {state.data.items.map((entry) => (
                <Entry key={entry.id} entry={entry} />
              ))}
            </ol>
            <div className={ops.more}>
              {state.data.nextBefore ? (
                <button type="button" className="btn btn-secondary" disabled={more.busy} aria-busy={more.busy || undefined} onClick={() => void loadOlder()}>
                  Load older
                </button>
              ) : (
                <p className={styles.helper}>That is everything{filtered ? ' for these filters' : ''}.</p>
              )}
            </div>
            <div aria-live="polite">{more.error ? <Alert>{more.error}</Alert> : null}</div>
          </>
        ) : (
          <State title={filtered ? 'No entries match' : 'No entries yet'}>
            {filtered ? 'Try fewer filters, or a shorter action or name.' : 'Staff changes appear here as they happen.'}
          </State>
        )}
      </div>
    </>
  );
}

function Entry({ entry: e }: { entry: AuditLogEntry }) {
  const [copied, setCopied] = useState(false);
  const keys = changedKeys(e.before, e.after);
  const kind = !e.before && e.after ? 'Created' : e.before && !e.after ? 'Deleted' : null;
  const table = TABLES.find((t) => t.value === e.table)?.label ?? e.table;

  async function copy() {
    try {
      await navigator.clipboard.writeText(e.recordId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <li className={ops.entry}>
      <div className={ops.entryHead}>
        <span className={ops.action}>{e.action}</span>
        <strong>{e.actor.name}</strong>
        <time dateTime={e.at}>{formatIndia(e.at)}</time>
      </div>
      <div className={ops.entryMeta}>
        <span>{e.actor.email ?? 'No email'}</span>
        <span>
          {table}
          {kind ? ` · ${kind.toLowerCase()}` : ''}
        </span>
        <button type="button" className={ops.copy} onClick={() => void copy()} aria-label={`Copy record ID ${e.recordId}`}>
          {e.recordId.slice(0, 8)}…
        </button>
        <span role="status">{copied ? 'Copied' : ''}</span>
      </div>
      {e.changedFields.length ? (
        <ul className={ops.chips} aria-label="Changed fields">
          {e.changedFields.map((f) => (
            <li key={f} className={ops.chip}>
              {f}
            </li>
          ))}
        </ul>
      ) : null}
      {keys.length ? (
        <details className={ops.diff}>
          <summary>
            {kind ?? 'Changes'}: {keys.length} field{keys.length === 1 ? '' : 's'}
          </summary>
          <div className={styles.tableWrap} role="region" aria-label="Before and after" tabIndex={0}>
            <table className={ops.diffTable}>
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Before</th>
                  <th scope="col">After</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td className={e.before ? ops.before : undefined}>
                      <pre>{e.before ? showValue(e.before[k]) : '(none)'}</pre>
                    </td>
                    <td className={e.after ? ops.after : undefined}>
                      <pre>{e.after ? showValue(e.after[k]) : '(none)'}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </li>
  );
}

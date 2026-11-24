'use client';

import type { AssetViewUrl } from '@exam-prep/contracts';
import { adminApi } from '@/lib/api/admin';
import { useLoad } from '@/features/admin/ui';
import styles from '@/features/admin/admin.module.css';

/** Thumbnails of scanned images via short-lived signed links (the caller's own by default). */
export function ImageList({
  ids,
  onRemove,
  load = adminApi.questionImageUrl,
}: {
  ids: string[];
  onRemove?: ((id: string) => void) | undefined;
  /** Reviewers pass a loader scoped to the review they are reading. */
  load?: (id: string) => Promise<AssetViewUrl>;
}) {
  if (!ids.length) return null;
  return (
    <ul className={styles.thumbs}>
      {ids.map((id, index) => (
        <li key={id}>
          <Thumb id={id} label={`Image ${index + 1}`} load={load} />
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

function Thumb({ id, label, load }: { id: string; label: string; load: (id: string) => Promise<AssetViewUrl> }) {
  const { state } = useLoad(() => load(id), [id]);
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

'use client';

import { adminApi } from '@/lib/api/admin';
import { useLoad } from '@/features/admin/ui';
import styles from '@/features/admin/admin.module.css';

/** Thumbnails of the caller's own scanned images, via short-lived signed links. */
export function ImageList({
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

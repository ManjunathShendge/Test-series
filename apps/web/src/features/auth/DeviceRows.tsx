'use client';

import type { Device } from '@exam-prep/contracts';
import { Glyph } from '@/features/marketing/showcase/Glyph';
import { Spinner } from './ui';
import styles from './auth.module.css';

const PLATFORM = { web: 'Web browser', android: 'Android app', ios: 'iPhone app' } as const;
const when = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** The account's devices with a Remove action; the current device cannot remove itself here. */
export function DeviceRows({
  devices,
  busyId,
  onRemove,
}: {
  devices: Device[];
  busyId: string | null;
  onRemove: (id: string) => void;
}) {
  return (
    <ul className={styles.devices}>
      {devices.map((d) => (
        <li key={d.id} className={styles.device}>
          <span className={styles.deviceIcon}>
            <Glyph name={d.platform === 'web' ? 'compass' : 'phone'} size={18} />
          </span>
          <span className={styles.deviceText}>
            <strong>{d.name ?? 'Unnamed device'}</strong>
            <span className="t-small t-secondary">
              {d.isCurrent ? 'This browser' : PLATFORM[d.platform]} · {d.isActive ? `active ${when.format(new Date(d.lastActiveAt))}` : 'signed out'}
            </span>
          </span>
          {d.isCurrent || !d.isActive ? null : (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onRemove(d.id)}
              disabled={busyId !== null}
              aria-busy={busyId === d.id || undefined}
              aria-label={`Remove ${d.name ?? 'this device'}`}
            >
              {busyId === d.id ? <Spinner label="Removing" /> : null}
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

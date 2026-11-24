import Link from 'next/link';
import { Icon, type IconName } from '@/ui/icons/Icon';
import styles from './console.module.css';

/** Dashboard blocks shared by the examiner workspace and the admin console. Real counts only. */

export const today = () =>
  new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Translucent tile inside the gradient hero. */
export function Glass({ icon, label, value, note }: { icon: IconName; label: string; value: string | number; note: string }) {
  return (
    <div className={styles.glass}>
      <span className={styles.glassLabel}>
        <span className={styles.glassIcon}>
          <Icon name={icon} size={18} />
        </span>
        {label}
      </span>
      <b>{value}</b>
      <small>{note}</small>
    </div>
  );
}

export function StatCard({
  icon,
  chip,
  value,
  label,
  note,
  part,
  whole,
  barLabel,
}: {
  icon: IconName;
  chip: string;
  value: string | number;
  label: string;
  note: string;
  part: number;
  whole: number;
  barLabel: string;
}) {
  const value100 = percent(part, whole);
  return (
    <div className={styles.statCard}>
      <div className={styles.statTop}>
        <span className={styles.statIcon}>
          <Icon name={icon} size={22} />
        </span>
        <span className={styles.chip}>{chip}</span>
      </div>
      <b>{value}</b>
      <span>{label}</span>
      <small>{note}</small>
      <div className={styles.bar}>
        <div>
          <span>{barLabel}</span>
          <span>{value100}%</span>
        </div>
        <div className={styles.track} role="progressbar" aria-label={barLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value100}>
          <span style={{ width: `${value100}%` }} />
        </div>
      </div>
    </div>
  );
}

export function Pending({ icon, count, title, body, href, action }: { icon: IconName; count: number; title: string; body: string; href: string; action: string }) {
  return (
    <div className={styles.pending}>
      <div className={styles.pendingTop}>
        <span className={styles.pendingIcon}>
          <Icon name={icon} size={20} />
        </span>
        <span className={styles.count} aria-label={`${count} ${title.toLowerCase()}`}>
          {count}
        </span>
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      <Link className={styles.pendingButton} href={href}>
        {action}
        <Icon name="arrow" size={18} />
      </Link>
    </div>
  );
}

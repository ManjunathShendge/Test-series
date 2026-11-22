import type { ExaminerTier, TestType } from '@exam-prep/contracts';

/** Display helpers for catalogue data. Money arrives in paise; durations in seconds. */

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const count = new Intl.NumberFormat('en-IN');
const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export const formatPrice = (paise: number) => (paise === 0 ? 'Free' : rupees.format(paise / 100));
export const formatCount = (n: number) => count.format(n);

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Dates are plain `YYYY-MM-DD` admin entries or ISO timestamps. */
export function formatDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+05:30`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : day.format(date);
}

/** Marks without trailing zeros: 2, 0.5, 0.33. */
export const formatMarks = (n: number) => String(Number(n.toFixed(2)));

export const TEST_TYPE_LABEL: Record<TestType, string> = {
  mock: 'Full mock',
  sectional: 'Sectional',
  pyq: 'Previous year',
  live: 'Live test',
};

export const TIER_LABEL: Record<ExaminerTier, string> = {
  top: 'Top examiner',
  verified: 'Verified examiner',
  new: 'New examiner',
};

export const LANGUAGE_LABEL = { en: 'English', hi: 'Hindi' } as const;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

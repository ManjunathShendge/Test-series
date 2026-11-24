/*
 * Pure helpers for the admin operations pages (catalogue, CMS, reports, audit log).
 * India time throughout: staff work in IST and the API reports India calendar days.
 */

const IST_MS = 5.5 * 3600_000;

/** India calendar day (YYYY-MM-DD) for an instant. */
export function indiaDay(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD shifted by whole days (calendar arithmetic, no time zone involved). */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The default report range: the last 30 India days, today included. */
export function lastDays(count = 30, now: Date = new Date()): { from: string; to: string } {
  const to = indiaDay(now);
  return { from: addDays(to, -(count - 1)), to };
}

/** A datetime-local value ("2026-11-24T10:30"), read as India time, as an ISO time with offset. */
export function localToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const iso = `${value}:00+05:30`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** An ISO time as a datetime-local value in India time. */
export function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t + IST_MS).toISOString().slice(0, 16);
}

/** "24 Nov 2026, 10:30 am" in India time. */
export function formatIndia(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}

/** "24 Nov" for a YYYY-MM-DD day. */
export function formatDay(day: string, withYear = false): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** Banner links: an in-app path (no protocol-relative or backslash tricks) or an https address. */
export type BannerLink = { kind: 'internal'; href: string } | { kind: 'external'; href: string } | null;
export function classifyLink(link: string): BannerLink {
  const value = link.trim();
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return { kind: 'internal', href: value };
  if (value.startsWith('https://')) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? { kind: 'external', href: url.toString() } : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** A banner is on show when active and inside its window (either end may be open). */
export function bannerWindow(b: { active: boolean; startsAt: string | null; endsAt: string | null }, now = Date.now()): 'off' | 'scheduled' | 'ended' | 'live' {
  if (!b.active) return 'off';
  if (b.startsAt && Date.parse(b.startsAt) > now) return 'scheduled';
  if (b.endsAt && Date.parse(b.endsAt) <= now) return 'ended';
  return 'live';
}

/** Keys whose values differ between two audit snapshots, in a stable order. */
export function changedKeys(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])).sort();
}

/** A snapshot value as plain text for display (never markup). */
export function showValue(value: unknown): string {
  if (value === undefined) return '(not set)';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

/** Field errors from an API VALIDATION_FAILED body ({ issues: [{ path, message }] }); root issues go under "". */
export function fieldErrors(details: unknown): Record<string, string> {
  const issues = (details as { issues?: unknown } | undefined)?.issues;
  if (!Array.isArray(issues)) return {};
  const out: Record<string, string> = {};
  for (const issue of issues) {
    if (typeof issue === 'string') out[''] ??= issue;
    else if (issue && typeof issue === 'object') {
      const { path, message } = issue as { path?: unknown; message?: unknown };
      const key = Array.isArray(path) ? path.join('.') : typeof path === 'string' ? path : '';
      if (typeof message === 'string') out[key] ??= message;
    }
  }
  return out;
}

/** Nice upper bound for a chart axis (1, 2, 5 × 10^n). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

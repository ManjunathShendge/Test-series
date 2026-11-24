// Server-anchored countdown. The device clock never decides time (PRD 11 "Timer integrity"):
// the server sends its time with every response and the client keeps only the offset.

/** Offset to add to a local monotonic reading to get server time, from one round trip. */
export function serverOffset(serverNowMs: number, sentAtMs: number, receivedAtMs: number): number {
  // Assume the server stamped the reply halfway through the round trip.
  return serverNowMs - (sentAtMs + receivedAtMs) / 2;
}

/** Milliseconds left until `deadlineMs` (server time), never negative. */
export function remainingMs(deadlineMs: number, offsetMs: number, localNowMs: number): number {
  return Math.max(0, deadlineMs - (localNowMs + offsetMs));
}

/** "1:05:09", "12:04" or "0:07" for a countdown display (tabular digits in the UI). */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Milestones (minutes left) at which screen readers hear a time warning, not every second. */
export const TIME_WARNINGS_MIN = [10, 5, 1] as const;

export function crossedWarning(previousMs: number, nowMs: number): number | null {
  for (const minutes of TIME_WARNINGS_MIN) {
    const at = minutes * 60_000;
    if (previousMs > at && nowMs <= at) return minutes;
  }
  return null;
}

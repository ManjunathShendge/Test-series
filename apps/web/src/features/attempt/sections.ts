import type { AttemptSection } from '@exam-prep/contracts';

/**
 * Sections open at `nowMs` (server time). The clock can close a section on its own; opening the
 * next one waits for the server, which sets its window.
 */
export function openSectionIds(sections: readonly AttemptSection[], nowMs: number): string[] {
  return sections
    .filter((s) => {
      if (s.closedAt || !s.opensAt) return false;
      if (Date.parse(s.opensAt) > nowMs) return false;
      return !s.closesAt || Date.parse(s.closesAt) > nowMs;
    })
    .map((s) => s.id);
}

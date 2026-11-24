import { beforeEach, describe, expect, it } from 'vitest';
import Storage from 'expo-sqlite/kv-store';
import { clearAttempts, loadAttempt, newLocalAttempt, removeAttempt, saveAttempt } from '@/lib/storage/attempt-outbox';
import { openSectionIds } from '@/features/attempt/sections';

describe('attempt outbox', () => {
  beforeEach(async () => {
    await Storage.clear();
  });

  it('keeps unacknowledged events across a restart', async () => {
    const rec = newLocalAttempt('a1', 'tok', 1, 0);
    rec.events.push({ seq: 1, kind: 'answer', testQuestionId: '11111111-1111-4111-8111-111111111111', selected: 'B', marked: false, visited: true, timeMs: 4000 });
    rec.nextSeq = 2;
    await saveAttempt(rec);
    const back = await loadAttempt('a1');
    expect(back?.events).toHaveLength(1);
    expect(back?.nextSeq).toBe(2);
    expect(back?.token).toBe('tok');
  });

  it('removes a closed attempt and clears everything on sign-out', async () => {
    await saveAttempt(newLocalAttempt('a1', 't1', 1, 0));
    await saveAttempt(newLocalAttempt('a2', 't2', 1, 0));
    await removeAttempt('a1');
    expect(await loadAttempt('a1')).toBeNull();
    await clearAttempts();
    expect(await loadAttempt('a2')).toBeNull();
  });
});

describe('section windows', () => {
  it('locks a section on the clock and waits for the server to open the next', () => {
    const base = { name: 's', order: 1, questionCount: 5, positiveMarks: 1, negativeMarks: 0, durationSeconds: 600, closedAt: null } as const;
    const list = [
      { ...base, id: 'a', opensAt: '2026-11-24T10:00:00Z', closesAt: '2026-11-24T10:10:00Z', state: 'open' as const },
      { ...base, id: 'b', opensAt: null, closesAt: null, state: 'upcoming' as const },
    ];
    expect(openSectionIds(list, Date.parse('2026-11-24T10:05:00Z'))).toEqual(['a']);
    expect(openSectionIds(list, Date.parse('2026-11-24T10:10:00Z'))).toEqual([]);
  });
});

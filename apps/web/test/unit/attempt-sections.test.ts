import { describe, expect, it } from 'vitest';
import type { AttemptSection } from '@exam-prep/contracts';
import { openSectionIds } from '@/features/attempt/sections';

const T0 = Date.parse('2026-11-24T10:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const section = (id: string, over: Partial<AttemptSection>): AttemptSection => ({
  id,
  name: id,
  order: 1,
  questionCount: 10,
  positiveMarks: 2,
  negativeMarks: 0.5,
  durationSeconds: 1200,
  opensAt: null,
  closesAt: null,
  closedAt: null,
  state: 'upcoming',
  ...over,
});

describe('openSectionIds', () => {
  const sectional = [
    section('quant', { opensAt: at(0), closesAt: at(20), state: 'open' }),
    section('english', { order: 2 }),
  ];

  it('opens only the running section of a sectional test', () => {
    expect(openSectionIds(sectional, T0 + 60_000)).toEqual(['quant']);
  });

  it('locks a section on the clock, and waits for the server to open the next', () => {
    expect(openSectionIds(sectional, T0 + 20 * 60_000)).toEqual([]);
  });

  it('keeps a section finished early closed even before its time ends', () => {
    const done = [{ ...sectional[0]!, closedAt: at(5) }, sectional[1]!];
    expect(openSectionIds(done, T0 + 6 * 60_000)).toEqual([]);
  });

  it('opens every section of a whole-test window until the deadline', () => {
    const shared = ['a', 'b'].map((id) => section(id, { durationSeconds: null, opensAt: at(0), closesAt: at(60), state: 'open' }));
    expect(openSectionIds(shared, T0 + 59 * 60_000)).toEqual(['a', 'b']);
    expect(openSectionIds(shared, T0 + 60 * 60_000)).toEqual([]);
  });
});

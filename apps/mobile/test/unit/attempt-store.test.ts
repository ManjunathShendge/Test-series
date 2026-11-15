import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTest } from '@/lib/demo';
import { isSectionOpen, paletteState, useAttemptStore } from '@/lib/store/attempt';

const IBPS = 't-ibps-mini-1'; // three sections, 8 minutes each, opened in order
const MIN = 60_000;

const s = () => useAttemptStore.getState();
const indexOf = (questionId: string) => s().paper!.questions.findIndex((q) => q.id === questionId);
const firstOfSection = (sectionId: string) => s().paper!.questions.findIndex((q) => q.sectionId === sectionId);

describe('attempt store, sectional timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T10:00:00Z'));
    s().reset();
  });
  afterEach(() => vi.useRealTimers());

  it('starts on the first question with only that question visited', () => {
    expect(s().start(IBPS, 'en')).toBe(true);
    expect(s().currentIndex).toBe(0);
    expect(Object.keys(s().answers)).toEqual([s().paper!.questions[0]!.id]);
    expect(s().answers[s().paper!.questions[0]!.id]?.selectedOptionId).toBeUndefined();
  });

  it('records an answer only on the question that was selected', () => {
    s().start(IBPS, 'en');
    s().select('B');
    const answered = Object.entries(s().answers).filter(([, a]) => a.selectedOptionId);
    expect(answered).toHaveLength(1);
    expect(answered[0]![0]).toBe(s().paper!.questions[0]!.id);
  });

  it('carries no answer into a later section when the clock moves the student there', () => {
    const test = getTest(IBPS)!;
    s().start(IBPS, 'en');
    s().select('B');

    // Same path the screen takes when a section window closes.
    for (const section of test.sections.slice(1)) {
      vi.advanceTimersByTime(8 * MIN);
      expect(isSectionOpen(s().sectionWindows!, section.id, Date.now())).toBe(true);
      s().visit(firstOfSection(section.id));
      const q = s().paper!.questions[s().currentIndex]!;
      expect(q.sectionId).toBe(section.id);
      expect(s().answers[q.id]?.selectedOptionId).toBeUndefined();
      expect(paletteState(s().answers[q.id])).toBe('visited');
    }

    const answered = Object.values(s().answers).filter((a) => a.selectedOptionId);
    expect(answered).toHaveLength(1);
  });

  it('does not let a student into a locked section', () => {
    s().start(IBPS, 'en');
    const reasoningFirst = firstOfSection(getTest(IBPS)!.sections[2]!.id);
    s().visit(reasoningFirst);
    expect(s().currentIndex).toBe(0);
  });

  it('scores exactly the answers that were given', () => {
    s().start(IBPS, 'en');
    s().select('B');
    const result = s().submit('manual')!;
    expect(result.correct + result.wrong).toBe(1);
    expect(result.skipped).toBe(29);
    expect(indexOf(result.review.find((r) => r.selectedOptionId)!.questionId)).toBe(0);
  });

  it('a fresh start never inherits answers from a previous attempt', () => {
    s().start('t-cgl-mini-3', 'en');
    s().select('B');
    s().reset();
    s().start(IBPS, 'en');
    expect(Object.values(s().answers).filter((a) => a.selectedOptionId)).toHaveLength(0);
  });
});

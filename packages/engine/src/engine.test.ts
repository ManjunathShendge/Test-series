import { describe, expect, it } from 'vitest';
import { counts, crossedWarning, formatCountdown, initialState, paletteOf, reduce, remainingMs, score, serverOffset } from './index.js';

const items = [
  { id: 'q1', sectionId: 's1' },
  { id: 'q2', sectionId: 's1' },
  { id: 'q3', sectionId: 's2' },
];

describe('palette', () => {
  it('has five distinct states and marking keeps the answer', () => {
    expect(paletteOf(undefined)).toBe('not_visited');
    expect(paletteOf({ selected: null, marked: false, visited: true, timeMs: 0 })).toBe('not_answered');
    expect(paletteOf({ selected: 'A', marked: false, visited: true, timeMs: 0 })).toBe('answered');
    expect(paletteOf({ selected: null, marked: true, visited: true, timeMs: 0 })).toBe('marked_for_review');
    expect(paletteOf({ selected: 'B', marked: true, visited: true, timeMs: 0 })).toBe('answered_and_marked');
  });
});

describe('reducer', () => {
  it('visits the first question and moves with save and next', () => {
    let s = initialState(items, {}, ['s1', 's2']);
    expect(s.current).toBe(0);
    expect(paletteOf(s.answers['q1'])).toBe('not_answered');
    s = reduce(s, { type: 'select', option: 'C' });
    s = reduce(s, { type: 'save_next' });
    expect(s.current).toBe(1);
    expect(paletteOf(s.answers['q1'])).toBe('answered');
    s = reduce(s, { type: 'mark_next' });
    expect(paletteOf(s.answers['q2'])).toBe('marked_for_review');
    expect(s.current).toBe(2);
    s = reduce(s, { type: 'clear' });
    expect(s.answers['q3']?.selected).toBeNull();
  });

  it('keeps locked sections closed and follows the server when a section changes', () => {
    let s = initialState(items, {}, ['s1']);
    expect(reduce(s, { type: 'go', index: 2 }).current).toBe(0);
    s = reduce(s, { type: 'go', index: 1 });
    s = reduce(s, { type: 'save_next' });
    expect(s.current).toBe(1); // the end of the open section
    s = reduce(s, { type: 'sections', open: ['s2'] });
    expect(s.current).toBe(2);
    expect(reduce(s, { type: 'select', option: 'A' }).answers['q3']?.selected).toBe('A');
    expect(reduce(s, { type: 'go', index: 0 }).current).toBe(2);
  });

  it('adds time only to the current open question and counts the summary', () => {
    let s = initialState(items, {}, ['s1', 's2']);
    s = reduce(s, { type: 'tick', ms: 1500 });
    s = reduce(s, { type: 'tick', ms: 500 });
    expect(s.answers['q1']?.timeMs).toBe(2000);
    s = reduce(s, { type: 'select', option: 'A' });
    expect(counts(s)).toEqual({ answered: 1, notAnswered: 0, notVisited: 2, marked: 0, answeredAndMarked: 0, total: 3 });
    expect(counts(s, 's2').total).toBe(1);
  });
});

describe('timing', () => {
  it('anchors to server time and never goes below zero', () => {
    const offset = serverOffset(10_000, 1_000, 1_200); // server is 8.9 s ahead
    expect(offset).toBe(8_900);
    expect(remainingMs(70_000, offset, 1_100)).toBe(60_000);
    expect(remainingMs(70_000, offset, 999_999)).toBe(0);
    expect(formatCountdown(3_909_000)).toBe('1:05:09');
    expect(formatCountdown(7_000)).toBe('0:07');
    expect(crossedWarning(301_000, 299_000)).toBe(5);
    expect(crossedWarning(299_000, 298_000)).toBeNull();
  });
});

describe('scoring', () => {
  it('awards, deducts and skips without float drift', () => {
    expect(
      score([
        { selected: 'A', correct: 'A', positive: 2, negative: 0.5 },
        { selected: 'B', correct: 'A', positive: 2, negative: 0.5 },
        { selected: null, correct: 'C', positive: 2, negative: 0.5 },
        { selected: 'D', correct: 'D', positive: 0.1, negative: 0.25 },
        { selected: 'D', correct: 'D', positive: 0.2, negative: 0.25 },
      ]),
    ).toEqual({ score: 1.8, correct: 3, incorrect: 1, attempted: 4, skipped: 1 });
  });
});

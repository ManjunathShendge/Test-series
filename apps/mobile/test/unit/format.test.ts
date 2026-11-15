import { describe, expect, it } from 'vitest';
import { formatOrdinal, formatPaise } from '@/lib/format';

describe('formatOrdinal', () => {
  it.each([
    [1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'],
    [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [112, '112th'],
    [1184, '1,184th'], [14191, '14,191st'], [102345, '1,02,345th'],
  ])('%i -> %s', (n, expected) => expect(formatOrdinal(n)).toBe(expected));
});

describe('formatPaise', () => {
  it('shows Free for zero, whole rupees short, fractions with paise', () => {
    expect(formatPaise(0)).toBe('Free');
    expect(formatPaise(4900)).toBe('₹49');
    expect(formatPaise(747)).toBe('₹7.47');
    expect(formatPaise(29900)).toBe('₹299');
  });
});

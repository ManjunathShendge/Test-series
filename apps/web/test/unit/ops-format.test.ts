import { describe, expect, it } from 'vitest';
import {
  addDays,
  bannerWindow,
  changedKeys,
  classifyLink,
  fieldErrors,
  indiaDay,
  isoToLocal,
  lastDays,
  localToIso,
  niceMax,
  showValue,
} from '@/features/admin/ops-format';

describe('India dates', () => {
  it('uses the India calendar day near midnight UTC', () => {
    expect(indiaDay(new Date('2026-11-23T19:00:00Z'))).toBe('2026-11-24');
    expect(indiaDay(new Date('2026-11-23T18:00:00Z'))).toBe('2026-11-23');
  });
  it('counts the last 30 days with today included', () => {
    expect(lastDays(30, new Date('2026-03-01T06:00:00Z'))).toEqual({ from: '2026-01-31', to: '2026-03-01' });
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
  it('round-trips datetime-local values as India time with an offset', () => {
    expect(localToIso('2026-11-24T10:30')).toBe('2026-11-24T10:30:00+05:30');
    expect(isoToLocal('2026-11-24T05:00:00Z')).toBe('2026-11-24T10:30');
    expect(isoToLocal(localToIso('2026-12-31T23:59'))).toBe('2026-12-31T23:59');
    expect(localToIso('2026-11-24')).toBeNull();
    expect(isoToLocal(null)).toBe('');
  });
});

describe('classifyLink', () => {
  it('accepts in-app paths and https links only', () => {
    expect(classifyLink('/exams/ssc-cgl')).toEqual({ kind: 'internal', href: '/exams/ssc-cgl' });
    expect(classifyLink('https://example.com/a')).toEqual({ kind: 'external', href: 'https://example.com/a' });
    for (const bad of ['//evil.com', '/\\evil.com', 'http://example.com', 'javascript:alert(1)', 'exams', 'https://']) {
      expect(classifyLink(bad)).toBeNull();
    }
  });
});

describe('bannerWindow', () => {
  const now = Date.parse('2026-11-24T10:00:00Z');
  it('reads off, scheduled, ended and live', () => {
    expect(bannerWindow({ active: false, startsAt: null, endsAt: null }, now)).toBe('off');
    expect(bannerWindow({ active: true, startsAt: '2026-11-25T00:00:00Z', endsAt: null }, now)).toBe('scheduled');
    expect(bannerWindow({ active: true, startsAt: null, endsAt: '2026-11-24T09:00:00Z' }, now)).toBe('ended');
    expect(bannerWindow({ active: true, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' }, now)).toBe('live');
  });
});

describe('audit diff', () => {
  it('lists only changed keys, including added and removed ones', () => {
    expect(changedKeys({ a: 1, b: { x: 1 }, c: 'same' }, { a: 2, b: { x: 1 }, c: 'same', d: null })).toEqual(['a', 'd']);
    expect(changedKeys(null, { title: 'New' })).toEqual(['title']);
  });
  it('shows values as text', () => {
    expect(showValue('<b>x</b>')).toBe('<b>x</b>');
    expect(showValue(undefined)).toBe('(not set)');
    expect(showValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe('fieldErrors', () => {
  it('maps API issues by field and keeps the first message', () => {
    expect(
      fieldErrors({ issues: [{ path: 'imageUrl', message: 'Use an https:// address' }, { path: 'imageUrl', message: 'later' }, { path: '', message: 'The end must be after the start' }] }),
    ).toEqual({ imageUrl: 'Use an https:// address', '': 'The end must be after the start' });
    expect(fieldErrors({ issues: [{ path: ['link'], message: 'Bad link' }] })).toEqual({ link: 'Bad link' });
    expect(fieldErrors(undefined)).toEqual({});
  });
});

describe('niceMax', () => {
  it('rounds up to 1, 2 or 5 times a power of ten', () => {
    expect([0, 1, 3, 7, 12, 480, 99_000].map(niceMax)).toEqual([1, 1, 5, 10, 20, 500, 100_000]);
  });
});

import { describe, expect, it } from 'vitest';
import { bannerTarget } from '@/lib/banners';

describe('bannerTarget', () => {
  it('maps website and app paths onto existing app screens', () => {
    expect(bannerTarget('/exams/ssc-cgl')).toEqual({ kind: 'exam', id: 'ssc-cgl' });
    expect(bannerTarget('/exam/ssc-cgl')).toEqual({ kind: 'exam', id: 'ssc-cgl' });
    expect(bannerTarget('/tests/mock-1?utm=x')).toEqual({ kind: 'test', id: 'mock-1' });
    expect(bannerTarget('/series/full-pack/')).toEqual({ kind: 'series', id: 'full-pack' });
    expect(bannerTarget('/examiners/7f1c2d9e-1b2a-4c3d-9e8f-001122334455')).toEqual({ kind: 'examiner', id: '7f1c2d9e-1b2a-4c3d-9e8f-001122334455' });
    expect(bannerTarget('/discover')).toEqual({ kind: 'discover' });
    expect(bannerTarget('/exams')).toEqual({ kind: 'discover' });
  });

  it('opens only well-formed https links', () => {
    expect(bannerTarget('https://example.com/offer?x=1')).toEqual({ kind: 'web', url: 'https://example.com/offer?x=1' });
    for (const bad of ['http://example.com', 'https://', 'https://user@evil.com', 'https://a b.com', 'javascript:alert(1)', 'mailto:a@b.c']) {
      expect(bannerTarget(bad)).toBeNull();
    }
  });

  it('ignores paths that are not a known screen', () => {
    for (const bad of ['//evil.com', '/\evil', '/attempt/123', '/profile/delete-account', '/exams/a/b', '/tests/../x', 'exams/x', '']) {
      expect(bannerTarget(bad)).toBeNull();
    }
  });
});

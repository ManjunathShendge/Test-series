import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module reads its key once at load, as the Next build inlines it.
vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://ph.test/');
const { hasAnalyticsConsent, resetAnalyticsId, setAnalyticsConsent, track } = await import('@/lib/analytics');

const store = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
const lastBody = () => JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body)) as Record<string, unknown> & { properties: Record<string, unknown> };

beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', { localStorage });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  fetchMock.mockClear();
  vi.unstubAllGlobals();
});

describe('web analytics', () => {
  it('sends nothing until the visitor opts in', () => {
    expect(hasAnalyticsConsent()).toBe(false);
    track('catalogue_viewed');
    setAnalyticsConsent(false);
    track('catalogue_viewed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts anonymous events with a stable pseudonymous id after opt-in', () => {
    setAnalyticsConsent(true);
    track('free_attempt_started', { testId: 't1' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://ph.test/capture/');
    const first = lastBody();
    expect(first).toMatchObject({ api_key: 'phc_test', event: 'free_attempt_started' });
    expect(first.properties).toMatchObject({ testId: 't1', platform: 'web', $process_person_profile: false });

    track('review_opened');
    expect(lastBody().distinct_id).toBe(first.distinct_id);
    resetAnalyticsId();
    track('review_opened');
    expect(lastBody().distinct_id).not.toBe(first.distinct_id);
  });

  it('withdrawing consent stops events and forgets the id', () => {
    setAnalyticsConsent(true);
    track('review_opened');
    setAnalyticsConsent(false);
    expect(store.has('analytics-id')).toBe(false);
    track('review_opened');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats blocked storage as no consent', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(hasAnalyticsConsent()).toBe(false);
    expect(() => track('review_opened')).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

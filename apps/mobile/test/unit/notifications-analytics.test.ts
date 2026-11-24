import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { internalPath } from '@/features/notifications/links';

const state = { analyticsConsent: false };
const posthog = { key: 'phc_test', host: 'https://ph.test/' };
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('@/lib/config', () => ({ config: { posthog } }));
vi.mock('@/lib/store/app', () => ({ useAppStore: { getState: () => state } }));

const { track, resetAnalyticsId } = await import('@/lib/analytics');

describe('internalPath', () => {
  it('accepts app routes from path or url', () => {
    expect(internalPath({ path: '/attempt/abc/summary' })).toBe('/attempt/abc/summary');
    expect(internalPath({ url: '/test/1' })).toBe('/test/1');
  });

  it('rejects external, protocol-relative and malformed targets', () => {
    for (const data of [{ path: 'https://evil.test' }, { path: '//evil.test/x' }, { path: '/\\evil.test' }, { path: 'test/1' }, { path: 42 }, null, 'x']) {
      expect(internalPath(data)).toBeNull();
    }
  });
});

describe('track', () => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
  const sent = async () => {
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    return { url, body: JSON.parse(String(init?.body)) as Record<string, unknown> & { properties: Record<string, unknown> } };
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    state.analyticsConsent = true;
    posthog.key = 'phc_test';
  });
  afterEach(() => {
    fetchMock.mockClear();
    vi.unstubAllGlobals();
  });

  it('sends nothing without consent or without a key', async () => {
    state.analyticsConsent = false;
    track('catalogue_viewed');
    state.analyticsConsent = true;
    posthog.key = '';
    track('catalogue_viewed');
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts an anonymous event with a stable pseudonymous id', async () => {
    track('free_attempt_started', { testId: 't1' });
    const first = await sent();
    expect(first.url).toBe('https://ph.test/capture/');
    expect(first.body).toMatchObject({ api_key: 'phc_test', event: 'free_attempt_started' });
    expect(first.body.properties).toMatchObject({ testId: 't1', platform: 'ios', $process_person_profile: false });
    expect(first.body.distinct_id).toMatch(/^[0-9a-f-]{32,36}$/);

    track('review_opened');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((await sent()).body.distinct_id).toBe(first.body.distinct_id);

    await resetAnalyticsId();
    track('review_opened');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect((await sent()).body.distinct_id).not.toBe(first.body.distinct_id);
  });

  it('never throws when the network fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    expect(() => track('attempt_submitted')).not.toThrow();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});

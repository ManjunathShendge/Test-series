import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Profile } from '@exam-prep/contracts';

vi.mock('@/lib/auth', () => ({ idToken: vi.fn(async () => 'token-1') }));
vi.mock('@/lib/storage/device-id', () => ({ getDeviceId: vi.fn(async () => 'device-1') }));
vi.mock('@/lib/config', () => ({ config: { apiBaseUrl: 'http://api.test/v1' } }));

const { apiRequest, ApiRequestError } = await import('@/lib/api/http');

const profile = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'student@example.com',
  fullName: 'Asha',
  preferredLanguage: 'en',
  preparationStage: 'starting',
  targetExamIds: [],
  roles: ['student'],
  ageConfirmed: true,
  onboarded: false,
};

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('apiRequest', () => {
  it('sends the bearer token and device id and validates the response', async () => {
    fetchMock.mockResolvedValue(json(200, profile));
    await expect(apiRequest('GET', '/me', { schema: Profile })).resolves.toEqual(profile);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/v1/me');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer token-1', 'x-device-id': 'device-1' });
  });

  it('maps a contract error body to its code and details', async () => {
    fetchMock.mockResolvedValue(
      json(409, { error: { code: 'DEVICE_LIMIT_REACHED', message: 'Remove one', details: { activeDevices: [] } } }),
    );
    const error = await apiRequest('POST', '/identity/session', { body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 409, code: 'DEVICE_LIMIT_REACHED', details: { activeDevices: [] } });
  });

  it('reports a network failure without a status', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiRequest('GET', '/me', { schema: Profile })).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('rejects a reply that does not match the contract', async () => {
    fetchMock.mockResolvedValue(json(200, { ...profile, email: 42 }));
    await expect(apiRequest('GET', '/me', { schema: Profile })).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('treats an error without a contract body as a bad response', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(apiRequest('GET', '/me', { schema: Profile })).rejects.toMatchObject({ status: 502, code: 'BAD_RESPONSE' });
  });

  it('resolves undefined for 204 responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiRequest('DELETE', '/me/devices/x')).resolves.toBeUndefined();
  });
});

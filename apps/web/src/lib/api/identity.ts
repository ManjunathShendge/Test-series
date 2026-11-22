'use client';

import { DeviceLimitDetails, DeviceList, Profile, SessionResponse, type Device, type UpdateMeRequest } from '@exam-prep/contracts';
import { getDeviceId, setDeviceId } from '@/lib/storage/device';
import { apiRequest, ApiRequestError } from './http';

/** A readable name for this browser, shown in the student's device list. */
function browserName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` on ${os}` : ''}`.slice(0, 80);
}

/**
 * Signs this browser in with the API: bootstraps the profile and registers (or reuses) this
 * browser as one of the account's two devices. The website asks for the 18+ confirmation once,
 * in onboarding (PATCH /me), so it is not sent here.
 */
export async function createSession(): Promise<SessionResponse> {
  const deviceId = getDeviceId();
  const session = await apiRequest('POST', '/identity/session', {
    schema: SessionResponse,
    body: { ...(deviceId ? { deviceId } : {}), deviceName: browserName(), platform: 'web' },
  });
  setDeviceId(session.device.id);
  return session;
}

export const getMe = () => apiRequest('GET', '/me', { schema: Profile });

export const updateMe = (changes: UpdateMeRequest) => apiRequest('PATCH', '/me', { schema: Profile, body: changes });

export const listDevices = async (): Promise<Device[]> => (await apiRequest('GET', '/me/devices', { schema: DeviceList })).items;

export const revokeDevice = (id: string) => apiRequest('DELETE', `/me/devices/${encodeURIComponent(id)}`);

/** Active devices to choose from when sign-in hit the two-device limit. */
export function deviceLimitDevices(error: unknown): Device[] | null {
  if (!(error instanceof ApiRequestError) || error.code !== 'DEVICE_LIMIT_REACHED') return null;
  const parsed = DeviceLimitDetails.safeParse(error.details);
  return parsed.success ? parsed.data.activeDevices : [];
}

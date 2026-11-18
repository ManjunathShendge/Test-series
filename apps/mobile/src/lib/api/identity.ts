import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  DeviceLimitDetails,
  DeviceList,
  Profile,
  SessionResponse,
  type Device,
  type UpdateMeRequest,
} from '@exam-prep/contracts';
import { getDeviceId, setDeviceId } from '@/lib/storage/device-id';
import { apiRequest, ApiRequestError } from './http';

/** Signs this device in with the API, registering it on first use and storing its id. */
export async function createSession(): Promise<SessionResponse> {
  const deviceId = await getDeviceId();
  const session = await apiRequest('POST', '/identity/session', {
    schema: SessionResponse,
    body: {
      ...(deviceId ? { deviceId } : {}),
      deviceName: (Constants.deviceName ?? `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} device`).slice(0, 80),
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      ageConfirmed: true,
    },
  });
  await setDeviceId(session.device.id);
  return session;
}

export const getMe = () => apiRequest('GET', '/me', { schema: Profile });

export const updateMe = (changes: UpdateMeRequest) => apiRequest('PATCH', '/me', { schema: Profile, body: changes });

export const listDevices = async (): Promise<Device[]> => (await apiRequest('GET', '/me/devices', { schema: DeviceList })).items;

export const revokeDevice = (id: string) => apiRequest('DELETE', `/me/devices/${id}`);

/** Active devices to choose from when sign-in hit the two-device limit. */
export function deviceLimitDevices(error: unknown): Device[] | null {
  if (!(error instanceof ApiRequestError) || error.code !== 'DEVICE_LIMIT_REACHED') return null;
  const parsed = DeviceLimitDetails.safeParse(error.details);
  return parsed.success ? parsed.data.activeDevices : [];
}

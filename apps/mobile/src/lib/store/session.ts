import { queryClient } from '@/lib/api/client';
import { revokeDevice } from '@/lib/api/identity';
import { resetAnalyticsId } from '@/lib/analytics';
import { signOutOfFirebase } from '@/lib/auth';
import { unregisterPushToken } from '@/features/notifications/push';
import { getDeviceId } from '@/lib/storage/device-id';
import { useAppStore } from './app';
import { clearAttempts } from '@/lib/storage/attempt-outbox';

/**
 * Signs the student out of this device. The push token is forgotten and the device's slot
 * released on the server first (best effort: offline sign-out still works locally), then
 * Firebase is signed out and session, entitlements, results, any live attempt and cached
 * server data are reset, so the next sign-in never sees the previous student's data.
 */
export async function signOutEverywhere(): Promise<void> {
  const deviceId = await getDeviceId();
  if (deviceId) {
    // While the device is still registered: a revoked device can no longer change its token.
    await unregisterPushToken();
    await revokeDevice(deviceId).catch(() => undefined);
  }
  await signOutOfFirebase().catch(() => undefined);
  resetLocalSession();
}

/** Clears local state only; used when Firebase reports no signed-in user. */
export function resetLocalSession(): void {
  queryClient.clear();
  void clearAttempts();
  useAppStore.getState().signOut();
  // The next student on this phone gets a fresh pseudonymous analytics id.
  void resetAnalyticsId();
}

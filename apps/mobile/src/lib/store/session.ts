import { queryClient } from '@/lib/api/client';
import { revokeDevice } from '@/lib/api/identity';
import { signOutOfFirebase } from '@/lib/auth';
import { getDeviceId } from '@/lib/storage/device-id';
import { useAppStore } from './app';
import { clearAttempts } from '@/lib/storage/attempt-outbox';
import { useResultsStore } from './results';

/**
 * Signs the student out of this device. The device's slot is released on the server
 * first (best effort: offline sign-out still works locally), then Firebase is signed out
 * and session, entitlements, results, any live attempt and cached server data are reset,
 * so the next sign-in never sees the previous student's data.
 */
export async function signOutEverywhere(): Promise<void> {
  const deviceId = await getDeviceId();
  if (deviceId) await revokeDevice(deviceId).catch(() => undefined);
  await signOutOfFirebase().catch(() => undefined);
  resetLocalSession();
}

/** Clears local state only; used when Firebase reports no signed-in user. */
export function resetLocalSession(): void {
  queryClient.clear();
  void clearAttempts();
  useResultsStore.getState().reset();
  useAppStore.getState().signOut();
}

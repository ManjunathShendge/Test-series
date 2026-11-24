import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { PushTokenRequest } from '@exam-prep/contracts';
import { apiRequest } from '@/lib/api/http';
import { getDeviceId } from '@/lib/storage/device-id';
import { internalPath } from './links';

/**
 * Expo push registration (docs/NOTIFICATIONS.md). The token is stored on the server against
 * this install's device id; the server decides what to send and honours the student's
 * preferences. Everything here is best effort: no push never blocks sign-in or sign-out.
 *
 * expo-notifications is loaded lazily so Expo Go on Android (no remote push since SDK 53)
 * never evaluates it, and so its import-time warnings stay out of unsupported runtimes.
 */
type NotificationsModule = typeof import('expo-notifications');

const ANDROID_CHANNEL = 'default';

/** Remote push needs a physical device and, on Android, a development or store build. */
function pushSupported(): boolean {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  return !(Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id ? id : undefined;
}

let loaded: Promise<NotificationsModule | null> | undefined;
function notifications(): Promise<NotificationsModule | null> {
  loaded ??= pushSupported() ? import('expo-notifications').catch(() => null) : Promise.resolve(null);
  return loaded;
}

const putToken = async (token: PushTokenRequest['token']) => {
  const deviceId = await getDeviceId();
  if (!deviceId) return;
  const body: PushTokenRequest = { token };
  await apiRequest('PUT', `/me/devices/${encodeURIComponent(deviceId)}/push-token`, { body });
};

/**
 * Asks for permission (once; `prompt: false` only checks) and sends this install's Expo push
 * token to the API. Skips silently on simulators, Expo Go on Android, builds without an EAS
 * project id, or when the student declines. Never throws.
 */
export async function registerPushToken({ prompt = true }: { prompt?: boolean } = {}): Promise<void> {
  try {
    const id = projectId();
    const N = id ? await notifications() : null;
    if (!id || !N) return;
    // Android 13+ shows the permission prompt only once a channel exists.
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync(ANDROID_CHANNEL, { name: 'Updates', importance: N.AndroidImportance.DEFAULT });
    }
    let { granted, canAskAgain } = await N.getPermissionsAsync();
    if (!granted && prompt && canAskAgain) ({ granted } = await N.requestPermissionsAsync());
    if (!granted) return;
    const { data } = await N.getExpoPushTokenAsync({ projectId: id });
    await putToken(data);
  } catch {
    // Push is optional; the next sign-in or launch tries again.
  }
}

/** Forgets this install's token on the server. Call before the device is revoked. Never throws. */
export async function unregisterPushToken(): Promise<void> {
  try {
    if (projectId() && (await notifications())) await putToken(null);
  } catch {
    // Revoking the device removes its token on the server as well.
  }
}

/**
 * Opens the screen a tapped notification points at, including the tap that launched the app.
 * Shows notices as banners while the app is open. Mount once, inside the navigator's tree.
 */
export function useNotificationRouting(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let remove: (() => void) | undefined;
    const open = (data: unknown) => {
      const path = internalPath(data);
      if (path) router.push(path as Href);
    };
    void notifications().then((N) => {
      if (!N || cancelled) return;
      N.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
      });
      const subscription = N.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
      remove = () => subscription.remove();
      // The tap that launched the app; cleared so a later remount does not open it again.
      const last = N.getLastNotificationResponse();
      if (last && !cancelled) {
        N.clearLastNotificationResponse();
        open(last.notification.request.content.data);
      }
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [enabled]);
}

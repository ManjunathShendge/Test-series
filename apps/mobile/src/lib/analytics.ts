import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';
import type { AnalyticsEvent } from '@exam-prep/contracts';
import { config } from '@/lib/config';
import { useAppStore } from '@/lib/store/app';

/**
 * Product analytics (docs/NOTIFICATIONS.md PostHog events) over PostHog's public capture API.
 * Sends nothing unless EXPO_PUBLIC_POSTHOG_KEY is set and the student opted in (Terms and
 * privacy > Your choices). The distinct id is a random id kept on this phone, never the email
 * or account id; it is replaced at sign-out. Properties are counts and ids only: never stems,
 * answers, emails or payment details. purchase_confirmed is sent by the server from verified
 * payment state, so the client cannot send it.
 */
export type ClientAnalyticsEvent = Exclude<AnalyticsEvent, 'purchase_confirmed'>;
export type AnalyticsProps = Record<string, string | number | boolean>;

const ID_KEY = 'examprep.analyticsId';

function randomId(): string {
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
  if (uuid) return uuid;
  // Not a secret, only a stable pseudonym, so Math.random is acceptable here.
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

let cachedId: Promise<string> | undefined;
function distinctId(): Promise<string> {
  cachedId ??= (async () => {
    const saved = await Storage.getItem(ID_KEY).catch(() => null);
    if (saved) return saved;
    const id = randomId();
    await Storage.setItem(ID_KEY, id).catch(() => undefined);
    return id;
  })();
  return cachedId;
}

/** Forgets the pseudonymous id so the next student on this phone is not linked to the last. */
export async function resetAnalyticsId(): Promise<void> {
  cachedId = undefined;
  await Storage.removeItem(ID_KEY).catch(() => undefined);
}

/** Fire and forget: never throws, never delays the caller. */
export function track(event: ClientAnalyticsEvent, props: AnalyticsProps = {}): void {
  const { key, host } = config.posthog;
  if (!key || !useAppStore.getState().analyticsConsent) return;
  void (async () => {
    try {
      await fetch(`${host.replace(/\/+$/, '')}/capture/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          event,
          distinct_id: await distinctId(),
          // Anonymous events: PostHog keeps no person profile for this id.
          properties: { ...props, platform: Platform.OS, $process_person_profile: false },
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Analytics is optional; a lost event is acceptable.
    }
  })();
}

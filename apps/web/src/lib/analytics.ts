import type { AnalyticsEvent } from '@exam-prep/contracts';

/**
 * Product analytics (docs/NOTIFICATIONS.md PostHog events) over PostHog's public capture API.
 * Sends nothing unless NEXT_PUBLIC_POSTHOG_KEY is set and the visitor opted in on the account
 * page ("Your data"). The distinct id is a random id kept in this browser, never the email or
 * account id. Properties are counts and ids only: never stems, answers, emails or payment
 * details. purchase_confirmed is sent by the server from verified payment state.
 */
export type ClientAnalyticsEvent = Exclude<AnalyticsEvent, 'purchase_confirmed'>;
export type AnalyticsProps = Record<string, string | number | boolean>;

// Literal reads so Next inlines them into the browser bundle.
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '';
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com').replace(/\/+$/, '');

const CONSENT_KEY = 'analytics-consent';
const ID_KEY = 'analytics-id';

/** True when a PostHog key is configured, so the consent choice has an effect. */
export const analyticsAvailable = KEY !== '';

/** Whether the visitor opted in. Unknown or unreadable storage means no. */
export function hasAnalyticsConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === 'granted';
  } catch {
    return false;
  }
}

export function setAnalyticsConsent(granted: boolean): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
    // Withdrawing consent also drops the pseudonymous id.
    if (!granted) window.localStorage.removeItem(ID_KEY);
  } catch {
    // Storage blocked: the visitor stays opted out.
  }
}

/** Forgets the pseudonymous id (sign-out), so the next person in this browser is not linked. */
export function resetAnalyticsId(): void {
  try {
    window.localStorage.removeItem(ID_KEY);
  } catch {
    // Nothing stored.
  }
}

function distinctId(): string | null {
  try {
    let id = window.localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Fire and forget: never throws, never delays the caller. */
export function track(event: ClientAnalyticsEvent, props: AnalyticsProps = {}): void {
  if (!KEY || typeof window === 'undefined' || !hasAnalyticsConsent()) return;
  const id = distinctId();
  if (!id) return;
  void fetch(`${HOST}/capture/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: KEY,
      event,
      distinct_id: id,
      // Anonymous events: PostHog keeps no person profile for this id.
      properties: { ...props, platform: 'web', $process_person_profile: false },
      timestamp: new Date().toISOString(),
    }),
    keepalive: true,
  }).catch(() => undefined);
}

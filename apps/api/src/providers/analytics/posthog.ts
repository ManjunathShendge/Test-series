/**
 * Server-side PostHog capture for events only the server can confirm (purchase_confirmed).
 * Pseudonymous: the distinct id is a hash of the profile id, never an email or name.
 */
export class PostHogCapture {
  constructor(
    private readonly apiKey: string,
    private readonly host = 'https://eu.i.posthog.com',
  ) {}

  async capture(event: string, distinctId: string, properties: Record<string, string | number | boolean>): Promise<void> {
    const response = await fetch(`${this.host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey, event, distinct_id: distinctId, properties: { ...properties, $lib: 'exam-prep-server' } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`PostHog HTTP ${response.status}`);
  }
}

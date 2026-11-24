import { z } from 'zod';

const SEND_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** In-app path opened on tap; never keys, content or personal data. */
  data?: { path: string };
}

export type PushResult = { ok: true; ticketId: string } | { ok: false; error: string; tokenInvalid: boolean };

const Ticket = z.union([
  z.object({ status: z.literal('ok'), id: z.string() }),
  z.object({ status: z.literal('error'), message: z.string(), details: z.object({ error: z.string().optional() }).optional() }),
]);
const Reply = z.object({ data: z.array(Ticket) });

/**
 * Expo push service (docs/NOTIFICATIONS.md). Works without credentials; an access token is
 * needed only when "enhanced push security" is on for the Expo project. Store credentials
 * (FCM/APNs) are attached to the Expo project, not to this server.
 */
export class ExpoPush {
  constructor(private readonly accessToken?: string) {}

  /** Sends up to 100 messages; results are in the same order. Throws only on transport errors. */
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    if (messages.length === 0) return [];
    const response = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: JSON.stringify(messages.slice(0, 100).map((m) => ({ ...m, sound: 'default', priority: 'high' }))),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Expo push HTTP ${response.status}`);
    const reply = Reply.parse(await response.json());
    return reply.data.map((t) =>
      t.status === 'ok'
        ? { ok: true as const, ticketId: t.id }
        : { ok: false as const, error: t.details?.error ?? t.message, tokenInvalid: t.details?.error === 'DeviceNotRegistered' },
    );
  }
}

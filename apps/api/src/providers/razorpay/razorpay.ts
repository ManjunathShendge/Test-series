import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../common/errors/api-error.js';

const BASE = 'https://api.razorpay.com/v1';

const RazorpayOrder = z.object({ id: z.string(), amount: z.number().int(), currency: z.string(), status: z.string() });
const RazorpayPayment = z.object({
  id: z.string(),
  order_id: z.string().nullable(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(['created', 'authorized', 'captured', 'refunded', 'failed']),
  /** Razorpay's fee including GST on it, in paise; present once captured. */
  fee: z.number().int().nullable().optional(),
});
const RazorpayRefund = z.object({ id: z.string(), amount: z.number().int(), status: z.string() });
const RefundList = z.object({ items: z.array(RazorpayRefund) });

export type RazorpayPayment = z.infer<typeof RazorpayPayment>;
export type RazorpayRefund = z.infer<typeof RazorpayRefund>;

/** Constant-time comparison of two hex signatures. */
function sameSignature(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Razorpay REST adapter (Orders, Payments, Refunds) with Basic auth. Keys stay on the server;
 * the browser only ever receives the public key id. Every response is schema-checked.
 */
export class Razorpay {
  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string | undefined,
  ) {}

  get publicKeyId(): string {
    return this.keyId;
  }

  private async call<S extends z.ZodType>(method: 'GET' | 'POST', path: string, schema: S, body?: unknown): Promise<z.infer<S>> {
    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ApiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'The payment service is not reachable. Please try again.');
    }
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const description = (payload as { error?: { description?: unknown } } | undefined)?.error?.description;
      throw new ApiError(
        response.status >= 500 ? 503 : 422,
        response.status >= 500 ? 'PAYMENT_PROVIDER_UNAVAILABLE' : 'PAYMENT_REJECTED',
        typeof description === 'string' ? description : 'The payment service refused the request.',
      );
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success)
      throw new ApiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'The payment service sent an unexpected reply.');
    return parsed.data;
  }

  /** `receipt` is our purchase id, so a timed-out request can be matched later. */
  createOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
    return this.call('POST', '/orders', RazorpayOrder, { amount: amountPaise, currency: 'INR', receipt, notes });
  }

  fetchPayment(paymentId: string) {
    return this.call('GET', `/payments/${encodeURIComponent(paymentId)}`, RazorpayPayment);
  }

  /** For accounts without automatic capture: captures an authorized payment for its exact amount. */
  capture(paymentId: string, amountPaise: number) {
    return this.call('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, RazorpayPayment, {
      amount: amountPaise,
      currency: 'INR',
    });
  }

  refund(paymentId: string, amountPaise: number, notes: Record<string, string>) {
    return this.call('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, RazorpayRefund, {
      amount: amountPaise,
      notes,
    });
  }

  async refunds(paymentId: string): Promise<RazorpayRefund[]> {
    return (await this.call('GET', `/payments/${encodeURIComponent(paymentId)}/refunds`, RefundList)).items;
  }

  /** Checkout handler signature: HMAC-SHA256(order_id|payment_id, key secret). */
  verifyCheckout(orderId: string, paymentId: string, signature: string): boolean {
    const expected = createHmac('sha256', this.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
    return sameSignature(expected, signature);
  }

  /** Webhook signature over the original request bytes with the separate webhook secret. */
  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    if (!this.webhookSecret) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return sameSignature(expected, signature);
  }
}

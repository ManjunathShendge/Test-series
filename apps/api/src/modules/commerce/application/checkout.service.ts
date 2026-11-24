import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { transaction, withUser, type Database } from '@exam-prep/db';
import type {
  CheckoutOrder,
  MyPurchaseList,
  OrderQuote,
  OrderRequest,
  OrderResult,
  Ownership,
  PurchaseItemType,
  VerifyPaymentRequest,
} from '@exam-prep/contracts';
import { z } from 'zod';
import { DATABASE, ENVIRONMENT } from '../../../database/database.module.js';
import type { Environment } from '../../../config/env.js';
import { ApiError, notFound } from '../../../common/errors/api-error.js';
import type { Razorpay, RazorpayPayment } from '../../../providers/razorpay/razorpay.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import { commerceRepository as repo, type CheckoutRow } from '../repositories/commerce.repository.js';
import { RAZORPAY, mapCommerceError, toMyPurchase } from '../domain/commerce.js';

/** Thrown to roll back a quote's trial order; never leaves this file. */
class QuoteRollback {
  constructor(readonly quote: OrderQuote) {}
}

const WebhookBody = z.object({
  event: z.string(),
  payload: z
    .object({
      payment: z
        .object({
          entity: z.object({
            id: z.string(),
            order_id: z.string().nullable().optional(),
            notes: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional(),
          }),
        })
        .optional(),
    })
    .optional(),
});

const notVerified = (message = 'The payment could not be verified. If money was taken, it will be refunded automatically by your bank or Razorpay.') =>
  new ApiError(422, 'PAYMENT_NOT_VERIFIED', message);

/**
 * Web checkout with Razorpay (PAYMENTS.md lifecycle): the server prices the order, Razorpay takes
 * the payment, and access is granted only after the signature is verified and the payment is
 * fetched from Razorpay as captured for exactly this order and amount. The webhook repeats the
 * same fulfilment, so a closed browser tab still delivers access. Fulfilment is idempotent.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    @Inject(RAZORPAY) private readonly razorpay: Razorpay | null,
  ) {}

  private gateway(): Razorpay {
    if (!this.razorpay)
      throw new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'Online payments are not available yet. Please try again later.');
    return this.razorpay;
  }

  private asStudent<T>(access: AccessContext, action: Parameters<typeof withUser<T>>[2]): Promise<T> {
    return withUser(this.db, access.profileId, async (client) => {
      try {
        return await action(client);
      } catch (error) {
        if (error instanceof QuoteRollback) throw error;
        return mapCommerceError(error);
      }
    });
  }

  /** The price with the coupon applied, computed by the same database function, then rolled back. */
  async quote(access: AccessContext, req: OrderRequest): Promise<OrderQuote> {
    try {
      await this.asStudent(access, async (client) => {
        const id = await repo.createWebOrder(client, req.itemType, req.itemId, req.couponCode ?? null, this.env.GST_RATE_PERCENT);
        const row = (await repo.checkout(client, id))!;
        throw new QuoteRollback({
          grossPaise: row.gross_amount_paise,
          discountPaise: row.discount_paise,
          totalPaise: row.total_paid_paise,
          couponCode: row.coupon_code,
        });
      });
    } catch (error) {
      if (error instanceof QuoteRollback) return error.quote;
      throw error;
    }
    throw new Error('unreachable');
  }

  async createOrder(access: AccessContext, req: OrderRequest): Promise<CheckoutOrder> {
    const gateway = this.gateway();
    let row = await this.asStudent(access, async (client) => {
      const id = await repo.createWebOrder(client, req.itemType, req.itemId, req.couponCode ?? null, this.env.GST_RATE_PERCENT);
      return (await repo.checkout(client, id))!;
    });
    if (!row.razorpay_order_id) {
      // Never inside a database transaction: the receipt is our purchase id, so a timed-out
      // request is matched later instead of creating a second paid order.
      const order = await gateway.createOrder(row.total_paid_paise, row.id, {
        purchase_id: row.id,
        item_type: row.item_type,
        item_id: row.item_id,
      });
      if (order.amount !== row.total_paid_paise || order.currency !== 'INR')
        throw new ApiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'The payment service sent an unexpected order.');
      row = await this.asStudent(access, async (client) => {
        await repo.attachOrder(client, row.id, order.id);
        // A parallel request may have attached its own order first; checkout uses whichever won.
        return (await repo.checkout(client, row.id))!;
      });
      if (!row.razorpay_order_id) throw new ApiError(409, 'PAYMENT_REJECTED', 'This order is no longer open. Start again.');
    }
    return this.checkoutOrder(gateway, row);
  }

  private checkoutOrder(gateway: Razorpay, row: CheckoutRow): CheckoutOrder {
    return {
      purchaseId: row.id,
      keyId: gateway.publicKeyId,
      razorpayOrderId: row.razorpay_order_id!,
      amountPaise: row.total_paid_paise,
      currency: 'INR',
      itemName: row.item_title,
      prefill: { name: row.student_name, email: row.student_email },
    };
  }

  /**
   * The payment, captured, for exactly this order and amount. Accounts without automatic capture
   * leave a fresh payment `authorized`; it is captured here for the order amount.
   */
  private async settledPayment(gateway: Razorpay, row: CheckoutRow, paymentId: string): Promise<RazorpayPayment> {
    let payment = await gateway.fetchPayment(paymentId);
    if (payment.order_id !== row.razorpay_order_id || payment.currency !== 'INR' || payment.amount !== row.total_paid_paise)
      throw notVerified();
    if (payment.status === 'authorized') payment = await gateway.capture(payment.id, row.total_paid_paise);
    if (payment.status !== 'captured' || payment.amount !== row.total_paid_paise) throw notVerified();
    return payment;
  }

  async verify(access: AccessContext, purchaseId: string, req: VerifyPaymentRequest): Promise<OrderResult> {
    const gateway = this.gateway();
    const row = await this.asStudent(access, (client) => repo.checkout(client, purchaseId));
    if (!row || row.student_id !== access.profileId) throw notFound('Order');
    if (row.status === 'captured' || row.status === 'refunded')
      return { purchaseId: row.id, status: row.status, invoiceNumber: row.invoice_number };
    if (row.razorpay_order_id !== req.razorpayOrderId || !gateway.verifyCheckout(req.razorpayOrderId, req.razorpayPaymentId, req.razorpaySignature))
      throw notVerified();
    const payment = await this.settledPayment(gateway, row, req.razorpayPaymentId);
    return this.asStudent(access, async (client) => {
      await repo.fulfil(client, {
        purchaseId: row.id,
        orderId: row.razorpay_order_id!,
        paymentId: payment.id,
        amount: payment.amount,
        fee: payment.fee ?? 0,
        event: `checkout:${payment.id}`,
        payload: { source: 'checkout', payment },
      });
      const done = (await repo.checkout(client, row.id))!;
      return { purchaseId: done.id, status: done.status, invoiceNumber: done.invoice_number };
    });
  }

  /**
   * Razorpay webhook: the signature covers the exact request bytes. Only `payment.captured` and
   * `order.paid` fulfil (after re-fetching the payment); every verified event is stored once.
   */
  async webhook(rawBody: Buffer | undefined, signature: string | undefined, eventId: string | undefined): Promise<void> {
    const gateway = this.gateway();
    if (!rawBody || !signature || !gateway.verifyWebhook(rawBody, signature))
      throw new ApiError(400, 'PAYMENT_NOT_VERIFIED', 'Invalid webhook signature.');
    let body: z.infer<typeof WebhookBody>;
    try {
      body = WebhookBody.parse(JSON.parse(rawBody.toString('utf8')));
    } catch {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Unexpected webhook body.');
    }
    const id = eventId?.slice(0, 120) || `webhook:${createHash('sha256').update(rawBody).digest('hex')}`;
    const entity = body.payload?.payment?.entity;
    const notes = entity?.notes && !Array.isArray(entity.notes) ? entity.notes : {};
    const purchaseId = z.uuid().safeParse(notes['purchase_id']);

    if ((body.event === 'payment.captured' || body.event === 'order.paid') && entity && purchaseId.success) {
      const payment = await gateway.fetchPayment(entity.id);
      if (payment.status === 'captured' && payment.order_id && payment.currency === 'INR') {
        try {
          await transaction(this.db, (client) =>
            repo.fulfil(client, {
              purchaseId: purchaseId.data,
              orderId: payment.order_id!,
              paymentId: payment.id,
              amount: payment.amount,
              fee: payment.fee ?? 0,
              event: id,
              payload: { event: body.event, payment },
            }),
          );
          return;
        } catch (error) {
          const code = (error as { code?: unknown } | null)?.code;
          // Not ours, or the amount does not match: keep the evidence, do not make Razorpay retry.
          if (code !== 'P0002' && code !== '23514') throw error;
          this.logger.warn(`Razorpay ${body.event} for purchase ${purchaseId.data} did not match its order`);
        }
      }
    }
    await transaction(this.db, (client) =>
      repo.recordEvent(client, id, purchaseId.success ? purchaseId.data : null, JSON.parse(rawBody.toString('utf8'))),
    );
  }

  async ownership(access: AccessContext, itemType: PurchaseItemType, itemId: string): Promise<Ownership> {
    const owned = await withUser(this.db, access.profileId, (client) => repo.owns(client, access.profileId, itemType, itemId));
    return { owned, paymentsEnabled: this.razorpay !== null };
  }

  async myPurchases(access: AccessContext): Promise<MyPurchaseList> {
    const rows = await withUser(this.db, access.profileId, (client) => repo.myPurchases(client, access.profileId));
    return { items: rows.map(toMyPurchase) };
  }
}

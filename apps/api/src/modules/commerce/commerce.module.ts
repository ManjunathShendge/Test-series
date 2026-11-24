import { Module } from '@nestjs/common';
import { ENVIRONMENT } from '../../database/database.module.js';
import type { Environment } from '../../config/env.js';
import { Razorpay } from '../../providers/razorpay/razorpay.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AdminCommerceService } from './application/admin-commerce.service.js';
import { CheckoutService } from './application/checkout.service.js';
import { EarningsService } from './application/earnings.service.js';
import { RAZORPAY } from './domain/commerce.js';
import {
  AdminCommerceController,
  AdminPayoutsController,
  CheckoutController,
  ExaminerEarningsController,
  RazorpayWebhookController,
} from './http/commerce.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [
    CheckoutController,
    RazorpayWebhookController,
    ExaminerEarningsController,
    AdminPayoutsController,
    AdminCommerceController,
  ],
  providers: [
    {
      provide: RAZORPAY,
      inject: [ENVIRONMENT],
      // Without keys, checkout answers 503 PAYMENTS_NOT_CONFIGURED; everything else still works.
      useFactory: (env: Environment) =>
        env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
          ? new Razorpay(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET)
          : null,
    },
    CheckoutService,
    EarningsService,
    AdminCommerceService,
  ],
})
export class CommerceModule {}

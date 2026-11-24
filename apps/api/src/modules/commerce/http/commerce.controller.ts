import { Body, Controller, Get, Header, Headers, HttpCode, Param, Patch, Post, Put, Query, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  BlockStudentRequest,
  CalculatePayoutsRequest,
  CreateCouponRequest,
  GrantAccessRequest,
  OrderRequest,
  PayoutActionRequest,
  PayoutMonthQuery,
  PurchaseItemType,
  RefundRequest,
  SalesQuery,
  StudentSearchQuery,
  UpdateCouponRequest,
  UpdatePriceBandRequest,
  VerifyPaymentRequest,
  type AdminStudentDetail,
  type AdminStudentList,
  type AssetViewUrl,
  type CheckoutOrder,
  type CouponList,
  type ExaminerSalesResponse,
  type Entitlements,
  type MyPurchaseList,
  type OrderQuote,
  type OrderResult,
  type Ownership,
  type Payout,
  type PayoutList,
  type PricingOverview,
} from '@exam-prep/contracts';
import { FirebaseAuthGuard, CurrentIdentity } from '../../../common/guards/firebase-auth.guard.js';
import { parseContract } from '../../../common/pipes/parse-contract.js';
import type { VerifiedIdentity } from '../../../providers/firebase/identity-verifier.js';
import type { AccessContext } from '../../identity/application/identity.service.js';
import { CurrentAccess, RequireAdminPermission, Roles, RolesGuard } from '../../identity/http/roles.guard.js';
import { AdminCommerceService } from '../application/admin-commerce.service.js';
import { CheckoutService } from '../application/checkout.service.js';
import { EarningsService } from '../application/earnings.service.js';

const Id = z.uuid();
const OwnershipQuery = z.strictObject({ itemType: PurchaseItemType, itemId: z.uuid() });
const CSV = 'text/csv; charset=utf-8';

const file = (result: { file: Buffer; filename: string }) =>
  new StreamableFile(result.file, { disposition: `attachment; filename="${result.filename}"`, type: CSV });

/** Student web checkout (PAYMENTS.md). Prices and access are decided by the server. */
@Controller()
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class CheckoutController {
  constructor(private readonly service: CheckoutService) {}

  @Post('orders/quote')
  @HttpCode(200)
  quote(@CurrentAccess() access: AccessContext, @Body() body: unknown): Promise<OrderQuote> {
    return this.service.quote(access, parseContract(OrderRequest, body));
  }

  @Post('orders')
  createOrder(@CurrentAccess() access: AccessContext, @Body() body: unknown): Promise<CheckoutOrder> {
    return this.service.createOrder(access, parseContract(OrderRequest, body));
  }

  @Post('orders/:id/verify')
  @HttpCode(200)
  verify(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<OrderResult> {
    return this.service.verify(access, parseContract(Id, id), parseContract(VerifyPaymentRequest, body));
  }

  @Get('me/ownership')
  ownership(@CurrentAccess() access: AccessContext, @Query() query: unknown): Promise<Ownership> {
    const q = parseContract(OwnershipQuery, query);
    return this.service.ownership(access, q.itemType, q.itemId);
  }

  @Get('me/entitlements')
  @Header('Cache-Control', 'private, no-store')
  entitlements(@CurrentAccess() access: AccessContext): Promise<Entitlements> {
    return this.service.entitlements(access);
  }

  @Get('me/purchases/:id/invoice')
  @Header('Cache-Control', 'private, no-store')
  async invoice(@CurrentAccess() access: AccessContext, @Param('id') id: string): Promise<StreamableFile> {
    const pdf = await this.service.invoice(access, parseContract(Id, id));
    return new StreamableFile(pdf.file, { disposition: `attachment; filename="${pdf.filename}"`, type: 'application/pdf' });
  }

  @Get('me/purchases')
  purchases(@CurrentAccess() access: AccessContext): Promise<MyPurchaseList> {
    return this.service.myPurchases(access);
  }
}

/** Razorpay server-to-server callbacks: no user session; the signature is the authentication. */
@Controller('webhooks')
export class RazorpayWebhookController {
  constructor(private readonly service: CheckoutService) {}

  @Post('razorpay')
  @HttpCode(200)
  async razorpay(
    @Req() request: { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
  ): Promise<{ ok: true }> {
    await this.service.webhook(request.rawBody, signature, eventId);
    return { ok: true };
  }
}

/** Examiner dashboard: sales, earnings and payouts, coupon codes (PRD 4.4). */
@Controller('examiner')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('examiner')
export class ExaminerEarningsController {
  constructor(private readonly service: EarningsService) {}

  @Get('sales')
  sales(@CurrentIdentity() identity: VerifiedIdentity, @Query() query: unknown): Promise<ExaminerSalesResponse> {
    return this.service.sales(identity, parseContract(SalesQuery, query).days);
  }

  @Get('earnings')
  earnings(@CurrentIdentity() identity: VerifiedIdentity): Promise<PayoutList> {
    return this.service.payouts(identity);
  }

  @Get('earnings/:id/statement')
  @Header('cache-control', 'no-store')
  async statement(@CurrentIdentity() identity: VerifiedIdentity, @Param('id') id: string): Promise<StreamableFile> {
    return file(await this.service.statement(identity, parseContract(Id, id)));
  }

  @Get('earnings/:id/tds-certificate')
  tdsCertificate(@CurrentIdentity() identity: VerifiedIdentity, @Param('id') id: string): Promise<AssetViewUrl> {
    return this.service.tdsCertificate(identity, parseContract(Id, id));
  }

  @Get('coupons')
  coupons(@CurrentIdentity() identity: VerifiedIdentity): Promise<CouponList> {
    return this.service.coupons(identity);
  }
}

/** Admin pricing and students (ops permission, PRD 8). */
@Controller('admin')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@RequireAdminPermission('ops')
export class AdminCommerceController {
  constructor(private readonly service: AdminCommerceService) {}

  @Get('pricing')
  pricing(@CurrentAccess() access: AccessContext): Promise<PricingOverview> {
    return this.service.pricing(access);
  }

  @Post('coupons')
  createCoupon(@CurrentAccess() access: AccessContext, @Body() body: unknown): Promise<PricingOverview> {
    return this.service.createCoupon(access, parseContract(CreateCouponRequest, body));
  }

  @Patch('coupons/:id')
  updateCoupon(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<PricingOverview> {
    return this.service.setCouponActive(access, parseContract(Id, id), parseContract(UpdateCouponRequest, body).isActive);
  }

  @Put('price-bands/:examId')
  priceBand(@CurrentAccess() access: AccessContext, @Param('examId') examId: string, @Body() body: unknown): Promise<PricingOverview> {
    return this.service.updatePriceBand(access, parseContract(Id, examId), parseContract(UpdatePriceBandRequest, body));
  }

  @Get('students')
  students(@CurrentAccess() access: AccessContext, @Query() query: unknown): Promise<AdminStudentList> {
    return this.service.searchStudents(access, parseContract(StudentSearchQuery, query).q);
  }

  @Get('students/:id')
  student(@CurrentAccess() access: AccessContext, @Param('id') id: string): Promise<AdminStudentDetail> {
    return this.service.studentDetail(access, parseContract(Id, id));
  }

  @Patch('students/:id')
  block(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminStudentDetail> {
    return this.service.block(access, parseContract(Id, id), parseContract(BlockStudentRequest, body));
  }

  @Post('students/:id/grants')
  grant(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminStudentDetail> {
    return this.service.grant(access, parseContract(Id, id), parseContract(GrantAccessRequest, body));
  }

  @Post('purchases/:id/refund')
  @HttpCode(200)
  refund(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<AdminStudentDetail> {
    return this.service.refund(access, parseContract(Id, id), parseContract(RefundRequest, body));
  }
}

/** Admin payouts (finance permission, PRD 8 "Payouts"). */
@Controller('admin/payouts')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@RequireAdminPermission('finance')
export class AdminPayoutsController {
  constructor(private readonly service: AdminCommerceService) {}

  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: unknown): Promise<PayoutList> {
    return this.service.payouts(access, parseContract(PayoutMonthQuery, query).month);
  }

  @Get('export')
  @Header('cache-control', 'no-store')
  async export(@CurrentAccess() access: AccessContext, @Query() query: unknown): Promise<StreamableFile> {
    return file(await this.service.exportPayouts(access, parseContract(PayoutMonthQuery, query).month));
  }

  @Post('calculate')
  @HttpCode(200)
  calculate(@CurrentAccess() access: AccessContext, @Body() body: unknown): Promise<PayoutList> {
    return this.service.calculate(access, parseContract(CalculatePayoutsRequest, body));
  }

  @Post(':id')
  @HttpCode(200)
  act(@CurrentAccess() access: AccessContext, @Param('id') id: string, @Body() body: unknown): Promise<Payout> {
    return this.service.act(access, parseContract(Id, id), parseContract(PayoutActionRequest, body));
  }
}

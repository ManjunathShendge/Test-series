import { z } from 'zod';

// Web commerce, examiner sales/earnings/coupons and admin pricing, payouts and students
// (PRD 4.4, 8; PAYMENTS.md). Amounts are integer paise; the server decides every price.

const IsoTime = z.iso.datetime({ offset: true });
const Paise = z.number().int();
const CouponCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,20}$/, 'Codes are 4 to 20 letters or digits.');

export const PurchaseItemType = z.enum(['single_test', 'test_series']);
export type PurchaseItemType = z.infer<typeof PurchaseItemType>;
export const PurchaseStatus = z.enum(['created', 'captured', 'failed', 'refunded']);
export type PurchaseStatus = z.infer<typeof PurchaseStatus>;

// Student checkout ----------------------------------------------------------------------------

export const OrderRequest = z.strictObject({
  itemType: PurchaseItemType,
  itemId: z.uuid(),
  couponCode: CouponCode.optional(),
});
export type OrderRequest = z.infer<typeof OrderRequest>;

/** Price the server will charge, with the coupon applied; nothing is stored. */
export const OrderQuote = z.object({
  grossPaise: Paise,
  discountPaise: Paise,
  totalPaise: Paise,
  couponCode: z.string().nullable(),
});
export type OrderQuote = z.infer<typeof OrderQuote>;

/** What Razorpay Checkout needs; the key id is public, the secret never leaves the server. */
export const CheckoutOrder = z.object({
  purchaseId: z.uuid(),
  keyId: z.string(),
  razorpayOrderId: z.string(),
  amountPaise: Paise,
  currency: z.literal('INR'),
  itemName: z.string(),
  prefill: z.object({ name: z.string(), email: z.string().nullable() }),
});
export type CheckoutOrder = z.infer<typeof CheckoutOrder>;

export const VerifyPaymentRequest = z.strictObject({
  razorpayOrderId: z.string().trim().min(1).max(64),
  razorpayPaymentId: z.string().trim().min(1).max(64),
  razorpaySignature: z.string().trim().regex(/^[a-f0-9]{64}$/),
});
export type VerifyPaymentRequest = z.infer<typeof VerifyPaymentRequest>;

export const OrderResult = z.object({
  purchaseId: z.uuid(),
  status: PurchaseStatus,
  invoiceNumber: z.string().nullable(),
});
export type OrderResult = z.infer<typeof OrderResult>;

export const Ownership = z.object({ owned: z.boolean(), paymentsEnabled: z.boolean() });
export type Ownership = z.infer<typeof Ownership>;

/**
 * GET /v1/me/entitlements: what the student can open now. Tests include those unlocked through
 * a series. The server re-checks access on every paper request; this only drives the UI.
 */
export const Entitlements = z.object({ testIds: z.array(z.uuid()), seriesIds: z.array(z.uuid()) });
export type Entitlements = z.infer<typeof Entitlements>;

export const MyPurchase = z.object({
  id: z.uuid(),
  itemType: PurchaseItemType,
  itemId: z.uuid(),
  itemTitle: z.string(),
  itemSlug: z.string(),
  status: PurchaseStatus,
  totalPaise: Paise,
  discountPaise: Paise,
  couponCode: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  channel: z.string(),
  validUntil: IsoTime.nullable(),
  capturedAt: IsoTime.nullable(),
  refundedAt: IsoTime.nullable(),
  createdAt: IsoTime,
});
export type MyPurchase = z.infer<typeof MyPurchase>;
export const MyPurchaseList = z.object({ items: z.array(MyPurchase) });
export type MyPurchaseList = z.infer<typeof MyPurchaseList>;

// Examiner dashboard (PRD 4.4) ------------------------------------------------------------------

export const SalesRow = z.object({
  sales: z.number().int(),
  refunds: z.number().int(),
  grossPaise: Paise,
  netPaise: Paise,
  /** Proposed share (DECISIONS O03): 65% of net, 75% when the examiner's code was used. */
  sharePaise: Paise,
  couponSales: z.number().int(),
  attempts: z.number().int(),
});
export type SalesRow = z.infer<typeof SalesRow>;

export const ExaminerSalesResponse = z.object({
  from: IsoTime,
  to: IsoTime,
  totals: SalesRow,
  byTest: z.array(SalesRow.extend({ itemId: z.uuid(), itemType: PurchaseItemType, title: z.string() })),
  byDay: z.array(SalesRow.extend({ day: z.string() })),
});
export type ExaminerSalesResponse = z.infer<typeof ExaminerSalesResponse>;

export const SalesQuery = z.strictObject({ days: z.coerce.number().int().min(7).max(365).default(30) });
export type SalesQuery = z.infer<typeof SalesQuery>;

export const PayoutStatus = z.enum(['calculated', 'on_hold', 'approved', 'paid']);
export type PayoutStatus = z.infer<typeof PayoutStatus>;

export const Payout = z.object({
  id: z.uuid(),
  examinerId: z.uuid(),
  examinerName: z.string(),
  month: z.string(),
  directSalesPaise: Paise,
  couponSalesPaise: Paise,
  passPoolPaise: Paise,
  refundDeductionsPaise: Paise,
  carriedForwardPaise: Paise,
  grossPaise: Paise,
  tdsRatePercent: z.number(),
  tdsPaise: Paise,
  netPayablePaise: Paise,
  status: PayoutStatus,
  holdReason: z.string().nullable(),
  carriedIntoMonth: z.string().nullable(),
  bankTransferRef: z.string().nullable(),
  paidAt: IsoTime.nullable(),
  hasTdsCertificate: z.boolean(),
  kycVerified: z.boolean(),
  updatedAt: IsoTime,
});
export type Payout = z.infer<typeof Payout>;
export const PayoutList = z.object({ items: z.array(Payout) });
export type PayoutList = z.infer<typeof PayoutList>;

export const Coupon = z.object({
  id: z.uuid(),
  code: z.string(),
  examinerId: z.uuid().nullable(),
  examinerName: z.string().nullable(),
  discountPercent: z.number().nullable(),
  maxDiscountPaise: Paise.nullable(),
  flatDiscountPaise: Paise.nullable(),
  validFrom: IsoTime,
  validUntil: IsoTime.nullable(),
  maxUses: z.number().int().nullable(),
  uses: z.number().int(),
  isActive: z.boolean(),
  salesPaise: Paise,
});
export type Coupon = z.infer<typeof Coupon>;
export const CouponList = z.object({ items: z.array(Coupon) });
export type CouponList = z.infer<typeof CouponList>;

// Admin: pricing, payouts, students (PRD 8) ------------------------------------------------------

export const CreateCouponRequest = z
  .strictObject({
    code: CouponCode,
    examinerId: z.uuid().nullable(),
    discountPercent: z.number().min(0).max(100).nullable(),
    maxDiscountPaise: z.number().int().min(0).max(1_000_000).nullable(),
    flatDiscountPaise: z.number().int().min(0).max(1_000_000).nullable(),
    validUntil: IsoTime.nullable(),
    maxUses: z.number().int().min(1).max(1_000_000).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.discountPercent !== null && value.flatDiscountPaise !== null)
      ctx.addIssue({ code: 'custom', path: ['flatDiscountPaise'], message: 'Choose a percentage or a flat amount, not both.' });
    if (value.examinerId === null && value.discountPercent === null && value.flatDiscountPaise === null)
      ctx.addIssue({ code: 'custom', path: ['discountPercent'], message: 'A platform code needs a discount.' });
    if (value.validUntil && new Date(value.validUntil).getTime() <= Date.now())
      ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'The end date must be in the future.' });
  });
export type CreateCouponRequest = z.infer<typeof CreateCouponRequest>;

export const UpdateCouponRequest = z.strictObject({ isActive: z.boolean() });
export type UpdateCouponRequest = z.infer<typeof UpdateCouponRequest>;

export const AdminPriceBand = z.object({
  examId: z.uuid(),
  examName: z.string(),
  minPaise: Paise,
  maxNewPaise: Paise,
  maxVerifiedPaise: Paise,
  maxTopPaise: Paise,
  updatedAt: IsoTime,
});
export type AdminPriceBand = z.infer<typeof AdminPriceBand>;

export const PricingOverview = z.object({
  coupons: z.array(Coupon),
  bands: z.array(AdminPriceBand),
  examiners: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type PricingOverview = z.infer<typeof PricingOverview>;

export const UpdatePriceBandRequest = z
  .strictObject({
    expectedUpdatedAt: IsoTime,
    minPaise: z.number().int().min(100).max(1_000_000),
    maxNewPaise: z.number().int().min(100).max(1_000_000),
    maxVerifiedPaise: z.number().int().min(100).max(1_000_000),
    maxTopPaise: z.number().int().min(100).max(1_000_000),
  })
  .superRefine((value, ctx) => {
    if (!(value.minPaise <= value.maxNewPaise && value.maxNewPaise <= value.maxVerifiedPaise && value.maxVerifiedPaise <= value.maxTopPaise))
      ctx.addIssue({ code: 'custom', path: ['maxNewPaise'], message: 'Use minimum ≤ New ≤ Verified ≤ Top.' });
  });
export type UpdatePriceBandRequest = z.infer<typeof UpdatePriceBandRequest>;

export const PayoutMonthQuery = z.strictObject({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
export type PayoutMonthQuery = z.infer<typeof PayoutMonthQuery>;

export const CalculatePayoutsRequest = z.strictObject({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  tdsRatePercent: z.number().min(0).max(50),
});
export type CalculatePayoutsRequest = z.infer<typeof CalculatePayoutsRequest>;

export const PayoutActionRequest = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('approve'), expectedUpdatedAt: IsoTime }),
  z.strictObject({ action: z.literal('hold'), expectedUpdatedAt: IsoTime, reason: z.string().trim().min(3).max(500) }),
  z.strictObject({ action: z.literal('release'), expectedUpdatedAt: IsoTime }),
  z.strictObject({
    action: z.literal('mark_paid'),
    expectedUpdatedAt: IsoTime,
    bankTransferRef: z.string().trim().min(4).max(64).regex(/^[A-Za-z0-9/-]+$/, 'Letters, digits, / and - only.'),
  }),
  z.strictObject({ action: z.literal('attach_tds'), expectedUpdatedAt: IsoTime, assetId: z.uuid() }),
]);
export type PayoutActionRequest = z.infer<typeof PayoutActionRequest>;

export const StudentSearchQuery = z.strictObject({ q: z.string().trim().min(2).max(200) });
export type StudentSearchQuery = z.infer<typeof StudentSearchQuery>;

export const AdminStudent = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string().nullable(),
  isBlocked: z.boolean(),
  createdAt: IsoTime,
  attempts: z.number().int(),
});
export type AdminStudent = z.infer<typeof AdminStudent>;
export const AdminStudentList = z.object({ items: z.array(AdminStudent) });
export type AdminStudentList = z.infer<typeof AdminStudentList>;

export const AdminStudentDetail = AdminStudent.extend({
  purchases: z.array(MyPurchase.extend({ refundable: z.boolean(), refundBlockedReason: z.string().nullable() })),
});
export type AdminStudentDetail = z.infer<typeof AdminStudentDetail>;

export const RefundRequest = z.strictObject({ reason: z.string().trim().min(3).max(500) });
export type RefundRequest = z.infer<typeof RefundRequest>;
export const GrantAccessRequest = z.strictObject({
  itemType: PurchaseItemType,
  itemId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});
export type GrantAccessRequest = z.infer<typeof GrantAccessRequest>;
export const BlockStudentRequest = z.strictObject({ blocked: z.boolean(), reason: z.string().trim().min(3).max(500) });
export type BlockStudentRequest = z.infer<typeof BlockStudentRequest>;

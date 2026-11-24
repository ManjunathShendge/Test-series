'use client';

import {
  AdminStudentDetail,
  AdminStudentList,
  AssetViewUrl,
  CheckoutOrder,
  CouponList,
  ExaminerSalesResponse,
  MyPurchaseList,
  OrderQuote,
  OrderResult,
  Ownership,
  Payout,
  PayoutList,
  PricingOverview,
  type BlockStudentRequest,
  type CalculatePayoutsRequest,
  type CreateCouponRequest,
  type GrantAccessRequest,
  type OrderRequest,
  type PayoutActionRequest,
  type PurchaseItemType,
  type UpdatePriceBandRequest,
  type VerifyPaymentRequest,
} from '@exam-prep/contracts';
import { apiDownload, apiRequest } from './http';

/** Web checkout, examiner earnings and admin money screens. The server decides every amount. */
const enc = encodeURIComponent;

export const checkoutApi = {
  ownership: (itemType: PurchaseItemType, itemId: string) =>
    apiRequest('GET', `/me/ownership?itemType=${itemType}&itemId=${enc(itemId)}`, { schema: Ownership }),
  quote: (body: OrderRequest) => apiRequest('POST', '/orders/quote', { schema: OrderQuote, body }),
  order: (body: OrderRequest) => apiRequest('POST', '/orders', { schema: CheckoutOrder, body }),
  verify: (purchaseId: string, body: VerifyPaymentRequest) =>
    apiRequest('POST', `/orders/${enc(purchaseId)}/verify`, { schema: OrderResult, body, timeoutMs: 30000 }),
  purchases: async () => (await apiRequest('GET', '/me/purchases', { schema: MyPurchaseList })).items,
  /** Tax invoice PDF for one of the student's own purchases. */
  invoice: (purchaseId: string) => apiDownload(`/me/purchases/${enc(purchaseId)}/invoice`),
};

export const earningsApi = {
  sales: (days: number) => apiRequest('GET', `/examiner/sales?days=${days}`, { schema: ExaminerSalesResponse }),
  payouts: async () => (await apiRequest('GET', '/examiner/earnings', { schema: PayoutList })).items,
  statement: (id: string) => apiDownload(`/examiner/earnings/${enc(id)}/statement`),
  tdsCertificate: (id: string) => apiRequest('GET', `/examiner/earnings/${enc(id)}/tds-certificate`, { schema: AssetViewUrl }),
  coupons: async () => (await apiRequest('GET', '/examiner/coupons', { schema: CouponList })).items,
};

export const adminMoneyApi = {
  pricing: () => apiRequest('GET', '/admin/pricing', { schema: PricingOverview }),
  createCoupon: (body: CreateCouponRequest) => apiRequest('POST', '/admin/coupons', { schema: PricingOverview, body }),
  setCouponActive: (id: string, isActive: boolean) =>
    apiRequest('PATCH', `/admin/coupons/${enc(id)}`, { schema: PricingOverview, body: { isActive } }),
  updateBand: (examId: string, body: UpdatePriceBandRequest) =>
    apiRequest('PUT', `/admin/price-bands/${enc(examId)}`, { schema: PricingOverview, body }),

  payouts: async (month: string) => (await apiRequest('GET', `/admin/payouts?month=${month}`, { schema: PayoutList })).items,
  calculate: async (body: CalculatePayoutsRequest) =>
    (await apiRequest('POST', '/admin/payouts/calculate', { schema: PayoutList, body, timeoutMs: 60000 })).items,
  act: (id: string, body: PayoutActionRequest) => apiRequest('POST', `/admin/payouts/${enc(id)}`, { schema: Payout, body }),
  exportPayouts: (month: string) => apiDownload(`/admin/payouts/export?month=${month}`),

  students: async (q: string) => (await apiRequest('GET', `/admin/students?q=${enc(q)}`, { schema: AdminStudentList })).items,
  student: (id: string) => apiRequest('GET', `/admin/students/${enc(id)}`, { schema: AdminStudentDetail }),
  block: (id: string, body: BlockStudentRequest) =>
    apiRequest('PATCH', `/admin/students/${enc(id)}`, { schema: AdminStudentDetail, body }),
  grant: (id: string, body: GrantAccessRequest) =>
    apiRequest('POST', `/admin/students/${enc(id)}/grants`, { schema: AdminStudentDetail, body }),
  refund: (purchaseId: string, reason: string) =>
    apiRequest('POST', `/admin/purchases/${enc(purchaseId)}/refund`, { schema: AdminStudentDetail, body: { reason }, timeoutMs: 45000 }),
};

/** "₹49" / "₹49.50"; zero shows as ₹0 (money screens never say "Free"). */
export const inr = (paise: number) =>
  `${paise < 0 ? '−' : ''}₹${(Math.abs(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Saves a downloaded blob under a filename. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

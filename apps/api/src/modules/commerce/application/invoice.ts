import { renderPdf, type PdfLine, type PdfRule } from '../../../common/pdf/simple-pdf.js';

export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  item_type: string;
  item_title: string;
  student_name: string;
  student_email: string | null;
  gross_amount_paise: number;
  discount_paise: number;
  taxable_amount_paise: number;
  gst_rate_percent: string;
  gst_amount_paise: number;
  total_paid_paise: number;
  payment_channel: string;
  coupon_code: string | null;
  captured_at: Date | null;
  refunded_at: Date | null;
}

export interface Seller {
  legalName?: string | undefined;
  gstin?: string | undefined;
  address?: string | undefined;
  supportEmail?: string | undefined;
}

const rupees = (paise: number) => `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const CHANNEL: Record<string, string> = { razorpay: 'Online (Razorpay)', google_play: 'Google Play', apple_iap: 'App Store', admin_grant: 'Granted by support' };

/**
 * Invoice or receipt PDF for one purchase, from the amounts stored at capture (never recomputed).
 * It is titled "Tax invoice" only when the seller GSTIN is configured; otherwise "Receipt".
 */
export function invoicePdf(row: InvoiceRow, seller: Seller): { file: Buffer; filename: string } {
  const tax = !!seller.gstin;
  const title = tax ? 'Tax invoice' : 'Receipt';
  const number = row.invoice_number ?? row.id.slice(0, 8).toUpperCase();
  const lines: PdfLine[] = [];
  const rules: PdfRule[] = [];
  let y = 60;
  const add = (text: string, opts: Partial<PdfLine> = {}) => lines.push({ text, x: 50, y, ...opts });

  add(seller.legalName ?? 'Exam Prep', { size: 16, bold: true });
  add(title, { x: 545, right: true, size: 16, bold: true });
  y += 18;
  if (seller.address) add(seller.address, { size: 9 });
  y += 13;
  if (seller.gstin) add(`GSTIN ${seller.gstin}`, { size: 9 });
  y += 30;

  add('Billed to', { size: 9, bold: true });
  add(`${title} no.`, { x: 340, size: 9, bold: true });
  add(number, { x: 545, right: true, size: 9 });
  y += 14;
  add(row.student_name, { size: 10 });
  add('Date', { x: 340, size: 9, bold: true });
  add(row.captured_at ? day(row.captured_at) : '-', { x: 545, right: true, size: 9 });
  y += 14;
  if (row.student_email) add(row.student_email, { size: 9 });
  add('Paid via', { x: 340, size: 9, bold: true });
  add(CHANNEL[row.payment_channel] ?? row.payment_channel, { x: 545, right: true, size: 9 });
  y += 34;

  rules.push({ x1: 50, x2: 545, y: y - 12 });
  add('Item', { size: 9, bold: true });
  add('Amount', { x: 545, right: true, size: 9, bold: true });
  y += 8;
  rules.push({ x1: 50, x2: 545, y });
  y += 18;
  add(`${row.item_title} (${row.item_type === 'test_series' ? 'test series' : 'test'}, SAC 999293)`, { size: 10 });
  add(rupees(row.gross_amount_paise), { x: 545, right: true });
  y += 18;
  if (row.discount_paise > 0) {
    add(`Discount${row.coupon_code ? ` (${row.coupon_code})` : ''}`, { size: 10 });
    add(`- ${rupees(row.discount_paise)}`, { x: 545, right: true });
    y += 18;
  }
  rules.push({ x1: 300, x2: 545, y: y - 6 });
  y += 10;
  add('Taxable value', { x: 300, size: 10 });
  add(rupees(row.taxable_amount_paise), { x: 545, right: true });
  y += 16;
  add(`GST @ ${Number(row.gst_rate_percent)}% (IGST)`, { x: 300, size: 10 });
  add(rupees(row.gst_amount_paise), { x: 545, right: true });
  y += 20;
  add('Total paid', { x: 300, size: 12, bold: true });
  add(rupees(row.total_paid_paise), { x: 545, right: true, size: 12, bold: true });
  y += 30;
  if (row.refunded_at) {
    add(`Refunded on ${day(row.refunded_at)}. Access to this item has ended.`, { size: 10, bold: true });
    y += 18;
  }
  y += 10;
  add('Prices include GST. This is a computer-generated document and needs no signature.', { size: 8 });
  y += 12;
  if (seller.supportEmail) add(`Questions about this purchase: ${seller.supportEmail}`, { size: 8 });

  return { file: renderPdf(lines, rules, `${title} ${number}`), filename: `${number.replace(/[^A-Za-z0-9_-]/g, '-')}.pdf` };
}

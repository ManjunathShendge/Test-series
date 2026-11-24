import { describe, expect, it } from 'vitest';
import { renderPdf } from '../../src/common/pdf/simple-pdf.js';
import { emailCopy, pushCopy } from '../../src/jobs/templates.js';
import { invoicePdf } from '../../src/modules/commerce/application/invoice.js';

describe('notification templates', () => {
  it('localizes push copy and keeps it short', () => {
    expect(pushCopy('result_ready', 'hi', { test: 'SSC Mock 1' }).title).toBe('आपका परिणाम तैयार है');
    expect(pushCopy('result_ready', 'en', { test: 'SSC Mock 1' }).body).toContain('SSC Mock 1');
  });

  it('escapes user-provided text in email HTML', () => {
    const mail = emailCopy('receipt_ready', { name: '<script>x</script>', item: 'A & B', amount: '₹10', url: 'https://example.test/account' }, 'Brand');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.text).toContain('https://example.test/account');
  });
});

describe('PDF writer', () => {
  it('produces a well-formed single page with a valid cross-reference table', () => {
    const pdf = renderPdf([{ text: 'Total (₹118) \\ done', x: 50, y: 60 }], [{ x1: 50, x2: 545, y: 70 }], 'Doc').toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('(Total \\(Rs. 118\\) \\\\ done)');
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    // Every object offset in the table points at "n 0 obj".
    const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(pdf.slice(o).startsWith(`${i + 1} 0 obj\n`)).toBe(true));
  });

  it('labels a tax invoice only with a seller GSTIN', () => {
    const row = {
      id: '00000000-0000-4000-8000-000000000000', invoice_number: 'INV/1', item_type: 'single_test', item_title: 'Mock', student_name: 'S',
      student_email: null, gross_amount_paise: 11800, discount_paise: 0, taxable_amount_paise: 10000, gst_rate_percent: '18',
      gst_amount_paise: 1800, total_paid_paise: 11800, payment_channel: 'razorpay', coupon_code: null, captured_at: null, refunded_at: null,
    };
    expect(invoicePdf(row, { gstin: '27ABCDE1234F1Z5' }).file.toString('latin1')).toContain('(Tax invoice)');
    const receipt = invoicePdf(row, {});
    expect(receipt.file.toString('latin1')).toContain('(Receipt)');
    expect(receipt.filename).toBe('INV-1.pdf');
  });
});

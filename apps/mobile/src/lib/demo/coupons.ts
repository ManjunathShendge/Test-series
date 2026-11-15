import { examiners, series, tests } from './catalogue';

/**
 * Demo coupon rules (PRD 6.3: platform promotional coupons and examiner codes).
 * On store billing a discount cannot change the Play or App Store price at
 * runtime; the server maps a valid code to a discounted product tier and
 * records the attribution. Examiner codes also move the sale to the higher
 * revenue share (PRD 4.4). The server is the authority for all of this; the
 * client only previews the outcome.
 */
export interface CouponResolution {
  code: string;
  kind: 'platform' | 'examiner';
  percentOff: number;
  examinerId?: string;
  label: string;
}

interface CouponRule {
  code: string;
  kind: 'platform' | 'examiner';
  percentOff: number;
  examinerId?: string;
}

const RULES: CouponRule[] = [
  { code: 'WELCOME20', kind: 'platform', percentOff: 20 },
  { code: 'ANITA10', kind: 'examiner', percentOff: 10, examinerId: 'ex-anita' },
  { code: 'RAHUL10', kind: 'examiner', percentOff: 10, examinerId: 'ex-rahul' },
];

export type CouponOutcome = { ok: true; coupon: CouponResolution } | { ok: false; reason: string };

export function resolveCoupon(raw: string, item: { kind: 'test' | 'series'; id: string }): CouponOutcome {
  const code = raw.trim().toUpperCase();
  if (!code) return { ok: false, reason: 'Enter a code.' };
  const rule = RULES.find((r) => r.code === code);
  if (!rule) return { ok: false, reason: 'This code is not valid or has expired.' };
  if (rule.kind === 'examiner') {
    const examinerId = item.kind === 'test' ? tests.find((t) => t.id === item.id)?.examinerId : series.find((s) => s.id === item.id)?.examinerId;
    if (examinerId !== rule.examinerId) {
      const name = examiners.find((e) => e.id === rule.examinerId)?.name ?? 'this examiner';
      return { ok: false, reason: `This code only works on tests by ${name}.` };
    }
  }
  const examinerName = rule.examinerId ? examiners.find((e) => e.id === rule.examinerId)?.name : undefined;
  const base: CouponResolution = {
    code: rule.code,
    kind: rule.kind,
    percentOff: rule.percentOff,
    label: rule.kind === 'examiner' ? `${rule.percentOff}% off · supports ${examinerName ?? 'the examiner'}` : `${rule.percentOff}% off`,
  };
  return { ok: true, coupon: rule.examinerId ? { ...base, examinerId: rule.examinerId } : base };
}

/** Discounted price in paise, rounded to the nearest paisa, never below zero. */
export function applyPercentOff(paise: number, percentOff: number): number {
  return Math.max(0, Math.round((paise * (100 - percentOff)) / 100));
}

/**
 * Splits a GST-inclusive price (integer paise) into base and tax. The 18% rate
 * is the proposed launch rate for digital services; final rates and invoice
 * issuer are pending with the CA (DECISIONS O09), so UI labels it "includes".
 */
export const GST_RATE_PERCENT = 18;
export function splitGst(inclusivePaise: number, ratePercent = GST_RATE_PERCENT): { basePaise: number; gstPaise: number } {
  const basePaise = Math.round((inclusivePaise * 100) / (100 + ratePercent));
  return { basePaise, gstPaise: inclusivePaise - basePaise };
}

import type { NotificationKind } from '@exam-prep/contracts';

/**
 * Notification copy, versioned with the code, English and Hindi with English fallback
 * (docs/NOTIFICATIONS.md). Push carries only a title, a short line and an in-app path; emails
 * carry the facts the recipient needs and a link, never keys, question content or KYC.
 */

export type Lang = 'en' | 'hi';
export const TEMPLATE_VERSION = 1;

export interface PushCopy {
  title: string;
  body: string;
}

type Vars = Record<string, string>;

const push: Record<'result_ready' | 'followed_new_test' | 'unfinished_attempt' | 'exam_date_changed', Record<Lang, (v: Vars) => PushCopy>> = {
  result_ready: {
    en: (v) => ({ title: 'Your result is ready', body: `${v.test}: see your score, rank and solutions.` }),
    hi: (v) => ({ title: 'आपका परिणाम तैयार है', body: `${v.test}: अपना स्कोर, रैंक और हल देखें।` }),
  },
  followed_new_test: {
    en: (v) => ({ title: `New test from ${v.examiner}`, body: v.test ?? '' }),
    hi: (v) => ({ title: `${v.examiner} का नया टेस्ट`, body: v.test ?? '' }),
  },
  unfinished_attempt: {
    en: (v) => ({ title: 'Your test is still running', body: `${v.test}: about 10 minutes left. Your answers are saved.` }),
    hi: (v) => ({ title: 'आपका टेस्ट अभी चल रहा है', body: `${v.test}: लगभग 10 मिनट बाकी हैं। आपके उत्तर सहेजे गए हैं।` }),
  },
  exam_date_changed: {
    en: (v) => ({ title: `${v.exam}: dates updated`, body: 'The official exam dates have changed. Tap to see them.' }),
    hi: (v) => ({ title: `${v.exam}: तिथियाँ बदलीं`, body: 'परीक्षा की आधिकारिक तिथियाँ बदल गई हैं। देखने के लिए टैप करें।' }),
  },
};

export function pushCopy(kind: keyof typeof push, lang: Lang, vars: Vars): PushCopy {
  return (push[kind][lang] ?? push[kind].en)(vars);
}

export interface EmailCopy {
  subject: string;
  /** Short paragraphs; the first is the greeting. */
  lines: string[];
  action: { label: string; url: string };
}

const email: Record<'qc_verdict' | 'student_report' | 'payout_paid' | 'receipt_ready', (v: Vars) => EmailCopy> = {
  qc_verdict: (v) =>
    v.verdict === 'approved'
      ? {
          subject: `Approved: ${v.test}`,
          lines: [`Hello ${v.name},`, `Your test "${v.test}" passed quality review. You can publish it from your dashboard.`],
          action: { label: 'Open the test', url: v.url! },
        }
      : {
          subject: `Changes requested: ${v.test}`,
          lines: [`Hello ${v.name},`, `The reviewer asked for changes to "${v.test}". The comments are on each flagged question.`],
          action: { label: 'See the comments', url: v.url! },
        },
  student_report: (v) => ({
    subject: `A student reported a question in ${v.test}`,
    lines: [
      `Hello ${v.name},`,
      `A student reported a question (${v.reason}) in "${v.test}". Please respond within 72 hours; if the answer key was wrong, the correction rescored everyone.`,
    ],
    action: { label: 'Open reports', url: v.url! },
  }),
  payout_paid: (v) => ({
    subject: `Payout sent for ${v.month}`,
    lines: [`Hello ${v.name},`, `We have paid ${v.amount} for ${v.month}${v.ref ? ` (bank reference ${v.ref})` : ''}. Your statement is in Earnings.`],
    action: { label: 'Open earnings', url: v.url! },
  }),
  receipt_ready: (v) => ({
    subject: `Your receipt for ${v.item}`,
    lines: [`Hello ${v.name},`, `Thank you for your purchase. ${v.item} is unlocked. Amount paid: ${v.amount} (GST included). Your invoice is in your account.`],
    action: { label: 'Open my account', url: v.url! },
  }),
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function emailCopy(kind: keyof typeof email, vars: Vars, brand: string): { subject: string; text: string; html: string } {
  const c = email[kind](vars);
  const text = [...c.lines, '', `${c.action.label}: ${c.action.url}`, '', `${brand}`].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
${c.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('\n')}
<p><a href="${escapeHtml(c.action.url)}" style="display:inline-block;background:#0a4174;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(c.action.label)}</a></p>
<p style="color:#64748b;font-size:12px">${escapeHtml(brand)}</p></body></html>`;
  return { subject: c.subject, text, html };
}

export const PUSH_KINDS = new Set<NotificationKind>(['result_ready', 'followed_new_test', 'unfinished_attempt', 'exam_date_changed']);

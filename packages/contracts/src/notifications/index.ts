import { z } from 'zod';

// Notifications (docs/NOTIFICATIONS.md) and product analytics events ---------------------------

/**
 * Optional engagement notices a student may switch off. Results, receipts and account notices
 * are transactional and always sent.
 */
export const NotificationPrefs = z.object({
  newTestsFromFollowed: z.boolean(),
  unfinishedAttempt: z.boolean(),
  examDateChanges: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { newTestsFromFollowed: true, unfinishedAttempt: true, examDateChanges: true };

/** PUT /v1/me/notification-preferences: any subset. */
export const UpdateNotificationPrefs = NotificationPrefs.partial().refine((v) => Object.keys(v).length > 0, 'At least one field is required');
export type UpdateNotificationPrefs = z.infer<typeof UpdateNotificationPrefs>;

/** PUT /v1/me/devices/:id/push-token. Expo push tokens only; null forgets the token. */
export const PushTokenRequest = z.strictObject({
  token: z
    .string()
    .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/)
    .nullable(),
});
export type PushTokenRequest = z.infer<typeof PushTokenRequest>;

/** Every notification the platform sends (MVP triggers). */
export const NotificationKind = z.enum([
  'result_ready',
  'followed_new_test',
  'unfinished_attempt',
  'exam_date_changed',
  'qc_verdict',
  'student_report',
  'payout_paid',
  'receipt_ready',
]);
export type NotificationKind = z.infer<typeof NotificationKind>;

/** PostHog product events (docs/NOTIFICATIONS.md); no stems, answers or credentials. */
export const AnalyticsEvent = z.enum([
  'onboarding_completed',
  'catalogue_viewed',
  'free_attempt_started',
  'attempt_submitted',
  'purchase_confirmed',
  'review_opened',
]);
export type AnalyticsEvent = z.infer<typeof AnalyticsEvent>;

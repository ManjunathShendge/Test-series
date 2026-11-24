# Notifications and product telemetry

Domain outbox -> template resolver -> unique event/user/channel delivery -> provider adapter -> delivery receipt/retry. Push is Expo; email SES or compatible provider. No launch SMS with OTP disabled; WhatsApp and abandoned-checkout campaigns deferred. Provider failure never rolls back attempt submission or purchase.

| Trigger | Recipient/channel | Phase / suppression |
|---|---|---|
| Result/rank ready; corrected score | Student push | MVP; emit after committed result snapshot |
| New test by followed examiner | Student push | MVP; only live publication, dedupe version/event |
| Unfinished attempt | Student push | MVP; only while resumable, never after deadline |
| Official exam date changed | Target-exam students push | MVP; admin-approved date/source |
| QC verdict/changes requested | Examiner email | MVP; submission-specific deep link |
| New student report | Examiner email | MVP; group duplicate alerts, 72h response target |
| Payout processed | Examiner email | MVP; verified paid status only |
| Receipt/invoice ready | Buyer email/profile | MVP; private authenticated link |
| Pass expires in 3 days/expired | Student push + email | Phase 2 |
| Live starts in 1 day/15min | Registered student push | Phase 2; cancel/reschedule old jobs |

Templates versioned and localized with English fallback. Authenticated deep links recheck entitlement/role. Quiet preferences apply to optional engagement; classify transactional notices explicitly. Expired push tokens removed. Inspect provider receipts; cap retry and surface failed jobs to ops. No keys/content/KYC in push payloads or emails beyond necessary receipt data.

PostHog events: onboarding_completed, catalogue_viewed, free_attempt_started, attempt_submitted, purchase_confirmed, review_opened. Use pseudonymous IDs, server-confirmed purchase amount and consent policy; never attach stems/answers or raw credentials. Sentry redacts network bodies and protected screens. KPI definitions: conversion = paying active students / active students in same period; QC turnaround submission-to-verdict; wrong-key reports track confirmed distinct reports per 1,000 attempts. Owner finalizes precise cohorts before reporting targets.

## Implementation (C3, 24 November 2026)

- Outbox: migration 022 triggers enqueue jobs in the same transaction as the change: attempt closed (result ready), attempt started (reminder 10 minutes before the deadline when the attempt is long enough), test goes live (followers), test approved or changes requested (QC verdict), exam `important_dates` changed, question report filed (grouped per question per day, sent after 5 minutes), payout marked paid, purchase captured (receipt and the server-side `purchase_confirmed` event; admin grants excluded). The corrected-score notice arrives with key-correction rescoring.
- Worker (`apps/api/src/worker.ts`, role `exam_worker`): `JobRunner` claims due jobs with `FOR UPDATE SKIP LOCKED` under a 120 s lease, retries with backoff (1 min, 4 min, 16 min, 1 h, 4 h; six attempts) and leaves failed jobs in `jobs` for ops. Recipients are resolved when the job runs, so a finished attempt gets no reminder and an unpublished test notifies nobody. `notification_deliveries` holds one row per recipient, channel and job; a retried job sends only what has not gone out.
- Preferences: `profiles.notification_prefs` (GET/PUT /me/notification-preferences) covers followed-examiner tests, unfinished-attempt reminders and exam dates; results, receipts, QC, reports and payouts are transactional.
- Providers, all optional: Expo push (no credentials needed; `EXPO_ACCESS_TOKEN` when enhanced push security is on; FCM/APNs credentials live in the Expo project). Push tokens: PUT /me/devices/:id/push-token, from the device itself; tokens Expo reports as `DeviceNotRegistered` are removed. Email over SMTP (`EMAIL_SMTP_URL`, `EMAIL_FROM`; Amazon SES SMTP works). PostHog server capture (`POSTHOG_API_KEY`, `POSTHOG_HOST`) with a hashed profile id. Anything not configured is recorded as `skipped`.
- Templates: `apps/api/src/jobs/templates.ts`, push in English and Hindi by the student's language, examiner and receipt emails in English; HTML escapes every value. Push carries a title, one line and an in-app path only.
- Invoices: GET /me/purchases/:id/invoice renders a PDF from the amounts stored at capture. It is a "Tax invoice" only when `SELLER_GSTIN` (with `SELLER_LEGAL_NAME`, `SELLER_ADDRESS`) is set; otherwise a "Receipt". SAC 999293 and IGST wording await CA confirmation.
- Account deletion: the worker queues `account.finalize_deletions` hourly; each finalized account queues `account.delete_identity`, which deletes the Firebase user when `FIREBASE_SERVICE_ACCOUNT_JSON` is set and otherwise fails visibly for manual removal.


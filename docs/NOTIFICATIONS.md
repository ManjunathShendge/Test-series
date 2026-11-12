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

# Implementation roadmap

The development foundation and a mobile demo exist; domain implementation milestones remain pending. Read [DECISIONS](DECISIONS.md) and [PROJECT_STATUS](PROJECT_STATUS.md). Estimates in PRD (Phase 0 ~2 weeks, MVP 10-12 weeks, expansion 6-8 weeks; requirement draft adds mobile billing effort) are planning inputs, not delivery commitments.

## Phase 0 and independent bootstrap

M0 can proceed with synthetic fixtures while owners resolve O01-O12. Before dependent production work: confirm exams/templates/PYQ/Hindi/content rights/revenue split, staffing/catalogue target, brand and legal/tax policy. Start organization/store account, D-U-N-S, agreement/bank/tax enrollment prerequisites early. Sign-in and billing channels are already decided; do not ask them again.

Spikes S1 trigram EN/HI, S2 rendering/device budget, S3 hosting/residency/connections, S4 store products and recovery. See [spikes](spikes/README.md). No production thresholds or SKU type without evidence.

| Milestone | Read first | Deliverable and acceptance |
|---|---|---|
| M0 Bootstrap | ARCHITECTURE, SETUP | Three apps/three packages, Compose/emulators, scripts/CI/env validation/health. Clean-clone commands actually work; versions pinned |
| M1 Identity | DATA_MODEL, SECURITY, API_CONTRACTS | Roles/devices/consent/auth/linking/audit/outbox. Concurrent third device rejected; ownership tests; Apple relay/linking safe |
| M2 Catalogue | DATA_MODEL, WEB | Categories/exams/stages/syllabus/template versions/tiers. Admin creates complete synthetic template; published template frozen |
| M3 Authoring | CONTENT_AUTHORING, QC_PIPELINE | Applications/10 samples/KYC/agreement, editor/import/own-bank. Valid 100-question import and precise invalid-row errors |
| M4 Rule QC | QC_PIPELINE, S1 findings | Checks 1-5/8, PYQ corpus/thresholds/precheck. Duplicate/PYQ/variant fixtures and policy boundaries pass |
| M5 Review/publish | QC_PIPELINE, ARCHITECTURE | Assignment/SLA/verdicts/revision lock/second review/artifact. All-question approval gate and no-key payload verified |
| M6 Student shell | MOBILE, WEB, design master | Auth/onboarding/free discovery/search/follow/config. Android/iOS/web reach free test; provider linking tested |
| M7 Attempt engine | TEST_ENGINE, API_CONTRACTS | Durable web/native answers, sessions/sections/time/submit. Crash, outage, replay, gap, takeover and finalizer races pass |
| M8 Results | RESULTS, QC_PIPELINE | Results/benchmarks/progress/bookmarks/reports/quarantine/correction. Rescore idempotent, immutable history, rank rebuild verified |
| M9a Web commerce | PAYMENTS, DATA_MODEL | Orders/coupons/Razorpay/entitlements/invoices/refunds/ledger. Duplicate verify/webhook race creates one economic effect |
| M9b Store billing | PAYMENTS, MOBILE, S4 | Validated products, verification/notifications/refunds/restore/ack. Kill-before-verify, duplicate-token and consumed-purchase recovery pass on both stores |
| M10 Notifications | NOTIFICATIONS | Launch trigger matrix, delivery retry/logging. Every enabled trigger tested, disabled Phase 2 triggers silent |
| M11 Admin operations | OPERATIONS, SECURITY, PAYMENTS | KYC/tier/suspend/grants/reports/banners/payouts/TDS upload. Hand-calculated payout fixture includes holds/minimum/refund/concurrent runs |
| M12 Optional AI | QC_PIPELINE | Blind solve, notes, secure cache/spend control. Off means no calls; bad output never changes verdict/content |
| M13 Hardening | TESTING, INFRA, LAUNCH_CHECKLIST | Native/store tests, security, restore, performance, deletion and policies; 500-student 2-week beta and documented launch approval |

Each milestone: contracts/schema if needed -> smallest complete service flow -> client -> meaningful tests -> documentation/status evidence. No automatic public release after coding. M9b depends on S4; M7 depends on timing policy; M13 requires business/legal/store gates. Record blocked subtask and continue independent authorized work.

## Phase 2

Pass plans/sales/pool/reminders together; live registration/windows/encrypted predownload (keys withheld until start), server deadlines, integrity review and delayed ranking/solutions; ratings; examiner question stats; AI tag/solution/Hindi suggestion buttons; wrong-key SQL rule and Pass fraud controls. Quote and accept separately.

## Later

WhatsApp, Autopay, RazorpayX, referrals, full offline mode, institute sub-users, multi-correct/numeric questions, regional languages, doubt solver, adaptive practice, calculator when an exam requires it, option shuffling, streaks/weekly goals, written reviews, rank-card images/daily quiz. Do not sneak them into MVP.

# Verification strategy

The domain suites below remain planned. M0 checks now exist: API environment unit tests, mobile unit tests, SQLite storage integration tests, HTTP readiness failure tests and API/worker/web smoke checks. See SETUP and PROJECT_STATUS for commands and observed results. Use real SQLite files (not mocks or `:memory:`) for transactional behavior; provider fakes for deterministic integration, real sandboxes for billing certification. Test invariants rather than mock method call counts.

| Layer | Required evidence |
|---|---|
| Unit | Engine transitions/marking/sections, normalization golden fixtures EN/HI/math, exact paise rounding, eligibility |
| Contract | Zod input/output, OpenAPI agreement, error envelope, serializer key/solution leakage including nested assets |
| Integration | Ownership/roles/device races, immutable versions, outbox rollback/replay, submit/finalizer races, coupon caps, entitlement overlap |
| Commerce | Duplicate/out-of-order notifications, verify-webhook race, payment reuse, pending state, wrong environment/product/account, refund-before-grant, payout double run |
| Web E2E | Examiner sample/import -> QC -> publish -> free/paid attempt -> results/report; finance permission separation |
| Native | Real-device capture behavior, Google/email/Apple linking, process kill/offline resume, SQLite failure, store recovery/refund/restore |
| Accessibility | Keyboard-only, TalkBack/VoiceOver, zoom/font scaling, contrast, touch targets and palette states |
| Operational | Migration forward compatibility, backup restore, key rotation exercise, failed jobs replay, notification invalid token |

## Critical fixtures

English-only/bilingual/grouped papers, wrong/missing key, duplicate across owners, own free/paid reuse, untagged PYQ, cap boundary, changed passage/options order, malformed ZIP, script in rich text, AI malformed/injection text, all-skipped/negative/tied score, no peers, expired series, multiple entitlement sources, refund after paid payout. Synthetic data only.

M3 imports 100 valid questions with math/Hindi/images without hand edits. QC catches seeded exact duplicates and preserves warning-only pattern checks. Frozen version mutation fails under actual application DB role. AI disabled makes zero network calls and enabled wrong-answer response only flags, never decides.

## Performance acceptance

PRD budgets: test-ready <2 seconds on mid-range Android/4G, answer save <300ms, Android app <30MB, 99.9% live-window uptime. Define test-ready including required paper render/assets; measure cold/warm separately. Durable local save p95 <300ms; separately report network ack p95/p99 and unsynced backlog. Record actual device/OS, network shaping, build mode and sample size.

Load test 2,000-5,000 only after founder fixes target; no target means no certification. Include up to N/5 dirty batches/sec, event payload sizes, start/submit spikes, reconnect storms and background QC/payment jobs. Assert zero lost acknowledged writes, bounded queue recovery and score determinism; acknowledge late-unsynced-answer policy limits. Live feature cannot ship on desktop-only timings.

## Merge and release gates

M0 establishes `pnpm typecheck`, `lint`, `test`, `test:int`, `test:e2e`, `build`. Changes run relevant checks; risky cross-module changes run integration suite. Missing tooling is reported, never interpreted as success. Release adds native sandbox evidence, security/restore/load results and legal/store gates in LAUNCH_CHECKLIST. Record artifacts and failures in PROJECT_STATUS.

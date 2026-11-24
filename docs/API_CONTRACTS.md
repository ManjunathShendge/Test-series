# API contract specification

REST `/v1`; Zod schemas in packages/contracts precede implementation. Generate OpenAPI in M0/M1, do not maintain divergent DTOs. JSON uses camelCase; DB uses snake_case. IDs opaque strings, timestamps ISO UTC, INR values integer paise, explicit enum/error codes. Cursor lists return `{items,nextCursor}`; default 20/max 100 (proposed).

Authenticated requests carry Firebase bearer token, registered device/session proof and request ID. A device ID is an identifier, not authentication. Web may use a secure same-origin BFF/session cookie with CSRF protection; that route still enforces API authorization. Never trust UI role gating.

## Surface and permissions

| Method/path | Access | Behavior |
|---|---|---|
| GET /config | Public | Safe versioned flags, minimum app version, allowed auth/billing modes; no secrets |
| POST /identity/session | Verified identity | Register/login device, bootstrap profile; two-device limit serialized |
| GET/PATCH /me | Self | Preferences, profile, onboarding; role fields excluded. `ageConfirmed: true` records the one-time 18+ confirmation (cannot be withdrawn); setting `preparationStage` before it is confirmed is 400 `AGE_CONFIRMATION_REQUIRED`. `onboarded` = stage set and 18+ confirmed |
| GET/DELETE /me/devices/:id | Self | Inspect/revoke device session |
| POST /me/deletion | Reauthenticated self | Idempotent deletion request/status workflow |
| GET /exams, /exams/:id, /tests, /series/:id, /examiners/:id | Public | Published metadata only, filters, cursor |
| GET/POST/PATCH/DELETE /admin/catalogue/categories[/:id] | Admin, ops or super | Categories; delete only without exams |
| GET/POST/PATCH /admin/catalogue/exams[/:id], GET .../exams/:id/history | Admin, ops or super | Exam details (`expectedUpdatedAt`, 409 `STALE_EDIT`); new exams hidden; shown only with a published template; slug locked while shown with live tests; history from the audit log |
| POST /admin/catalogue/exams/:id/stages, PUT/DELETE /stages/:id; POST .../subjects, PUT/DELETE /subjects/:id; POST /subjects/:id/topics, PUT/DELETE /topics/:id | Admin, ops or super | Stages and syllabus tree; responses return the whole exam; delete refused (409 `IN_USE`) when templates, tests, questions or topic targets use it; topics added in bulk, duplicates skipped case-insensitively |
| POST /admin/catalogue/exams/:id/templates, GET/PUT/DELETE /templates/:id, POST /templates/:id/{publish,new-version,retire,reinstate} | Admin, ops or super | Draft saves allowed while inconsistent (`issues` lists why); publish 422 `TEMPLATE_NOT_PUBLISHABLE`; published templates 409 `TEMPLATE_LOCKED`; new version copies into a draft (repeat returns it) and publishing it retires the previous one |
| PUT/DELETE /examiners/:id/follow | Student | Idempotent follow state |
| POST /examiner/applications | Examiner applicant | Profile/agreement and ten-question sample submission |
| POST /assets/upload-intents | Authorized owner/staff | Restricted upload URL, MIME/size limits and object scope |
| POST /assets/:id/complete | Owner | Validate hash/type, quarantine until checks finish |
| POST/PATCH /examiner/tests | Examiner owner | Draft only, optimistic revision check |
| GET /examiner/application | Signed-in account | `{ application: ExaminerApplication \| null }` (never a bare null) |
| GET /examiner/imports/template?examId&stageId&templateId | Approved examiner | XLSX: Questions/Groups headers plus Sections, Codes (own subjects/topics) and Instructions reference sheets; `no-store` |
| POST /examiner/imports, /:id/commit | Owner | Validate file/zip, row errors, atomic accepted import |
| POST /examiner/tests/:id/precheck | Owner | Immediate bounded checks or 202 job ID |
| POST /examiner/tests/:id/submit | Owner | Freeze manifest and enqueue QC |
| GET /qc/reviews, /qc/reviews/:id | Assigned reviewer/ops | Queue and exact submitted content |
| POST /qc/reviews/:id/verdicts | Assigned reviewer | Expected version, action/reason, audit |
| POST /qc/reviews/:id/complete | Assigned reviewer | All questions approved or change request |
| POST /tests/:id/publish | Authorized publication service/staff | Approval and artifact gate |
| POST /attempts | Student | testId, instructionsAccepted; entitlement checked; returns state + session token, or {attemptId, resume} when one is running (409 ATTEMPT_IN_PROGRESS for another test, 403 NOT_ENTITLED) |
| GET /me/attempts | Student | Own attempts, newest first |
| GET /attempts/:id | Owner + x-attempt-session while running | Canonical state: server time, deadline, section windows, answers, cursor, epoch, ack; 409 SESSION_REPLACED without the current token |
| POST /attempts/:id/takeover | Owner | New token, epoch + 1, ack reset; the old session gets SESSION_REPLACED |
| GET /attempts/:id/paper, /images/:assetId | Owner | Questions without keys or solutions; images by short-lived signed link |
| POST /attempts/:id/sync | Owner + session | {epoch, lastAckSeq, events ≤200}; contiguous seq, replay no-op, SYNC_GAP / SYNC_CONFLICT; late events acknowledged as rejected with a reason |
| POST /attempts/:id/submit | Owner + session | Final batch and close in one transaction; idempotent, returns the summary |
| GET /attempts/:id/summary | Owner | Server score, rank (first attempts), percentile, sections, late events |
| GET /attempts/:id/review | Owner, closed attempt | Summary, cohort comparison (first attempts), every question with answer, key in force, solution, time and percent correct |
| GET /me/progress, /me/practice/:kind | Student | Topic accuracy, weakest topic, trend, recommended tests; mistakes or bookmarks lists |
| PUT /me/saved-questions/:questionId | Student who met the question in a closed attempt | {bookmarked?, inNotebook?} |
| POST /questions/:id/reports | Student, own closed attempt | {attemptId, reason, comment?}; one report per student per question |
| POST /orders | Student | One item per mobile order; server price and provider selection |
| POST /orders/:id/verify | Owner | Razorpay callback evidence; verify capture before fulfilment |
| POST /orders/:id/verify-store | Owner | Provider proof/token, bind to exact purchase intent |
| GET /orders/:id, /me/entitlements, /me/invoices | Owner | Confirmation/recovery and purchase history |
| POST /webhooks/razorpay, /apple, /google | Verified provider | Durable authenticated inbox, async processing |
| POST /admin/refunds, /admin/access-grants | Permissioned staff | Reason, verified state, audit |
| POST /admin/payouts/calculate, /:id/approve, /:id/mark-paid | Finance | Preview, allocation, reference and idempotency |
| Admin CRUD /exams,/templates,/reviewers,/examiners,/banners,/settings | Explicit permission | Version check, ownership/capability and audit |

Implemented 22 November 2026 (`packages/contracts/src/catalogue`): `GET /v1/exams`, `/v1/exams/:id`, `/v1/tests` (query `exam`, `examiner`, `type`, `access`, `featured`, `q`, `cursor`, `limit` 1-50, default 20; unknown fields rejected), `/v1/tests/:id`, `/v1/series/:id`, `/v1/examiners/:id`. Exam, test and series ids accept the UUID or the slug; examiner ids are UUIDs. Live tests of active exams by approved examiners only; no questions, keys or solutions; `Cache-Control: public, max-age=60, stale-while-revalidate=300`. Per-student fields (owned, attempted, followed) arrive with authenticated variants in later milestones.

Implemented 24 November 2026 (`packages/contracts/src/qc`, `authoring/examiner-tests.ts`):
- Examiner: `POST /v1/examiner/tests/:id/precheck` now returns policy `issues` (block or warn, PRD 5.1) and `patternFit`; `submit` runs Stage 1 and routes to a reviewer; `POST /tests/:id/use-latest-versions`; access `free | paid | pass_included | series_only` with `includedInPass`, paid prices inside the exam band for the examiner's tier; `GET /examiner/quality`, `GET /examiner/reports`, `POST /examiner/reports/:id/response`.
- Reviewer (`qc_reviewer` or ops admin; assignment checked): `GET /v1/qc/queue`, `GET /qc/reviews/:id`, `PUT /qc/reviews/:id/items/:itemId` (approve needs the five-item checklist; change/reject need reason and comment), `POST /qc/reviews/:id/finish`, `POST /qc/reviews/:id/spot-check`, `GET /qc/reviews/:id/images/:assetId`, `GET /qc/reports`, `POST /qc/reports/:id/resolve`.
- Admin (ops): `GET /v1/admin/qc`, `POST /admin/qc/reviewers`, `DELETE /admin/qc/reviewers/:id`, `POST /admin/qc/reviewers/:id/exams`, `DELETE /admin/qc/mappings/:id`, `PATCH /admin/qc/reviews/:id/assign`, `POST /admin/qc/spot-checks`, `PUT /admin/qc/settings/:examId` (version-checked), `GET /admin/examiners`, `PATCH /admin/examiners/:id` (tier, status, KYC verified; reason audited).

Implemented 24 November 2026 (`packages/contracts/src/commerce`, `qc`):
- Student: `GET /v1/me/ownership?itemType&itemId`, `GET /me/purchases`, `POST /orders/quote` (price with coupon, nothing stored), `POST /orders` (Razorpay order; public key id only), `POST /orders/:id/verify` (signature, then the payment is fetched and must be captured for the exact amount). `POST /webhooks/razorpay` verifies `x-razorpay-signature` over the raw body. Without keys: 503 `PAYMENTS_NOT_CONFIGURED`. Errors: `ALREADY_OWNED`, `COUPON_INVALID`, `PAYMENT_NOT_VERIFIED`, `PAYMENT_REJECTED`, `PAYMENT_PROVIDER_UNAVAILABLE`.
- Examiner: `GET /v1/examiner/sales?days=7-365`, `GET /examiner/earnings`, `GET /examiner/earnings/:id/statement` (CSV), `GET /examiner/earnings/:id/tds-certificate`, `GET /examiner/coupons`. `PATCH /examiner/tests/:id` accepts `scheduledPublishAt`.
- Examiner series: `POST /v1/examiner/series/:id/publish`, `POST /examiner/series/:id/unpublish` (body `expectedUpdatedAt`); publish needs one live test; `ExaminerSeries.liveTestCount`.
- Reviewer: `PUT /v1/qc/reviews/:id/items/:itemId/edit` (minor edit), `POST /qc/reports/:id/correct-key`.
- Admin (ops): `GET /v1/admin/pricing`, `POST /admin/coupons`, `PATCH /admin/coupons/:id`, `PUT /admin/price-bands/:examId` (version-checked), `GET /admin/students?q`, `GET /admin/students/:id`, `PATCH /admin/students/:id` (block, reason audited), `POST /admin/students/:id/grants`, `POST /admin/purchases/:id/refund` (`REFUND_NOT_ALLOWED` outside policy). Admin (finance): `GET /admin/payouts?month`, `GET /admin/payouts/export?month`, `POST /admin/payouts/calculate`, `POST /admin/payouts/:id` (`approve`, `hold`, `release`, `mark_paid`, `attach_tds`; version-checked).

Paths above describe resource families; define exact single-resource PATCH routes in contracts during their milestone. No implicit catch-all admin mutation endpoint.

## Error and replay semantics

```json
{"error":{"code":"ATTEMPT_CLOSED","message":"This attempt has ended.","requestId":"opaque-id","details":{"status":"auto_submitted"}}}
```

Role-protected routes use `FirebaseAuthGuard` then `RolesGuard` (`@Roles(...)`, `@RequireAdminPermission('ops'|'finance'|'super')`, implemented 23 November 2026): verified email, unblocked account, active registered device (`x-device-id`), and a role read from the database on every request; a missing role or admin flag answers 403 `FORBIDDEN`. Services still check ownership and RLS remains the last barrier.

400 invalid input; 401 unauthenticated; 403 permission/device failure; 404 inaccessible resource; 409 revision/idempotency/session conflict; 422 business validation; 429 limit with Retry-After; 503 retriable dependency. Stable codes include ENTITLEMENT_REQUIRED, DEVICE_LIMIT, SESSION_REPLACED, SEQUENCE_GAP, PRICE_CHANGED, PURCHASE_PENDING, PAYMENT_REUSED, QC_BLOCKED. Avoid sensitive details.

Idempotency-Key required on order/start/submit/refund/payout mutations. Scope by actor+route+key, bind request digest; same key/different request ->409. Persistent record returns original result after timeout. Financial identity uniqueness remains after generic key expiry. Concurrent requests serialize; do not return uncommitted responses.

Mutating drafts include expectedRevision; 409 returns latest revision and merge guidance. Response serializers are positive allowlists, including nested assets. Webhooks use raw-body signature/JWS/OIDC verification as provider requires, reject wrong environment/audience/application and persist only necessary encrypted/redacted data.

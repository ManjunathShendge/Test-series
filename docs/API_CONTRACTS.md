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
| POST /attempts | Student | testId, mode, instructionsAccepted; idempotent start |
| GET /attempts/:id | Owner | Canonical state, clock, cursor, paper URL refresh |
| POST /attempts/:id/takeover | Owner + current device | New session epoch, prior lease invalidation |
| PUT /attempts/:id/answers | Attempt owner/session | Contiguous batch; see TEST_ENGINE |
| POST /attempts/:id/submit | Attempt owner/session | Final batch + closure in transaction |
| GET /attempts/:id/results, /review | Owner | Terminal/result-release gate, solutions only in review |
| GET /me/progress, /me/mistakes, /me/bookmarks | Student | Authorized own history and aggregates |
| PUT/DELETE /me/bookmarks/:questionId | Student | Must have review access |
| POST /questions/:id/reports | Authorized student | Type/evidence; dedup distinct reporters |
| POST /orders | Student | One item per mobile order; server price and provider selection |
| POST /orders/:id/verify | Owner | Razorpay callback evidence; verify capture before fulfilment |
| POST /orders/:id/verify-store | Owner | Provider proof/token, bind to exact purchase intent |
| GET /orders/:id, /me/entitlements, /me/invoices | Owner | Confirmation/recovery and purchase history |
| POST /webhooks/razorpay, /apple, /google | Verified provider | Durable authenticated inbox, async processing |
| POST /admin/refunds, /admin/access-grants | Permissioned staff | Reason, verified state, audit |
| POST /admin/payouts/calculate, /:id/approve, /:id/mark-paid | Finance | Preview, allocation, reference and idempotency |
| Admin CRUD /exams,/templates,/reviewers,/examiners,/banners,/settings | Explicit permission | Version check, ownership/capability and audit |

Implemented 22 November 2026 (`packages/contracts/src/catalogue`): `GET /v1/exams`, `/v1/exams/:id`, `/v1/tests` (query `exam`, `examiner`, `type`, `access`, `featured`, `q`, `cursor`, `limit` 1-50, default 20; unknown fields rejected), `/v1/tests/:id`, `/v1/series/:id`, `/v1/examiners/:id`. Exam, test and series ids accept the UUID or the slug; examiner ids are UUIDs. Live tests of active exams by approved examiners only; no questions, keys or solutions; `Cache-Control: public, max-age=60, stale-while-revalidate=300`. Per-student fields (owned, attempted, followed) arrive with authenticated variants in later milestones.

Paths above describe resource families; define exact single-resource PATCH routes in contracts during their milestone. No implicit catch-all admin mutation endpoint.

## Error and replay semantics

```json
{"error":{"code":"ATTEMPT_CLOSED","message":"This attempt has ended.","requestId":"opaque-id","details":{"status":"auto_submitted"}}}
```

Role-protected routes use `FirebaseAuthGuard` then `RolesGuard` (`@Roles(...)`, `@RequireAdminPermission('ops'|'finance'|'super')`, implemented 23 November 2026): verified email, unblocked account, active registered device (`x-device-id`), and a role read from the database on every request; a missing role or admin flag answers 403 `FORBIDDEN`. Services still check ownership and RLS remains the last barrier.

400 invalid input; 401 unauthenticated; 403 permission/device failure; 404 inaccessible resource; 409 revision/idempotency/session conflict; 422 business validation; 429 limit with Retry-After; 503 retriable dependency. Stable codes include ENTITLEMENT_REQUIRED, DEVICE_LIMIT, SESSION_REPLACED, SEQUENCE_GAP, PRICE_CHANGED, PURCHASE_PENDING, PAYMENT_REUSED, QC_BLOCKED. Avoid sensitive details.

Idempotency-Key required on order/start/submit/refund/payout mutations. Scope by actor+route+key, bind request digest; same key/different request ->409. Persistent record returns original result after timeout. Financial identity uniqueness remains after generic key expiry. Concurrent requests serialize; do not return uncommitted responses.

Mutating drafts include expectedRevision; 409 returns latest revision and merge guidance. Response serializers are positive allowlists, including nested assets. Webhooks use raw-body signature/JWS/OIDC verification as provider requires, reject wrong environment/audience/application and persist only necessary encrypted/redacted data.

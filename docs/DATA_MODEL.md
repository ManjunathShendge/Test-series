# Relational data model

This is the schema specification; SQL migrations in `packages/db/migrations/sqlite` and this document evolve together. Storage is SQLite per the 16 November 2026 decision; Postgres-specific types below map to SQLite STRICT tables (TEXT UUIDs, INTEGER epoch-millisecond UTC timestamps, JSON validated with `json_valid`). UUID identifiers; UTC timestamps; integer paise for INR; rational/integer-scaled scoring; explicit foreign keys, created_at and updated_at on mutable records. No soft-delete cascade may erase financial/audit history.

## Identity and catalogue

| Tables | Required fields / relationships |
|---|---|
| users | unique firebase_uid, email, optional unverified phone, name, locale, age_confirmed_at, status, deleted_at |
| user_roles, devices | unique user/role, admin permission flags; user/device, hashed session secret, push token, last_seen_at, revoked_at |
| consents, deletion_requests | user, purpose/notice version, accepted_at; deletion workflow state and retention exceptions |
| examiner_profiles, examiner_kyc | user unique, individual/institute, subjects, tier, approval state, agreement version/time; encrypted PAN/bank/UPI, GSTIN, private asset references, verifier |
| examiner_applications, sample_submissions | examiner, exam, 10 pinned sample versions, review and rejection reason |
| reviewer_assignments | reviewer, exam, subject, active |
| exam_categories, exams, stages | hierarchy; exam editorial syllabus, official date/source and cutoff history |
| syllabus_nodes | exam, parent, subject/topic kind, localized label |
| exam_templates, template_versions | stage; immutable sections, count, marking, duration, lock rules and topic targets |
| test_series, series_memberships | owner, stage, validity_days, price_tier_id; test, ordering and availability schedule |
| tests | examiner, stage/template, kind mock/PYQ, languages, paid/free access, in_pass, tier, current_version, status |
| follows, banners | unique student/examiner; image/link/order/active interval |

Pass inclusion is independent from free/paid access and series membership, not a mutually exclusive purchase type.

## Content and QC

| Tables | Required fields / relationships |
|---|---|
| questions, question_versions | owner/exam/source/year; version number, exam_id, bilingual structured stem/options/solution, stable option IDs, key, subject/topic/difficulty, hashes, normalization_version, approval state |
| question_groups, group_versions | passage/DI content and assets; frozen version references in questions and papers |
| assets | owner, object key, MIME, size, sha256, scan state, classification, access scope |
| draft_test_questions | test, section, position, exact question_version_id; unique section/position |
| test_versions, test_version_questions | immutable version, template snapshot, paper object key/hash, published_at; ordered question/group version IDs and marks |
| import_runs, import_rows | owner, file hash, status, parsed row, errors, commit idempotency key |
| pyq_sources | exam/stage/year/shift, official source/provenance, coverage state |
| qc_settings, qc_runs, qc_flags | exam thresholds/cap; immutable submission manifest/hash, policy version, status; question/match/type/severity/evidence |
| qc_reviews, qc_verdicts | assignee/SLA/second-review flag; exact version, action, reason/comment and actor |
| ai_suggestions, ai_cache, ai_usage | question version, model/prompt/input digest, output JSON, human disposition; unique digest/model/prompt; reserved/actual spend |
| question_reports, quarantines | student/question/type/evidence/status; effective question/version, trigger and resolution |
| corrections, correction_items | approved correction, old/new question version mapping, scoring policy, reviewer, scope |

`ai_suggestion` is a read-model field sourced from ai_suggestions. Never UPDATE frozen question content to append AI output. Draft edits can create successive versions; review binds exact version IDs.

## Attempts and results

| Tables | Required fields / relationships |
|---|---|
| attempts | user, test_version, mode, device/session epoch, started_at, deadline_at, status, current question/section, contiguous ack sequence, submit reason |
| attempt_sessions | attempt, epoch, device, expires_at, revoked_at; one active lease |
| attempt_events | attempt, epoch, seq, event kind, option/mark/navigation data, server_received_at; unique attempt/epoch/seq |
| attempt_answers | PK attempt/question version, selection, mark flag, latest seq, telemetry time; key belongs to pinned paper |
| attempt_section_windows | attempt/section, opened_at, closes_at, closed_at; server enforced |
| result_revisions | attempt, revision, correction_id, score, counts, sections, key mapping, status; unique attempt/correction |
| rank_snapshots | cohort/version/correction epoch, population, computed_at, rank/percentile entries |
| question_stats, topic_stats | derived aggregates, sample count, calculation version/time |
| bookmarks | unique user/question; references authorized review context |

Normal ranking uses first completed normal attempt per user/paper cohort; reattempts excluded. Partial unique active normal attempt user/test_version; user-level active attempt/session enforcement occurs under a user row lock to prevent cross-paper races.

## Commerce and operations

| Tables | Required fields / relationships |
|---|---|
| price_tiers, store_products | INR reference price, active; provider/environment/product ID, tier, verified product type, currency/territory |
| examiner_price_bands | examiner tier -> allowed price tier IDs |
| orders, order_items | user/provider/platform/state/currency/idempotency; item scope, immutable title/version/tier/product/examiner snapshot, gross/discount/tax/provider fee/net/share_bps |
| billing_accounts, purchase_intents | stable opaque user binding; order/item correlation, provider fields, expiry |
| payments, payment_events | order/provider/environment/transaction or token hash, encrypted token, verified state; provider/environment/event ID, payload digest, processing state |
| entitlements | user, scope test/series/pass, scope ID, order_item or grant reference, starts_at/ends_at/revoked_at |
| coupons, coupon_redemptions | code/rules/owner/caps/validity; reservation and redemption by user/order |
| refunds, financial_adjustments | payment/provider refund ID, amount, state, cause; append-only settlement differences |
| invoices, invoice_counters | order, FY/number unique, tax snapshot/PDF status; FY last number row lock |
| ledger_entries | examiner, signed paise, sale/refund/adjustment/tds/payout/pass_pool, source and unique economic-event key |
| payouts, payout_allocations | examiner/period/status/hold/bank ref; unique ledger entry allocation, amount, payout ID |
| tds_certificates | examiner/quarter, private asset, uploaded_by |
| audit_log | actor/action/entity/time/request ID, redacted before/after; append-only |
| outbox_events, consumer_receipts | event ID/type/payload/version/status; unique consumer/event receipt |
| notifications, notification_deliveries | event/user/template/channel key unique; attempt/provider ID/status/receipt/error |
| idempotency_records | actor/route/key unique, request hash, state, response reference, expiry |
| app_config | versioned validated flags, updater, updated_at; secret values never public |

Phase 2 adds pass_plans, pass_pool_runs/allocations, live_windows/registrations and ratings. Do not enable their checkout/UI before associated accounting and integrity work.

## Constraints and indexing

- unique `(question_id, version_no)` and `(test_id, version_no)`; triggers or restricted mutation paths reject frozen version edits.
- `(exam_id,text_hash,normalization_version)` and masked-hash btree indexes; GIN pg_trgm on normalized English stem with exam filtering; benchmark composite btree_gin strategy.
- GIN image hashes; question corpus indexed by exam and approval/source state; exclude same logical question during historical matching.
- Payment uniqueness includes provider + environment + transaction/token identity. Event uniqueness alone is insufficient for economic effects.
- Unique entitlement source per order item; multiple grants may overlap. Refund revokes only that source.
- Ledger source-event uniqueness and immutable grants; allocation table changes do not mutate ledger rows.
- FK/constraint checks on item scope, nonnegative line amounts, valid option membership, section positions and date intervals.
- App role cannot UPDATE/DELETE ledger or audit. Separate migration role; protection tests use actual application privileges.
- Sensitive blobs/tokens encrypted; audit snapshots exclude secrets/content/KYC. Retention and deletion policy finalized before production.

## Implemented M0 baseline (16 November 2026)

Migration `001_storage.sql` (SQLite, STRICT tables) implements storage primitives only, not the domain services:

- `bootstrap_state` with schema version 1, checked by readiness.
- `users`, `roles` (student, examiner, reviewer, ops, finance, super), `user_roles`, `sessions` (hashed token references).
- `billing_orders` (integer paise, INR only, unique idempotency key), `billing_events` (unique per provider event), `ledger_entries` (unique source event; update/delete blocked by triggers).
- `audit_events` (update/delete blocked by triggers).
- `stored_files` (file contents as BLOBs).
- `jobs` (deduplication key, leased claims with recovery of expired leases).

The identity and commerce workflows that must use these tables are M1 and M9 work; the M1 schema will extend or replace these primitives to match the specification above. The idempotent local/test seed inserts a synthetic infrastructure marker, not a user or paper. SQLite has no database roles; authorization is enforced in API services and the file is protected by OS permissions. The earlier PostgreSQL bootstrap migration is preserved in `docs/archive/postgres-bootstrap/`.

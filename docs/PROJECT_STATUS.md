# Project status

Date: 24 November 2026.

## Completed

- Reviewed requirement.text and all 19 extracted PRD pages; visually inspected the payment policy page.
- Preserved source inputs and created reconciled architecture/system/Claude Code documentation.
- Identified latest authentication/billing decisions and technical/business gates.
- Ran SKILL.md searches after supporting files appeared; applied relevant accessibility matches and retained a disclosed manual visual fallback because returned styles did not fit adult timed exams.

## Implementation state

The development foundation runs on PostgreSQL 17 (Docker locally and in CI; Supabase Mumbai for staging, owner decision 18 November 2026). Identity, catalogue, and examiner-authoring API slices now use the database; staging has the baseline schema and restricted roles. Mobile email sign-in/profile/device flows use the API, and the Home, Discover, exam, test, series, and examiner catalogue surfaces now use catalogue API hooks instead of demo catalogue reads. Demo attempt, result, purchase and profile-history data remain for milestones not yet implemented. M3 authoring, malware scanning, and staff KYC downloads are implemented; full browser acceptance, real archive checkout, owner/legal KYC policy and production scanner remain open. Later domain contracts, attempt, results, billing, and launch milestones remain incomplete.

## Log

## 24 November 2026: database integration tests brought up to date
- CI had not passed since M2: 11 of 41 `packages/db` integration tests still described pre-M7 behaviour and were not part of the local checks run for C1-C6. No product code changed; every failure was a stale test:
  - migration count was hard-coded (now read from the folder); devices now have per-row rules (C6);
  - device, audit-log and follower rows are written as the acting user (rules from C2, C4, C6); an audit edit by the API role now matches no rows, and the worker edit still hits the append-only trigger;
  - answer rows are created at attempt start (M7): a test helper creates them as `start_attempt()` does, and students update them;
  - single-test purchases name their test (migration 016);
  - payouts: only finished months, KYC before payout, first-payout hold from payout history, and the current minimum wording (M9). The hand-calculated amounts are unchanged.
- Checks: `pnpm test:int` database 41/41, API 26/26.
- CI web build: a fresh `.env` copied from `.env.example` has an empty `NEXT_PUBLIC_SITE_URL`, which the site config used as the address (Invalid URL at build). Empty values now fall back to the defaults (site address and API address); reproduced locally and fixed.

## 24 November 2026: security and performance checks (owner checklist)
- Added: API rate limits (429 `RATE_LIMITED`, new additive error code) and security headers, website security headers, JSON-LD escaping (an examiner could otherwise inject markup through a test title), patched gRPC through a pnpm override, PostHog keys added to the public-variable allowlist (the CI check had been failing since C3).
- Fixed from Lighthouse: squashed logo on narrow screens; home page hero text started invisible (LCP 4.5 s simulated mobile, now 1.2 s); secondary text on light tiles and the page tint under 4.5:1 contrast (now navy there, per MASTER.md).
- Lighthouse (production build, mobile, Edge): home, exam, test and privacy pages performance 99-100 over repeat runs, accessibility 100, best practices 100. SEO 69 locally only because non-production pages are deliberately `noindex` (`SITE_INDEXABLE`).
- Load (autocannon, 50 connections, 20 s, catalogue reads, one API process on a laptop with Docker Postgres): about 1,260 requests a second, p99 86 ms, no errors; with limits on, about 1,200 served per address per minute and the rest refused cheaply.
- Dependency audit (production): 7 left (1 high), all inside minio, exceljs and Expo build tooling with no fixed parent release; reachable only with server-controlled input or at build time. Outdated: patch and minor releases only, plus deliberately held TypeScript and Node type definitions.
- Gitleaks: 60 commits, 7 findings, all false positives (SECURITY "HTTP protections"), recorded in `.gitleaksignore` with owner approval; a rescan finds no leaks. CI now runs gitleaks over the whole history on every push (pinned release, checksum verified).
- Unused packages (knip): removed `@nestjs/config` and `@exam-prep/engine` from the API and `@exam-prep/contracts` from the engine. Kept `nodemailer` (the worker sends email with it) and ignored `expo-updates` (not referenced): both knip false positives.
- Checks: typecheck, lint, unit tests (API 54, web 18, mobile 38, contracts 14, engine 6), integration 26/26, public-variable check, full build and smoke tests.

## 24 November 2026: C6 hardening, store readiness and handover
- Database (026): per-row rules for `user_devices` and `test_series`; remaining API-only tables listed in DATA_MODEL "Row rules (C6)".
- Reliability: a database connection lost mid-transaction no longer crashes the API or worker (it was an unhandled error event; found as an intermittent integration failure).
- Start-up checks: Anthropic and PostHog key shapes, email URL and sender set together, Firebase service account must parse and belong to the project, Razorpay test keys refused in production, webhook secret required when deployed. Errors name the variable, never the value.
- App store readiness: `preview` and `production` EAS profiles, version 1.0.0, production build refuses the development bundle ID, export-compliance flag, iOS privacy manifest, storage, microphone and overlay permissions removed for store builds. Web `.env.example` now lists the Firebase and site URL variables.
- Docs: STORE_RELEASE (what is ready, billing and Sign in with Apple hand-off, listing answers, release steps), HANDOVER, new runbooks in OPERATIONS (jobs, notifications, deletion, AI, scheduled publishing), launch checklist item for store verification.
- Checks: rolled-back row-rule script (11 passed); earlier milestone scripts re-run after the new rules (C2 23, C3 20, C4 24, series 8, C5 18); integration tests 26/26 three runs in a row; environment tests 19; full build and smoke tests (`pnpm test:e2e`); Expo config resolves for development, preview and production.
- Correction: the C5 entry earlier said 19 checks; the script has 18.

## 24 November 2026: C5 AI assistance for reviewers (M6)
- Database (025): per-exam AI switches off by default (plus a Hindi/English check), append-only `ai_suggestions`, monthly spend ledger, cache readable only by admins, trigger that queues checks when a test enters QC.
- Worker: Anthropic adapter behind `LLM_API_KEY` (model, prices and monthly cap in `.env.example`); per-question jobs with blind answer, ambiguity and language checks; key and solution never sent; output validated and bounded; exact-input cache; atomic cost reservation against the cap; failures recorded as "AI check unavailable". Details in QC_PIPELINE "Implementation (C5)".
- Web: AI switches on the admin exam page; advisory AI panel on each question in the reviewer page (blind pick vs key, notes, or unavailable reason). AI never changes a question or verdict.
- Checks: rolled-back worker script against the real database with a fake model (18 passed: off by default, QC entry queues once, nothing sent with switches off, one call and record per question, no key or solution in any prompt, server key comparison, language check only for bilingual questions, spend settles to actual cost, repeat skipped, cache hit at zero cost, unusable reply, busy provider retried once, budget cap stops calls, reservations released, content and test unchanged, append-only, reviewers read but students cannot read or write); reviewer query returns the latest suggestion; unit tests for prompt input, cache key and reply parsing. Found and fixed: notes for checks not asked for were being stored.
- Needs from the owner: an Anthropic API key with suitable data terms, and switching the checks on per exam.

## 24 November 2026: C4 admin operations (M11)
- Database (024): banner placement, schedule window, https image and safe-link checks, visitor/admin policies; audit log readable by admins only and appendable only in the actor's own name.
- API (`/admin/ops`, ops or super admins): catalogue list with feature/unfeature (free published tests; published series) and unpublish (tests archive for good; series can be republished), reasons kept in the audit log; banner CRUD and public GET /banners for web and app; reports (sales, refunds, channels, students, attempts, QC turnaround, open reports, top tests, daily series) with sales/attempts/daily CSV exports (formula cells neutralised, each download audited); audit log with filters, changed fields and before/after values, keyset paging. New error code INVALID_STATE.
- Web: real Catalogue, CMS, Reports pages and a new Audit log page in the admin console; banner strip on the public home. App: banner rail on Home (in-app screens and https links only). Support (question report queue) and exam date editing already existed; date edits now notify students through the C3 outbox.
- Checks: rolled-back service script against the real database as the app role (24 passed: permission refusal for finance-only admins, feature rules, unpublish and audit reason, students lose the unpublished test, series flow, database refusal of http images and unsafe links, banner placement and schedule, students cannot write banners, report and CSV exports, audit paging without overlap, only changed fields shown, students cannot read or forge audit entries); route-authorization test for the ops routes; workspace typecheck, lint, tests (API 44, mobile 38, web 17); web build; Android bundle; ops endpoints return 401 signed out; home and admin pages load.

## 24 November 2026: C3 notifications, invoices and analytics (M10)
- Database (022-023): outbox triggers for all eight MVP notices, `notification_deliveries`, `profiles.notification_prefs`, worker permission for the deletion finalizer.
- Worker: leased PostgreSQL job runner with retries and failed-job retention; push (Expo), email (SMTP/SES), server PostHog `purchase_confirmed`, hourly account-deletion finalizer and Firebase identity removal. Every provider is optional and switched on by its env key (`.env.example`); details in NOTIFICATIONS "Implementation".
- API: GET/PUT /me/notification-preferences, PUT /me/devices/:id/push-token, GET /me/purchases/:id/invoice (PDF; tax invoice only with a seller GSTIN).
- App: expo-notifications 58.1.9 and expo-device 58.0.5; push token registered after sign-in (skipped without an EAS project id, on simulators, in Android Expo Go or without permission) and cleared on sign-out; taps open in-app paths only; notification settings saved on the server; consent-gated PostHog events.
- Web: consent-gated PostHog events, consent switch under "Your data", invoice download per purchase.
- Checks: rolled-back worker script against the real database as the worker role (20 passed: every trigger queues once, result/followed/exam pushes with deep links, QC and report emails, receipt retry after an SMTP failure without duplicate sends, opt-out respected, reminder only while running, dead token removed, deletion finalized through the queue, identity job fails visibly without Firebase admin, tax invoice vs receipt); worker starts and runs its schedule; workspace typecheck, lint, tests (API 43, mobile 35, web 8); web build; Android bundle; new endpoints return 401 signed out.
- Open: a new development build is needed for push; FCM/APNs credentials in the Expo project, SMTP, PostHog and Firebase service account are client keys; SAC code and IGST wording on invoices need CA confirmation.

## 24 November 2026: C2 student experience
- Database (021): owner-only policy on examiner follows with a trigger-maintained public follower count; account deletion requests (`deletion_requested_at`) and `finalize_account_deletions(grace)`, which anonymizes the profile, removes devices, follows and saved questions, keeps attempts (anonymous) and financial records, and returns Firebase uids for the worker to delete. It is refused inside a student request.
- API: GET/PUT/DELETE /me/following[/:examinerId] (follow list plus newest tests from followed examiners), GET /me/entitlements, POST/DELETE /me/deletion (POST needs a sign-in within 5 minutes; examiner and staff accounts go to support), GET /me/export. The profile carries `deletionRequestedAt`.
- App: every demo module is removed (`src/lib/demo`). Home, Discover, exam, examiner, series and test screens read follows and access from the server; target exams, stage and language save to the server; profile purchases and receipts come from /me/purchases; deletion runs through re-sign-in and the API, with "Download my data". Test cards show exam and examiner names from the API (they were blank before). The purchase sheet no longer simulates a payment: until the client registers a store billing adapter (`src/features/commerce/billing.ts`) paid items show "Available soon" with no external payment link; with one, access unlocks only when /me/entitlements lists the item. Search sends exam, type, examiner and free/paid filters to the server.
- Web: Follow button on examiner pages; account page gains "New from examiners you follow" and "Your data" (JSON download, deletion with re-sign-in, cancel).
- Checks: rolled-back service script against the real database (23 passed: follow idempotency and count, feed, unknown examiner, self-follow, RLS isolation, export contents, re-sign-in required, staff refused, 7-day schedule, cancel, finalizer grace, refusal in a student request, anonymization, fresh account after deletion); entitlement query checked in a rolled-back transaction (series grant unlocks its 3 tests); workspace typecheck, lint and tests (API 39); web build; Android bundle; new endpoints return 401 signed out.
- Open: the deletion finalizer and Firebase identity removal run from the C3 worker; `user_devices` still has the allow-all app policy (C6 security pass).

## 24 November 2026: C1 results and progress (M8)
- Database (020): owner-only access on saved questions and question reports (replacing allow-all app policies); SECURITY DEFINER functions that open only the caller's closed attempts: solution review (corrected key in force, solution, own and cohort time, percent correct), cohort comparison (first attempts), practice lists, bookmarks, topic accuracy and question reports (one per student per question). Wrong answers fill the mistake notebook when an attempt closes; earlier attempts were back-filled.
- API: GET /attempts/:id/review, GET /me/progress, GET /me/practice/:kind, PUT /me/saved-questions/:questionId, POST /questions/:questionId/reports.
- Web: result page with Overview (rank, percentile, accuracy, comparison with average and topper or "not enough data", section and topic analysis) and Solutions (filters, Hindi, bookmark, remove from notebook, report); /progress (totals, weakest topic, trend chart, topic accuracy, recommended tests); /practice/mistakes and /practice/bookmarks; links from the account page.
- App: result, solutions, progress tab, practice lists and home progress card read the server; the demo results store and old result screen are removed.
- Checks: rolled-back service script against the real database (21 passed: no solutions while running, keys after submit, score equals question marks, cohort, notebook, bookmarks, isolation between students, report visibility to the author only, progress and recommendations); workspace typecheck, lint and tests; web build; Android bundle; new endpoints return 401 signed out.

## 24 November 2026: staff area authorization
- Website: the admin console opens only for admins with a permission (operations, finance or super); each admin sees only the sections their permission covers (payouts need finance, the rest operations) and gets an in-console notice for anything else. The QC review area opens only for QC reviewers and operations admins. Anyone else gets a full-page "no access" screen with no console or staff menu. The examiner workspace opens only for approved examiners; everyone else can reach only the application page, and other examiner addresses redirect there.
- API: examiner-only routes (tests, series, question bank, imports, sales, earnings, coupons, quality, reports) now require the examiner role at the route as well as approval in the service; the profile carries admin permission flags for navigation.
- Checks: route-authorization unit tests for students, examiners, reviewers, operations, finance, super and permission-less admins (9 passed); workspace typecheck, lint and tests; web and API builds; staff API routes return 401 signed out.

## 24 November 2026: test engine (M7 database, API, web and mobile players) and error screens
- Database (019) and engine as in TEST_ENGINE "Implementation". API: start (entitlement, one running attempt, resume), state, takeover, paper without keys, attempt-scoped images, numbered sync, submit, summary, my attempts; finalizer times out attempts past their deadline.
- Web: instructions page with the acceptance box (`/attempt/start/[slug]`), CBT player (`/attempt/[id]`) with five-state palette, section tabs, overall and section timers, Save & Next, Mark for Review & Next, Clear Response, finish-section and submit dialogs with counts, English/Hindi, text size, watermark, offline and takeover handling; score summary (`/attempt/[id]/summary`); "My tests" on the account page; "Start free test" and "Start test" (owned) link to the instructions.
- Error screens: every route error and not-found page in the site and staff areas uses a drawn illustration, plain words and Try again / Go back / Home; failed loads inside pages use the same screen by kind (offline, signed out, no access, blocked, not found, rate limit, unavailable, server).
- Mobile: instructions Start calls the API; new player and score screens (`/attempt/[id]`, `/attempt/[id]/summary`) on the same protocol with SQLite outbox; Home "Continue attempt", test page and refund check read running attempts from the server; the on-device demo attempt store, its route and its launch-time auto-submit are removed; sign-out clears stored attempt sessions. Demo results/progress screens stay until M8.
- Web unit tests now run under Vitest (`apps/web/vitest.config.ts`) and no longer collect the Playwright browser spec.
- Checks run: database script for start, windows, answers authority, scoring and finalizer (13 passed); real service in a rolled-back transaction for entitlement, resume, session replaced, other student, paper without keys, ack, replay, conflict, gap, resume state, takeover, idempotent submit, after-submit rejection, sectional lock and early finish (20 passed); engine tests (6), web unit tests (4), mobile tests (30, including outbox and math text), workspace typecheck and lint, web production build, Android Metro bundle; new pages return 200, unknown test 404, all noindex.
- Not done: no signed-in browser or device run of the players (owner said browser tests are not needed; device process-kill evidence still required by TEST_ENGINE); mobile math is readable text, not typeset; results, solutions review and progress are M8.

## 24 November 2026: web payments, examiner earnings, admin money, reviewer edit, key correction, scheduled publishing (M8 part, M9, M11)
- Database (016-018): Razorpay order, fulfilment, refund and grant functions (server price, coupon rules, invoice numbers per Indian financial year, entitlement, append-only ledger, receipt job, all idempotent); payout calculation replaced (sales by capture month, refunds by refund month, KYC, first payout held one cycle, ₹500 minimum, held and negative balances carry forward); examiners read their own sales and finished-attempt counts (aggregates only); TDS certificate access; scheduled publishing; reviewer edit keeps the replaced version.
- Student web checkout with Razorpay Checkout: coupon quote, order, signature check, payment fetched and captured server-side, webhook fallback; purchases on the account page. Without keys the site says payments are not switched on.
- Examiner: Sales and revenue (cards, one chart, tables by test and day), Earnings and payouts (statement CSV, TDS certificate), Coupon code; schedule-publish time in test settings.
- Admin: Pass and pricing (coupon codes, price bands; Pass plans are Phase 2), Payouts (calculate, hold, release, approve, mark paid with bank reference, TDS upload, CSV export; finance permission), Students (search, purchases, refund within policy, grant access, block with reason).
- Reviewer: minor edit (new question version, re-validated, approved when the review finishes); key correction on a report (new version per test, past attempts re-scored and ranks rebuilt, students queued for notice, reports closed).
- Fixed: duplicate-detection number masking had lost its word boundaries in an earlier edit (no saved question was affected).
- Checks run: repo typecheck (9 packages), API and web lint, API and contracts unit tests (42 passed), web production build; migrations 016-018 applied locally; rolled-back database script for pricing, double-click reuse, attach once, fulfil once (webhook repeat), wrong order, already owned, coupon reuse, free item, RLS, examiner isolation, refund, grant, October payout hold, unfinished month, scheduled publish (16 passed); repository queries run against real rows (sale plus refund nets to zero; shares 65%/75%); new routes return 401 signed out; webhook 503 without keys; new pages return 200.
- Test series: the examiner publishes and unpublishes their own series (PRD 3 "Examiners own Test Series"; no admin or QC step for a series). Publishing needs at least one test in it that passed review and is live, and a price of at least ₹1; unpublishing stops new sales and buyers keep access. New tests can join a published series. Checked with the real service in a rolled-back transaction (8 passed).
- Not done: no live Razorpay test payment (needs the owner's test keys); no browser journey (needs real sign-in); invoice PDFs and receipt/rescore notification delivery wait for the worker consumers; app store billing is M10. Refund policy (7 days, nothing started), 65%/75% shares, 10% TDS default and 18% GST remain proposals (O03, O09).

## 24 November 2026: examiner flow PRD 4.2-5.5 (M4 rule QC, M5 review/publish, examiner quality)
- Database (013-015): Stage 1 on submit with reviewer routing, verdict function that publishes or returns with approved items locked, review history kept when items change, reason-code and threshold constraints, auto-hide count fix.
- Examiner: pre-submit policy issues (other examiner's copy, untagged PYQ, own question live in a paid test blocks; masked/trigram/image matches warn), topic-mix table, price band by tier, Pass-only and series-only access, QC feedback per position, "use updated versions", Tier and quality page, Student reports with replies.
- Reviewer workspace `/review`: queue (fast lane, flags, SLA), question cards with side-by-side matches, PRD checklist, approve/request change/reject with reason codes, verdict, second reviews, report resolution.
- Admin: QC operations (reviewers and exam mapping, assign/reassign with reason, second reviews, thresholds), Examiners (tier, KYC verified, suspend/ban with audited reason), Support (report queue). Shared console frame for admin, examiner and reviewer.
- Checks run: contracts/API/web typecheck and lint; migrations 013-015 applied locally; a rolled-back script ran submit -> Stage 1 -> review -> changes requested -> locked-item refusal -> revision -> resubmit -> live -> reuse block -> second review -> report reply/resolve -> tier/KYC -> settings against the real database (all passed, 418 audit rows written); new API routes return 401 unauthenticated; new pages return 200.
- Not done: no browser journey (needs real sign-in); reviewer minor edit, scheduled publishing, key-correction rescoring (M8), sales/earnings/coupon modules (M9/M11). Proposals P-QC1/P-QC2 and KYC policy await owner sign-off.

## 24 November 2026: M3/continuing catalogue milestone
- Verified a clean local source build and startup for MinIO `RELEASE.2025-09-07T16-13-09Z`; PostgreSQL, MinIO and ClamAV all became healthy.
- Removed the mislocated root `security.txt` audit prompt.
- Added `/v1/examiners` public catalogue contract/API and migrated mobile Home, Discover, exam, test, instructions, series and examiner catalogue screens from demo catalogue reads to real API hooks.
- Verified `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, migrations and local `/health/live` plus `/v1/exams` and `/v1/examiners` responses.
- M3 remains blocked on a real browser upload/preview/commit journey, real 100-question archive checkout, approved agreement/KYC policy and production malware endpoint. Mobile catalogue remains blocked on staging/real-device evidence and has not replaced demo attempt/result/billing flows.

```text
Date / milestone / requirement IDs: 11 November 2026 / M0 (started: folder skeleton only) / R26
Implemented behavior and changed paths:
  - Moved UI/UX Pro Max support folders data/, scripts/, templates/ into
    .claude/skills/ui-ux-pro-max/ (the path SKILL.md's search commands expect);
    removed generated scripts/__pycache__. Root SKILL.md unchanged (source input).
  - Created ARCHITECTURE package layout: apps/api/src/{common,config,providers,
    modules/<10 modules>}, apps/api/test, apps/{web,mobile}/{app,src/features,
    src/lib,src/ui}, packages/contracts/src/<6 domains>,
    packages/engine/src/{reducer,timing,scoring,sections},
    packages/db/{prisma,migrations,seeds}, docker/postgres, .github/workflows.
    Empty folders hold .gitkeep only; no manifests or code yet.
Checks run: search.py "error summary validation" --domain ux from new location returned
  the expected Focusable Error Summary result.
Unavailable checks and reason: no package manifests yet, so no typecheck/lint/test/build.
  Docker is not installed on this machine (Node v22.18.0, pnpm 11.12.0, Python 3.12 present).
  Repository is not a git repository yet.
Open decision IDs / blocking dependency: none for M0; Docker required for Compose verification.
Next concrete action: M0 tooling: verify current Next/Nest/Expo/Prisma/pg-boss compatibility,
  then root package.json, pnpm-workspace, turbo, strict tsconfig, per-package manifests.
```

```text
Date / milestone / requirement IDs: 12 November 2026 / M0 (folder structure only) / R26
Implemented behavior and changed paths:
  - Expanded the skeleton into the full documented layout. apps/api/src gains
    common/{decorators,filters,guards,interceptors,pipes,errors,logging,types,utils},
    config/env, database, health, outbox, jobs, providers/<8 adapters> and
    modules/<10>/{http,application,domain,repositories,jobs} matching the
    ARCHITECTURE dependency direction; apps/api/test/{integration,e2e,fixtures,helpers}.
  - apps/web: app route groups (public)/(student)/(examiner)/(staff), src/features/<9>,
    src/lib/{api,auth,config,query,storage,utils}, src/ui/{primitives,patterns,tokens},
    public, test/{unit,e2e}.
  - apps/mobile: expo-router app/{(auth),(tabs),attempt}, src/features/<6 student-only>,
    src/lib/{api,auth,billing,storage,notifications,config}, src/ui/<3>, assets, test/unit.
  - packages/contracts/src adds common/ beside the six documented domains, plus test/;
    packages/engine adds test/; packages/db adds src/ and test/.
  - docker/{postgres/init,minio,mailpit,firebase} for the SETUP.md Compose services.
  - Root .gitignore created (env/secret, native credential, build, volume and coverage rules).
    144 .gitkeep markers; no empty directory left unmarked.
Checks run: directory tree printed and verified against ARCHITECTURE "Package layout" and
  the module ownership table; no empty directories remain.
Unavailable checks and reason: no package manifests, so typecheck/lint/test/build still
  cannot run. Docker not installed on this machine. Repository is still not git-initialised,
  so .gitkeep/.gitignore are inert until `git init`.
Open decision IDs / blocking dependency: contracts coverage for the results, payouts,
  notifications and admin modules is undefined - ARCHITECTURE lists six contract domains
  against ten API modules. Resolve by folding them into existing domains or amending
  ARCHITECTURE before M1 contracts work.
Next concrete action: git init plus initial commit, install Docker Desktop, then M0 tooling:
  verify Next/Nest/Expo/Prisma/pg-boss compatibility and create root package.json,
  pnpm-workspace, turbo, strict tsconfig and per-package manifests.
```

```text
Date / milestone / requirement IDs: 12 November 2026 / M0 (documentation reconciliation) / R13 R15 R17 R18 R26 R27
Implemented behavior and changed paths:
  - Preserved the owner-supplied mobile stack note verbatim at
    docs/sources/MOBILE_STACK_NOTE_2026-11-12.md with a provenance header; registered it in SOURCES.
  - DECISIONS gains E14-E20 (storage, package naming, attempt sub-routes, timer offset,
    S2-gated renderer, server-issued device ID, analytics residency), a refinements paragraph,
    conflicts C1-C4 and an unverified-version note.
  - Applied the adopted structural items only: apps/mobile/app/attempt/[id] and
    apps/mobile/src/lib/guards.
Checks run: mobile tree reprinted and compared against DECISIONS E15/E16; no empty directories.
Unavailable checks and reason: still no manifests, so typecheck/lint/test/build cannot run;
  library versions in the note were not verified because that is M0 tooling work against vendor docs.
Open decision IDs / blocking dependency: C1 phone OTP versus D01, C2 Android Razorpay versus D02,
  C3 late-batch grace window versus E09/O12, C4 third-device behavior. C1-C3 block dependent
  M1, M7 and M9b work; they do not block M0 tooling.
Next concrete action: owner rules on C1-C4, then git init and M0 tooling version resolution.
```

```text
Date / milestone / requirement IDs: 13 November 2026 / M0 (decision resolution) / R13 R15 R18 R26 R27
Implemented behavior and changed paths:
  - Researched and resolved C1-C4 in DECISIONS against vendor documentation, at owner instruction:
    C1 no phone OTP (D01 stands), C2 Apple IAP on iOS and Play Billing only on Android for MVP
    (D02 stands, user choice billing deferred to Phase 2), C3 strict deadline (E09/O12 stand),
    C4 third device blocked with student-initiated revoke.
  - Replaced the unverified-version note with a validated table: Expo SDK 58 current, not 55;
    expo-iap required because react-native-iap dropped Expo support at v15; mmkv v4 createMMKV
    confirmed; iOS screenshot behavior corrected; Razorpay not applicable on mobile.
Checks run: five web searches against Expo changelog/docs, Play Console Help, OpenIAP/npm and
  Apple external-purchase-entitlement coverage. Findings recorded with sources in the chat reply.
Unavailable checks and reason: no manifests, so typecheck/lint/test/build still cannot run;
  store behavior and device screenshot behavior need real-device and sandbox evidence (S4, M13).
Open decision IDs / blocking dependency: none blocking M0. O03 net-revenue definition and O09
  GST/TDS treatment remain owner/CA items; C2 keeps them simpler by using one provider per platform.
Next concrete action: git init plus initial commit, then M0 tooling: resolve Expo SDK 58 /
  React Native 0.88 / Next / Nest / Prisma / pg-boss compatibility as a set and write the manifests.
```

```text
Date / milestone / requirement IDs: 13 November 2026 / M0 (toolchain) / R26
Implemented behavior and changed paths:
  - Published the repository baseline to GitHub (commit db7b43e, 284 files). Client-confidential
    sources are gitignored and absent from history; verified the PRD PDF returns 404 on the remote
    while CLAUDE.md returns 200. Added docs/sources/README.md. Fixed the global git user.name value.
  - Installed Docker Desktop 4.99.0 via winget on an existing WSL2/Ubuntu setup.
Checks run (command, outcome, evidence):
  - docker version: client and server 29.9.3; docker compose version: v5.7.0; engine Linux, 8GB.
  - postgres:18-alpine container: server_version 18.6; CREATE EXTENSION pg_trgm and btree_gin both
    succeeded (pg_trgm 1.6, btree_gin 1.3); similarity('railway recruitment','railway recruitement')
    returned 0.77272725. Container removed afterwards.
  - npm registry dist-tags read directly: next 16.4.6, @nestjs/core 12.5.0, @prisma/client 7.10.1,
    pg-boss 12.38.2, expo 58.0.25, expo-iap 6.4.4, zod 4.6.7, turbo 2.11.11.
Unavailable checks and reason: no manifests yet, so typecheck/lint/test/build still cannot run.
Open decision IDs / blocking dependency:
  - prisma npm "latest" tag resolves to 8.0.0-rc.33, a release candidate, while @prisma/client
    latest is 7.10.1 stable. Pin both to 7.10.1; never install prisma from the latest tag.
  - Local Node is 22.18.0. NestJS 12 runtime needs 22.12+, but its CLI generators need 22.22.3+.
    Bump within the 22 line before using nest CLI generators.
  - NestJS 12 ships core packages as ESM and defaults new projects to Vitest and oxlint; TESTING.md
    predates this and needs a decision during manifest work.
Next concrete action: write the M0 workspace manifests, Compose file and env validation against the
  pinned set above, then run the clean-clone flow.
```

```text
Date / milestone / requirement IDs: 15 November 2026 / mobile client demo (ahead of M-series) /
  PRD 6.1 to 6.7
Implemented behavior and changed paths (apps/mobile):
  - Design tokens and primitives from design-system MASTER; typed demo repository with key-free
    papers and solutions held separately; zustand stores for session, results and the attempt.
  - Screens: sign-in, onboarding, Home, Discover, exam, examiner, series, test detail, purchase
    sheet, instructions, attempt, result and review, Progress, practice lists, Profile, edit exams.
  - Phase G: on-device persistence and resume, coupon and examiner codes, GST-inclusive price,
    price band filter, edit target exams, continue-attempt wiring.
  - Phase H: shared review card, cross-attempt mistake notebook and bookmarks, single bookmark
    source, sign-out clears results and any live attempt, chart label and header fixes.
  - Phase I: storage moved to SQLite (expo-sqlite kv-store); purchase detail with tax invoice or
    receipt, GST breakdown, share, and refund request (web 7-day rule) or store refund link;
    devices with removal; notification preferences; help with FAQs and contact form; terms,
    privacy and analytics consent; account deletion with typed confirmation and grace period.
  - Phase J: React Query data layer over the demo repository (src/lib/api) with NetInfo online
    status; skeleton, offline and error states on Home, Discover and test detail; floating offline
    banner; post-submit scoring state. Walked series purchase, IBPS sectional timing with locked
    sections and automatic section switch, Hindi switching, offline and reconnect, and deadline
    auto-submit on the emulator.
  - Phase J checks: pnpm exec vitest run in apps/mobile, 19 tests passed (attempt store sectional
    timing, answer isolation, scoring; money and rank formatting). tsc and oxlint clean.
Checks run (command, outcome, evidence):
  - pnpm exec tsc --noEmit in apps/mobile: exit 0. pnpm exec oxlint app src: no findings.
  - Manual walkthrough on Android emulator Pixel_10a in Expo Go with screenshots: sign-in,
    onboarding, Home, Discover filters, purchase with ANITA10, instructions, attempt, kill and
    relaunch mid-attempt resumed on the same question with the saved answer, leave dialog,
    Progress, practice lists, result, exam tabs, series, examiner, Profile, sign-out.
Unavailable checks and reason: native Android build
  blocked by the space in the repository path (DECISIONS X1); no iOS device or simulator.
Open decision IDs / blocking dependency: X1 repository relocation (owner), X4 and O09 GST
  treatment (CA), X5 and S4 store coupon and SKU strategy.
Next concrete action: owner decides on relocating the repository; then resume M0 phases 4 and 5
  (Compose, env validation, CI) and add Vitest coverage for the attempt store and practice lists.
```

## Next action

M3 remains in progress: validate browser-based upload and grouped-import preview/commit, make local object storage reproducible from a clean checkout, and obtain owner/legal-approved examiner agreement and KYC policies. Scanner failure is fail-closed and staff downloads require a clean scan; neither means KYC is verified. M4 onward, commerce, store and launch gates remain separate.

## 23 November 2026: M3 examiner application foundation

- Added shared examiner-application and ten-sample contracts, migration 009, owner-only decision authority and audited application/sample records.
- Added API routes for examiner submission and operations review/approve/reject.
- Added the private `/admin/examiners` staff page.
- Applied migration 009 to local PostgreSQL and bumped runtime schema readiness to version 9.
- Checks passed: workspace typecheck, lint, unit tests, production build and `test:int` integration suite.
- Remaining M3 scope at this point: object/KYC upload verification, the question editor, XLSX/ZIP import, and browser/API coverage; these items were implemented in the follow-up below.

## 23 November 2026: M3 authoring implementation (acceptance incomplete)

- Added examiner application/status and taxonomy APIs, the `/examiner/apply` and `/examiner` workflows, and staff application/sample review.
- Added draft question revisions, upload intents/completion checks, and template-bound import preview/commit with idempotency and archive validation (migrations 009-012).
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:int` (41 database and 25 API tests), `pnpm build`, and `pnpm test:e2e` all passed. The e2e script is an HTTP/readiness/CORS smoke test, not a browser journey.
- The import path does not support grouped passages or image references, so the 100-question M3 import acceptance test is not met. Uploads remain scan-pending; there is no malware scanner or safe KYC viewer. Browser upload/CORS behavior and clean-clone MinIO image portability are unverified. No browser journey or real MinIO upload was performed.
- Deployed use still requires owner/legal-approved examiner agreement text and policy; local/test uses a clearly marked non-legal placeholder. Do not claim M3 completion or launch readiness.
- The API integration suite still emits a non-failing `pg` overlapping-query deprecation warning in the pre-existing admin catalogue `topics` query.

## 23 November 2026: M3 import and malware hardening (acceptance incomplete)

- Added optional `Groups` sheet parsing for shared English/Hindi passages and ZIP image references. Referenced question and passage images are malware-scanned, copied to server-only object keys, and committed as clean assets; commit revalidates ownership and scan state. Rejected parses are persisted with sheet/row/cell errors, and uncommitted objects are cleaned up best-effort.
- Added the ops-only, audited, short-lived KYC attachment-download path. A clean malware scan is not a KYC verification decision.
- Removed the PostgreSQL overlapping-query warning in admin catalogue reads by running those queries sequentially on one client.
- Checks passed: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm test:int` (41 database and 25 API integration tests). API unit tests include scanner protocol coverage, invalid/missing image paths, and a synthetic 100-question bilingual grouped/image archive; API integration verifies passage/image persistence during commit.
- Not verified: a complete browser upload-to-preview-to-commit journey, browser PUT/CORS against MinIO, or clean-checkout MinIO startup. Parser and commit are tested separately, not as one real archive upload journey.
- Blocking dependencies: owner/legal-approved examiner agreement and KYC document/verification/retention/sales policy; a private production ClamAV endpoint with maintained signatures; an accessible, pinned, clean-checkout-compatible local S3 image; and browser upload validation. M3 and launch readiness remain incomplete.

## 24 November 2026: M3 browser acceptance attempt
- Started the API and web development stack and attempted `/examiner/apply`.
- Verified MinIO browser CORS preflight accepts `http://localhost:3000` for `PUT` and `content-type`.
- Verified `pnpm test:int`: 41 database integration tests and 25 API integration tests passed, including authoring/import commit and idempotent commit coverage.
- Verified `pnpm test:e2e`: API, worker, web and CORS smoke checks passed.
- The browser upload → preview → commit acceptance did not complete. No local Firebase Auth emulator or synthetic signed-in examiner fixture is configured, so the web remained at the sign-in gate.
- The 100-question parser unit fixture and integration commit path pass separately. They do not establish one end-to-end browser result.
- M3 engineering browser acceptance remains blocked locally by missing synthetic authentication; owner agreement/KYC text and a production malware scanner remain external blockers.

## 24 November 2026: M3 close-out work (browser acceptance not yet passing)

- Fixed: a first-time examiner saw "Could not load application" because `GET /examiner/application` returned an empty body for null; it now returns `{ application: null }` (contract change, web and tests updated).
- Added `GET /examiner/imports/template` and a "Download template" button: the workbook lists the template's sections and the examiner's subject/topic codes, which were previously unobtainable from the UI.
- Examiner pages skip student onboarding and ask for the 18+ confirmation once; `POST /examiner/applications` now refuses an account without it (`AGE_CONFIRMATION_REQUIRED`).
- The question editor offers only the approved application's subjects (others failed on save); the staff review shows exam/subject/topic names instead of UUIDs; the application form explains that sample subjects become authoring subjects.
- Added `pnpm test:browser` (apps/web/test/e2e): fresh database with the demo catalogue, API in test mode with a locally generated signing key, separate web build in `.next-e2e`, Firebase answered in the browser; real MinIO and ClamAV. Playwright 1.65.1 pinned.
- Checks run: API, contracts and web typecheck and lint; authoring integration tests 3/3 (new: 18+ refusal, `{ application: null }`, template content, examiner-only and assigned-template access).
- Not verified: the browser journey has not passed. Run 1 found the null-body bug above; run 2 timed out on a test-script selector (`getByLabel('Exam', { exact: true })` does not match a select whose accessible name includes its value). Fix the selector and rerun before claiming M3 acceptance. Full `pnpm test`/`test:int`/`build` were not rerun for this change.
- External blockers unchanged: owner/legal agreement and KYC policy, production malware scanner.

## Update template

```text
Date / milestone / requirement IDs:
Implemented behavior and changed paths:
Checks run (command, outcome, evidence):
Unavailable checks and reason:
Open decision IDs / blocking dependency:
Next concrete action:
```

## 16 November 2026: development foundation / M0 / R26

Implemented:

- Idempotent environment setup; pinned Node 22.23.5 and patched pnpm 11.13.1.
- Compose services with loopback ports and persistent volumes; PostgreSQL role separation, Firebase demo project, MinIO private bucket initialization and Mailpit.
- Prisma baseline migration with required extensions; local/test-only repeatable infrastructure seed. Domain accounts and a complete paper await domain schemas.
- Validated server configuration, origin allowlist, database/schema readiness, pg-boss worker lifecycle and health endpoint.
- Clean startup scripts, separate unit/integration checks, API/worker/web HTTP smoke script, public-environment allowlist, CI and non-root container definitions.
- Corrected typecheck scripts to avoid mutating build metadata; mobile Vitest configuration uses an ESM file extension.
- Updated README/setup/instructions and schema/decision documentation.

Verification on 16 November 2026:

- Frozen-lockfile install with pnpm 11.13.1 passed.
- Workspace lint and typecheck passed; 29 unit tests passed (19 mobile, 10 API environment tests).
- Four integration tests passed: PostgreSQL extensions/schema, application role restrictions, incompatible schema rejection, HTTP liveness/readiness during database failure.
- Baseline migration applied; seed executed twice successfully.
- Repeated services startup passed; PostgreSQL, MinIO, Mailpit and Firebase were healthy; private bucket initialization passed.
- API/worker/web HTTP smoke and CORS checks passed; `pnpm dev` startup verified all three health endpoints.
- Public environment allowlist and git whitespace checks passed.
- API container build and packaged runtime readiness passed with pinned Node 22.23.5.
- Web container build and packaged server health passed with pinned Node 22.23.5.
- Scoped formatting checks passed. Temporary runtime-check containers were stopped and removed. Local development services remain running.

Host limitation: local Node remains 22.18.0 and emits the declared engine warning. CI/container runtime is pinned to 22.23.5. GitHub CI has been authored but has not run remotely; no deployment was performed.

Scope limits: no real authentication/billing, provider adapters, domain APIs, production deployment, browser user-journey tests or native/store verification. Empty unit suites are explicitly allowed for scaffolds; they are not coverage. The original 15 November mobile work is preserved.

Superseded the same day: the owner's SQLite storage decision replaced PostgreSQL, pg-boss and MinIO. The PostgreSQL verification above describes that earlier tree; the SQLite tree was first recorded as verified on 18 November.

## 18 November 2026: M0 close-out on SQLite / R26

Implemented:

- Host Node upgraded from 22.18.0 to the pinned 22.23.5 (winget OpenJS.NodeJS.22); the engine warning is gone.
- SETUP, DATA_MODEL, TESTING and CLAUDE.md updated to describe the SQLite foundation; ARCHITECTURE and INFRA carry a superseded-storage note pending a production design pass.
- Orphaned PostgreSQL role init and MinIO build files moved to `docs/archive/compose-services/`. Firebase Auth emulator configuration kept for M1.
- M0 work committed and pushed to GitHub so CI runs remotely.

Verification on 18 November 2026 (Node 22.23.5, pnpm 11.13.1):

- `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck` passed.
- `pnpm test`: 29 unit tests passed (19 mobile, 10 API). The first run after install failed once in the web task under parallel turbo; serial and two forced parallel reruns passed. Not reproduced.
- `pnpm check:public-env` passed; `pnpm db:migrate`, then `pnpm db:seed` twice, passed.
- `pnpm test:int`: 9 passed (8 SQLite storage, 1 HTTP readiness failure path).
- `pnpm test:e2e`: API, worker, web and CORS smoke passed. It requires `db:migrate` first; a run without the database failed with `unable to open database file`, as SETUP now documents.

- First remote CI run passed on commit 67d5a59 (GitHub Actions run 44356546448): every step including both API and web image builds.

Not run locally: Docker image builds (verified in CI only). No iOS device or simulator; X1 relocation pending.

## 19 November 2026: PostgreSQL on Supabase / M0 rework / R26

Implemented (commits 8811a7a to the M5 docs commit):

- DECISIONS "PostgreSQL on Supabase" supersedes the SQLite server storage decision; Supabase is database only, Firebase and Expo Push unchanged.
- Local PostgreSQL 17.12 in Compose on loopback 15432 with migrator, API and worker roles; three database URLs in env examples.
- `packages/db` on `pg` 8.23.1: transactional checksummed migrator with advisory lock; migration 001 with pg_trgm/btree_gin, append-only ledger and audit including TRUNCATE, SKIP LOCKED leased jobs. No password column and no file BLOBs.
- API/worker on pg pools; staging/production require `DATABASE_CA_CERT_PATH` for verified TLS; worker can use a separate session-mode URL.
- CI starts PostgreSQL via Compose before migrating; API image no longer creates a SQLite data directory. SETUP, DATA_MODEL, TESTING updated.

Verification on 19 November 2026 (Node 22.23.5, pnpm 11.13.1, Docker 29.9.3):

- Frozen install, public-env check, lint and typecheck passed.
- Unit: 31 passed (19 mobile, 12 API including SQLite-URL rejection and deployed-TLS requirement).
- Integration: 10 passed (8 database on an isolated database per test, 2 API readiness); temporary databases were all dropped.
- Migrate twice (second reported up to date) and seed twice passed; API/worker/web and CORS smoke passed.
- API image built; Compose `app` profile API and worker both returned 200 on `/health/ready` against the Postgres container, then were stopped.
- Supabase staging (18 November): transaction and session poolers both connected, PostgreSQL 17.12, extensions available, 30-43 ms round trip. Read-only; nothing migrated.
- iOS: owner reports the Expo Go demo running on a physical iPhone without issues. Expo Go cannot load native auth or billing modules, so this is not development-build or store evidence.

Open: Supabase CA certificate and restricted roles before staging migration; confirm the Data API is disabled; Supabase plan, backups and PITR terms (E11); pre-existing react/react-dom 19.3.0/19.3.1 peer warning; Supabase account password rotation after it appeared in a session log.

### 19 November 2026: Supabase staging provisioned

- Supabase Root 2021 CA (valid to April 2031) stored outside the repository; both poolers passed full certificate verification.
- Migration 001 applied to staging; `provision-roles` created `exam_app` and `exam_worker` and wrote their URLs to the local `.env` under `STAGING_`, without printing them.
- Supabase's `ensure_rls` trigger had enabled RLS with no policies, so the service roles saw no rows and readiness failed. Fixed in the migrator: RLS on everywhere plus an `exam_service_access` policy for the two roles, reapplied every run; new integration test.
- Staging checks as each role: verified TLS, readiness, row write (rolled back) allowed; CREATE/DROP TABLE and `schema_migrations` access denied; `anon` and `authenticated` have no SELECT on any public table. The built API and worker both returned 200 on `/health/ready` against staging.
- Local suite after the change: lint, typecheck, unit (31), integration (11), migrate and smoke all passed.
- Owner confirmed the Data API is disabled (not independently verifiable from a database connection).

## 19 November 2026: owner schema v1.1 / data model

Implemented (commits 1153853 to 5190c93):

- Owner-supplied `Supabase_Database_Schema_Documentation.md` registered as a confidential source (gitignored) and made the data model. PRD prevails on sign-in (Firebase), versioning, QC-gated publishing, locked approved questions and the admin audit log; technical corrections for store billing, unverified phone and function search paths.
- Migrations 002 identity, 003 catalogue, 004 QC and attempts, 005 commerce, functions and buckets: 39 tables, all twelve schema sections. Each deviation and its reason is in DATA_MODEL.
- `withUser` sets the verified profile per transaction; schema policies use `current_user_id()`. Worker has full row access; the API follows schema policies where they exist.

Verification on 19 November 2026:

- Database integration: 34 tests passed on two consecutive runs, each in an isolated database. They cover the sign-in function and no email merge, own-profile visibility and blocked self-promotion, the two-device limit under concurrency, append-only audit, corrections and ledger, question immutability and versioning, examiner publishing limits, frozen published tests, QC locks, five-report auto-hide, server-only timing and scoring with a strict answer deadline, order and entitlement rules, automatic audit rows, all five functions, and a hand-calculated payout fixture (holds, refunds, minimum, paid rows untouched, finalised month).
- Whole suite: lint, typecheck, 31 unit tests, 36 integration tests and the HTTP smoke test passed. Local database migrated to schema version 5 and seeded.
- Two defects found by tests and fixed before commit: the device-limit lock saw no rows under RLS (now an advisory lock), and privileged functions left no audit trace when they suspend the user context (now one audit row per run).
- Staging: migrations 002-005 applied in one transaction; 39 of 39 tables have RLS; `anon`/`authenticated` can read no table and execute none of the sensitive functions; five storage buckets created; as `exam_app`, readiness, sign-in, own-profile visibility and blocked self-promotion all held (probe rolled back). The built API and worker returned 200 on `/health/ready` against staging.

Open: Firebase project (owner); whether examiners may create their own coupon codes (currently admin-only); TDS/GST parameters (O09) and net revenue after store fees (O03).

### 19 November 2026: Supabase keep-alive

- `keep-supabase-awake.yml` runs `SELECT now()` every three days as `exam_keepalive` (login-only, no table access, verified TLS). Owner added the `SUPABASE_KEEPALIVE_DATABASE_URL` secret; the first manual run (Actions run 44388767265) succeeded. Before that, a local psql run of the same command succeeded and the role was refused on `profiles` and `bootstrap_state`.
- GitHub disables scheduled workflows after 60 days without repository activity; remove the workflow once staging is on a paid Supabase plan.

## 19 November 2026: M1 milestone A, email sign-in end to end

Implemented (API in 6c11491, mobile in the following commit):

- API: Firebase ID tokens verified against Google's securetoken keys (project issuer/audience, RS256). `POST /v1/identity/session` requires a verified email and 18+ confirmation, creates the profile without merging on email, and registers a server-issued device under the two-device limit (409 with the active devices). `GET/PATCH /v1/me`, `GET /v1/me/devices`, `DELETE /v1/me/devices/:id` (allowed from an unregistered device so a blocked student can free a slot). Errors use the contract shape.
- Mobile: Firebase JS SDK email/password (create account, verification email and re-check, password reset), session persisted in expo-sqlite; sign-in calls the API, stores the device id in SecureStore and handles the device limit by removing a device and retrying. Onboarding saves language and preparation stage to the server; Profile and Devices read and revoke real devices; the language switch saves to the server and reverts on failure; sign-out releases this device's slot. Google and Apple buttons are disabled until the development build (milestone D).
- `apps/mobile/.env.example` lists the four public Firebase web config values; the public-env allowlist includes them.

Verification on 19 November 2026:

- Lint (0 warnings), typecheck and unit tests across the workspace passed: mobile 25 (6 new for API error mapping, network failure, contract-invalid replies and 204), API 14.
- API identity integration: 8 tests (verified-email gate, age confirmation, profile bootstrap, device registration and limit, revoke, profile update, token rejection) passed with test-only signing keys.
- Against the real Firebase project `testapp-6be1e`: an unverified account was refused with 403 and a tampered token with 401; the throwaway account was deleted.
- `expo export --platform ios` bundled successfully, including Firebase's React Native persistence.
- Not yet verified: the full flow on a phone with a verified inbox (owner test in Expo Go).

Open: target exams are not saved to the server yet (needs the catalogue, milestone B); target-exam editing and account deletion remain local demo screens.

### 19 November 2026: device testing and repository path

- Owner moved the repository to `Client-projects\Test-series`; the path has no spaces, so the DECISIONS X1 blocker is removed. A native Android build has not been retried.
- Device testing is Expo Go on the owner's physical iPhone; the Android emulator is no longer used. `apps/mobile/.env` points the API at the computer's LAN address.
- Docs only (DECISIONS X1, SETUP); no code changed and no checks run.

### 19 November 2026: mobile visual redesign (owner references)

- New identity per DECISIONS V1-V6: exact seven-colour palette in `src/ui/tokens`, Outfit + Inter fonts loaded before the splash hides, type scale one step smaller, pill buttons, larger card radii.
- Launch: `(auth)/welcome` three-slide intro (swipe, Continue, Skip, progress pill, Sign up / Log in) with pseudo-3D SVG illustrations that drift unless Reduce Motion is on; shown once per device (`introSeen` survives sign-out). Sign-in has a navy header and white form sheet and opens in sign-up or log-in mode from the slides. Splash background is navy.
- In-app: floating navy pill tab bar; Home with greeting header, navy hero card (attempt in progress, last score with percentile ring, or first free test) and a tinted 2x2 tile grid; Progress with an interactive line chart (tap or screen-reader select, cutoff line, date stepper) and a metric rail; Discover with an editorial heading and exams as rotated shapes. Other screens pick up the new tokens unchanged.
- Dependencies: react-native-svg 15.16.0 (via `expo install`), @expo-google-fonts/inter 0.4.2, @expo-google-fonts/outfit 0.4.3; lockfile updated.

Checks run: mobile typecheck, lint (exit 0) and unit tests (25 passed); `expo export --platform ios` bundled. Not yet verified: appearance and interaction on the owner's iPhone in Expo Go, Hindi rendering with the new fonts, VoiceOver pass over the new chart and tab bar. No screenshots taken.

### 20 November 2026: sign-in scope

- Sign in with Apple deferred by the owner (DECISIONS A1); the disabled Apple button is removed. App Store submission is blocked until it is added or Guideline 4.8 is re-checked.
- Google sign-in is on hold until the product domain exists (owner, 20 November 2026): the Google consent screen needs the authorized domain plus privacy-policy and terms URLs on it. The Google button stays visible but disabled. When resumed: Firebase Google provider, consent screen, iOS/Android apps with the final bundle ID, then the development build (setup steps given to the owner in session).
- Email/password sign-in remains the working method in Expo Go. TextField no longer sets lineHeight on the input (iOS pushed the text to the bottom of the field).

### 20 November 2026: Google sign-in code for development builds

- Correction to the entry above: the domain is needed only to publish the Google consent screen; Testing mode works without it. The owner asked to set up what development needs now.
- Added `expo-dev-client` 58.0.21 and `@react-native-google-signin/google-signin` 17.0.0 (via `expo install`, pinned; the library's Expo guide confirms no Expo Go support and a required `iosUrlScheme` without native Firebase). `eas.json` with a `development` profile; EAS project ID in `app.config.ts`; bundle ID and Google URL scheme are build-time values (`APP_BUNDLE_ID`, `GOOGLE_IOS_URL_SCHEME`), and an EAS build without the scheme fails fast.
- Auth adapter: `signInWithGoogle` (native picker, Google ID token, Firebase `signInWithCredential`), lazy-loaded so Expo Go keeps working; Google sign-out on sign-out; messages for Google errors and for an existing password account (never merged on email; linking not built). The Google button is live when configured in a development build; in Expo Go it says it needs the installed app. No API change: the API already accepts any verified Firebase identity.
- Checks: mobile typecheck, lint, unit tests (32, 7 new), public-env allowlist, `expo export --platform ios`; `expo config` shows the Google URL scheme in Info.plist when set.
- Not done (needs the owner): Firebase Google provider, consent screen test user, bundle ID, Firebase iOS app and client IDs, Apple Developer account, EAS login and the first development build. Not verified on a device.

## 22 November 2026: Phase 1 UI track, milestone U0 brand foundation

Owner decisions: product name MakeMePrepare, domain makemeprepare.com, logo MMP-logo.png, logo blue added to the palette, motion on web and mobile without Three.js (DECISIONS O10, V7-V9). Owner also asked that all web work follow SEO practice.

Track milestones (an update to the owner after each): U0 brand foundation; U1 mobile motion system; U2 mobile screens; W0 web foundation (tokens, fonts, Motion/Lenis, header/footer, SEO base: canonical, sitemap, robots, Open Graph); W1 public landing page and legal page shells; later web pages follow the Phase 1 backend milestones.

U0 implemented:

- Brand assets derived from MMP-logo.png by script (unblended from the white background, not redrawn): logo, mark and wordmark with reversed navy-surface versions in `apps/mobile/assets/brand` and `apps/web/public/brand`; app icon, Android adaptive icon and splash image in `apps/mobile/assets`; `apps/web/app/icon.png` and `apple-icon.png`.
- Mobile: app name MakeMePrepare, icon, adaptive icon and splash image in `app.config.ts`; the sign-in header shows the logo mark in place of the placeholder tile; the welcome header shows the mark beside the slide dots. Token `palette.brand500` / `colors.brand` = #0569D6. Bundle ID, URL scheme and storage keys unchanged (changing them would break Google OAuth clients and sign the student out).
- Web: metadata base https://makemeprepare.com, title template, description, Open Graph defaults, theme colour; `robots: noindex` until the W1 public site ships.

Checks run: mobile and web typecheck and lint; mobile unit tests (32 passed); `expo config` shows name, icon, adaptive icon and splash; `expo export --platform ios` bundled with the logo asset; `next build` passed and serves `/icon.png` and `/apple-icon.png`. Not verified: icon and splash on a device (the native icon and splash need a new development build; Expo Go shows its own), welcome header spacing on a 320pt-wide screen.

## 22 November 2026: milestone W0 web foundation

Owner re-prioritised: web app first (needed today), mobile motion (U1/U2) after. Order: W0 foundation, W1 public site, W2 student web app on the mobile demo data.

Implemented:

- `app/globals.css`: the mobile tokens as CSS variables (palette, logo blue, semantic colours, spacing, radii, shadows, motion durations), type scale, pill buttons with press scale, cards, chips, focus ring, skip link and a global reduced-motion override.
- Fonts: Outfit and Inter through `next/font/google` (self-hosted at build time).
- Motion 14.14.0 and Lenis 1.3.27 (pinned). `SmoothScroll` (Lenis, off under reduced motion), `Reveal`/`RevealItem` (fade-up on entering view, server-rendered content stays readable without JavaScript).
- `Logo` (derived assets; horizontal lockup that drops the wordmark under 400px), `SiteHeader` (transparent over the navy hero, solid white once scrolled, phone menu with an animated icon, Escape to close), `SiteFooter`, `(public)` route group layout.
- SEO base: `src/lib/config/site.ts` (canonical origin from `NEXT_PUBLIC_SITE_URL`, default https://makemeprepare.com), metadata title template, canonical, Open Graph and Twitter card, 1200x630 share image with alt text, Organization and WebSite JSON-LD, `robots.ts` and `sitemap.ts`. Indexing is allowed only with `SITE_INDEXABLE=true`; every other environment serves `Disallow: /` and `noindex`.

Checks run: web typecheck, lint and `next build` (static `/`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image.png`); served build screenshotted at 1280, 390 and 360 px: header clear over navy, solid after scroll, no wrapping on phones. Console shows only 404s from prefetching `/sign-in` and the policy pages, which W1/W2 add.

## 22 November 2026: milestone W1 public site

Implemented (`apps/web/src/features/marketing`, `app/(public)`):

- Landing page in the mobile visual language: navy launch-gradient hero with CSS line reveal and an animated sample of the app dashboard (count-up figures, ring drawn in, gentle float, labelled "Sample dashboard"); promise cards; how it works; feature bento in the dashboard tile colours with the CBT palette states and a score-versus-cutoff line that draws in; exams (SSC, Banking, Railways); examiner band ("portal opens soon", no revenue figures); FAQ accordion; final call to action.
- Copy stays inside decided scope: no prices, revenue shares, test counts, ratings or testimonials. The exams section names the proposed launch exams (O01 is still a proposed default; update the copy if the founder changes them).
- SEO: one h1, ordered headings, canonical, FAQPage JSON-LD matching the visible FAQ, FAQ answers kept in the HTML when collapsed, hero animated in CSS so it paints before hydration.
- `/privacy`, `/terms`, `/refunds`: "being finalised" pages that state what each policy will cover without inventing terms; `noindex, follow`, excluded from the sitemap.

Checks run: web typecheck, lint, `next build` (all routes static). Served build screenshotted full-page at 1280 and 390 px; fixed an orphaned bento card, a flat trend scale and ring text inheriting caption size. With reduced motion every heading and paragraph is visible and figures show final values; with JavaScript off the h1 and FAQ answers are in the HTML, but scroll-revealed sections stay at opacity 0. No page errors in the console.
Not done: Lighthouse/Core Web Vitals run, real policy text (legal), examiner portal, `/sign-in` (W2).

## 22 November 2026: W1b product showcase and app download

Owner brief with six SaaS landing references (layout and composition only; brand colours, fonts and components stay ours). Implemented in `apps/web/src/features/marketing/showcase`:

- "One account, every screen" (`#app`, after How it works): tinted ice-to-sky stage with a dotted texture; browser-window student dashboard (sidebar, greeting, four stat cards, score-versus-cutoff chart that draws in, continue-attempt card, recent results, section accuracy, quick action) with sample data; the mobile home screen in a phone frame overlapping the window; two floating notification cards; three highlights. Scroll moves the window from a 14 degree tilt to flat and drifts the cards and phone at different rates (Motion `useScroll`); none of it runs with reduced motion.
- App download band (after Exams): navy panel, three benefits, two phones (CBT attempt screen with the five-state palette, and home), a notification card, store buttons marked "Coming soon" that link nowhere. Before launch, swap in the official Google Play and App Store badge artwork and listing URLs.
- "App" link added to header and footer. Phone: dashboard drops sidebar and recent results; floating cards hide below 860 px; the download band shows one phone at its designed size.

Checks run: web typecheck, lint, `next build`; screenshots at 1280, 820 and 390 px with fixes for card and phone overlaps and a cramped two-phone layout; no page errors; no horizontal overflow at any width; reduced motion leaves the window untransformed.

## 22 November 2026: W1d hero and about band after the NOVACORE reference

The W1c round (wider layout, 90% hero, scroll choreography) was reverted at the owner's request. The owner then supplied the NOVACORE landing reference for design only, brand guidelines unchanged.

Implemented in `apps/web/src/features/marketing/hero`:

- Hero: rounded light panel (canvas tint to ice to sky, 12 px frame) with the navigation integrated; headline "Practise like it's exam day." with "Walk in ready." in a navy-to-logo-blue gradient; navy pill CTA with a sky arrow disc and a play-disc secondary link; a three-item trust line (no ratings or client counts); the mobile launch illustration ported to web SVG in place of the reference portrait, floating in CSS; a glass "score growth" widget whose bars grow in; a five-card row (ribbon, pleat and bloom satin shapes in brand blues, a navy statement card, a sample result breakdown). Cards lift and arrows shift on hover; the art moves slightly.
- About band: two-column intro with gradient-highlighted words, four stat cards stating decided product facts (100% reviewed, 3 exam categories, 5 CBT question states, 2 devices) with count-up, one of them a navy CBT-palette visual. The reference's partner logo strip is omitted (no partners).
- Header: transparent state now uses dark text over the light hero; policy pages use the same light band. Old navy hero, preview and promise cards removed with their styles.
- Responsive: tablet stacks the hero and lays the cards out 3 + 2; phones get a swipeable card row and single-column stats.

Checks run: web typecheck, lint, `next build`; screenshots at 1440, 820 and 390 px and the privacy page; fixed the glass widget covering the clock, faint bars, an empty tablet card slot and an oversized tablet bloom; no horizontal overflow at 390, 820 or 1440; no page errors.

## 22 November 2026: glass navigation pill

- Owner nav reference (glassmorphism bars): the header is a floating frosted pill inset 16 px from the top and within the page container, 8 px padding on all sides; translucent white with a top sheen, white hairline and soft shadow, more opaque once scrolled. Log in and Start free share an inner glass segment; the phone menu is a matching glass panel under the pill (Escape and link choice close it). Hero and policy pages get more space above the content.
- Build pitfall fixed: Lightning CSS dropped the standard `backdrop-filter` when `-webkit-backdrop-filter` was also declared, and minified `blur() saturate()` into an invalid value, so Chrome rendered no blur (this also affected the hero glass widget). Write only the standard property with a single `blur()`; the build adds the prefix.

Checks run: web build; computed `backdrop-filter: blur(18px)` on the pill; screenshots at the top, after scrolling and with the phone menu open; no horizontal overflow at 390, 820 or 1440 px.

## 22 November 2026: micro-interactions, section fades, slide in/out

- Section fade: `SectionFade` (public layout) adds a 28 px fade-up to every section below the first screen as it scrolls into view. Classes are added only after hydration, so crawlers, no-JS visitors and reduced-motion users see every section immediately.
- Slide in and out (Motion, `Reveal once={false}` with `left`/`right`/`up`/`scale` variants): How it works steps from the left, feature cards from alternating sides, exam cards scale, examiner points from the right, app benefits from the left, About stats and showcase highlights rise. They leave when scrolled past and return in either direction.
- Micro-interactions (CSS): button lift and press, arrow nudges, growing underline on footer and text links, logo tilt, card lifts site-wide, icon pops, eyebrow rule that draws in with its section, step rule and number, FAQ row highlight and text shift, examiner point highlight, palette chips, store button lift, dashboard row and sidebar hovers, glass widget lift with bouncing bars, trust ticks and result dots, rotating spark, gently bobbing notification cards.
- Hover lifts on Motion-animated elements use the CSS `translate` property (Motion leaves an inline `transform` that would otherwise override them); hero load animations use `backwards` fill so hover transforms apply afterwards. `main { overflow-x: clip }` restored for side slide-ins.

Checks run: web typecheck, lint, `next build`; in Chromium: sections fade in when reached, steps slide out (opacity 0) after scrolling past and back in, exam card hover gives `translate: 0 -3px` after its reveal, no horizontal overflow while scrolling at 390 and 820 px, no `sf-init` under reduced motion or without JavaScript, no page errors.

## 22 November 2026: demo catalogue in Supabase staging

- `packages/db/seeds/demo-catalogue.mjs` (`seed:demo`) writes the mobile demo data (`seeds/demo-catalogue.json`, exported from `apps/mobile/src/lib/demo`) into the real schema: 3 categories, 3 exams with stage, official-pattern template and sections, 10 subjects, 89 topics, 4 examiner personas (approved, placeholder Firebase IDs nobody can sign in with, no KYC or bank details), 100 approved questions with keys and solutions, 3 series and 11 live tests (4 free, 7 paid at the demo's placeholder prices) with 29 sections and 290 QC-approved items.
- Deterministic IDs and skip-if-present, so re-runs add nothing and published tests are never edited. Staging requires `APP_ENV=staging` plus `CONFIRM_DEMO_SEED=staging`; production is refused.
- No student accounts, purchases, entitlements, attempts, ratings or coupons were created.

Checks run: local run then re-run (no new rows); staging run over the session pooler with verified TLS, then re-run (no new rows). As `exam_app` on staging: 3 exams, 11 live tests, 3 series and 4 examiners visible; questions not readable directly (RLS; students receive them through `get_test_questions_for_attempt`). Database integration tests 34/34 passed.

## 22 November 2026: public catalogue API

- Contracts `packages/contracts/src/catalogue`; API module `apps/api/src/modules/catalogue` (controller, service, parameterised repository). Endpoints: `GET /v1/exams`, `/v1/exams/:id`, `/v1/tests` (filters, search, keyset cursor), `/v1/tests/:id`, `/v1/series/:id`, `/v1/examiners/:id`. Public, no sign-in; short public cache headers.
- Only live tests of active exams by approved examiners and published series are returned. Responses are positive allowlists: no questions, keys, solutions or examiner contact/KYC/bank fields.
- Migration 006 adds `public_examiner_cards` (DATA_MODEL) so examiner names can be shown without opening `profiles` to the API role. Applied locally and on staging (schema version 6); on staging `anon`/`authenticated` cannot execute it, `exam_app` can.

Checks run: lint, typecheck, unit and integration suites across the workspace (new `apps/api/test/integration/catalogue.test.mjs`: counts and ordering, full pagination without duplicates, filters and search, no leaked keys in any payload, drafts/unpublished series/suspended examiners hidden, malformed input rejected). Built API probed against the local database and against Supabase staging: all six endpoints returned the seeded data.
Not done: authenticated per-student fields (owned, attempted, followed), OpenAPI generation, clients still read the bundled demo data.

## 22 November 2026: web catalogue pages (W2b)

UI/UX Pro guidance applied (local search: server-component data fetching, metadata API, error.tsx, no-results with a next step, wrapping filter chips, URL deep links); design MASTER tokens and card rules.

- Pages in `apps/web/app/(public)/(catalogue)`: `/exams` (exam cards with live/free counts, next exam date, last cutoff), `/exams/[slug]` (pattern facts, filter chips as URL links, test grid with cursor "More tests", official pattern table, syllabus, free-test, key-date and subject side cards), `/tests/[slug]` (facts, price card, sections and marking table, rules derived from the test's own sections, examiner and series links, more tests), `/series/[slug]` (tests in release order, price and validity), `/examiners/[id]` (tier, followers, exams, series, latest tests).
- Data: `src/lib/api/catalogue.ts` reads the public API server-side, validates every response against the shared contracts, caches for 60 s; `API_BASE_URL` (server) points at the API. Pages render per request, so builds do not need the API.
- States: error page with retry; real 404 status for unknown or malformed ids (no streaming loading screen, which would have turned 404s into 200s); empty states with a next action.
- SEO: per-page titles, descriptions and canonicals, BreadcrumbList JSON-LD, sitemap now lists exams, tests, series and examiners from the API (falls back to static pages when the API is unreachable). Header/footer "Exams" go to `/exams`; landing exam cards link to their exam pages.
- `check:public-env` allowlist gains `NEXT_PUBLIC_SITE_URL` (public canonical origin, added in W0); CI would otherwise fail.

Checks run: workspace lint, typecheck and build; `check:public-env`. Against the local API and database, every page at 1440, 820 and 390 px: 200 status, no horizontal overflow, no element past the phone viewport, no page errors; unknown test/exam/series/examiner return 404 with noindex. Fixed during review: hidden card on the exam index (now one grid), free-test card saying "or in the series", single-column overflow on tablets and phones.
Open: `/sign-in` (W2a) is linked from Start/Buy buttons and still 404s; buying needs web payments (M9a); per-student state (owned, attempted, followed).

## 23 November 2026: authentication and authorization end to end (AU1, AU2)

AU1 API authorization:

- `RolesGuard` with `@Roles(...)` and `@RequireAdminPermission(...)` (`apps/api/src/modules/identity/http/roles.guard.ts`), used after `FirebaseAuthGuard`; `IdentityService.resolveAccess` requires a verified email, an unblocked account and an active registered device, and reads roles and admin flags from the database on every request. `IdentityModule` exports the guards for domain modules. New contract error code `FORBIDDEN` (additive).
- No production route needs a role yet (all current routes are public or self-service); examiner, QC and admin endpoints adopt the guard from M3.

AU2 website log in and sign up (`apps/web`, Firebase JS SDK 13.4.0 pinned, same as mobile):

- `/sign-in` (Log in / Sign up switch, 18+ confirmation before any method, Google popup, email and password with show/hide, inline field errors and a focused error summary), email verification step (check, resend with 60 s cooldown, use another account), two-device limit step (remove a device and continue), blocked and existing-account errors (no merge on email, invariant 10).
- `/forgot-password` (same confirmation whether or not an account exists), `/onboarding` (name, target exams from the catalogue API, stage, language; PATCH /me), `/account` (profile, preferences, devices with remove, log out).
- `AuthProvider` registers the browser as a `web` device through POST /identity/session and keeps the device id in local storage; `RequireSession` sends signed-out visitors to `/sign-in?next=` and first-time students through onboarding; `next` accepts same-site paths only. Header shows "My account" once signed in (UI hint only).
- Auth pages are `noindex, nofollow`; Firebase is not loaded on marketing or catalogue pages.

Checks run: workspace lint, typecheck, unit tests, build, `check:public-env`, smoke test; integration 34 database + 19 API (4 new authorization tests: token and device required, role and admin-flag matrix, role removal/blocking/device revocation effective on the next request). Browser at 1440 and 390 px against the local API and the real Firebase project, without creating accounts: protected pages redirect with `next`, validation and 18+ errors, focused error summary, Firebase wrong-password message, password reveal, reset request (HTTP 200, neutral message), noindex, no overflow, no page errors, zero Firebase requests on the landing page; CORS preflight allows the website origin and refuses others.
Not run: a full sign-up with a real inbox and a Google popup (needs a real account; owner to try), Firebase Auth emulator end-to-end (CLI not installed, API does not accept emulator tokens). Open: rate limiting on /identity/session, account deletion/export (security audit list), Sign in with Apple (A1).

### 23 November 2026: smoother website sign-in (owner feedback)

Owner could not sign in or up. Causes found: only the website dev server was running (the API on 3001 was down, so every sign-in stopped after Firebase), and closing or losing the Google popup showed a red "closed before it finished" error.

- 18+ confirmation is now a statement beside the buttons ("By continuing, you confirm you are 18 or older…") instead of a tick box that blocked Google and email. The app still uses the tick box; align when the owner confirms.
- Google: closing the window is silent; blocked popups fall back to a full-page redirect; the button frees itself about a second after the person returns to the page (Firebase otherwise needs ~9 s because Google's COOP hides the closed window).
- Email verification continues on its own (checks every 4 s and on tab focus) after the link is clicked; the manual button stays as a backup.
- Server unreachable: "Connecting to MakeMePrepare" with automatic retries (2 s doubling to 30 s, and on focus) instead of an error; "Signing you in…" shows immediately after Firebase accepts.
- Fixed: "Use a different account" during the last second of sign-up left the form unable to submit; it is disabled until sign-up finishes.

Checks run against the owner's running dev site and the real Firebase project with synthetic `@example.test` accounts (deleted afterwards): sign-up reaches "Check your inbox" in about 2.5 s; unverified log-in lands on the same step; switching account and logging in again works; closing Google shows no error and re-enables the button in about 1.4 s after focus returns; no page errors. Web typecheck and lint pass. Not run: completing Google or a real inbox verification (needs the owner's account).

### 23 November 2026: auth alignment with the PRD (18+, landing page, first admin)

- 18+ is now recorded, not assumed (migration 007, DATA_MODEL): `is_age_verified_18_plus` defaults to FALSE with `age_confirmed_at`; existing profiles keep their sign-in confirmation; users cannot withdraw or rewrite it. `Profile.ageConfirmed` added; `onboarded` requires a stage and the confirmation; PATCH /me accepts `ageConfirmed: true` and refuses a stage without it (`AGE_CONFIRMATION_REQUIRED`). Supersedes the "statement beside the buttons" above.
- Website: sign-in has no age step (legal line only); onboarding asks once with a tick box, hidden when already confirmed (accounts made in the app, which still confirms at sign-in). After onboarding, or signing in with nothing requested, students go to their first target exam (`/exams/<slug>`), else `/exams`; a requested `next` still wins. Exam pages addressed by id redirect (308) to the slug URL.
- First super admin: `pnpm --filter @exam-prep/db bootstrap-super-admin` (owner connection; email typed twice; existing, unblocked, non-demo account; refuses once any super admin exists; audited in the same transaction). Later staff roles are granted by an admin in the product (M2/M3), not by invite or sign-up.

Checks run: integration 37 database (3 new: bootstrap refusals/grant/audit, blocked and demo refusals, 18+ recorded and not withdrawable) + 21 API (2 new: website age-in-onboarding, app age-at-sign-in), workspace unit tests (mobile fixture updated for `ageConfirmed`), web build, typecheck and lint. Browser at 1440 and 390 px against the local dev site and the real catalogue API, with Firebase and the identity API mocked: new web account sees the 18+ tick only in onboarding, blocked submit sends nothing, PATCH carries `ageConfirmed: true`, lands on `/exams/ibps-po`; app-made account has no tick and no `ageConfirmed` in the PATCH; onboarded account lands on its first exam; `next=/account` is honoured; no overflow or page errors.
Not run: the same flow with a real verified account (needs a real inbox or Google account).
Staging: migration 007 applied 23 November 2026 with the owner's go-ahead; schema version 7, default FALSE, all 4 existing (demo persona) profiles keep a confirmation time, API role still reads the catalogue.

## 23 November 2026: M2 catalogue (admin)

An ops (or super) admin sets up a complete exam through the website: category, exam, stages, syllabus tree (subjects and topics), exam page details (syllabus, dates, cutoffs) and the pattern template (sections, counts, timing, marking, topic targets), then publishes it and shows the exam on the website.

- Migration 008 (DATA_MODEL): template drafts, publish freeze (template and sections), versions that retire the version they replace, hierarchy consistency, tests only on published active templates, admin-only hierarchy writes. Demo seed and fixtures publish after creating sections.
- API `/v1/admin/catalogue/*` (API_CONTRACTS) behind `RolesGuard` + ops permission, checked again in the service; every change runs under the admin's database identity and is audited with a named `catalogue.*` action and before/after state. Stale saves 409 `STALE_EDIT`; in-use deletes 409 `IN_USE`; publish 422 `TEMPLATE_NOT_PUBLISHABLE` with the reasons; published 409 `TEMPLATE_LOCKED`. New error codes are additive.
- Shared `templateIssues` (contracts) gives the editor the same publish checks as the API. Public exam pages use the first stage's published, active template.
- Website `/admin` (noindex): exams and categories, exam page (details with unsaved-change warning, stages, syllabus tree with bulk topic entry, templates, recent changes from the audit log), template editor (live totals and publish checklist, confirm dialogs, read-only when published, new version, retire/reinstate, delete draft). Accounts without the admin role see a staff-only message; staff skip student onboarding for the console.

Checks run: workspace lint, typecheck, unit tests (6 new template-rule tests) and build; integration 41 database (4 new: freeze, consistency, published-template-only tests, admin-only writes with audit) + 23 API (2 new: permission matrix, full lifecycle with conflicts, locking, versions, public page and audit). Browser at 1440 and 390 px on the local website against the API in test mode on an isolated database (Firebase mocked with locally signed tokens; first admin made with the bootstrap script): every step above passed with no page errors or overflow. Fixed during testing: topic de-duplication kept the wrong spelling, staff were sent to student onboarding, a subject panel collapsed after adding topics, the template editor showed "Unsaved changes" on load, the exam details form lost its "Saved." confirmation, and the admin shell lacked a Suspense boundary for the production build.
Staging: migration 008 applied 23 November 2026 with the owner's go-ahead; schema version 8, the 3 demo templates count as published, 7 admin-only triggers present, API role still reads 3 exams and 11 live tests.
Not run: the admin console against staging or with real Firebase accounts. Not in M2: price tiers (O04), PYQ Excel upload (M4), per-exam AI toggles (M12), staff role grants (with M3/M11). Real exam patterns need founder and subject-lead confirmation (O01).

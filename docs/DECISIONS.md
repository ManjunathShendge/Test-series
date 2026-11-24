# Decisions, assumptions, and conflicts

Status date: 12 November 2026. This is the canonical reconciliation of the supplied sources, not a claim that every business decision has been approved.

## Precedence

Latest explicit decisions in requirement.text > original PRD for the affected subject > earlier draft text. SKILL.md governs UI guidance. Architecture refinements below resolve technical omissions without changing commercial policy. The PRD transcription preserves superseded material for traceability; do not implement it without this overlay.

## Confirmed in the supplied requirements

| ID | Decision | Consequence |
|---|---|---|
| D01 | Google and verified email at launch; Apple alongside Google on iOS | Phone optional/unverified; OTP disabled |
| D02 | Razorpay web, native store billing in apps | No external checkout promotion in mobile; cross-platform entitlements |
| D03 | Fixed price tiers | Examiner selects permitted tier; server freezes price/product snapshot |
| D04 | Modular monolith, PostgreSQL, pg-boss, shared TS engine | Three apps and three shared packages; no new stateful server database |
| D05 | Human review and immutable publishing | Every question approved before publish; AI suggestions separate |
| D06 | Android, iOS, web at launch | Native billing and Apple authentication are MVP deliverables |

## Reconciliation and engineering decisions

| ID | Conflict/omission | Resolution |
|---|---|---|
| E01 | Pass appears in overview but build phases place it later | MVP sells tests/series only. Pass sales, reminders and pool enabled together in Phase 2 |
| E02 | “Offline-first” versus offline mode deferred | MVP tolerates temporary loss of connectivity during an online-started attempt; no offline starts or unlimited late uploads |
| E03 | pg-boss enqueue assumed inside arbitrary Prisma transaction | Write outbox in Prisma transaction; dispatcher publishes with event ID; consumers dedupe |
| E04 | AI updates conflict with frozen versions | Store AI output in separate suggestion records; expose ai_suggestion as read-model field; human acceptance creates a version |
| E05 | One account “per email” | Firebase UID identifies account. Linking requires proof of both identities; Apple relay addresses may differ |
| E06 | Account token set equal to order ID everywhere | Stable opaque billing account identity plus provider-supported purchase correlation; prove exact item mapping in store spike |
| E07 | Consumable tier purchase restores permanent content | Treat product type as provisional; prove recovery/approval before M9b. Backend restores owned content; stores cannot recover consumed transactions alone |
| E08 | Auto-hide would mutate frozen papers | Quarantine question and block new starts for affected published versions until replacement reviewed; never silently shorten a paper |
| E09 | “No answer ever lost” versus offline deadline | Retain local events, but score only server-accepted events. Strict server deadline; unsynced late events require explicit support policy |
| E10 | All SDKs confined to API | Backend adapters contain privileged SDKs; client adapters necessarily contain native auth/billing SDKs |
| E11 | Old free-tier prices and quotas | Historical input only. No guaranteed budget/limits; validate vendor quotes and residency before provisioning |
| E12 | Admin “minor edit” and locked questions | New version, validation and approval of the exact edited version; audit the action |
| E13 | Student item stats MVP versus examiner stats Phase 2 | MVP results compute aggregate benchmarks; examiner-facing question-stat dashboard deferred |

## Proposed defaults and owner gates

| ID | Proposed default | Owner / when required |
|---|---|---|
| O01 | SSC CGL Tier 1, IBPS PO Prelims, RRB NTPC CBT 1 | Founder + subject lead before production templates; verify official patterns, never assume all contain 100 questions |
| O02 | PYQ cap 10%, English required, Hindi optional but complete when declared | Founder before enforcing content policy in production |
| O03 | 65% direct / 75% examiner-code share; 50% Pass pool; multiplier 1.0 | Founder before live money; tax/fee definition with finance |
| O04 | Same target prices across channels; mobile codes attribution only | Founder before price-tier/product creation; display actual localized store price |
| O05 | 18+ gate; license type unchosen | Founder/legal before onboarding/public launch; do not invent legal agreement |
| O06 | AI off until approved provider/data terms and spend cap | Founder before external question transmission |
| O07 | 20 or 50 tests per exam; 20+ examiners; reviewer staffing | Founder/ops before content acquisition commitments |
| O08 | 2,000-5,000 concurrent live attempts | Founder picks exact target before live-test load certification |
| O09 | GST/TDS rates, retention, invoice issuer for store purchases | CA/legal before live commerce; receipt-only store handling is provisional |
| O10 | **Resolved 22 November 2026 (owner):** product name MakeMePrepare, domain makemeprepare.com, logo MMP-logo.png (see V7-V9) | Store listing copy and trademark search remain founder tasks |
| O11 | India-hosted core data; external provider transfers reviewed | Engineering/legal before provider selection |
| O12 | Strict receive-before-deadline acceptance, 30s finalizer delay only | Product before M7; delay grants no extra answering time |
| P-QC1 | QC fast lane (PRD 5.5) = Top tier: the queue orders Top tier first, then flag count, then the 48h SLA deadline. Verified and New share the standard lane | Founder/ops before staffing reviewers; one ORDER BY in `qc.repository.ts` changes it |
| P-QC2 | A failed second review (PRD 5.3.7) is recorded for the admin team and does not unpublish the test automatically. Reviewer "Minor edit" is built (24 November 2026): it creates a new question version, re-runs content, bilingual and copy checks, and is approved when the review finishes | Ops before launch |
| P-PAY1 | Web refunds: full refund through Razorpay within 7 days of payment when no covered test has been started; admin-recorded with a reason; access ends at once. Partial refunds are not offered | Founder/finance before live money |
| P-PAY2 | Payouts: GST-inclusive prices at `GST_RATE_PERCENT` (default 18); examiner share of net revenue (after GST and Razorpay fee) 65% or 75% with their own code (O03); TDS default 10% set per calculation; KYC verified, first payout held one cycle, ₹500 minimum, balances carry forward | CA/finance before live money (O03, O09) |

Open items do not prevent M0, contracts, fake adapters, or synthetic fixtures. They gate only the dependent production behavior. Record each resolution with date, owner, evidence, and affected requirement IDs.

## Mobile stack note, 12 November 2026

Source preserved verbatim at [sources/MOBILE_STACK_NOTE_2026-11-12.md](sources/MOBILE_STACK_NOTE_2026-11-12.md).
It is owner-supplied input, not an automatic override: where it restates an engineering
omission it is adopted below; where it reverses a decision already confirmed in
requirement.text it is held as a conflict (C1-C4) until the owner rules.

| ID | Note item | Resolution |
|---|---|---|
| E14 | Durable attempt storage in MMKV | Durable answer log stays in SQLite per MOBILE.md: it is transactional and survives partial writes, which an mmap key-value store does not guarantee. MMKV is permitted for small non-authoritative state (server-time offset, last route, cached safe config). Revisit only with S2 write-latency evidence |
| E15 | Shared packages named `attempt-core` and `api-types` | Same role as existing `packages/engine` and `packages/contracts`; keep ARCHITECTURE names. The note's tree also omits `apps/api`; NestJS API and worker remain as specified |
| E16 | Attempt sub-routes instructions/attempt/summary/result | Adopted under `apps/mobile/app/attempt/[id]/`. Tab labels stay Home, Discover, Progress, Profile per MOBILE.md; "Search" is the same surface |
| E17 | Timer from a server offset refreshed on every sync, never from setInterval or device clock | Adopted as the explicit statement of MOBILE.md anchored monotonic time. Re-anchor after process restart; no wall-clock-derived extra time |
| E18 | Server-rendered KaTeX as the default renderer | Kept as an S2-gated choice, not a commitment. The note's own decision 7 agrees that the single-WebView renderer needs a low-end Android benchmark first |
| E19 | Server-issued device ID in secure storage; ANDROID_ID secondary only | Adopted; consistent with API_CONTRACTS, where a device ID is an identifier and not authentication |
| E20 | PostHog Cloud residency conflicts with India-hosted data | Recorded against O11. Analytics residency is decided with hosting, not separately; self-host or disclose, and never send question content or KYC to analytics |
| E21 | Malware scan before examiner assets are accepted | Use the digest-pinned ClamAV 1.4.3 daemon over a private TCP connection. The API fails closed when scanning is unavailable, copies clean bytes to a server-only object key, and never equates a clean scan with manual KYC verification. Deployments must provision a private scanner endpoint and keep signature updates healthy |

Also adopted as refinements, consistent with existing docs: no `expo-updates` reload during an
active attempt; signed asset URLs reissued on attempt resume (already `GET /attempts/:id` paper
URL refresh); generic price-point store products mapped server-side rather than one product per
test; net revenue in O03 defined after store fees; backend-only entitlement grant after verified
purchase; question content excluded from Sentry and PostHog.

### Conflicts resolved 13 November 2026

Resolved by research against vendor documentation, at the owner's instruction. Each is reversible
by a dated owner decision; the engineering reasoning is stated so it can be argued with.

| ID | Resolution | Basis |
|---|---|---|
| C1 | No phone OTP at launch. D01 stands: Google, verified email, and Apple on iOS | The note justified OTP by Apple guideline 4.8, but 4.8 is satisfied by offering Sign in with Apple, which D01 already requires. OTP adds Indian SMS cost, an APNs key and a reCAPTCHA fallback path on iOS for no compliance gain. Phone stays optional and unverified |
| C2 | iOS: Apple IAP, no choice. Android: Play Billing only for MVP; user choice billing deferred to Phase 2. D02 stands | Apple external purchase link entitlement covers the EU, Japan and Brazil only, so IAP is mandatory for Indian digital goods and the note's "web-only iOS" option carries real rejection risk under 3.1.1. On Android user choice billing is genuinely available and cuts the fee by 4 points, but it requires a second billing path, alternative-billing APIs, transaction reporting, and its own refund, invoice and reconciliation flows, all touching invariant 7. Revisit when volume makes 4 points worth a second money path |
| C3 | Strict receive-before-deadline acceptance. E09 and O12 stand; no grace window for late batches | A network-dependent grace window gives two students who stopped at the same instant different amounts of answering time. Unsynced late events are a support-policy matter, not a scoring one. The 30s finalizer delay remains server-side and grants no extra answering time |
| C4 | Third concurrent device is blocked, not silently swapped. The student revokes a device themselves | Matches the M1 acceptance criterion already written. Silent revocation of the oldest device would end another live attempt. A monthly swap cap stays open as anti-abuse tuning, not a launch blocker |

### Versions validated 13 November 2026

Checked against vendor sources; still subject to M0 compatibility resolution as a set.

| Claim in the note | Verified position |
|---|---|
| Expo SDK 55 or later | SDK 58 is current (React Native 0.88, built for iOS 27). Target 58; SDK 55 is two releases stale |
| `react-native-iap` v14+ or `expo-iap` | Use **expo-iap**. react-native-iap dropped Expo support at v15.0.0 and is for bare RN CLI projects; both are maintained in the OpenIAP monorepo. This is now a correctness issue, not a preference |
| `react-native-mmkv` v4, `createMMKV()` | Confirmed: v4 is a Nitro Module, `createMMKV()` replaces `new MMKV()`, `.delete()` became `.remove()`, needs `react-native-nitro-modules` and the New Architecture. Scope limited by E14 to non-authoritative state |
| iOS screenshots prevented from iOS 13 | Broadly correct, and better than expected: the module layers a secure text field so app content does not appear in the screenshot. The screenshot still occurs. Keep the watermark and verify on real devices |
| `react-native-razorpay` 2.3.1+ | Not applicable on mobile under C2. Razorpay stays web-only |

M0 still pins the full set together against official documentation; no single version above is pinned in isolation.

### Mobile demo build, 15 November 2026

These record how the client demo was built. None changes a launch invariant. Items marked proposal still need the named owner.

| ID | Decision | Rationale and limit |
|---|---|---|
| X1 | The demo runs in Expo Go, not a native development build | The React Native Android CMake step fails when the repository path contains a space, as "Client projects" does. Junction and subst workarounds fail because Expo and Gradle canonicalise the real path. The fix is to move the repository to a path without spaces; that is an owner call. Expo Go shows Expo branding and cannot load expo-iap, so store billing stays simulated until the move. Update 19 November 2026: the owner moved the repository to `Client-projects\Test-series` (no spaces), which removes the path blocker; a native Android build has not been retried. The owner tests on a physical iPhone in Expo Go and no longer uses an Android emulator. The Expo Go limits above still apply until development builds (milestone D) |
| X2 | Demo state persists in SQLite (expo-sqlite key-value store) through zustand persist; owner chose SQLite on 15 November 2026 | Gives PRD 6.4 resume behaviour on device for the demo. Data moves to the server database once the API exists. Production keeps E14: the attempt event log commits to SQLite before the UI acknowledges a save, and the server stays authoritative for time, score and entitlement |
| X3 | Navigation hooks come from expo-router only | expo-router 58 vendors React Navigation core. A separately installed @react-navigation package has no navigation context and crashed the attempt screen. Do not add @react-navigation packages directly |
| X4 | Proposal: prices display as GST-inclusive at 18% | Display only, pending O09 with the CA. Integer paise throughout; fractional amounts render with paise |
| X5 | Proposal: coupons and examiner codes map to discounted store products on the server | Play and App Store prices cannot change at runtime. The demo previews the discount on the client; the server must validate the code against the receipt and record attribution for the examiner revenue share. Needs S4 to settle the SKU strategy |

## M0 implementation refinements (16 November 2026)

- Pin Node 22.23.5 in `.node-version`, CI and images; it meets the existing engine range.
- PostgreSQL host port defaults to 15432 after Windows rejected 5432. Override `POSTGRES_PORT` and all three database URLs together.
- Local MinIO builds official release `RELEASE.2025-09-07T16-13-09Z` from source after the official Quay image returned 401. The architecture stays S3-compatible. Source: https://github.com/minio/minio/tree/RELEASE.2025-09-07T16-13-09Z .
- M0 seeds an infrastructure marker only. Synthetic accounts and a paper await their domain schemas in M1-M5.
- Empty contracts/engine/web unit suites explicitly allow no tests. Real database integration tests are separate and never silently skip missing infrastructure.

- Upgrade pnpm from 11.12.0 to 11.13.1: the npm registry marks 11.12.0 as broken and explicitly recommends 11.13.1 or newer. Use the same pin in CI and images.

## SQLite storage decision (16 November 2026, owner instruction)

> Superseded on 18 November 2026 by "PostgreSQL on Supabase" below.

The owner requested SQLite for all application storage, including authentication, authorization and billing records. This supersedes earlier PostgreSQL, pg-boss and S3 storage decisions. Server data and file BLOBs use one SQLite file; mobile keeps its existing local SQLite cache. API and worker share the server file on one host with WAL, foreign keys, a busy timeout and short write transactions. No network filesystem or multi-host shared-file deployment. SQL migrations are checksummed and transactional. SQLite does not supply database roles: authorization belongs to API services, and OS permissions protect the file. Payment verification still uses the approved payment providers; selecting SQLite does not implement or bypass checkout/authentication workflows. Existing PostgreSQL/MinIO volumes are preserved, not converted or deleted.

## PostgreSQL on Supabase (18 November 2026, owner instruction)

Supersedes the 16 November SQLite storage decision for server data. D04's PostgreSQL requirement stands again; SQLite remains the mobile on-device store (E14, X2).

- **Provider:** Supabase managed PostgreSQL in the Mumbai region (ap-south-1) for staging and production. Local development and CI use PostgreSQL 17 in Docker, matching the Supabase major version (17.12 observed on 18 November).
- **Supabase scope:** database only. Firebase stays the identity provider (D01). Supabase Auth, the Data API (auto-generated REST endpoints, which must be disabled) and Edge Functions are not used; the NestJS API is the only path to data, so the server keeps authority over entitlement, price, time and score. Supabase Storage may be evaluated later as the S3-compatible object store.
- **Connections:** API through the transaction pooler (port 6543); worker and migrations through the session pooler (port 5432). Direct connections are IPv6-only and are not used. TLS verifies Supabase's CA certificate in deployed environments.
- **Data access:** `pg` (node-postgres) with parameterized SQL, a checksummed transactional SQL migrator and a PostgreSQL job table claimed with `FOR UPDATE SKIP LOCKED` and leases. This replaces the earlier Prisma and pg-boss choices in D04/ARCHITECTURE: it works through the transaction pooler without prepared-statement settings, keeps one migration format, and preserves the tested idempotency, append-only and lease semantics. Revisit if domain work shows a clear need for an ORM.
- **Files:** binary content leaves the database. The SQLite `stored_files` BLOB table is not carried over; object storage is chosen when file uploads are built.
- **Roles:** migrator (schema owner), `exam_app` and `exam_worker` (row access only) locally and on Supabase; `provision-roles` creates the hosted roles and revokes Supabase's `anon`/`authenticated` table access.
- **Row-level security (19 November 2026):** Supabase auto-enables RLS on new tables. Keep it on everywhere with one policy for the two service roles, applied by the migrator after every run, rather than disabling it. API services remain the authorization layer.
- **Push notifications:** unaffected. Expo Push stays the provider (NOTIFICATIONS); Supabase has no push delivery service.
- Plan tier, backups and point-in-time recovery terms must be confirmed on the Supabase plan before production (E11).

## Database schema source (19 November 2026, owner instruction)

`Supabase_Database_Schema_Documentation.md` v1.1 (SHA-256 `1b8d0530…0a1d`, client-confidential, gitignored) is the authoritative data model. Implement its tables, columns, enums, indexes, triggers and functions as written, except where the owner directed the PRD to prevail and the three technical corrections below. Each deviation is listed in DATA_MODEL with its reason.

PRD prevails (owner direction):

- **Sign-in is Firebase (PRD tech stack).** `profiles.id` is a generated UUID with a unique `firebase_uid`; there is no `auth.users` reference. Schema uses of `auth.uid()` become `public.current_user_id()`, which reads the transaction-local `app.user_id` setting the API sets after verifying the Firebase token. Supabase Storage object policies keyed on Supabase sessions are not created; the API authorizes file access and issues signed expiring URLs (PRD storage row).
- **Live tests are versioned, not edited (PRD p.4).** Approved questions are immutable apart from statistics and report counters. A key correction creates a new question version and an append-only correction record; rescoring reads that record instead of overwriting `correct_option`.
- **Tests go live only on QC approval (PRD p.4).** Examiners may create and edit their own tests only in draft or changes-requested states and may submit them; approval, scheduling, publishing and price changes after submission happen through reviewer/admin functions.
- **Approved questions stay locked during revisions (PRD p.4).** Examiners cannot change approved or QC-locked questions.
- **Audit log on every admin action (PRD p.9).** `admin_audit_logs` is append-only, and admin mutations write it in the same transaction.

Technical corrections:

- Store billing columns and identifiers on `purchases` for Apple IAP and Google Play Billing (D02/C2 postdate the PRD); the M0 `billing_events` inbox and append-only `ledger_entries` remain for idempotent, verified fulfilment.
- `profiles.phone` is not unique: phone is optional and unverified (D01/C1).
- Every `SECURITY DEFINER` function sets `search_path` explicitly.

Row-level security: the schema's policies apply to the API role. Tables without schema policies keep the blanket service policy. The worker role keeps blanket access for system jobs (rescoring, payouts, fulfilment). Where the API must write rows the schema only lets users read, a policy scoped to `current_user_id()` is added and noted in DATA_MODEL. M0 primitives `users`, `roles`, `user_roles`, `sessions`, `billing_orders` and `audit_events` are replaced by `profiles`, `profiles.roles`, Firebase, `purchases` and `admin_audit_logs`.

The schema's revenue split, Pass pool, payout minimum and SLAs match the PRD. Its fixed 10% TDS and 18% GST defaults remain parameters pending the CA (O09), and net revenue after store fees remains O03.

## Mobile visual identity (19 November 2026, owner instruction)

The owner supplied three references: a three-slide 3D onboarding (launch experience), a set of dashboard and analytics screens (in-app layout), and a seven-colour palette (identity). The references set structure and look only; finance, events and health content in them is not product scope.

| ID | Decision | Rationale and limit |
|---|---|---|
| V1 | Brand palette is exactly #001D39, #0A4174, #49769F, #4E8EA2, #6EA2B3, #7BBDE8, #BDD8E9, plus white and two pale tints of #BDD8E9 for the canvas and muted surfaces | Owner palette. Navy carries launch screens, hero cards and the tab bar; ice/sky/cyan tint the dashboard tiles. Text pairs were checked: navy on white/ice/sky/cyan/teal and white on navy/navy-blue/steel all pass 4.5:1; #4E8EA2 and #6EA2B3 never carry white text |
| V2 | Exam-state colours stay outside the palette: green answered/correct, red not answered/wrong, purple marked for review, amber warning | They mirror the official CBT interface students train for, and correct/wrong must read instantly. Used for state only, always with an icon or shape cue |
| V3 | In-app screens are light (pale ice canvas, white and tinted cards); only launch, sign-in header, hero cards and the tab bar are navy | Reference 2 is light, and long question reading is easier on a light surface. The pasted spec's "navy app background" was not applied to content screens |
| V4 | Fonts: Outfit (headings, large figures) and Inter (body, labels, tabular numbers), bundled via @expo-google-fonts 0.4.x; type scale one step smaller than the first scale at the owner's request, captions held at the 12px floor | ui-ux-pro-max typography search ("Geometric Modern", "Inter System"). Neither family has Devanagari; Hindi falls back to the system face per glyph. Verify Hindi questions on device |
| V5 | Launch: three swipeable intro slides before sign-in, shown once per device; no "Later" action | No guest mode exists, so "Later" would lead nowhere. Illustrations are pseudo-3D SVG (react-native-svg 15.16.0, included in Expo Go) in the palette, not rendered 3D art; commissioned 3D art can replace them later |
| V6 | Navigation: floating navy pill tab bar, four tabs, active tab shows a sky pill with its label | Reference 2 pattern within MASTER's five-destination limit; laid out below content so nothing is hidden behind it. No centre "create" button: students do not create content |
| V7 | Logo blue #0569D6 (sampled from MMP-logo.png) joins the palette as `brand`: links, emphasis words, active and progress indicators and motion highlights on light surfaces. Primary buttons stay navy blue | Owner chose "add to palette" (22 November 2026). 5.25:1 with white either way and 4.87:1 on the canvas; 3.24:1 on navy, so never text on navy. Logo navy #051D40 is treated as palette #001D39 |
| V8 | Logo assets are derived from MMP-logo.png, never redrawn: transparent full logo, mark and wordmark, plus reversed versions (navy ink to white, blue kept) for navy surfaces; app icon is the mark on white | The original has a white background and navy ink that disappears on navy surfaces |
| V9 | Phase 1 UI track adds motion to the existing identity on web and mobile, without redesign: mobile uses react-native-reanimated (the web libraries do not run in React Native); web uses CSS, Motion and Lenis. No Three.js, GSAP or Lottie (owner, 22 November 2026). Rive and Anime.js only if a specific need appears. Every public web page meets the SEO rules in WEB.md | Owner Phase 1 brief. Reduced-motion preference is respected on both platforms |

## Sign in with Apple deferred (20 November 2026, owner instruction)

| ID | Decision | Rationale and limit |
|---|---|---|
| A1 | Mobile sign-in is Google plus verified email only; Sign in with Apple is deferred. Supersedes the Apple part of D01, D06 and C1 until revisited | Owner call. App Store Review Guideline 4.8 expects an equivalent privacy-focused login (in practice Sign in with Apple) in an iOS app that offers Google sign-in; email/password is unlikely to qualify because it cannot hide the email. Development builds and TestFlight are unaffected; **App Store submission is blocked until Apple sign-in is added or 4.8 is re-checked against its current text**. Android and web unaffected. Account-linking rules (E05, invariant 10) still apply when Apple is added |


## Question content format (24 November 2026, M3)

| ID | Decision | Rationale and limit |
|---|---|---|
| Q1 | Question, option, solution and passage text is plain text, never HTML. Math is `\( … \)` inline and `\[ … \]` display, rendered with KaTeX 0.19.1. Tables are pipe tables: a `\| a \| b \|` header line, a `\| --- \| --- \|` separator, then row lines (at most 10 columns and 50 rows). Everything else is literal text | Satisfies SECURITY "structured sanitization" without an HTML sanitizer: there is no markup to sanitize, and React escapes text. `\(` avoids the currency clash of `$`. `packages/contracts` holds the one parser (`parseRichText`) used by the API, web and later mobile, so the preview is what students see |
| Q2 | The API rejects malformed content on sample, draft and import save: unbalanced delimiters, ragged tables, and math KaTeX cannot parse. `\href`, `\url`, `\includegraphics` and `\html*` are rejected through KaTeX's trust hook; `maxExpand` 200 and `maxSize` 20 stop macro loops and oversized output | KaTeX renders untrusted commands as red text rather than throwing, so they are detected explicitly. Students never receive content that failed validation |
| Q3 | Rendering on mobile stays S2-gated (E18). This decision fixes the stored format only | The stored text needs no migration whichever renderer S2 selects |


## Web payments with Razorpay test mode (24 November 2026, owner instruction)

| ID | Decision | Rationale and limit |
|---|---|---|
| R1 | Web checkout uses Razorpay Orders and Checkout in test mode (`rzp_test_` keys in `.env`); live keys are refused outside production by the environment check | Owner choice. No real money moves in development |
| R2 | Access is granted only after the server verifies the Checkout signature and fetches the payment from Razorpay as captured for exactly the order amount; an authorized payment is captured by the server. The webhook (`payment.captured`, `order.paid`) runs the same idempotent fulfilment so a closed tab still delivers access | Invariant 7 |
| R3 | Razorpay calls never run inside a database transaction; the order receipt is the purchase id. Refunds look for an existing Razorpay refund before creating one | Retries never double-charge or double-refund |
| R5 | Test series are published by their examiner, with no admin or QC approval: the PRD has examiners own series and QC review tests only. A series can be published once one of its tests is live (so everything sold has passed review); admins keep "feature or unpublish" (PRD 8 Catalogue) | Owner instruction, 24 November 2026 |
| R4 | The Razorpay key secret and webhook secret stay in the API; the browser receives only the key id | Invariant 9 |

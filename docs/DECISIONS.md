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
| O10 | Product name/brand | Founder before store listings and public assets |
| O11 | India-hosted core data; external provider transfers reviewed | Engineering/legal before provider selection |
| O12 | Strict receive-before-deadline acceptance, 30s finalizer delay only | Product before M7; delay grants no extra answering time |

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

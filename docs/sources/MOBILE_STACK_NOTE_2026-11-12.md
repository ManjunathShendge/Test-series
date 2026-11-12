<!--
PROVENANCE: supplied by the project owner on 12 November 2026, pasted from another chat
session. Preserved verbatim below the rule as a source input, per CLAUDE.md
("Preserve the original sources"). Reconciliation against DECISIONS.md is recorded in
DECISIONS.md entries E14-E20; conflicts awaiting an owner ruling are listed in
PROJECT_STATUS.md. Do not implement this note directly without that overlay.
-->

---

# Exam Prep Marketplace: Mobile Stack and Engineering Guardrails (Corrected)

12 November 2026 · Replaces the earlier stack note · Checked against PRD dated 2 November 2026

## Summary

The original stack is kept, with five corrections (billing libraries, device ID, timer, iOS screenshots, sign-in) and eight additions the PRD requires. Seven items need a Phase 0 decision and are listed at the end.

## 1. Package stack

Everything below needs EAS development builds, not Expo Go. Use Expo SDK 55 or later, which runs only on the New Architecture.

| Area | Package | Notes |
|---|---|---|
| Navigation | `expo-router` | Typed routes; deep links mapped to the Next.js URLs |
| Local storage | `react-native-mmkv` v4 + `react-native-nitro-modules` | v4 uses createMMKV(), not new MMKV(); encrypt the test cache |
| State | `zustand` | Attempt logic lives in the shared package (section 2) |
| Server state | `@tanstack/react-query` | Catalogue, purchases, results |
| Questions | `react-native-webview` + bundled KaTeX CSS and fonts | One WebView, reused; math pre-rendered on the server |
| Test images | `expo-file-system` | Local files referenced from the WebView |
| Feed images | `expo-image` | Marketplace screens only |
| Content protection | `expo-screen-capture` | Android and iOS (section 4) |
| Auth | `@react-native-firebase/app` and `/auth`, `@react-native-google-signin/google-signin`, `expo-apple-authentication`, `expo-build-properties` | Static frameworks on iOS, each Firebase module listed under forceStaticLinking |
| Payments | `react-native-razorpay` 2.3.1+, and `react-native-iap` v14+ or `expo-iap` | Depends on the billing route (section 5) |
| Device identity | `expo-secure-store`, `expo-application` | Server-issued ID (section 4) |
| Push | `expo-notifications` | Per PRD section 10 |
| Observability | `@sentry/react-native`, `posthog-react-native` | Session replay off on test screens |
| Updates | `expo-updates` | Never reload during an attempt |

## 2. Repository structure

The web app also has a test engine, so the attempt logic sits in a shared package used by both clients.

```text
exam-prep/
├── apps/
│   ├── mobile/                       # Expo app
│   │   ├── app/
│   │   │   ├── (auth)/               # Phone OTP, Google, Apple, age gate
│   │   │   ├── (tabs)/               # Home, Search, Progress, Profile
│   │   │   ├── checkout/             # Billing route chosen in Phase 0
│   │   │   ├── test/[id]/
│   │   │   │   ├── instructions.tsx  # Rules, "I have read", asset download
│   │   │   │   ├── attempt.tsx       # Locked CBT screen
│   │   │   │   ├── summary.tsx       # Pre-submit confirmation
│   │   │   │   └── result.tsx        # Score, review, solutions
│   │   │   └── _layout.tsx           # Providers, attempt-recovery redirect
│   │   ├── src/
│   │   │   ├── components/cbt/       # Palette, Timer, QuestionWebView, Watermark
│   │   │   ├── components/marketplace/
│   │   │   ├── storage/              # MMKV instances, answer log
│   │   │   ├── services/             # api.ts, assets.ts, billing.ts
│   │   │   └── guards/               # deviceId.ts, appSwitch.ts, updates.ts
│   │   ├── app.config.ts
│   │   └── eas.json
│   └── web/                          # Next.js: student site, examiner portal, admin
└── packages/
    ├── attempt-core/                 # State machine, timer maths, sync protocol
    └── api-types/                    # Contracts shared with NestJS
```

`attempt-core` must have no React Native or DOM imports.

## 3. Test engine rules

**Timer**
- The server owns start and end times. The client stores a server-time offset at start and refreshes it on every sync response.
- Remaining time is always computed from that offset, never from a running `setInterval` or the raw device clock.
- The server auto-submits at end time. Sectional locks are derived from the server start time where section order is fixed.
- After a crash the clock keeps running (decision 1).

**Local save and sync**
- Each answer change is written to MMKV before the UI confirms it.
- Writes go to an append-only log: attempt ID, question ID, sequence number, client timestamp, idempotency key.
- The log syncs in batches every few seconds with retry. The server keeps the highest sequence number per question.
- Submit works offline by queueing. The server finalises from what it holds and accepts late batches within a grace window (decision 2).

**Test payload**
- Downloaded on the Instructions screen, per attempt, keyed by test version ID.
- It never contains answer keys or solutions. Scoring is server-side, and solutions load after submission.
- It is encrypted at rest and purged after submission.

**Rendering**
- One WebView stays mounted for the whole attempt, and question HTML is swapped in by message.
- KaTeX is rendered to HTML on the server, so the device needs only CSS and fonts.
- Options are semantic radio inputs inside the WebView, with a CSS font-scale variable for zoom and font size. The palette, timers and navigation stay native.

**Images**
- Test images are downloaded to the file system and referenced by local path, because the WebView does not read the expo-image cache.
- Signed URLs expire, so a resumed attempt needs an endpoint that reissues them.

**Resume and navigation**
- On cold start the root layout checks for an active attempt and routes straight to it.
- The attempt screen uses `usePreventRemove`, `gestureEnabled: false` and an Android back handler. With the hook alone, a back swipe can still start and is then cancelled.

## 4. Content protection, devices and integrity

- **Screen capture:** On Android the module uses FLAG_SECURE. On iOS it now prevents recordings and, from iOS 13, screenshots. Verify on real devices.
- **Watermark:** Keep the user-ID watermark on all platforms with `pointerEvents="none"`, since a second phone's camera defeats any block.
- **Device ID:** The server issues an ID at first login, stored in secure storage. ANDROID_ID is only a secondary signal, because it is tied to the signing key, user and device and can change on factory reset.
- **Device limit:** Two active devices, with browsers counted. What happens on the third is decision 3.
- **App switches:** Log timestamps and durations. iOS reports `inactive` for overlays; Android needs its `blur` and `focus` events. Apply thresholds on the server.
- **Phase 2, live tests:** Bind each attempt to one device, add Play Integrity and App Attest, and handle split-screen and picture-in-picture.
- **Telemetry:** Keep question content out of Sentry breadcrumbs and PostHog events.

## 5. Payments and store billing

| Platform | Route | What it requires |
|---|---|---|
| Android, option a | Play Billing plus Razorpay | Alternative billing APIs and transaction reporting |
| Android, option b | Play Billing only | Standard service fee |
| Android, option c | Web-only sales | No purchase flow in the app |
| iOS | Apple In-App Purchase | Default route; see below |
| Web | Razorpay Checkout | As the PRD describes |

- **Android fee:** Under option a, the service fee is reduced by 4% on alternative-billing transactions. Option c is a recognised consumption-only model with no service fee.
- **iOS:** External purchase links do not apply in India. Web-only sales are high risk, because Apple allows access to content bought elsewhere only if those items are also available as in-app purchases.
- **Library:** The react-native-iap v12 line is archived; active development is v15+ on Nitro Modules. It supports Android user choice billing. react-native-razorpay supports the New Architecture from 2.3.1.

If any in-app billing is chosen:
- Use generic price-point products mapped to tests on the server; a store product per test is unworkable at 2,000 tests.
- Apple handles IAP refunds itself, so the 7-day Razorpay refund flow in PRD 6.3 will not cover those sales.
- Define "net revenue" in the 65/75% split as after store fees.
- Grant access only from the backend, after verifying the store purchase or the Razorpay webhook.
- Ask your CA how GST invoices work for store-billed sales.

## 6. Auth, compliance and privacy

- **Sign-in:** Phone OTP, Google, and Sign in with Apple on iOS. Apple's guideline 4.8 requires an equivalent privacy-focused login when a third-party login sets up the primary account.
- **Phone OTP on iOS:** Upload the APNs key and test the reCAPTCHA fallback used on devices without APNs.
- **Age gate:** Add a date-of-birth step to onboarding and block under-18s, as the PRD recommends. Match the store age declarations. If the gate is ever lifted, the children's rules begin on 13 May 2027.
- **Account deletion:** The Profile button triggers the backend deletion workflow, not a mailto link. Play also needs the web deletion URL already listed in PRD 13.2.
- **Data location:** PostHog Cloud runs in the US or Germany, which conflicts with "data stays in India" in PRD section 11 (decision 5).

## 7. Performance and size budgets

| PRD target | Approach | Check |
|---|---|---|
| Test loads in under 2 seconds | Payload and images downloaded, WebView warmed on Instructions | Measure on a mid-range Android on 4G |
| Answer save under 300 ms | Local write first, batched sync | Define which write is measured (decision 6) |
| Android app under 30 MB | Define as Play download size for one architecture | Size check in CI from the first build |
| No answer lost | Append-only log, retry, recovery redirect | Test app kill, airplane mode and low storage mid-attempt |

## 8. PRD edits

- **Section 6.1:** Add the age gate and Sign in with Apple.
- **Section 6.4:** Change "same time left" to "correct time left" if decision 1 goes that way.
- **Section 9.1:** Define net revenue after store fees.
- **Section 11:** Reword "data stays in India", or self-host analytics.
- **Section 12:** Update the iOS screenshot note, and state the device-limit behaviour.

## 9. Phase 0 decisions to add

1. Does the clock keep running after a crash? Recommended: yes.
2. How long is the grace window for late answer batches?
3. Third device: block it, or revoke the oldest? Recommended: block, with user-managed removal and a monthly swap cap.
4. Billing route per platform, and the product model for in-app sales.
5. PostHog: self-host in Mumbai, or use the cloud and disclose it?
6. Does "answer save under 300 ms" mean the local write or the server acknowledgement?
7. Benchmark the single-WebView renderer on a low-end Android before committing to it.

## Sources

- [Expo ScreenCapture](https://docs.expo.dev/versions/v57.0.0/sdk/screen-capture/)
- [Expo Application](https://docs.expo.dev/versions/v48.0.0/sdk/application)
- [Expo New Architecture guide](https://docs.expo.dev/guides/new-architecture)
- [react-native-mmkv reference](https://skillsmp.com/skills/margelo-react-native-skills-skills-react-native-mmkv-skill-md)
- [React Navigation: preventing going back](https://reactnavigation.org/docs/7.x/preventing-going-back)
- [React Native Firebase setup](https://rnfirebase.io/~pipeline-docs)
- [React Native Firebase phone auth fix](https://github.com/invertase/react-native-firebase/pull/8902)
- [Google Play: user choice billing](https://support.google.com/googleplay/android-developer/answer/13821247?hl=en)
- [Google Play user choice billing in India](https://productgrowth.in/insights/consumer/google-play-user-choice-billing-india/)
- [External purchase links and India](https://ecorpit.com/ios-eu-external-purchase-links-storekit-guide-2026/)
- [Apple guideline 3.1.3(b) in the Hey case](https://www.imore.com/phil-schiller-says-apple-will-not-change-its-mind-over-hey-email-app)
- [react-native-iap status](https://github.com/iaptic/react-native-iap)
- [react-native-iap alternative billing](https://hyochan.github.io/react-native-iap/blog/tags/storekit)
- [react-native-razorpay 3.0.0 notes](https://app.unpkg.com/react-native-razorpay@3.0.0/files/CLAUDE.md)
- [Apple guideline 4.8](https://newly.app/how-to/add-social-login)
- [DPDP Act for edtech](https://www.edtechreview.in/news/what-the-dpdp-act-means-for-schools-colleges-and-edtech-companies/)
- [PostHog Cloud regions](https://complydog.com/blog/is-posthog-gdpr-compliant)

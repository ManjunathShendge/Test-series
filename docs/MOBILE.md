# Mobile architecture

Expo development builds from day one; Android/iOS students only. Stack specified by sources, not inferred from a nonexistent package.json. expo-router routes compose feature screens; TanStack Query for server state, Zustand for transient UI, SQLite for durable attempts. Secure platform storage/auth SDK persistence for credentials. Native billing/auth require compatible development builds, not Expo Go assumptions.

Features: auth/onboarding, discovery, purchase, attempt, results, progress, profile. Thin platform adapters own API, auth, billing, persistence, notifications and capture protection. Shared contracts/engine have no native imports.

## Identity and navigation

Google + verified email; Apple alongside Google on iOS, equal prominence. Proposed email/password flow with verification/reset; choose and document exact mobile SDK flow in M1. Firebase UID is canonical. Link providers only after authenticated proof, including Apple relay-address differences; never merge accounts simply by email. See [Firebase account linking](https://firebase.google.com/docs/auth/web/account-linking).

Onboarding: 18+ confirmation (proposed policy), target exams/language/preparation stage; land on featured free test. Optional phone is unverified. Two-device management allows revoke-and-replace flow. Bottom tabs: Home, Discover, Progress, Profile. Attempt is immersive outside tabs. Deep links enforce auth and ownership before opening.

## Runtime configuration and purchases

Fetch safe `/v1/config`: supported app versions, auth methods, purchase enabled/provider, Pass/live feature flags. Mobile provider is Apple or Google by platform; no remotely enabled Razorpay fallback. Cache last safe config; missing config disables new commerce but must not destroy in-progress attempts. Minimum-version enforcement during active attempts needs a deferred safe-update path except security-critical revocation.

Purchase flow and Restore purchases follow [PAYMENTS](PAYMENTS.md). Display store-localized price; pending verification retains intent and shows confirmation status. Reconcile on app foreground. No client entitlement shortcuts.

## Attempt rendering and device behavior

Implement [TEST_ENGINE](TEST_ENGINE.md). One restricted WebView renders sanitized rich content/KaTeX with bundled fonts/CSS; native timer, controls and palette. Deny arbitrary navigation and remote script execution; validate bridge messages. Prefetch only required question assets after authorization. S2 benchmarks actual math/Hindi/tables on mid-range Android; server-rendered math fallback only after measurement and accessibility review.

Capture protection on sensitive attempt/review routes, watermark with pseudonymous user identifier. Android capture/recent-app protection and iOS recording behavior require physical-device checks; never promise impossible screenshot prevention. Log app-switch count as telemetry, not automatic cheating proof.

## Release and budgets

Target test-ready <2s on defined 4G/mid-range device, durable save p95 <300ms, Android delivered app size <30MB. Record actual build size, font/asset contribution and device/network methodology. No fabricated pass for native dependencies exceeding budget. EAS Update only within runtime-compatible JS/assets; native module changes require new builds. Push registration belongs to authenticated device; remove invalid tokens and redact telemetry. No question content, keys or KYC in analytics.

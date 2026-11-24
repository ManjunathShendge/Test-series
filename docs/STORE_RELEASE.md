# Store release (App Store and Google Play)

What the code already does for store review, what the client's team adds, and the values to enter in App Store Connect and Play Console. Store acceptance itself is an external gate (LAUNCH_CHECKLIST).

## Ready in the code

| Item | Where | Notes |
|---|---|---|
| Build profiles | `apps/mobile/eas.json` | `development` (dev client), `preview` (internal APK / ad-hoc), `production` (store: Android App Bundle, auto-incremented build numbers, versions kept by EAS) |
| App version | `app.config.ts` `version` | `1.0.0`; raise it for each store release |
| Bundle ID guard | `app.config.ts` | A `production` build stops with a clear error unless `APP_BUNDLE_ID` is set in the EAS `production` environment, so the development ID `com.testapp.examprep` can never be published |
| Export compliance | `ios.config.usesNonExemptEncryption: false` | HTTPS only, no custom cryptography; App Store Connect stops asking for each build |
| iOS privacy manifest | `ios.privacyManifests` | No tracking; React Native's required-reason APIs (UserDefaults CA92.1, file timestamps C617.1, boot time 35F9.1). Expo modules add their own |
| Android permissions | `android.blockedPermissions` | Storage and microphone removed always; screen overlay removed for `preview` and `production`. What remains: internet, vibrate, notifications (Android 13+ prompt), boot-completed for scheduled notices |
| Push | `expo-notifications` | Asks only after sign-in; works without permission; no marketing pushes |
| Account deletion in app | Profile > Delete account | Required by both stores; recent sign-in required; 7-day grace then server-side removal (C2). Web URL for the listing: `https://<web domain>/account` |
| No external payment links | `PurchaseSheet` | Without a registered billing adapter, paid items show "Available soon"; the app never links to web checkout |
| Restore purchases hook | `BillingAdapter.restore` | Apple requires it when non-consumables exist |
| Legal pages | Web `/privacy`, `/terms`, `/refunds` | Use these URLs in both listings; text still needs legal review |

## Client's team: store billing

The app's hook-up point is `apps/mobile/src/features/commerce/billing.ts` (contract in its header comment). Register an adapter once at start-up with `registerBillingAdapter(...)`; the purchase sheet then offers the item and waits until `GET /v1/me/entitlements` lists it.

Not built yet, and needed before mobile sales: the server endpoint that verifies a store purchase and grants access (Apple App Store Server API signed transactions, Google Play Developer API purchase tokens), plus store server notifications for refunds. It is held by the PAYMENTS "Store catalog gate": the product type and item-to-product mapping must be decided first, and the code must not guess them. The database already has the columns (`purchases.store_*`, `payment_channel` `apple_iap`/`google_play`, `store_environment` sandbox/production) and the grant path used by Razorpay.

## Client's team: Sign in with Apple

Required for App Store submission because the app offers Google sign-in (DECISIONS A1, Guideline 4.8).

1. Apple Developer: enable "Sign in with Apple" for the App ID.
2. Firebase console: enable the Apple provider (Services ID, key, team ID).
3. App: add `expo-apple-authentication` (plugin in `app.config.ts`, `ios.usesAppleSignIn: true`), then add the Apple branch where `apps/mobile/src/lib/auth/index.ts` notes it: sign in with Firebase `OAuthProvider('apple.com')` using the Apple identity token and a hashed nonce.
4. Server: no change. The API accepts any Firebase ID token for the project, and profiles are keyed by Firebase user ID. Accounts are never merged by email (CLAUDE.md invariant 10), so an Apple "Hide My Email" user who later signs in with Google gets a separate account unless the user links providers in the app while signed in.
5. Account deletion with Apple: the reauthentication step must accept Apple as a sign-in method (`reauthenticate` in the same file).

## Listing answers (from what the code collects)

Data collected, all linked to the account and used for app functionality only, none sold or used for tracking:

| Data | Why | Optional |
|---|---|---|
| Email address, name | Account and receipts | No |
| Purchase history | Access to bought tests, invoices | No |
| App activity: test attempts, answers, scores | Results, ranks and progress | No |
| Device ID (server-issued) and push token | Device limit, notifications | Push token yes |
| Product analytics (pseudonymous ID, event counts) | Improving the app (PostHog) | Yes, opt-in in the app; off by default |

Data is encrypted in transit. Users can request deletion in the app and on the web (`/account`). Content rating: educational, no user-generated public content apart from question reports to staff; no ads. Target audience: 18+ (sign-up requires the 18+ confirmation).

## Release steps

1. EAS: set `APP_BUNDLE_ID`, `GOOGLE_IOS_URL_SCHEME`, and the `EXPO_PUBLIC_*` values (API URL, Firebase web config, optional PostHog key) in the `production` environment.
2. `eas build --profile production --platform all`, then `eas submit --profile production` (it asks for the App Store Connect app and Play service account the first time).
3. Play: internal testing, then closed testing, then staged production rollout. Apple: TestFlight, then review.

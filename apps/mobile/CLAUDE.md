# Mobile instructions

Read docs/MOBILE.md; before attempt changes read docs/TEST_ENGINE.md. UI follows root SKILL.md and design master/override.

- expo-router route files compose screens; API/auth/billing/storage are adapters.
- TanStack Query owns server state, Zustand transient state, SQLite durable attempts.
- Persist answer event + state before confirming save; never keep only copy in memory/network.
- Engine receives anchored monotonic time; after process restart re-anchor from server. No wall-clock-derived extra time.
- Server confirms entitlement; Apple/Play native billing only, localized prices, pending/recovery/restore flows.
- Google/email plus Apple on iOS; authenticated linking, never email-only account merge.
- No privileged credentials or question keys in client bundle/cache before authorized review.
- Native SDK/module changes require new development build. Verify current Expo compatibility.
- Real-device evidence needed for screen capture, process-kill recovery, size/performance and store billing.

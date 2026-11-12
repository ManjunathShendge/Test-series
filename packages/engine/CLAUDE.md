# Engine instructions

- Pure deterministic TypeScript only: no React, HTTP, storage, randomness or implicit system clock.
- Receive events, template and time as inputs. Stable question/option IDs, five palette states and locked sections.
- Scoring handles skipped/negative/marked answers using exact arithmetic; server supplies private key.
- Browser/native share reducer; never ship key fixtures or privileged content in production bundles.
- Test transitions, boundaries, repeated events, timing and marking independently of UI.

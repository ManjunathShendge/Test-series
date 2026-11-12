# Local setup specification

No package manifests or runnable code exist yet. M0 must implement this procedure and verify it on a clean clone; the commands below are planned interfaces.

## Prerequisites and compatibility

Git, Node supported by selected Next/Nest/Expo releases, pinned pnpm, Docker Compose, Java/Android SDK for Android, Xcode on macOS or hosted EAS builds for iOS. Windows developers can use PowerShell and Docker Desktop/WSL2; local iOS compilation requires macOS. Select compatible stable versions from official documentation in M0 and record exact versions in packageManager/engines, lockfile and CI; no undocumented “latest” dependencies.

M0 creates workspace/turbo config, strict tsconfig, lint/format config, package scripts, .gitignore, safe .env.example per app, Compose, CI, Dockerfiles and health endpoints. These are implementation deliverables, not files created by this documentation task.

## Clean-clone flow after M0

```powershell
pnpm install --frozen-lockfile
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Compose: Postgres with pg_trgm/btree_gin, MinIO, Mailpit, Firebase Auth emulator. Named volumes preserve data. Migrate command uses dev workflow only locally; deploy uses a separate noninteractive migrate deploy command. Seed deterministic synthetic student/examiner/reviewer/ops/finance accounts and one complete free paper, no real personal data. Emulator-only test credentials must never enable production auth bypass.

Web proposed localhost:3000; API :3001; Postgres :5432; MinIO :9000; Mailpit UI :8025; Firebase emulator :9099. Confirm collisions and record actual ports in M0. Physical devices reach host LAN/tunnel, not their own localhost. Use isolated public HTTPS test ingress only when exercising provider sandbox callbacks.

## Environment contract

| Group | Variables to define/validate | Exposure |
|---|---|---|
| Common | NODE_ENV, APP_ENV, LOG_LEVEL, PUBLIC_WEB_ORIGIN, API_PORT, CORS_ORIGINS | Whitelisted config only |
| Database | DATABASE_URL, DIRECT_DATABASE_URL, WORKER_DATABASE_URL | Server secret; distinct roles/pool mode |
| Storage | S3_ENDPOINT, S3_REGION, S3_BUCKET_CONTENT, S3_BUCKET_PRIVATE, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY | Server only |
| Auth | FIREBASE_PROJECT_ID, credential reference, FIREBASE_AUTH_EMULATOR_HOST locally | Admin credentials server only; public client config separate |
| Billing | RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET; APPLE_BUNDLE_ID/ISSUER_ID/KEY_ID/private key reference; GOOGLE_PACKAGE_NAME/credential reference/PUBSUB_AUDIENCE | Server only except documented checkout public ID |
| Optional services | EMAIL_PROVIDER, EMAIL_FROM, provider credential; EXPO_ACCESS_TOKEN; LLM_ENABLED/MODEL/API_KEY/MONTHLY_CAP_PAISE | Disabled/fake locally |
| Privacy/telemetry | KYC_ENCRYPTION_KEY_REF, SENTRY_DSN, POSTHOG_KEY/HOST | Public keys only where vendor supports; no privileged tokens |
| Clients | NEXT_PUBLIC_API_BASE_URL, EXPO_PUBLIC_API_BASE_URL, Firebase public config | Compile-time public; never put secrets here |

Parse at boot with Zod; enabled provider missing config fails readiness; disabled provider does not require credentials. No secrets in docs or seed. Emulator flags prohibited in production. Feature flags in DB are typed/versioned; environment config constrains maximum capabilities.

## Verification and troubleshooting

`pnpm dev` starts API+worker+web; mobile starts separately with `pnpm --filter mobile start`. Liveness checks process; readiness checks dependencies/migration compatibility. Run typecheck, lint, unit/integration tests and build. Native dependency changes require rebuild, not a metro cache workaround. Failed database startup: inspect port/volume and logs; never destroy volumes as an automatic fix. Failed worker: check direct/session pool connection and extension/schema permissions. Document actual tool versions and observed outputs in PROJECT_STATUS.

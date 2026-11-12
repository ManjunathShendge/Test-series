# Infrastructure and deployment

Local -> isolated staging -> production. Prefer India-region compute/Postgres/private objects (PRD: AWS Mumbai). Free-tier candidates in requirement.text are historical suggestions, not verified current offers. Do not assume they cover a 500-student beta or any paid/live test workload. Validate region, commercial terms, capacity, backup/PITR, egress and actual bill before selection.

## Services

| Component | Development | Production direction |
|---|---|---|
| API/worker/web | Compose/local processes | Always-on container host; worker independently restartable |
| PostgreSQL | Container/extensions | Managed India-region Postgres, PITR, monitored connection budget |
| Objects | MinIO | S3-compatible private India-region bucket, signed access, versioning |
| Auth | Firebase emulator | Separate Firebase project; review provider data location |
| Billing | Fake + provider sandboxes | Razorpay live, Apple/Play production after launch gates |
| Push/email | Fake + Mailpit | Expo push; SES or approved email adapter |
| AI | Fake/disabled | Approved small-model provider, terms/cost gate |
| Telemetry/builds | Local output | Sentry/PostHog and EAS after privacy/budget review |

Core India hosting does not imply Firebase, push, analytics, CDN or LLM processing is India-only. Maintain data inventory and transfer assessment; do not assert blanket residency.

## CI and release

CI installs locked dependencies, runs lint/typecheck/unit tests, Postgres integration/migration tests, builds packages/apps and checks forbidden public secrets/key leakage. Generate artifacts once, tag image by commit SHA and retain previous release. PR preview uses fake/sandbox providers, no production data.

Production deployment: verify backup and migration plan -> run backward-compatible migration with migration role -> deploy worker/API/web images -> readiness + smoke -> monitor. Use expand/backfill/contract migrations across releases; rollback image only if compatible. No destructive down migration as routine recovery. Store apps have independent release cadence; API supports current and previous supported clients and versioned event schemas.

## Database, storage and edge

API bounded connection pool; worker and migrations use validated direct/session-compatible connection mode. Verify pg-boss compatibility with selected pooler instead of assuming transaction pooling works. Budget total connections across replicas/jobs. Separate app/migration roles and private network access.

TLS/HSTS, strict origin allowlist, security headers, request size/rate limits, signed short-lived object URLs. Public metadata may use CDN; private papers/solutions/KYC never become public through cache headers. Prefix/bucket separation for public images, papers, KYC, invoice/statement files. Artifact integrity hash and immutable keys allow safe retries.

## Backups and recovery objectives

Proposed staging RPO 24h, RTO 8h; production RPO <=15min, RTO <=2h pending owner budget approval. Live-window 99.9% uptime is a separate target and is not guaranteed by a two-hour disaster RTO. Paid launch needs documented PITR capability; nightly encrypted dumps are a second copy, not a substitute. Suggested retention 14 daily/6 monthly backups pending retention policy; separate access/key handling. Monthly restore drill includes DB, object-version references, secrets access and event/payment reconciliation. Never replay outbound payments blindly after restore.

## Observability and capacity

Structured request/event/order IDs, no content/PII. Metrics: API latency/errors, DB saturation, outbox lag, failed jobs, pending payment/ack age, attempt save latency, finalizer lag, QC SLA, notification errors. Alert thresholds proposed: readiness failure 2min; payment/ack backlog threatens provider deadline; QC oldest >36h; outbox lag >60s; answer failure >1%/5min. Tune from staging evidence.

Upgrade before real payments/live windows or when headroom fails. k6 covers start burst, worst-case dirty clients every 5s, retries, submit burst, worker backlog and full-duration run. Founder must choose concurrency; report measured throughput and bottlenecks, not theoretical guarantees. See TESTING and OPERATIONS.

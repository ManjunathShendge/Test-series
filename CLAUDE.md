# Exam Prep Marketplace: project instructions

## Current state and authority

Documentation only. Do not claim packages, scripts, tests, or services exist until inspected.
Read `docs/DECISIONS.md` for precedence: latest explicit decisions in requirement.text override older draft sections and PRD conflicts. Preserve the original sources. Unresolved business policies are proposals, not approvals.
Use `docs/ROADMAP.md` and `docs/PROJECT_STATUS.md` to choose the next authorized milestone.

## Stack and boundaries

- pnpm workspaces, Turborepo, strict TypeScript.
- `apps/api`: NestJS HTTP and pg-boss worker entry points; one modular monolith.
- `apps/web`: Next.js App Router; students, examiners, reviewer/admin sections.
- `apps/mobile`: Expo development builds, expo-router; students only.
- `packages/contracts`: Zod request/response contracts.
- `packages/engine`: pure TypeScript attempt reducer, timing, scoring functions.
- `packages/db`: Prisma, SQL migrations, seeds; PostgreSQL with pg_trgm and btree_gin.
- S3-compatible private storage; Firebase Google/email plus Apple on iOS.
- Web payments: Razorpay. Mobile payments: Apple IAP and Google Play Billing.
- No Redis, Firestore, external search, embeddings, vector DB, fine-tuning, or OCR at launch.

## Invariants

1. AI only suggests; human-reviewed actions and audit records are required to change content or verdicts. AI failure cannot approve or reject a question.
2. Approved question and published paper versions are immutable. Corrections create versions and explicit rescore mappings.
3. Never expose keys or solutions through student paper payloads, bundles, assets, logs, or caches before authorized review. Staff authoring/review access is separately authorized.
4. Server decides entitlement, price, time, section eligibility, score, and payment status.
5. Money uses integer minor units; launch currency INR (paise). Ledger and audit records are append-only.
6. Mutations affecting admin/reviewer actions commit with audit records. Domain jobs use a transactional outbox, then pg-boss dispatch.
7. Provider callbacks are untrusted until verified. Fulfilment, refunds, payout allocation, and job consumers are idempotent.
8. Durable answer persistence precedes UI confirmation. Never discard an answer on an ambiguous network response.
9. Backend SDKs stay behind `apps/api/src/providers/`; necessary client auth/billing SDKs stay behind client adapters. Never put privileged secrets on clients.
10. Do not merge accounts by matching email alone. Require authenticated provider linking.

## Workflow

- Inspect existing files first; work on one milestone or bounded task.
- Read scoped CLAUDE.md and relevant docs before editing that area.
- Check official compatibility docs before installing dependencies; pin resolved versions and lockfile in M0.
- Contract first, then migration/repository, service, controller, client, and meaningful tests.
- Schema changes include migration and DATA_MODEL update. Behavior changes include requirements/test updates.
- Keep controllers thin, SQL parameterized, and authorization inside services as well as route guards.
- Document a material architecture change in DECISIONS before introducing new infrastructure.
- Do not bypass a blocking business decision with invented values. Continue independent work.
- No production data, credentials, real payments, or public releases in fixtures or development.
- Finish with changed behavior, checks actually run, failures, and remaining blockers.

## Planned commands (M0 must implement)

```text
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
pnpm --filter mobile start
pnpm typecheck
pnpm lint
pnpm test
pnpm test:int
pnpm test:e2e
pnpm build
```

## Read on demand

| Task | Read |
|---|---|
| Bootstrap | docs/SETUP.md, docs/ARCHITECTURE.md |
| Schema/API/auth | docs/DATA_MODEL.md, docs/API_CONTRACTS.md, docs/SECURITY.md |
| Authoring/QC | docs/CONTENT_AUTHORING.md, docs/QC_PIPELINE.md |
| Attempt/results | docs/TEST_ENGINE.md, docs/RESULTS.md |
| Billing | docs/PAYMENTS.md |
| UI | SKILL.md, design-system/exam-prep-marketplace/MASTER.md, matching page override |
| Deployment | docs/INFRA.md, docs/OPERATIONS.md, docs/LAUNCH_CHECKLIST.md |

Definition of done: acceptance criteria met; relevant tests, lint, typecheck and build pass; documentation/status updated. Report checks unavailable in this documentation-only repository honestly.

# Project status

Date: 19 November 2026.

## Completed

- Reviewed requirement.text and all 19 extracted PRD pages; visually inspected the payment policy page.
- Preserved source inputs and created reconciled architecture/system/Claude Code documentation.
- Identified latest authentication/billing decisions and technical/business gates.
- Ran SKILL.md searches after supporting files appeared; applied relevant accessibility matches and retained a disclosed manual visual fallback because returned styles did not fit adult timed exams.

## Implementation state

The development foundation is implemented on PostgreSQL 17 (Docker locally and in CI; Supabase Mumbai for staging, owner decision 18 November 2026): workspace scripts, environment validation, API and worker health, a checksummed migration with storage primitives and a leased job table, idempotent fixture seed, CI and container definitions. Supabase staging is migrated, with restricted roles and verified TLS. The owner-supplied schema v1.1 is implemented in full (migrations 002-005) with the PRD overrides and deviations in DATA_MODEL; no API endpoints use it yet. Mobile remains a synthetic student demo without backend auth or billing. Domain contracts, the shared attempt engine and business database schemas remain future milestones. See the latest log for checks and remaining limits.

## Log

```text
Date / milestone / requirement IDs: 11 November 2026 / M0 (started: folder skeleton only) / R26
Implemented behavior and changed paths:
  - Moved UI/UX Pro Max support folders data/, scripts/, templates/ into
    .claude/skills/ui-ux-pro-max/ (the path SKILL.md's search commands expect);
    removed generated scripts/__pycache__. Root SKILL.md unchanged (source input).
  - Created ARCHITECTURE package layout: apps/api/src/{common,config,providers,
    modules/<10 modules>}, apps/api/test, apps/{web,mobile}/{app,src/features,
    src/lib,src/ui}, packages/contracts/src/<6 domains>,
    packages/engine/src/{reducer,timing,scoring,sections},
    packages/db/{prisma,migrations,seeds}, docker/postgres, .github/workflows.
    Empty folders hold .gitkeep only; no manifests or code yet.
Checks run: search.py "error summary validation" --domain ux from new location returned
  the expected Focusable Error Summary result.
Unavailable checks and reason: no package manifests yet, so no typecheck/lint/test/build.
  Docker is not installed on this machine (Node v22.18.0, pnpm 11.12.0, Python 3.12 present).
  Repository is not a git repository yet.
Open decision IDs / blocking dependency: none for M0; Docker required for Compose verification.
Next concrete action: M0 tooling: verify current Next/Nest/Expo/Prisma/pg-boss compatibility,
  then root package.json, pnpm-workspace, turbo, strict tsconfig, per-package manifests.
```

```text
Date / milestone / requirement IDs: 12 November 2026 / M0 (folder structure only) / R26
Implemented behavior and changed paths:
  - Expanded the skeleton into the full documented layout. apps/api/src gains
    common/{decorators,filters,guards,interceptors,pipes,errors,logging,types,utils},
    config/env, database, health, outbox, jobs, providers/<8 adapters> and
    modules/<10>/{http,application,domain,repositories,jobs} matching the
    ARCHITECTURE dependency direction; apps/api/test/{integration,e2e,fixtures,helpers}.
  - apps/web: app route groups (public)/(student)/(examiner)/(staff), src/features/<9>,
    src/lib/{api,auth,config,query,storage,utils}, src/ui/{primitives,patterns,tokens},
    public, test/{unit,e2e}.
  - apps/mobile: expo-router app/{(auth),(tabs),attempt}, src/features/<6 student-only>,
    src/lib/{api,auth,billing,storage,notifications,config}, src/ui/<3>, assets, test/unit.
  - packages/contracts/src adds common/ beside the six documented domains, plus test/;
    packages/engine adds test/; packages/db adds src/ and test/.
  - docker/{postgres/init,minio,mailpit,firebase} for the SETUP.md Compose services.
  - Root .gitignore created (env/secret, native credential, build, volume and coverage rules).
    144 .gitkeep markers; no empty directory left unmarked.
Checks run: directory tree printed and verified against ARCHITECTURE "Package layout" and
  the module ownership table; no empty directories remain.
Unavailable checks and reason: no package manifests, so typecheck/lint/test/build still
  cannot run. Docker not installed on this machine. Repository is still not git-initialised,
  so .gitkeep/.gitignore are inert until `git init`.
Open decision IDs / blocking dependency: contracts coverage for the results, payouts,
  notifications and admin modules is undefined - ARCHITECTURE lists six contract domains
  against ten API modules. Resolve by folding them into existing domains or amending
  ARCHITECTURE before M1 contracts work.
Next concrete action: git init plus initial commit, install Docker Desktop, then M0 tooling:
  verify Next/Nest/Expo/Prisma/pg-boss compatibility and create root package.json,
  pnpm-workspace, turbo, strict tsconfig and per-package manifests.
```

```text
Date / milestone / requirement IDs: 12 November 2026 / M0 (documentation reconciliation) / R13 R15 R17 R18 R26 R27
Implemented behavior and changed paths:
  - Preserved the owner-supplied mobile stack note verbatim at
    docs/sources/MOBILE_STACK_NOTE_2026-11-12.md with a provenance header; registered it in SOURCES.
  - DECISIONS gains E14-E20 (storage, package naming, attempt sub-routes, timer offset,
    S2-gated renderer, server-issued device ID, analytics residency), a refinements paragraph,
    conflicts C1-C4 and an unverified-version note.
  - Applied the adopted structural items only: apps/mobile/app/attempt/[id] and
    apps/mobile/src/lib/guards.
Checks run: mobile tree reprinted and compared against DECISIONS E15/E16; no empty directories.
Unavailable checks and reason: still no manifests, so typecheck/lint/test/build cannot run;
  library versions in the note were not verified because that is M0 tooling work against vendor docs.
Open decision IDs / blocking dependency: C1 phone OTP versus D01, C2 Android Razorpay versus D02,
  C3 late-batch grace window versus E09/O12, C4 third-device behavior. C1-C3 block dependent
  M1, M7 and M9b work; they do not block M0 tooling.
Next concrete action: owner rules on C1-C4, then git init and M0 tooling version resolution.
```

```text
Date / milestone / requirement IDs: 13 November 2026 / M0 (decision resolution) / R13 R15 R18 R26 R27
Implemented behavior and changed paths:
  - Researched and resolved C1-C4 in DECISIONS against vendor documentation, at owner instruction:
    C1 no phone OTP (D01 stands), C2 Apple IAP on iOS and Play Billing only on Android for MVP
    (D02 stands, user choice billing deferred to Phase 2), C3 strict deadline (E09/O12 stand),
    C4 third device blocked with student-initiated revoke.
  - Replaced the unverified-version note with a validated table: Expo SDK 58 current, not 55;
    expo-iap required because react-native-iap dropped Expo support at v15; mmkv v4 createMMKV
    confirmed; iOS screenshot behavior corrected; Razorpay not applicable on mobile.
Checks run: five web searches against Expo changelog/docs, Play Console Help, OpenIAP/npm and
  Apple external-purchase-entitlement coverage. Findings recorded with sources in the chat reply.
Unavailable checks and reason: no manifests, so typecheck/lint/test/build still cannot run;
  store behavior and device screenshot behavior need real-device and sandbox evidence (S4, M13).
Open decision IDs / blocking dependency: none blocking M0. O03 net-revenue definition and O09
  GST/TDS treatment remain owner/CA items; C2 keeps them simpler by using one provider per platform.
Next concrete action: git init plus initial commit, then M0 tooling: resolve Expo SDK 58 /
  React Native 0.88 / Next / Nest / Prisma / pg-boss compatibility as a set and write the manifests.
```

```text
Date / milestone / requirement IDs: 13 November 2026 / M0 (toolchain) / R26
Implemented behavior and changed paths:
  - Published the repository baseline to GitHub (commit db7b43e, 284 files). Client-confidential
    sources are gitignored and absent from history; verified the PRD PDF returns 404 on the remote
    while CLAUDE.md returns 200. Added docs/sources/README.md. Fixed the global git user.name value.
  - Installed Docker Desktop 4.99.0 via winget on an existing WSL2/Ubuntu setup.
Checks run (command, outcome, evidence):
  - docker version: client and server 29.9.3; docker compose version: v5.7.0; engine Linux, 8GB.
  - postgres:18-alpine container: server_version 18.6; CREATE EXTENSION pg_trgm and btree_gin both
    succeeded (pg_trgm 1.6, btree_gin 1.3); similarity('railway recruitment','railway recruitement')
    returned 0.77272725. Container removed afterwards.
  - npm registry dist-tags read directly: next 16.4.6, @nestjs/core 12.5.0, @prisma/client 7.10.1,
    pg-boss 12.38.2, expo 58.0.25, expo-iap 6.4.4, zod 4.6.7, turbo 2.11.11.
Unavailable checks and reason: no manifests yet, so typecheck/lint/test/build still cannot run.
Open decision IDs / blocking dependency:
  - prisma npm "latest" tag resolves to 8.0.0-rc.33, a release candidate, while @prisma/client
    latest is 7.10.1 stable. Pin both to 7.10.1; never install prisma from the latest tag.
  - Local Node is 22.18.0. NestJS 12 runtime needs 22.12+, but its CLI generators need 22.22.3+.
    Bump within the 22 line before using nest CLI generators.
  - NestJS 12 ships core packages as ESM and defaults new projects to Vitest and oxlint; TESTING.md
    predates this and needs a decision during manifest work.
Next concrete action: write the M0 workspace manifests, Compose file and env validation against the
  pinned set above, then run the clean-clone flow.
```

```text
Date / milestone / requirement IDs: 15 November 2026 / mobile client demo (ahead of M-series) /
  PRD 6.1 to 6.7
Implemented behavior and changed paths (apps/mobile):
  - Design tokens and primitives from design-system MASTER; typed demo repository with key-free
    papers and solutions held separately; zustand stores for session, results and the attempt.
  - Screens: sign-in, onboarding, Home, Discover, exam, examiner, series, test detail, purchase
    sheet, instructions, attempt, result and review, Progress, practice lists, Profile, edit exams.
  - Phase G: on-device persistence and resume, coupon and examiner codes, GST-inclusive price,
    price band filter, edit target exams, continue-attempt wiring.
  - Phase H: shared review card, cross-attempt mistake notebook and bookmarks, single bookmark
    source, sign-out clears results and any live attempt, chart label and header fixes.
  - Phase I: storage moved to SQLite (expo-sqlite kv-store); purchase detail with tax invoice or
    receipt, GST breakdown, share, and refund request (web 7-day rule) or store refund link;
    devices with removal; notification preferences; help with FAQs and contact form; terms,
    privacy and analytics consent; account deletion with typed confirmation and grace period.
  - Phase J: React Query data layer over the demo repository (src/lib/api) with NetInfo online
    status; skeleton, offline and error states on Home, Discover and test detail; floating offline
    banner; post-submit scoring state. Walked series purchase, IBPS sectional timing with locked
    sections and automatic section switch, Hindi switching, offline and reconnect, and deadline
    auto-submit on the emulator.
  - Phase J checks: pnpm exec vitest run in apps/mobile, 19 tests passed (attempt store sectional
    timing, answer isolation, scoring; money and rank formatting). tsc and oxlint clean.
Checks run (command, outcome, evidence):
  - pnpm exec tsc --noEmit in apps/mobile: exit 0. pnpm exec oxlint app src: no findings.
  - Manual walkthrough on Android emulator Pixel_10a in Expo Go with screenshots: sign-in,
    onboarding, Home, Discover filters, purchase with ANITA10, instructions, attempt, kill and
    relaunch mid-attempt resumed on the same question with the saved answer, leave dialog,
    Progress, practice lists, result, exam tabs, series, examiner, Profile, sign-out.
Unavailable checks and reason: native Android build
  blocked by the space in the repository path (DECISIONS X1); no iOS device or simulator.
Open decision IDs / blocking dependency: X1 repository relocation (owner), X4 and O09 GST
  treatment (CA), X5 and S4 store coupon and SKU strategy.
Next concrete action: owner decides on relocating the repository; then resume M0 phases 4 and 5
  (Compose, env validation, CI) and add Vitest coverage for the attempt store and practice lists.
```

## Next action

Begin M1 identity: Firebase project setup (owner), token verification and the sign-in flow on `ensure_profile_for_firebase_user`, `withUser` request context, devices and consent. API hosting (spike S3), native Android path relocation (X1), native iOS/store evidence and S4 remain separate work.

## Update template

```text
Date / milestone / requirement IDs:
Implemented behavior and changed paths:
Checks run (command, outcome, evidence):
Unavailable checks and reason:
Open decision IDs / blocking dependency:
Next concrete action:
```

## 16 November 2026: development foundation / M0 / R26

Implemented:
- Idempotent environment setup; pinned Node 22.23.5 and patched pnpm 11.13.1.
- Compose services with loopback ports and persistent volumes; PostgreSQL role separation, Firebase demo project, MinIO private bucket initialization and Mailpit.
- Prisma baseline migration with required extensions; local/test-only repeatable infrastructure seed. Domain accounts and a complete paper await domain schemas.
- Validated server configuration, origin allowlist, database/schema readiness, pg-boss worker lifecycle and health endpoint.
- Clean startup scripts, separate unit/integration checks, API/worker/web HTTP smoke script, public-environment allowlist, CI and non-root container definitions.
- Corrected typecheck scripts to avoid mutating build metadata; mobile Vitest configuration uses an ESM file extension.
- Updated README/setup/instructions and schema/decision documentation.

Verification on 16 November 2026:
- Frozen-lockfile install with pnpm 11.13.1 passed.
- Workspace lint and typecheck passed; 29 unit tests passed (19 mobile, 10 API environment tests).
- Four integration tests passed: PostgreSQL extensions/schema, application role restrictions, incompatible schema rejection, HTTP liveness/readiness during database failure.
- Baseline migration applied; seed executed twice successfully.
- Repeated services startup passed; PostgreSQL, MinIO, Mailpit and Firebase were healthy; private bucket initialization passed.
- API/worker/web HTTP smoke and CORS checks passed; `pnpm dev` startup verified all three health endpoints.
- Public environment allowlist and git whitespace checks passed.
- API container build and packaged runtime readiness passed with pinned Node 22.23.5.
- Web container build and packaged server health passed with pinned Node 22.23.5.
- Scoped formatting checks passed. Temporary runtime-check containers were stopped and removed. Local development services remain running.

Host limitation: local Node remains 22.18.0 and emits the declared engine warning. CI/container runtime is pinned to 22.23.5. GitHub CI has been authored but has not run remotely; no deployment was performed.

Scope limits: no real authentication/billing, provider adapters, domain APIs, production deployment, browser user-journey tests or native/store verification. Empty unit suites are explicitly allowed for scaffolds; they are not coverage. The original 15 November mobile work is preserved.

Superseded the same day: the owner's SQLite storage decision replaced PostgreSQL, pg-boss and MinIO. The PostgreSQL verification above describes that earlier tree; the SQLite tree was first recorded as verified on 18 November.

## 18 November 2026: M0 close-out on SQLite / R26

Implemented:
- Host Node upgraded from 22.18.0 to the pinned 22.23.5 (winget OpenJS.NodeJS.22); the engine warning is gone.
- SETUP, DATA_MODEL, TESTING and CLAUDE.md updated to describe the SQLite foundation; ARCHITECTURE and INFRA carry a superseded-storage note pending a production design pass.
- Orphaned PostgreSQL role init and MinIO build files moved to `docs/archive/compose-services/`. Firebase Auth emulator configuration kept for M1.
- M0 work committed and pushed to GitHub so CI runs remotely.

Verification on 18 November 2026 (Node 22.23.5, pnpm 11.13.1):
- `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck` passed.
- `pnpm test`: 29 unit tests passed (19 mobile, 10 API). The first run after install failed once in the web task under parallel turbo; serial and two forced parallel reruns passed. Not reproduced.
- `pnpm check:public-env` passed; `pnpm db:migrate`, then `pnpm db:seed` twice, passed.
- `pnpm test:int`: 9 passed (8 SQLite storage, 1 HTTP readiness failure path).
- `pnpm test:e2e`: API, worker, web and CORS smoke passed. It requires `db:migrate` first; a run without the database failed with `unable to open database file`, as SETUP now documents.

- First remote CI run passed on commit 67d5a59 (GitHub Actions run 44356546448): every step including both API and web image builds.

Not run locally: Docker image builds (verified in CI only). No iOS device or simulator; X1 relocation pending.

## 19 November 2026: PostgreSQL on Supabase / M0 rework / R26

Implemented (commits 8811a7a to the M5 docs commit):
- DECISIONS "PostgreSQL on Supabase" supersedes the SQLite server storage decision; Supabase is database only, Firebase and Expo Push unchanged.
- Local PostgreSQL 17.12 in Compose on loopback 15432 with migrator, API and worker roles; three database URLs in env examples.
- `packages/db` on `pg` 8.23.1: transactional checksummed migrator with advisory lock; migration 001 with pg_trgm/btree_gin, append-only ledger and audit including TRUNCATE, SKIP LOCKED leased jobs. No password column and no file BLOBs.
- API/worker on pg pools; staging/production require `DATABASE_CA_CERT_PATH` for verified TLS; worker can use a separate session-mode URL.
- CI starts PostgreSQL via Compose before migrating; API image no longer creates a SQLite data directory. SETUP, DATA_MODEL, TESTING updated.

Verification on 19 November 2026 (Node 22.23.5, pnpm 11.13.1, Docker 29.9.3):
- Frozen install, public-env check, lint and typecheck passed.
- Unit: 31 passed (19 mobile, 12 API including SQLite-URL rejection and deployed-TLS requirement).
- Integration: 10 passed (8 database on an isolated database per test, 2 API readiness); temporary databases were all dropped.
- Migrate twice (second reported up to date) and seed twice passed; API/worker/web and CORS smoke passed.
- API image built; Compose `app` profile API and worker both returned 200 on `/health/ready` against the Postgres container, then were stopped.
- Supabase staging (18 November): transaction and session poolers both connected, PostgreSQL 17.12, extensions available, 30-43 ms round trip. Read-only; nothing migrated.
- iOS: owner reports the Expo Go demo running on a physical iPhone without issues. Expo Go cannot load native auth or billing modules, so this is not development-build or store evidence.

Open: Supabase CA certificate and restricted roles before staging migration; confirm the Data API is disabled; Supabase plan, backups and PITR terms (E11); pre-existing react/react-dom 19.3.0/19.3.1 peer warning; Supabase account password rotation after it appeared in a session log.

### 19 November 2026: Supabase staging provisioned

- Supabase Root 2021 CA (valid to April 2031) stored outside the repository; both poolers passed full certificate verification.
- Migration 001 applied to staging; `provision-roles` created `exam_app` and `exam_worker` and wrote their URLs to the local `.env` under `STAGING_`, without printing them.
- Supabase's `ensure_rls` trigger had enabled RLS with no policies, so the service roles saw no rows and readiness failed. Fixed in the migrator: RLS on everywhere plus an `exam_service_access` policy for the two roles, reapplied every run; new integration test.
- Staging checks as each role: verified TLS, readiness, row write (rolled back) allowed; CREATE/DROP TABLE and `schema_migrations` access denied; `anon` and `authenticated` have no SELECT on any public table. The built API and worker both returned 200 on `/health/ready` against staging.
- Local suite after the change: lint, typecheck, unit (31), integration (11), migrate and smoke all passed.
- Owner confirmed the Data API is disabled (not independently verifiable from a database connection).

## 19 November 2026: owner schema v1.1 / data model

Implemented (commits 1153853 to 5190c93):
- Owner-supplied `Supabase_Database_Schema_Documentation.md` registered as a confidential source (gitignored) and made the data model. PRD prevails on sign-in (Firebase), versioning, QC-gated publishing, locked approved questions and the admin audit log; technical corrections for store billing, unverified phone and function search paths.
- Migrations 002 identity, 003 catalogue, 004 QC and attempts, 005 commerce, functions and buckets: 39 tables, all twelve schema sections. Each deviation and its reason is in DATA_MODEL.
- `withUser` sets the verified profile per transaction; schema policies use `current_user_id()`. Worker has full row access; the API follows schema policies where they exist.

Verification on 19 November 2026:
- Database integration: 34 tests passed on two consecutive runs, each in an isolated database. They cover the sign-in function and no email merge, own-profile visibility and blocked self-promotion, the two-device limit under concurrency, append-only audit, corrections and ledger, question immutability and versioning, examiner publishing limits, frozen published tests, QC locks, five-report auto-hide, server-only timing and scoring with a strict answer deadline, order and entitlement rules, automatic audit rows, all five functions, and a hand-calculated payout fixture (holds, refunds, minimum, paid rows untouched, finalised month).
- Whole suite: lint, typecheck, 31 unit tests, 36 integration tests and the HTTP smoke test passed. Local database migrated to schema version 5 and seeded.
- Two defects found by tests and fixed before commit: the device-limit lock saw no rows under RLS (now an advisory lock), and privileged functions left no audit trace when they suspend the user context (now one audit row per run).
- Staging: migrations 002-005 applied in one transaction; 39 of 39 tables have RLS; `anon`/`authenticated` can read no table and execute none of the sensitive functions; five storage buckets created; as `exam_app`, readiness, sign-in, own-profile visibility and blocked self-promotion all held (probe rolled back). The built API and worker returned 200 on `/health/ready` against staging.

Open: Firebase project (owner); whether examiners may create their own coupon codes (currently admin-only); TDS/GST parameters (O09) and net revenue after store fees (O03).

### 19 November 2026: Supabase keep-alive

- `keep-supabase-awake.yml` runs `SELECT now()` every three days as `exam_keepalive` (login-only, no table access, verified TLS). Owner added the `SUPABASE_KEEPALIVE_DATABASE_URL` secret; the first manual run (Actions run 44388767265) succeeded. Before that, a local psql run of the same command succeeded and the role was refused on `profiles` and `bootstrap_state`.
- GitHub disables scheduled workflows after 60 days without repository activity; remove the workflow once staging is on a paid Supabase plan.

